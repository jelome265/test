# webhook-verification.ts

## 🎯 Purpose (Why?)
The cryptographic shield for the payment system. It prevents attackers from forging payment confirmations.

## ⚙️ Mechanism (How?)
1. Accepts the **raw** body buffer (not the parsed JSON).
2. Computes an HMAC-SHA256 signature using the `PAYCHANGU_WEBHOOK_SECRET`.
3. Performs a **timing-safe comparison** (ADR-027) using `crypto.timingSafeEqual`.
4. Validates the payload timestamp to prevent replay attacks.

## 📦 Dependencies (What is it using?)
- Node.js `crypto` module.
- `env` from [[env.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[webhook.routes.ts.md]]

## 🗺️ Connections
- **Security**: Timing attack and Replay attack prevention.
- **Middleware**: Requires [[raw-body.middleware.ts.md]].
