import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { format } from 'date-fns-tz';
import { body, validationResult } from 'express-validator';
import cron from 'node-cron';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { processCampaignCalls } from './services/callService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post('/current_date_and_time', (req, res) => {
  try {
    const dubaiTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss', { timeZone: 'Asia/Dubai' });
    res.json({ current_time: dubaiTime });
  } catch (error) {
    logger.error('Error getting current time:', error);
    res.status(500).json({ error: 'Failed to get current time' });
  }
});

app.post('/make_appointment', [
  body('date').isISO8601().withMessage('Invalid date format'),
  body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
  body('phone').isMobilePhone('any').withMessage('Invalid phone number'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Placeholder for appointment logic
  res.json({ message: 'Appointment scheduled successfully' });
});

app.post('/outbound', [
  body('call_id').notEmpty().withMessage('Call ID is required'),
  body('status').isIn(['completed', 'failed', 'no-answer']).withMessage('Invalid call status'),
  body('duration').isInt({ min: 0 }).withMessage('Invalid call duration'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Placeholder for call completion logic
  res.json({ message: 'Call status updated successfully' });
});

app.post('/campaign/schedule', [
  body('campaign_id').notEmpty().withMessage('Campaign ID is required'),
  body('date').isISO8601().withMessage('Invalid date format'),
  body('start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
  body('end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
  body('timezone').notEmpty().withMessage('Timezone is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { campaign_id, date, start_time, end_time, timezone } = req.body;

    // Schedule the campaign using node-cron
    const [hour, minute] = start_time.split(':');
    const cronExpression = `${minute} ${hour} ${new Date(date).getDate()} ${new Date(date).getMonth() + 1} *`;

    cron.schedule(cronExpression, async () => {
      logger.info(`Starting scheduled campaign: ${campaign_id}`);
      try {
        await processCampaignCalls(campaign_id);
      } catch (error) {
        logger.error(`Error executing campaign ${campaign_id}:`, error);
      }
    }, {
      timezone,
      scheduled: true,
    });

    res.json({ 
      message: 'Campaign scheduled successfully',
      schedule: {
        campaign_id,
        execution_time: `${date} ${start_time}`,
        timezone
      }
    });
  } catch (error) {
    logger.error('Error scheduling campaign:', error);
    res.status(500).json({ error: 'Failed to schedule campaign' });
  }
});

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});