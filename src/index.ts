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
import { doc, updateDoc, setDoc, getDoc } from "firebase/firestore";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post("/current_date_and_time", (req, res) => {
  try {
    console.log("current date and time hit");
    console.log(req.body);
    const dubaiTime = format(
      utcToZonedTime(new Date(), "Asia/Dubai"), // Convert UTC to Dubai timezone
      "yyyy-MM-dd HH:mm:ss", // Desired format
      { timeZone: "Asia/Dubai" }, // Specify timezone explicitly
    );

    console.log(req.body.message.toolCalls[0]);
    res.json({
      results: [
        { toolCallId: req.body.message.toolCalls[0].id, result: dubaiTime },
      ],
    });
  } catch (error) {
    logger.error("Error getting current time:", error);
    res.status(500).json({ error: "Failed to get current time" });
  }
});

app.post("/make-appointment", async (req, res) => {
  console.log("Wildcard route make-app");
  console.log("Path:", req.path);
  console.log("Original URL:", req.originalUrl);
  console.log(req.body);

  try {
    const callId = req.body.message.call.id;
    const toolCall = req.body.message.toolCalls[0];
    console.log(toolCall.function.arguments);
    const functionArguments = toolCall.function.arguments;
    const { date, time } = functionArguments;

    // Prepare the data to be saved in Firestore
    const appointmentData = {
      date: date,
      time: time,
    };

    // Save the data to Firestore
    // Save the data to Firestore
    const appointmentRef = doc(db, "appointments", callId);
    await setDoc(appointmentRef, appointmentData);

    console.log("Appointment saved successfully to Firestore");

    // Respond with the required format
    res.json({
      results: [
        {
          toolCallId: toolCall.id,
          result: `appointment successfully booked for date ${appointmentData.date} and time ${appointmentData.time}`,
        },
      ],
    });
  } catch (error) {
    console.error("Error saving appointment to Firestore:", error);

    // Respond with an error message
    res.status(500).json({ error: "Failed to save appointment to Firestore" });
  }
});

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

// app.post(
//   "/campaign/schedule",
//   [
//     body("campaign_id").notEmpty().withMessage("Campaign ID is required"),
//     body("date").isISO8601().withMessage("Invalid date format"),
//     body("start_time")
//       .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
//       .withMessage("Invalid start time format"),
//     body("end_time")
//       .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
//       .withMessage("Invalid end time format"),
//     body("timezone").notEmpty().withMessage("Timezone is required"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     try {
//       const { campaign_id, date, start_time, end_time, timezone } = req.body;

//       // Convert campaign date and times to Date objects in the specified timezone
//       const campaignDate = parseISO(date);
//       const [startHour, startMinute] = start_time.split(":").map(Number);
//       const [endHour, endMinute] = end_time.split(":").map(Number);

//       const startDateTime = zonedTimeToUtc(
//         new Date(
//           campaignDate.getFullYear(),
//           campaignDate.getMonth(),
//           campaignDate.getDate(),
//           startHour,
//           startMinute,
//         ),
//         timezone,
//       );

//       const endDateTime = zonedTimeToUtc(
//         new Date(
//           campaignDate.getFullYear(),
//           campaignDate.getMonth(),
//           campaignDate.getDate(),
//           endHour,
//           endMinute,
//         ),
//         timezone,
//       );

//       const now = new Date();
//       const currentTimeInZone = utcToZonedTime(now, timezone);

//       // Compare just the date portions
//       const campaignDay = startOfDay(campaignDate);
//       const currentDay = startOfDay(currentTimeInZone);
//       const isToday = isEqual(campaignDay, currentDay);
//       const isPastDay = isPast(campaignDay) && !isToday;
//       const isFutureDay = isFuture(campaignDay);

//       // Check if start_time >= end_time
//       if (startDateTime >= endDateTime) {
//         await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
//         return res.json({
//           message:
//             "Campaign marked as ended: start time is after or equal to end time",
//           status: "ended",
//         });
//       }

//       // If date is in the future, schedule the campaign
//       if (isFutureDay) {
//         const [hour, minute] = start_time.split(":");
//         const cronExpression = `${minute} ${hour} ${campaignDate.getDate()} ${campaignDate.getMonth() + 1} *`;

//         cron.schedule(
//           cronExpression,
//           async () => {
//             logger.info(`Starting scheduled campaign: ${campaign_id}`);
//             try {
//               await processCampaignCalls(campaign_id);
//             } catch (error) {
//               logger.error(`Error executing campaign ${campaign_id}:`, error);
//             }
//           },
//           {
//             timezone,
//             scheduled: true,
//           },
//         );

//         return res.json({
//           message: "Campaign scheduled successfully",
//           status: "scheduled",
//         });
//       }

//       // If date is in the past (not today)
//       if (isPastDay) {
//         await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
//         return res.json({
//           message: "Campaign marked as ended: campaign date is in the past",
//           status: "ended",
//         });
//       }

//       // If date is today
//       if (isToday) {
//         // If start time is in the future, schedule it
//         if (isFuture(startDateTime)) {
//           const [hour, minute] = start_time.split(":");
//           const cronExpression = `${minute} ${hour} ${campaignDate.getDate()} ${campaignDate.getMonth() + 1} *`;

//           cron.schedule(
//             cronExpression,
//             async () => {
//               logger.info(`Starting scheduled campaign: ${campaign_id}`);
//               try {
//                 await processCampaignCalls(campaign_id);
//               } catch (error) {
//                 logger.error(`Error executing campaign ${campaign_id}:`, error);
//               }
//             },
//             {
//               timezone,
//               scheduled: true,
//             },
//           );

