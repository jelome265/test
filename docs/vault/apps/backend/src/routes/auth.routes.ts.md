# auth.routes.ts

## 🎯 Purpose (Why?)
Exposes user-facing identity management endpoints. It provides the interface for the mobile app to handle onboarding and security.

## ⚙️ Mechanism (How?)
- **Public**: `register`, `login`, and `refresh`.
- **Protected**: `logout`, `me`, `fcm-token`, and `change-password`.
It uses the `authRateLimit` middleware to prevent brute-force attacks on credentials.

## 📦 Dependencies (What is it using?)
- `authService` from [[auth.service.ts.md]]
- `authRateLimit` from [[rate-limit.middleware.ts.md]]
- `requireAuth` from [[auth.middleware.ts.md]]
- `RegisterSchema`, `LoginSchema`, etc., from [[auth.schemas.ts.md]]

## 🔗 Dependents (Where is it used?)
- Mounted in [[app.ts.md]] at `/api/v1/auth`.

## 🗺️ Connections
- **Security**: Account enumeration prevention (generic error messages).
- **Mobile**: FCM token update on foreground event.
