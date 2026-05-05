# paychangu.client.ts

## 🎯 Purpose (Why?)
A typed HTTP wrapper for the Paychangu REST API. It separates the "how" of making network requests from the "why" of the business logic.

## ⚙️ Mechanism (How?)
Uses `axios`. It implements methods for `initiatePayment` and `verifyPayment`. It includes a response interceptor that surgically removes the `Authorization` header from error objects before they are logged, preventing secret leakage.

## 📦 Dependencies (What is it using?)
- `axios`
- `env` from [[env.ts.md]]
- `ExternalServiceError` from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[payment.service.ts.md]]

## 🗺️ Connections
- **Pattern**: API Client Wrapper.
- **Security**: Credential safety in logs (ADR-030).
