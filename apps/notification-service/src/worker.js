import "dotenv/config";
import logger from "./utils/logger.js";

logger.info("🚀 Starting notification workers...");

import emailWorker from "./workers/email.worker.js";
import smsWorker from "./workers/sms.worker.js";
import pushWorker from "./workers/push.worker.js";

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down workers...`);
  await Promise.all([
    emailWorker.close(),
    smsWorker.close(),
    pushWorker.close(),
  ]);
  logger.info("All workers stopped. Bye!");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception in worker process", { error: err.message, stack: err.stack });
  shutdown("uncaughtException");
});