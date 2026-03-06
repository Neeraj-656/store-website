# 🏢 Vendor / KYC Service

**Base URL:** `/api/v1/vendors`  
**Port:** `3005`  
**Stack:** Node.js 22 · ES Modules · Express · PostgreSQL · Prisma 6.x · RabbitMQ

---

## 🎯 Purpose
Compliance, onboarding, and risk management for vendors. A vendor **cannot sell** until KYC is approved.

---

## 🏗️ KYC State Machine

```
PENDING_KYC
    │ vendor submits PAN + GSTIN + bank details + documents
    ▼
KYC_SUBMITTED ──────────────────────────────────────────────┐
    │ admin picks up review                                  │
    ▼                                                        │
KYC_IN_REVIEW                                               │
    │                    │                                   │
    ▼                    ▼                                   │
KYC_APPROVED         KYC_REJECTED ──── vendor resubmits ────┘
    │
    ├── SUSPENDED ── admin unsuspends ── KYC_APPROVED
    │
    └── BLACKLISTED (permanent, no API reversal)
```

**Vendor can sell only if:** `status === KYC_APPROVED AND isActive AND isIdentityVerified`

---

## 🛡️ Security Model

| Route | Auth |
|-------|------|
| `POST /register` | JWT — `role: vendor` |
| `GET /me` | JWT — `role: vendor` |
| `POST /me/kyc` | JWT — `role: vendor` |
| `POST /me/documents` | JWT — `role: vendor` |
| `GET /me/bank-details` | JWT — `role: vendor` (masked) |
| `GET /admin*` | JWT — `role: admin` |
| `POST /admin*` | JWT — `role: admin` |
| `GET /internal/:vendorId/can-sell` | `x-internal-service-token` |

---

## 📡 API Reference

### ❤️ Health
```
GET /api/v1/vendors/health → 200 { "status": "UP" }
```

---

### 📝 Vendor Registration
```
POST /api/v1/vendors/register
Authorization: Bearer <JWT (role: vendor)>

{
  "businessName": "Fresh Foods Pvt Ltd",
  "businessType": "PRIVATE_LIMITED",  ← SOLE_PROPRIETOR | PARTNERSHIP | PRIVATE_LIMITED | LLP
  "businessEmail": "contact@freshfoods.com"
}
```

---

### 📋 Submit KYC
```
POST /api/v1/vendors/me/kyc
Authorization: Bearer <JWT>

{
  "pan":        "ABCDE1234F",
  "businessPan": "FRESHF1234F",   ← optional
  "gstin":      "22ABCDE1234F1Z5",
  "bankDetails": {
    "accountNumber": "123456789012",
    "ifsc":          "HDFC0001234",
    "accountName":   "Fresh Foods Pvt Ltd",
    "bankName":      "HDFC Bank"
  }
}
```
**Validations:** PAN regex, GSTIN regex, IFSC regex  
**Side effects:** Fraud score computed, duplicate PAN/GSTIN detected, blacklist checked

---

### 📎 Upload KYC Document
```
POST /api/v1/vendors/me/documents
Authorization: Bearer <JWT>
Content-Type: multipart/form-data

Fields:
  file: <binary>
  type: PAN_CARD | BUSINESS_PAN | GST_CERTIFICATE | AADHAAR |
        BANK_STATEMENT | CANCELLED_CHEQUE | INCORPORATION_CERTIFICATE | ADDRESS_PROOF

Allowed file types: JPEG, PNG, WEBP, PDF
Max size: 10MB (configurable)
```
One document per type — re-uploading replaces the previous file.

---

### 🏦 Get Bank Details (masked)
```
GET /api/v1/vendors/me/bank-details
Authorization: Bearer <JWT>

200: { accountNumber: "********9012", ifsc: "HDFC0001234", ... }
```
Account number is masked — last 4 digits only.

---

### 🔒 INTERNAL — Check Vendor Can Sell
```
GET /api/v1/vendors/internal/:vendorId/can-sell
x-internal-service-token: <token>

200: { "success": true, "data": { "canSell": true, "reason": null } }
```

---

### 🛠️ Admin Endpoints

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/admin` | List vendors (filter by `status`, `flagged=true`) |
| `GET` | `/admin/:vendorId` | Get full vendor profile + audit log |
| `POST` | `/admin/:vendorId/review/start` | Pick up KYC for review |
| `POST` | `/admin/:vendorId/review/approve` | Approve KYC → vendor goes live |
| `POST` | `/admin/:vendorId/review/reject` | Reject with mandatory reason |
| `POST` | `/admin/:vendorId/suspend` | Suspend active vendor |
| `POST` | `/admin/:vendorId/unsuspend` | Lift suspension |
| `POST` | `/admin/:vendorId/blacklist` | Permanent ban |
| `PATCH` | `/admin/documents/:documentId` | Approve/reject individual document |
| `GET` | `/admin/blacklist` | List blacklisted identifiers |
| `POST` | `/admin/blacklist` | Add PAN/GSTIN/BANK_ACCOUNT to blacklist |
| `DELETE` | `/admin/blacklist` | Remove from blacklist |

---

## 📤 Events Published

| Routing Key | Trigger | Key Payload |
|-------------|---------|-------------|
| `vendor.kyc.approved` | Admin approves | `vendorId, userId, businessName, gstin` |
| `vendor.kyc.rejected` | Admin rejects | `vendorId, userId, reason` |
| `vendor.suspended` | Suspend or blacklist | `vendorId, userId, reason, blacklisted` |

---

## 🔍 Fraud Scoring

Score (0–100) computed at KYC submission:

| Signal | Points |
|--------|--------|
| Duplicate PAN | +30 |
| Duplicate GSTIN | +30 |
| Blacklisted PAN | +20 |
| Blacklisted GSTIN | +20 |
| Free/temp email domain | +15 |
| Private Limited or LLP | −10 |

Score ≥ `FRAUD_SCORE_THRESHOLD` (default 70) → auto-flagged for manual review.

---

## 🔐 Bank Details Encryption

Bank details (account number, IFSC, account name) are encrypted at rest using **AES-256-GCM**:
- Random 96-bit IV per encryption — never reused
- GCM auth tag stored alongside ciphertext — tamper-evident
- Three DB columns: `bankDetailsEncrypted`, `bankDetailsIv`, `bankDetailsTag`
- API never returns raw ciphertext or IV
- Account number masked on read (last 4 digits only)

Blacklist values are stored as **SHA-256 hashes** — raw PAN/GSTIN never written to DB.

---

## 🗄️ Data Model

```
Vendor              (userId*, pan, businessPan, gstin, bankDetailsEncrypted*, status, fraudScore)
KycDocument         (vendorId→, type, status, storagePath[server-only])
  @@unique([vendorId, type])
KycAuditLog         (vendorId→, event, fromStatus, toStatus, performedBy) — immutable
VendorOutboxEvent   (vendorId→, eventType, payload, published)
BlacklistedIdentifier (type, sha256_value) — hashed, no plaintext
```

---

## 🚀 Local Setup

```bash
# Generate a 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

cp .env.example .env    # fill in ENCRYPTION_KEY and other vars

docker-compose up -d postgres rabbitmq

npm install
npx prisma migrate dev --name init
npm run dev              # port 3005
```
