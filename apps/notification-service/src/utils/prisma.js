import { PrismaClient } from "@prisma/client";
import logger from "./logger.js";

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

prisma.$on("error", (e) => {
  logger.error("Prisma error", { message: e.message, target: e.target });
});

prisma.$on("warn", (e) => {
  logger.warn("Prisma warning", { message: e.message });
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;