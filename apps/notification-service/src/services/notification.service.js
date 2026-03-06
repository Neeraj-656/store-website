import { v4 as uuidv4 } from "uuid";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import { emailQueue, smsQueue, pushQueue } from "../queues/index.js";
import { renderTemplate, resolveTemplateName } from "./template.service.js";

export async function sendOrderConfirmation({ channel, recipient, variables, metadata = {} }) {
  return _dispatch({
    type: channel,
    category: "ORDER_CONFIRMATION",
    recipient,
    variables,
    metadata,
  });
}

export async function sendVendorOrderAlert({ channel, recipient, variables, metadata = {} }) {
  return _dispatch({
    type: channel,
    category: "VENDOR_ORDER_ALERT",
    recipient,
    variables,
    metadata,
  });
}

export async function sendRefundNotification({ channel, recipient, variables, metadata = {} }) {
  return _dispatch({
    type: channel,
    category: "REFUND_NOTIFICATION",
    recipient,
    variables,
    metadata,
  });
}

export async function sendOTP({ channel, recipient, variables, metadata = {} }) {
  return _dispatch({
    type: channel,
    category: "OTP_DELIVERY",
    recipient,
    variables,
    metadata,
    jobOptions: { priority: 1 },
  });
}

// ─── Core dispatcher ─────────────────────────────────────────────────────────

async function _dispatch({ type, category, recipient, variables, metadata, jobOptions = {} }) {
  const templateName = resolveTemplateName(category, type);
  const { subject, body } = await renderTemplate(templateName, variables);

  const notification = await prisma.notification.create({
    data: {
      id: uuidv4(),
      type,
      category,
      status: "PENDING",
      recipient,
      subject,
      body,
      metadata,
    },
  });

  const queue = _pickQueue(type);
  const job = await queue.add(
    category,
    {
      notificationId: notification.id,
      type,
      category,
      recipient,
      subject,
      body,
      metadata,
    },
    jobOptions
  );

  await prisma.notification.update({
    where: { id: notification.id },
    data: { status: "QUEUED", jobId: job.id },
  });

  logger.info("Notification queued", {
    notificationId: notification.id,
    jobId: job.id,
    type,
    category,
    recipient,
  });

  return { notificationId: notification.id, jobId: job.id };
}

function _pickQueue(type) {
  switch (type) {
    case "EMAIL": return emailQueue;
    case "SMS":   return smsQueue;
    case "PUSH":  return pushQueue;
    default:      throw new Error(`Unknown notification type: ${type}`);
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export async function getNotificationById(id) {
  return prisma.notification.findUnique({ where: { id } });
}

export async function listNotifications({ status, type, category, page = 1, limit = 20 } = {}) {
  const where = {};
  if (status)   where.status   = status;
  if (type)     where.type     = type;
  if (category) where.category = category;

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}