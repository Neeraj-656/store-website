import { Worker } from "bullmq";
import admin from "firebase-admin";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import config from "../config/index.js";
import { QUEUE_NAMES, redisConnection } from "../queues/index.js";

// ─── Firebase initialization (singleton) ─────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.push.projectId,
      privateKey: config.push.privateKey,
      clientEmail: config.push.clientEmail,
    }),
  });
}

const fcm = admin.messaging();

// ─── Worker ───────────────────────────────────────────────────────────────────
const pushWorker = new Worker(
  QUEUE_NAMES.PUSH,
  async (job) => {
    const { notificationId, recipient, subject, body, metadata } = job.data;

    logger.info("Processing push job", { jobId: job.id, notificationId, recipient });

    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    let tokens = [];

    if (recipient.startsWith("user:")) {
      const userId = recipient.replace("user:", "");
      const configs = await prisma.pushConfig.findMany({
        where: { userId, isActive: true },
        select: { deviceToken: true },
      });
      tokens = configs.map((c) => c.deviceToken);
    } else {
      tokens = [recipient];
    }

    if (!tokens.length) {
      logger.warn("No push tokens found, skipping", { notificationId, recipient });
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: "SENT", sentAt: new Date(), error: "No active device tokens" },
      });
      return { skipped: true };
    }

    const message = {
      notification: {
        title: subject || "Notification",
        body,
      },
      data: metadata
        ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)]))
        : {},
      tokens,
    };

    const response = await fcm.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          logger.warn("FCM token failed", { token: tokens[idx], error: resp.error?.message });
        }
      });

      if (failedTokens.length) {
        await prisma.pushConfig.updateMany({
          where: { deviceToken: { in: failedTokens } },
          data: { isActive: false },
        });
      }
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        error: null,
        metadata: {
          ...(typeof metadata === "object" ? metadata : {}),
          successCount: response.successCount,
          failureCount: response.failureCount,
        },
      },
    });

    logger.info("Push sent", {
      notificationId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    return { successCount: response.successCount, failureCount: response.failureCount };
  },
  {
    connection: redisConnection,
    concurrency: config.queue.concurrency,
  }
);

// ─── Event hooks ─────────────────────────────────────────────────────────────
pushWorker.on("failed", async (job, err) => {
  logger.error("Push job failed", {
    jobId: job?.id,
    notificationId: job?.data?.notificationId,
    error: err.message,
  });

  if (job?.data?.notificationId) {
    const isFinal = job.attemptsMade >= (job.opts?.attempts || config.queue.maxRetries);
    await prisma.notification.update({
      where: { id: job.data.notificationId },
      data: { status: isFinal ? "FAILED" : "RETRYING", error: err.message },
    });
  }
});

pushWorker.on("error", (err) => {
  logger.error("Push worker error", { error: err.message });
});

logger.info("🔔 Push worker started");

export default pushWorker;