# API Gateway

Single entry-point for all microservices. Handles JWT verification, rate
limiting, CORS, correlation IDs, and proxying to downstream services.

## Service Routing

| Gateway prefix        | Service           | Port  |
|-----------------------|-------------------|-------|
| `/api/v1/auth`        | authService       | 3000  |
| `/api/v1/products`    | catalogService    | 3001  |
| `/api/v1/orders`      | orderService      | 3002  |
| `/api/v1/payments`    | paymentService    | 3004  |
| `/api/v1/reviews`     | reviewService     | 3005  |
| `/api/v1/inventory`   | inventoryService  | 3006* |
| `/api/v1/vendors`     | vendor-service    | 3007  |
| `/api/v1/payouts`     | payoutService     | 3008  |
| `/api/v1/admin`       | adminService      | 3009  |

> **\* Port conflict resolved**: both `inventoryService` and `reviewService`
> originally used `PORT=3005` in their `.env` files. The docker-compose
> overrides `inventoryService` to port **3006**. Update the service's own
> `.env` to match.

Similarly, `vendor-service` and `payoutService` both had `PORT=3007`.
Payout is remapped to **3008** and admin to **3009** in docker-compose.

## Quick Start

```bash
# 1. Copy and fill in env vars
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start everything with Docker Compose
docker compose up --build

# 4. Or run the gateway alone (services must be running separately)
npm run dev
```

## Environment Variables

See `.env.example` for all options. Key vars:

| Variable                | Description                                                  |
|-------------------------|--------------------------------------------------------------|
| `PORT`                  | Gateway listen port (default `8080`)                        |
| `AUTH_SERVICE_URL`      | Auth service base URL                                        |
| `INTERNAL_SERVICE_TOKEN`| Shared secret injected as `x-internal-service-token`        |
| `CORS_ORIGINS`          | Comma-separated allowed origins, or `*`                      |
| `RATE_LIMIT_GLOBAL_MAX` | Requests per IP per minute (all routes)                      |
| `RATE_LIMIT_AUTH_MAX`   | Requests per IP per minute (auth routes)                     |

## Security Model

### JWT Verification
- The gateway fetches the **RS256 public key** from
  `AUTH_SERVICE_URL/api/v1/auth/public-key` at startup.
- Every non-public request must carry a valid `Authorization: Bearer <token>`.
- On success, `x-user-id`, `x-user-role`, and `x-user-email` are injected
  as trusted headers for downstream services.

### Blocked Internal Routes
The following paths are **blocked at the gateway** (403) — they are for
internal service-to-service communication only:

- `POST /api/v1/auth/register/admin`
- `POST/GET /api/v1/auth/internal/*`
- `POST /api/v1/payments/internal/*`
- `POST /api/v1/payouts/internal/*`
- `POST /api/v1/inventory/adjust|reserve|deduct|release`
- `GET /api/v1/vendors/internal/*`

### Public Routes (no token required)
- `POST /api/v1/auth/register/customer`
- `POST /api/v1/auth/register/vendor`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET  /api/v1/auth/public-key`
- `GET  /api/v1/products/public/:id`
- `GET  /health`

### Header Stripping
Inbound requests cannot inject `x-internal-service-token`, `x-user-id`,
`x-user-role`, or `x-user-email` — the gateway strips them before any
processing.
