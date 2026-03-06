import { Queue } from "bullmq";
import config from "../config/index.js";
import logger from "../utils/logger.js";

// ─── Shared Redis connection options ─────────────────────────────────────────
const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password && { password: config.redis.password }),
  maxRetriesPerRequest: null,
};

// ─── Queue names ──────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  EMAIL: "notification_email",
  SMS: "notification_sms",
  PUSH: "notification_push",
};

// ─── Default job options ──────────────────────────────────────────────────────
const defaultJobOptions = {
  attempts: config.queue.maxRetries,
  backoff: {
    type: "exponential",
    delay: config.queue.retryDelayMs,
  },
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail: { count: 200, age: 7 * 24 * 3600 },
};

// ─── Queue instances ──────────────────────────────────────────────────────────
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
  connection: redisConnection,
  defaultJobOptions,
});

export const smsQueue = new Queue(QUEUE_NAMES.SMS, {
  connection: redisConnection,
  defaultJobOptions,
});

export const pushQueue = new Queue(QUEUE_NAMES.PUSH, {
  connection: redisConnection,
  defaultJobOptions,
});

// ─── Health check helper ──────────────────────────────────────────────────────
export async function getQueueStats() {
  const [emailCounts, smsCounts, pushCounts] = await Promise.all([
    emailQueue.getJobCounts(),
    smsQueue.getJobCounts(),
    pushQueue.getJobCounts(),
  ]);

  return {
    email: emailCounts,
    sms: smsCounts,
    push: pushCounts,
  };
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export async function closeQueues() {
  logger.info("Closing BullMQ queues...");
  await Promise.all([emailQueue.close(), smsQueue.close(), pushQueue.close()]);
  logger.info("Queues closed.");
}

export { redisConnection };