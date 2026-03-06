# ⭐ Review Service

**Base URL:** `/api/v1/reviews`  
**Port:** `3004`  
**Stack:** Node.js 22 · ES Modules · Express · PostgreSQL · Prisma v7 · RabbitMQ

---

## 🎯 Responsibilities

| Owns | Must NOT Do |
|------|------------|
| Review CRUD | Manage orders |
| 1 review per product per customer | Handle payments |
| Rating aggregation (avg, star breakdown) | Call Order Service synchronously |
| Helpful/not-helpful voting | |
| Delivery verification (via event cache) | |
| Admin moderation | |

---

## 🏗️ Architecture

```
Order Service
    │  publishes order.delivered
    ▼
RabbitMQ ──► Review Service (consumer)
                  │  caches into DeliveredOrder table
                  │
Customer submits review
    │  POST /api/v1/reviews/products/:productId
    ▼
Review Service
    │  1. Check DeliveredOrder cache (order was delivered, contains product)
    │  2. Check duplicate (@@unique productId+userId)
    │  3. Create Review + recalculate ProductRating — one transaction
    │  4. Write ReviewOutboxEvent
    ▼
Outbox Relay Worker (every 2s)
    │  publishes to RabbitMQ
    ▼
  review.created
  review.rating_updated  ──► Catalog/Search re-indexes product
  review.updated
  review.deleted
  review.moderated
```

---

## 🔐 Security Model

| Route | Auth |
|-------|------|
| `GET /products/:productId` | Public |
| `GET /products/:productId/rating` | Public |
| `GET /:reviewId` | Public |
| `POST /products/:productId` | JWT — `role: user` only |
| `PATCH /:reviewId` | JWT — own review only |
| `DELETE /:reviewId` | JWT — own review; admin can delete any |
| `POST /:reviewId/vote` | JWT |
| `PATCH /:reviewId/moderate` | JWT — `role: admin` only |
| `GET /internal/ratings/:productId` | `x-internal-service-token` |

---

## 📡 API Reference

### ❤️ Health
```
GET /api/v1/reviews/health
→ 200 { "status": "UP" }
```

---

### 📋 List Reviews for a Product
```
GET /api/v1/reviews/products/:productId
  ?page=1&limit=10&rating=5&sort=newest|oldest|highest|lowest|helpful

200:
{
  "success": true,
  "data": [ ...reviews ],
  "meta": { "total": 42, "page": 1, "limit": 10, "pages": 5 }
}
```

---

### ⭐ Get Rating Summary
```
GET /api/v1/reviews/products/:productId/rating

200:
{
  "success": true,
  "data": {
    "productId": "MACBOOK-PRO-14",
    "averageRating": 4.73,
    "totalReviews": 148,
    "oneStar": 2, "twoStar": 3, "threeStar": 8, "fourStar": 21, "fiveStar": 114
  }
}
```

---

### 📝 Create Review
```
POST /api/v1/reviews/products/:productId
Authorization: Bearer <JWT>

Body:
{
  "orderId":  "uuid",           ← must be a delivered order owned by you
  "rating":   5,                ← 1–5
  "title":    "Great product",  ← optional, max 120 chars
  "body":     "..."             ← optional, max 5000 chars
}

201:
{
  "success": true,
  "data": {
    "review": { "id": "...", "productId": "...", "rating": 5, "status": "PUBLISHED" },
    "rating": { "averageRating": 4.73, "totalReviews": 149 }
  }
}
```

**Business rules enforced:**
- Order must be in local `DeliveredOrder` cache (populated from `order.delivered` event)
- Order must belong to the requesting user
- Order must contain the product being reviewed
- Only one review per product per customer (DB-level `@@unique`)

---

### ✏️ Update Review
```
PATCH /api/v1/reviews/:reviewId
Authorization: Bearer <JWT>

Body (all optional, at least one required):
{ "rating": 4, "title": "...", "body": "..." }
```

---

### 🗑️ Delete Review
```
DELETE /api/v1/reviews/:reviewId
Authorization: Bearer <JWT>
```
Users delete their own. Admins delete any.

---

### 👍 Vote on Review
```
POST /api/v1/reviews/:reviewId/vote
Authorization: Bearer <JWT>

Body: { "helpful": true }
```
One vote per user per review. Changing vote updates counts atomically.
Cannot vote on own review.

---

### 🔍 Get My Review for a Product
```
GET /api/v1/reviews/products/:productId/mine
Authorization: Bearer <JWT>
```

---

### 🛡️ Admin: Moderate Review
```
PATCH /api/v1/reviews/:reviewId/moderate
Authorization: Bearer <JWT (admin)>

Body: { "status": "PUBLISHED" | "REJECTED" }
```
Rejected reviews are excluded from rating aggregation and re-trigger `review.rating_updated`.

---

### 🔒 INTERNAL: Get Product Rating
```
GET /api/v1/reviews/internal/ratings/:productId
x-internal-service-token: <token>
```

---

## 📤 Events Published (RabbitMQ)

| Routing Key | Trigger |
|-------------|---------|
| `review.created` | New review published |
| `review.updated` | Review edited |
| `review.deleted` | Review removed |
| `review.moderated` | Admin changes status |
| `review.rating_updated` | Any event that changes the aggregate (create/update/delete/reject) |

`review.rating_updated` is the key event — Catalog and Search services subscribe to keep product metadata current.

## 📥 Events Consumed (RabbitMQ)

| Routing Key | Source | Action |
|-------------|--------|--------|
| `order.delivered` | Order Service | Cache into `DeliveredOrder` table |

---

## 🗄️ Data Model

```
Review            (id, productId, userId, orderId, rating, title, body, status, helpfulCount)
  @@unique([productId, userId])   ← 1 review per product per customer

ReviewHelpfulVote (id, reviewId→, userId, helpful)
  @@unique([reviewId, userId])    ← 1 vote per user per review

ProductRating     (productId*, averageRating, totalReviews, oneStar…fiveStar)
  ← materialized aggregate, updated in same transaction as every review change

DeliveredOrder    (orderId*, userId, productIds[], deliveredAt)
  ← local cache of order.delivered events — delivery verification without HTTP calls

ReviewOutboxEvent (eventType, payload, published)
  ← transactional outbox for guaranteed RabbitMQ delivery
```

---

## 🚀 Local Setup

```bash
cp .env.example .env

docker-compose up -d postgres rabbitmq

npm install
npx prisma migrate dev --name init

npm run dev    # nodemon, port 3004
```
