import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  format,
  parseISO,
  isFuture,
  isPast,
  isEqual,
  startOfDay,
} from "date-fns";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { body, validationResult } from "express-validator";
import cron from "node-cron";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { processCampaignCalls } from "./services/callService.js";
import { db } from "./lib/firebase.js";
import { doc, updateDoc, setDoc } from "firebase/firestore";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post("/current_date_and_time", (req, res) => {
  try {
    const dubaiTime = format(new Date(), "yyyy-MM-dd HH:mm:ss", {
      timeZone: "Asia/Dubai",
    });
    res.json({ current_time: dubaiTime });
  } catch (error) {
    logger.error("Error getting current time:", error);
    res.status(500).json({ error: "Failed to get current time" });
  }
});

app.post(
  "/make_appointment",
  [
    body("date").isISO8601().withMessage("Invalid date format"),
    body("time")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Invalid time format"),
    body("phone").isMobilePhone("any").withMessage("Invalid phone number"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    res.json({ message: "Appointment scheduled successfully" });
  },
);

app.post("/outbound", async (req, res) => {
  try {
    if (req.body.message?.type === "end-of-call-report") {
      const callData = req.body.message;
      const callId = callData.call.id;

      // Store call details in the 'calls' collection
      await setDoc(doc(db, "calls", callId), req.body.message);

      logger.info(`Stored call details for call ID: ${callId}`);
    }

    res.json({ message: "Call status updated successfully" });
  } catch (error) {
    logger.error("Error storing call details:", error);
    res.status(500).json({ error: "Failed to store call details" });
  }
});

app.post(
  "/campaign/schedule",
  [
    body("campaign_id").notEmpty().withMessage("Campaign ID is required"),
    body("date").isISO8601().withMessage("Invalid date format"),
    body("start_time")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Invalid start time format"),
    body("end_time")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Invalid end time format"),
    body("timezone").notEmpty().withMessage("Timezone is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { campaign_id, date, start_time, end_time, timezone } = req.body;

      // Convert campaign date and times to Date objects in the specified timezone
      const campaignDate = parseISO(date);
      const [startHour, startMinute] = start_time.split(":").map(Number);
      const [endHour, endMinute] = end_time.split(":").map(Number);

      const startDateTime = zonedTimeToUtc(
        new Date(
          campaignDate.getFullYear(),
          campaignDate.getMonth(),
          campaignDate.getDate(),
          startHour,
          startMinute,
        ),
        timezone,
      );

      const endDateTime = zonedTimeToUtc(
        new Date(
          campaignDate.getFullYear(),
          campaignDate.getMonth(),
          campaignDate.getDate(),
          endHour,
          endMinute,
        ),
        timezone,
      );

      const now = new Date();
      const currentTimeInZone = utcToZonedTime(now, timezone);

      // Compare just the date portions
      const campaignDay = startOfDay(campaignDate);
      const currentDay = startOfDay(currentTimeInZone);
      const isToday = isEqual(campaignDay, currentDay);
      const isPastDay = isPast(campaignDay) && !isToday;
      const isFutureDay = isFuture(campaignDay);

      // Check if start_time >= end_time
      if (startDateTime >= endDateTime) {
        await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
        return res.json({
          message:
            "Campaign marked as ended: start time is after or equal to end time",
          status: "ended",
        });
      }

      // If date is in the future, schedule the campaign
      if (isFutureDay) {
        const [hour, minute] = start_time.split(":");
        const cronExpression = `${minute} ${hour} ${campaignDate.getDate()} ${campaignDate.getMonth() + 1} *`;

        cron.schedule(
          cronExpression,
          async () => {
            logger.info(`Starting scheduled campaign: ${campaign_id}`);
            try {
              await processCampaignCalls(campaign_id);
            } catch (error) {
              logger.error(`Error executing campaign ${campaign_id}:`, error);
            }
          },
          {
            timezone,
            scheduled: true,
          },
        );

        return res.json({
          message: "Campaign scheduled successfully",
          status: "scheduled",
        });
      }

      // If date is in the past (not today)
      if (isPastDay) {
        await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
        return res.json({
          message: "Campaign marked as ended: campaign date is in the past",
          status: "ended",
        });
      }

      // If date is today
      if (isToday) {
        // If start time is in the future, schedule it
        if (isFuture(startDateTime)) {
          const [hour, minute] = start_time.split(":");
          const cronExpression = `${minute} ${hour} ${campaignDate.getDate()} ${campaignDate.getMonth() + 1} *`;

          cron.schedule(
            cronExpression,
            async () => {
              logger.info(`Starting scheduled campaign: ${campaign_id}`);
              try {
                await processCampaignCalls(campaign_id);
              } catch (error) {
                logger.error(`Error executing campaign ${campaign_id}:`, error);
              }
            },
            {
              timezone,
              scheduled: true,
            },
          );

          return res.json({
            message: "Campaign scheduled successfully for today",
            status: "scheduled",
          });
        }

        // If start time and end time are in the past
        if (isPast(startDateTime) && isPast(endDateTime)) {
          await updateDoc(doc(db, "campaigns", campaign_id), {
            status: "ended",
          });
          return res.json({
            message:
              "Campaign marked as ended: start and end times are in the past",
            status: "ended",
          });
        }

        // If start time is in the past but end time is in the future, start immediately
        if (isPast(startDateTime) && isFuture(endDateTime)) {
          logger.info(`Starting campaign immediately: ${campaign_id}`);
          try {
            // Start the campaign processing immediately
            processCampaignCalls(campaign_id).catch((error) => {
              logger.error(`Error executing campaign ${campaign_id}:`, error);
            });

            return res.json({
              message: "Campaign started immediately",
              status: "started",
            });
          } catch (error) {
            logger.error("Error starting campaign:", error);
            return res.status(500).json({ error: "Failed to start campaign" });
          }
        }
      }

      // Default response for any edge cases
      return res.status(400).json({
        error: "Invalid campaign schedule configuration",
        status: "error",
      });
    } catch (error) {
      logger.error("Error scheduling campaign:", error);
      res.status(500).json({ error: "Failed to schedule campaign" });
    }
  },
);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
