import 'dotenv/config';

const config = {
  port:    parseInt(process.env.PORT ?? '3007', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    audience:  process.env.JWT_AUDIENCE,
    issuer:    process.env.JWT_ISSUER,
  },

  internalToken: process.env.INTERNAL_SERVICE_TOKEN,

  rabbitmq: {
    url:      process.env.RABBITMQ_URL      ?? 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE ?? 'ecommerce_events',
  },

  // Razorpay X (Payouts API) — separate from Payment Service credentials
  razorpayX: {
    keyId:     process.env.RAZORPAYX_KEY_ID,
    keySecret: process.env.RAZORPAYX_KEY_SECRET,
  },

  escrow: {
    // How many days after delivery before escrow is released
    holdDays: parseInt(process.env.ESCROW_HOLD_DAYS ?? '3', 10),
  },

  settlement: {
    // Default platform commission if no CommissionRule exists
    defaultCommissionRate: parseFloat(process.env.DEFAULT_COMMISSION_RATE ?? '0.12'),
    defaultPaymentFeeRate: parseFloat(process.env.DEFAULT_PAYMENT_FEE_RATE ?? '0.02'),
  },
};

export default config;
