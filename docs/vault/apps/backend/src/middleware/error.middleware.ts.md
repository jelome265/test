# error.middleware.ts

## 🎯 Purpose (Why?)
The safety net of the application. It ensures that no matter what goes wrong, the client receives a predictable, non-cryptic error response without leaking sensitive internal details.

## ⚙️ Mechanism (How?)
It is an Express error-handling middleware (4 arguments). 
1. Logs the full error stack (via [[logger.ts.md]]) for internal tracking.
2. If it's a known `AppError`, it returns the specific status code (e.g., 401, 404).
3. If it's unknown, it defaults to a 500 status.
4. In production, it hides the stack trace.

## 📦 Dependencies (What is it using?)
- [[app-error.ts.md]]
- [[logger.ts.md]]

## 🔗 Dependents (Where is it used?)
- Mounted as the final middleware in [[app.ts.md]].

## 🗺️ Connections
- **Pattern**: Global Error Handler.
- **Observability**: Integrates with Sentry in production environments.
