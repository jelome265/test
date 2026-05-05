# env.ts

## 🎯 Purpose (Why?)
Acts as a strict gatekeeper for the application's environment. It ensures that the server never starts if a critical secret (like a database key or API secret) is missing or invalid.

## ⚙️ Mechanism (How?)
It uses **Zod** to parse `process.env`. If validation fails, it logs a clear error message and calls `process.exit(1)`. It exports a typed `env` object that provides intellisense and prevents typos throughout the backend.

## 📦 Dependencies (What is it using?)
- `zod`
- `dotenv` (loaded in [[index.ts.md]])

## 🔗 Dependents (Where is it used?)
- Every service or route that requires a secret (e.g., [[paychangu.client.ts.md]], [[supabase.ts.md]]).

## 🗺️ Connections
- **Security Pattern**: Fail-fast Configuration.
- **Reference**: [[.env.example.md]]
