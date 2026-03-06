import { Worker } from "bullmq";
import twilio from "twilio";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { QUEUE_NAMES, redisConnection } from "../queues/index.js";

// ─── Twilio client ────────────────────────────────────────────────────────────
const twilioClient = twilio(config.sms.accountSid, config.sms.authToken);

// ─── Worker ───────────────────────────────────────────────────────────────────
const smsWorker = new Worker(
  QUEUE_NAMES.SMS,
  async (job) => {
    const { notificationId, recipient, body } = job.data;

    logger.info("Processing SMS job", { jobId: job.id, notificationId, recipient });

    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    const message = await twilioClient.messages.create({
      from: config.sms.phoneNumber,
      to: recipient,
      body,
    });

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
        metadata: {
          ...(typeof job.data.metadata === "object" ? job.data.metadata : {}),
          twilioSid: message.sid,
          twilioStatus: message.status,
        },
      },
    });

    logger.info("SMS sent", { notificationId, twilioSid: message.sid, recipient });
    return { sid: message.sid };
  },
  {
    connection: redisConnection,
    concurrency: config.queue.concurrency,
  }
);

// ─── Event hooks ─────────────────────────────────────────────────────────────

smsWorker.on("failed", async (job, err) => {
  logger.error("SMS job failed", {
    jobId: job?.id,
    notificationId: job?.data?.notificationId,
    error: err.message,
    attempts: job?.attemptsMade,
  });

  if (job?.data?.notificationId) {
    const isFinal = job.attemptsMade >= (job.opts?.attempts || config.queue.maxRetries);
    await prisma.notification.update({
      where: { id: job.data.notificationId },
      data: {
        status: isFinal ? "FAILED" : "RETRYING",
        error: err.message,
      },
    });
  }
});

smsWorker.on("error", (err) => {
  logger.error("SMS worker error", { error: err.message });
});

logger.info("📱 SMS worker started");

export default smsWorker;