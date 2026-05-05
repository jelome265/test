# app.ts

## 🎯 Purpose (Why?)
The architectural hub of the backend. It assembles all the pieces (middleware, routes, security) into a single Express application.

## ⚙️ Mechanism (How?)
Exposes a `createApp()` factory function. It performs the following setup sequence:
1. **Security Headers**: (Helmet).
2. **CORS**: Configures cross-origin rules for mobile/web.
3. **Webhooks**: Registers `/webhooks` BEFORE JSON parsing to preserve raw bytes for HMAC.
4. **Body Parsers**: Standard JSON parsing.
5. **Route Mounting**: Versioned routes under `/api/v1`.
6. **Error Normalization**: Attaches the global error handler.

## 📦 Dependencies (What is it using?)
- `express`
- [[auth.routes.ts.md]], [[shipment.routes.ts.md]], [[payment.routes.ts.md]]
- [[error.middleware.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[index.ts.md]] (to start the real server)
- Integration tests (to mount a test app).

## 🗺️ Connections
- **Pattern**: Application Factory.
- **Security**: Ordering of webhook registration is a critical fraud prevention measure.
