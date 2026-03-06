import "dotenv/config";
import express   from "express";
import config    from "./config/index.js";
import logger    from "./utils/logger.js";
import prisma    from "./utils/prisma.js";
import { closeQueues } from "./queues/index.js";
import * as h    from "./handlers/notification.handler.js";

const app = express();
app.use(express.json());

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ─── FIX #8: Internal Service Auth ───────────────────────────────────────────
// The notification service has no public-facing routes.
// Every caller must present the shared internal service token.
// This prevents any network-reachable process from triggering OTPs or order
// confirmation emails for arbitrary users.
//
// The health endpoint is intentionally exempted so k8s probes work without auth.

const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

function requireServiceAuth(req, res, next) {
  // Skip auth for the health/readiness probes
  if (req.path === '/health' || req.path === '/ready') return next();

  const token = req.headers['x-internal-service-token'];

  if (!token) {
    logger.warn({ path: req.path, ip: req.ip }, 'Notification service: missing service token');
    return res.status(401).json({ success: false, error: 'Missing x-internal-service-token header' });
  }

  if (!INTERNAL_TOKEN) {
    // Startup guard: log a hard warning if token is not configured
    logger.error('INTERNAL_SERVICE_TOKEN env var is not set. All service requests will be rejected.');
    return res.status(503).json({ success: false, error: 'Service auth not configured' });
  }

  if (token !== INTERNAL_TOKEN) {
    logger.warn({ path: req.path, ip: req.ip }, 'Notification service: invalid service token');
    return res.status(401).json({ success: false, error: 'Invalid service token' });
  }

  next();
}

app.use(requireServiceAuth);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health (auth-exempt — checked above in requireServiceAuth)
app.get("/health", h.healthCheck);

// Readiness probe
app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "READY", service: "notification-service" });
  } catch (err) {
    res.status(503).json({ status: "UNREADY", error: err.message });
  }
});

// Notification dispatch
app.post("/notifications/order-confirmation", h.sendOrderConfirmation);
app.post("/notifications/vendor-order-alert",  h.sendVendorOrderAlert);
app.post("/notifications/refund",              h.sendRefundNotification);
app.post("/notifications/otp",                 h.sendOTP);

// Notification log
app.get("/notifications",     h.listNotifications);
app.get("/notifications/:id", h.getNotification);

// Push token registry
app.post("/push-configs", h.registerPushToken);

// 404
app.use((_req, res) => res.status(404).json({ success: false, error: "Not found" }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { message: err.message });
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(config.app.port, () => {
  logger.info(`✅ ${config.app.name} listening on port ${config.app.port} [${config.app.env}]`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down...`);
  server.close(async () => {
    await closeQueues();
    await prisma.$disconnect();
    logger.info("Server closed. Bye!");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

export default app;
