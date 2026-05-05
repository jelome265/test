# payment.routes.ts

## 🎯 Purpose (Why?)
Provides endpoints for customers to initiate payments and track their transaction status.

## ⚙️ Mechanism (How?)
The `/initiate` endpoint is the entry point for the payment flow. It enforces idempotency by requiring a client-generated UUID. It also limits requests to 20/hour per IP to prevent spamming the payment provider.

## 📦 Dependencies (What is it using?)
- `paymentService` from [[payment.service.ts.md]]
- `requireAuth` from [[auth.middleware.ts.md]]
- `paymentRateLimit` from [[rate-limit.middleware.ts.md]]
- `InitiatePaymentSchema` from [[payment.schemas.ts.md]]

## 🔗 Dependents (Where is it used?)
- Mounted in [[app.ts.md]] at `/api/v1/payments`.

## 🗺️ Connections
- **Financial Safety**: Rate-limited initiation.
- **Deduplication**: Idempotency key requirement.
