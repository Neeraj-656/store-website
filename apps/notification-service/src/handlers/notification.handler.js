import Joi from "joi";
import { v4 as uuidv4 } from "uuid";
import * as notificationService from "../services/notification.service.js";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";
import { getQueueStats } from "../queues/index.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const channelSchema = Joi.string().valid("EMAIL", "SMS", "PUSH").required();

const orderConfirmationSchema = Joi.object({
  channel: channelSchema,
  recipient: Joi.string().required(),
  variables: Joi.object({
    customerName: Joi.string().required(),
    orderId: Joi.string().required(),
    items: Joi.array().items(Joi.object()).optional(),
    total: Joi.string().optional(),
    estimatedDelivery: Joi.string().optional(),
    trackingUrl: Joi.string().optional(),
  }).required(),
  metadata: Joi.object().optional(),
});

const vendorAlertSchema = Joi.object({
  channel: channelSchema,
  recipient: Joi.string().required(),
  variables: Joi.object({
    vendorName: Joi.string().required(),
    orderId: Joi.string().required(),
    customerName: Joi.string().required(),
    items: Joi.array().items(Joi.object()).optional(),
    total: Joi.string().optional(),
    dashboardUrl: Joi.string().optional(),
    orderDate: Joi.string().optional(),
  }).required(),
  metadata: Joi.object().optional(),
});

const refundSchema = Joi.object({
  channel: channelSchema,
  recipient: Joi.string().required(),
  variables: Joi.object({
    customerName: Joi.string().required(),
    orderId: Joi.string().required(),
    refundAmount: Joi.string().required(),
    refundMethod: Joi.string().optional(),
    expectedArrival: Joi.string().optional(),
    initiatedAt: Joi.string().optional(),
  }).required(),
  metadata: Joi.object().optional(),
});

const otpSchema = Joi.object({
  channel: channelSchema,
  recipient: Joi.string().required(),
  variables: Joi.object({
    code: Joi.string().required(),
    purpose: Joi.string().required(),
    expiresInMinutes: Joi.number().optional(),
  }).required(),
  metadata: Joi.object().optional(),
  saveOtp: Joi.boolean().default(true),
  otpExpiresInMinutes: Joi.number().default(10),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const msg = error.details.map((d) => d.message).join(", ");
    throw Object.assign(new Error(msg), { statusCode: 400 });
  }
  return value;
}

function respond(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function handleError(res, err) {
  logger.error("Handler error", { message: err.message, stack: err.stack });
  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export async function sendOrderConfirmation(req, res) {
  try {
    const body = validate(orderConfirmationSchema, req.body);
    const result = await notificationService.sendOrderConfirmation(body);
    return respond(res, result, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function sendVendorOrderAlert(req, res) {
  try {
    const body = validate(vendorAlertSchema, req.body);
    const result = await notificationService.sendVendorOrderAlert(body);
    return respond(res, result, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function sendRefundNotification(req, res) {
  try {
    const body = validate(refundSchema, req.body);
    const result = await notificationService.sendRefundNotification(body);
    return respond(res, result, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function sendOTP(req, res) {
  try {
    const body = validate(otpSchema, req.body);
    const { saveOtp, otpExpiresInMinutes, ...dispatchPayload } = body;

    if (saveOtp) {
      const expiresAt = new Date(Date.now() + otpExpiresInMinutes * 60 * 1000);
      await prisma.oTP.create({
        data: {
          id: uuidv4(),
          recipient: body.recipient,
          code: body.variables.code,
          purpose: body.variables.purpose,
          expiresAt,
        },
      });
    }

    const result = await notificationService.sendOTP(dispatchPayload);
    return respond(res, result, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getNotification(req, res) {
  try {
    const notification = await notificationService.getNotificationById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }
    return respond(res, { notification });
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listNotifications(req, res) {
  try {
    const { status, type, category, page, limit } = req.query;
    const result = await notificationService.listNotifications({
      status,
      type,
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return respond(res, result);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function registerPushToken(req, res) {
  try {
    const { userId, deviceToken, platform } = req.body;
    if (!userId || !deviceToken || !platform) {
      return res.status(400).json({ success: false, error: "userId, deviceToken, platform required" });
    }

    const config = await prisma.pushConfig.upsert({
      where: { userId_deviceToken: { userId, deviceToken } },
      update: { isActive: true, platform },
      create: { id: uuidv4(), userId, deviceToken, platform },
    });

    return respond(res, { pushConfig: config }, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function healthCheck(req, res) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const queueStats = await getQueueStats();
    return respond(res, { status: "healthy", queues: queueStats });
  } catch (err) {
    return res.status(503).json({ success: false, status: "unhealthy", error: err.message });
  }
}