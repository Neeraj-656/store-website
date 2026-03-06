# 🌿 Verdant Market — Frontend

A premium Next.js 14 frontend for the Verdant organic grocery store, connecting to your microservices backend via the API Gateway at `localhost:8080`.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State (server) | TanStack Query v5 |
| State (client) | Zustand |
| Animations | Framer Motion |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| HTTP | Axios (with token refresh interceptor) |

## Architecture

```
app/
├── (store)/          ← Public grocery store (SEO + SSR)
│    └── page.tsx     ← Homepage: hero, categories, trending, all products
├── auth/
│    └── login/       ← Sign in + Register (customer & vendor)
├── orders/           ← Customer order history
├── vendor/           ← Vendor dashboard (protected: role=vendor)
│    ├── dashboard/   ← Stats, revenue chart, quick actions
│    ├── products/    ← Product CRUD
│    ├── orders/      ← Incoming orders view
│    └── payouts/     ← Wallet, ledger, payout requests
└── admin/            ← Admin panel (protected: role=admin)
     ├── dashboard/   ← Platform overview + service status
     ├── vendors/     ← KYC approvals + vendor management
     └── orders/      ← Force-cancel + force-refund
```

## API Endpoints Used

| Frontend Feature | Backend Endpoint |
|---|---|
| Login | `POST /api/v1/auth/login` |
| Register Customer | `POST /api/v1/auth/register/customer` |
| Register Vendor | `POST /api/v1/auth/register/vendor` |
| Logout | `POST /api/v1/auth/logout` |
| Token Refresh | `POST /api/v1/auth/refresh` |
| Get Public Product | `GET /api/v1/products/public/:id` |
| Create Product (vendor) | `POST /api/v1/products/vendor` |
| Create Order | `POST /api/v1/orders` |
| Checkout Order | `POST /api/v1/orders/:id/checkout` |
| My Orders | `GET /api/v1/orders/customer/:id` |
| Product Reviews | `GET /api/v1/reviews/products/:id` |
| Vendor Wallet | `GET /api/v1/payouts/wallet` |
| Request Payout | `POST /api/v1/payouts` |
| Admin Dashboard | `GET /api/v1/admin/dashboard` |
| Admin Vendors | `GET /api/v1/admin/vendors` |
| Approve KYC | `POST /api/v1/admin/vendors/:id/review/approve` |
| Reject KYC | `POST /api/v1/admin/vendors/:id/review/reject` |
| Force Cancel | `POST /api/v1/admin/orders/:id/force-cancel` |
| Force Refund | `POST /api/v1/admin/orders/:id/force-refund` |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.local.example .env.local
# Edit NEXT_PUBLIC_API_URL to point to your gateway

# 3. Start the dev server
npm run dev
# → http://localhost:3000

# Make sure your backend is running first:
# cd api-gateway && docker compose up --build
```

## Authentication Flow

1. User logs in → JWT stored in HTTP-only cookie (`verdant_token`, `verdant_refresh`)
2. `middleware.ts` checks cookie on every protected route request
3. Axios interceptor auto-refreshes expired tokens using `POST /auth/refresh`
4. Role decoded from JWT payload: `customer` → store, `vendor` → `/vendor/*`, `admin` → `/admin/*`

## Features

### Store (Public)
- Full-width hero carousel with Framer Motion transitions
- Animated category pills
- Horizontal product sliders
- Search + filter by category
- Product detail navigation
- Cart drawer with quantity management
- Checkout → creates order + triggers saga

### Vendor Dashboard
- Earnings wallet stats (available, pending, lifetime)
- Revenue + category bar charts (Recharts)
- Product CRUD (create with images, variants, SKU)
- Payout requests with bank details
- Ledger entry history

### Admin Panel
- Platform-wide stats from `GET /admin/dashboard`
- Live microservice status table
- Vendor KYC approve/reject/suspend
- Force-cancel and force-refund orders
- Moderation cases

## Notes

- Product listing uses **mock data** by default since the catalog service only exposes `GET /products/public/:id` (no list endpoint). Connect a real product list API or CMS to replace `lib/mock-data.ts`.
- The store page is a **client component** for interactivity. For full SSR/SEO, convert the product grid to a server component using `fetch` with ISR.
