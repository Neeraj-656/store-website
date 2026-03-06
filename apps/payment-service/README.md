# 💳 Payment Service

**Base URL:** `/api/v1/payments`  
**Port:** `3003`  
**Stack:** Node.js · ES Modules · Express · Razorpay · PostgreSQL · Prisma · RabbitMQ

---

## 🎯 Responsibilities

| Owns | Must NOT Do |
|------|------------|
| Razorpay Order creation | Deduct inventory |
| Payment signature verification | Change order status directly |
| Payment status lifecycle | Orchestrate sagas |
| Partial + full refunds | |
| Webhook signature validation | |
| Idempotency keys | |

---

## 🏗️ Razorpay Flow

```
1. Order Service  →  POST /internal/initiate
                          ↓
2. Payment Svc    →  Razorpay: create Order  →  razorpayOrderId
                          ↓
3. Frontend       ←  razorpayOrderId + keyId (returned to client)
                          ↓
4. Customer pays in Razorpay Checkout widget
                          ↓
5. Frontend       →  POST /verify  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
                          ↓
6. Payment Svc    →  Verify HMAC → mark SUCCESS → emit payment.success
                          ↓ (also)
7. Razorpay       →  POST /webhooks/razorpay  (payment.captured backup)
```

---

## 🔐 Security Model

| Route | Auth |
|-------|------|
| `POST /internal/initiate` | `x-internal-service-token` |
| `GET  /internal/order/:id` | `x-internal-service-token` |
| `POST /verify` | JWT Bearer |
| `GET  /:id` | JWT Bearer (own or admin) |
| `POST /:id/refund` | JWT Bearer (`user` or `admin`) |
| `POST /webhooks/razorpay` | HMAC-SHA256 signature |

---

## 📡 API Reference

### ❤️ Health
```
GET /api/v1/payments/health
→ 200 { "status": "UP" }
```

---

### 🔒 INTERNAL — Initiate Payment
```
POST /api/v1/payments/internal/initiate
x-internal-service-token: <token>

Body:
{
  "orderId":        "uuid",
  "userId":         "uuid",
  "amount":         50000,      ← paise (₹500 = 50000 paise)
  "currency":       "INR",
  "idempotencyKey": "optional"
}

201:
{
  "success": true,
  "data": {
    "id":              "pay_uuid",
    "orderId":         "...",
    "razorpayOrderId": "order_xxx",   ← pass this to the frontend
    "status":          "PROCESSING",
    "amount":          50000,
    "currency":        "INR"
  }
}
```

---

### ✅ Verify Payment (Frontend → Backend after checkout)
```
POST /api/v1/payments/verify
Authorization: Bearer <JWT>

Body:
{
  "razorpayOrderId":   "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "hmac_hex"
}

200:
{
  "success": true,
  "data": { "id": "...", "status": "SUCCESS", "razorpayPaymentId": "pay_xxx" }
}
```

---

### 🔒 INTERNAL — Get Payment by Order ID
```
GET /api/v1/payments/internal/order/:orderId
x-internal-service-token: <token>

200: { "success": true, "data": { ...payment, refunds[], statusHistory[] } }
```

---

### 👤 Get Payment by ID
```
GET /api/v1/payments/:id
Authorization: Bearer <JWT>

200: { "success": true, "data": { ...payment, refunds[], statusHistory[] } }
```
Users see only their own; admins see any.

---

### 💸 Request Refund
```
POST /api/v1/payments/:paymentId/refund
Authorization: Bearer <JWT>

Body:
{
  "amount": 25000,             ← paise; omit for full refund
  "reason": "customer_request"
}

200:
{
  "success": true,
  "data": {
    "refund":  { "id": "...", "status": "SUCCESS | PROCESSING", "type": "PARTIAL | FULL" },
    "payment": { "id": "...", "status": "PARTIALLY_REFUNDED | REFUNDED" }
  }
}
```

---

### 🪝 Razorpay Webhook
```
POST /api/v1/payments/webhooks/razorpay
x-razorpay-signature: <hmac-sha256>

Handled events:
  payment.captured     → SUCCESS  + payment.success
  payment.failed       → FAILED   + payment.failed
  refund.processed     → Refund status updated
  refund.speed_changed → Refund status updated
```

---

## 📤 RabbitMQ Events

| Routing Key | When |
|-------------|------|
| `payment.success` | Payment confirmed (verify or webhook) |
| `payment.failed` | Payment declined or Razorpay order failed |
| `payment.refunded` | Refund confirmed (partial or full) |

Events are written via **Transactional Outbox** — same DB transaction as the state change — and relayed to RabbitMQ every 2s by a background worker. Zero event loss on crash.

---

## 🔄 State Machine

```
INITIATED → PROCESSING → SUCCESS → PARTIALLY_REFUNDED → REFUNDED
                       ↘ FAILED
                       ↘ CANCELLED
```

---

## 🚀 Local Setup

```bash
cp .env.example .env          # fill in your Razorpay test keys

docker-compose up -d postgres rabbitmq

npm install
npx prisma migrate dev --name init

npm run dev                   # nodemon on port 3003
```

### Testing the flow locally
Use [Razorpay's test credentials](https://razorpay.com/docs/payments/dashboard/test-mode/) and the [Razorpay webhook simulator](https://dashboard.razorpay.com/app/webhooks) pointed at your local tunnel (ngrok/localtunnel).

---

## ⬆️ Prisma v7 Upgrade Notes

This project uses **Prisma v7** (latest). Here's what changed from v5 and what was updated:

### 1. New packages
```bash
npm install @prisma/client@7 @prisma/adapter-pg@7 pg
npm install -D prisma@7
```
`@prisma/adapter-pg` is new and **required** — Prisma v7 dropped the built-in Rust query engine.

### 2. `prisma/schema.prisma` — two changes
```prisma
generator client {
  provider = "prisma-client"                    # was: prisma-client-js
  output   = "../src/generated/prisma/client"   # now REQUIRED (no longer goes to node_modules)
}
```

### 3. New `prisma.config.js` at project root
Prisma v7 requires a config file for CLI operations (migrate, studio, etc):
```js
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
});
```

### 4. `src/prisma/client.js` — driver adapter is now mandatory
```js
// Before (v5):
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// After (v7):
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';  // ← new path
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

### 5. Generated client import path changed
```js
// Before: import { PrismaClient } from '@prisma/client'
// After:  import { PrismaClient } from '../generated/prisma/client.js'
```
The path is relative to where the file lives, matching `output` in schema.prisma.

### 6. `dotenv` no longer auto-loaded by Prisma CLI
Always load it yourself. In this project `import 'dotenv/config'` is the first line of `src/index.js` and `prisma.config.js`.

### 7. Node.js minimum version
Prisma v7 requires **Node.js >= 20.19.0** (recommended: 22.x).
