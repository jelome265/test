# webhook.routes.ts

## 🎯 Purpose (Why?)
Receives asynchronous status updates from Paychangu. This is the only way the system knows when a payment is finalized.

## ⚙️ Mechanism (How?)
**CRITICAL SECURITY**: This route is public but protected by HMAC-SHA256. 
1. Uses [[raw-body.middleware.ts.md]] to capture exact bytes.
2. Calls `verifyPaychanguWebhook` ([[webhook-verification.ts.md]]) to validate the signature.
3. Delegates to `paymentService.processWebhook` ([[payment.service.ts.md]]) for atomic status updates.

## 📦 Dependencies (What is it using?)
- `verifyPaychanguWebhook` from [[webhook-verification.ts.md]]
- `captureRawBody` and `parseRawBodyAsJson` from [[raw-body.middleware.ts.md]]

## 🔗 Dependents (Where is it used?)
- Mounted in [[app.ts.md]] at `/api/v1/webhooks`.

## 🗺️ Connections
- **Vulnerability Defense**: Replay attack prevention via timestamp checking.
- **Idempotency**: Always returns 200 OK to the provider to acknowledge receipt.
