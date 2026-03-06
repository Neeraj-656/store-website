import "dotenv/config";

const config = {
  app: {
    port: parseInt(process.env.PORT || "3003", 10),
    env: process.env.NODE_ENV || "development",
    name: process.env.SERVICE_NAME || "notification-service",
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  email: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || "Notifications <no-reply@app.com>",
  },

  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  push: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || "5", 10),
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || "3", 10),
    retryDelayMs: parseInt(process.env.QUEUE_RETRY_DELAY_MS || "5000", 10),
  },
};

export default config;