//           return res.json({
//             message: "Campaign scheduled successfully for today",
//             status: "scheduled",
//           });
//         }

//         // If start time and end time are in the past
//         if (isPast(startDateTime) && isPast(endDateTime)) {
//           await updateDoc(doc(db, "campaigns", campaign_id), {
//             status: "ended",
//           });
//           return res.json({
//             message:
//               "Campaign marked as ended: start and end times are in the past",
//             status: "ended",
//           });
//         }

//         // If start time is in the past but end time is in the future, start immediately
//         if (isPast(startDateTime) && isFuture(endDateTime)) {
//           logger.info(`Starting campaign immediately: ${campaign_id}`);
//           try {
//             // Start the campaign processing immediately
//             processCampaignCalls(campaign_id).catch((error) => {
//               logger.error(`Error executing campaign ${campaign_id}:`, error);
//             });

//             return res.json({
//               message: "Campaign started immediately",
//               status: "started",
//             });
//           } catch (error) {
//             logger.error("Error starting campaign:", error);
//             return res.status(500).json({ error: "Failed to start campaign" });
//           }
//         }
//       }

//       // Default response for any edge cases
//       return res.status(400).json({
//         error: "Invalid campaign schedule configuration",
//         status: "error",
//       });
//     } catch (error) {
//       logger.error("Error scheduling campaign:", error);
//       res.status(500).json({ error: "Failed to schedule campaign" });
//     }
//   },
// );

app.post(
  "/campaign/schedule",
  [
    body("campaign_id").notEmpty().withMessage("Campaign ID is required"),
    body("start_date").isISO8601().withMessage("Invalid start date format"),
    body("end_date").isISO8601().withMessage("Invalid end date format"),
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
      const {
        campaign_id,
        start_date,
        end_date,
        start_time,
        end_time,
        timezone,
      } = req.body;

      // Validate date range
      const startDate = parseISO(start_date);
      const endDate = parseISO(end_date);

      if (
        isPast(startDate) &&
        !isEqual(startOfDay(startDate), startOfDay(new Date()))
      ) {
        await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
        return res.json({
          message: "Campaign marked as ended: start date is in the past",
          status: "ended",
        });
      }

      if (endDate < startDate) {
        await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
        return res.json({
          message: "Campaign marked as ended: end date is before start date",
          status: "ended",
        });
      }

      // Parse times
      const [startHour, startMinute] = start_time.split(":").map(Number);
      const [endHour, endMinute] = end_time.split(":").map(Number);

      // Check if start_time >= end_time
      const startDateTime = new Date();
      startDateTime.setHours(startHour, startMinute, 0);
      const endDateTime = new Date();
      endDateTime.setHours(endHour, endMinute, 0);

      if (startDateTime >= endDateTime) {
        await updateDoc(doc(db, "campaigns", campaign_id), { status: "ended" });
        return res.json({
          message:
            "Campaign marked as ended: start time is after or equal to end time",
          status: "ended",
        });
      }

      // Schedule daily cron job for the campaign
      const cronExpression = `${startMinute} ${startHour} * * *`;

      cron.schedule(
        cronExpression,
        async () => {
          try {
            // Check if current date is within campaign date range
            const now = utcToZonedTime(new Date(), timezone);
            const currentDate = startOfDay(now);

            if (
              currentDate < startOfDay(startDate) ||
              currentDate > startOfDay(endDate)
            ) {
              return;
            }

            // Check if current time is within campaign hours
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = currentHour * 60 + currentMinute;
            const campaignStartTime = startHour * 60 + startMinute;
            const campaignEndTime = endHour * 60 + endMinute;

            if (
              currentTime < campaignStartTime ||
              currentTime > campaignEndTime
            ) {
              return;
            }

            // Check campaign status
            const campaignDoc = await getDoc(doc(db, "campaigns", campaign_id));
            if (
              !campaignDoc.exists() ||
              campaignDoc.data().status === "ended"
            ) {
              return;
            }

            logger.info(`Starting scheduled campaign: ${campaign_id}`);
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

      // If today is within the date range and current time is within campaign hours, start immediately
      const now = utcToZonedTime(new Date(), timezone);
      const currentDate = startOfDay(now);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;
      const campaignStartTime = startHour * 60 + startMinute;
      const campaignEndTime = endHour * 60 + endMinute;

      if (
        currentDate >= startOfDay(startDate) &&
        currentDate <= startOfDay(endDate) &&
        currentTime >= campaignStartTime &&
        currentTime <= campaignEndTime
      ) {
        logger.info(`Starting campaign immediately: ${campaign_id}`);
        processCampaignCalls(campaign_id).catch((error) => {
          logger.error(`Error executing campaign ${campaign_id}:`, error);
        });
      }

      return res.json({
        message: "Campaign scheduled successfully",
        status: "scheduled",
      });
    } catch (error) {
      logger.error("Error scheduling campaign:", error);
      res.status(500).json({ error: "Failed to schedule campaign" });
    }
  },
);

// Wildcard route
app.post("/*", (req, res) => {
  console.log("wildcard route");
  console.log("Path:", req.path);
  console.log("Original URL:", req.originalUrl);
  console.log(req.body);
  res.json({
    results: [
      { toolCallId: req.body.toolCalls.id, result: "booked successfully" },
    ],
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
