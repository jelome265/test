# logger.ts

## 🎯 Purpose (Why?)
Provides structured logging for the application. Unlike `console.log`, structured logs are machine-readable (JSON) and easy to query in production environments.

## ⚙️ Mechanism (How?)
Wraps **Pino**. It is configured to:
1. **Redact**: Automatically strips sensitive fields like `password`, `token`, and `Authorization` headers from the logs.
2. **Context**: Includes a unique `requestId` on every log entry for easy tracing.
3. **Levels**: Uses standard levels (info, error, debug, warn).

## 📦 Dependencies (What is it using?)
- `pino`
- `env` from [[env.ts.md]]

## 🔗 Dependents (Where is it used?)
- Used by every service and middleware for observability.

## 🗺️ Connections
- **Security**: Credential redaction policy.
