import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { QUEUE_NAMES, redisConnection } from "../queues/index.js";

// ─── Nodemailer transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

// ─── Worker ───────────────────────────────────────────────────────────────────
const emailWorker = new Worker(
  QUEUE_NAMES.EMAIL,
  async (job) => {
    const { notificationId, recipient, subject, body } = job.data;

    logger.info("Processing email job", { jobId: job.id, notificationId, recipient });

    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    const info = await transporter.sendMail({
      from: config.email.from,
      to: recipient,
      subject: subject || "Notification",
      html: body,
    });

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
        metadata: {
          ...(typeof job.data.metadata === "object" ? job.data.metadata : {}),
          messageId: info.messageId,
        },
      },
    });

    logger.info("Email sent", { notificationId, messageId: info.messageId, recipient });
    return { messageId: info.messageId };
  },
  {
    connection: redisConnection,
    concurrency: config.queue.concurrency,
  }
);

// ─── Event hooks ─────────────────────────────────────────────────────────────
emailWorker.on("failed", async (job, err) => {
  logger.error("Email job failed", {
    jobId: job?.id,
    notificationId: job?.data?.notificationId,
    error: err.message,
    attempts: job?.attemptsMade,
  });

  if (job?.data?.notificationId) {
    const isFinal = job.attemptsMade >= (job.opts?.attempts || config.queue.maxRetries);
    await prisma.notification.update({
      where: { id: job.data.notificationId },
      data: { status: isFinal ? "FAILED" : "RETRYING", error: err.message },
    });
  }
});

emailWorker.on("error", (err) => {
  logger.error("Email worker error", { error: err.message });
});

logger.info("📧 Email worker started");

export default emailWorker;