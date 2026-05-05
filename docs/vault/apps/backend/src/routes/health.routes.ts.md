# health.routes.ts

## 🎯 Purpose (Why?)
Provides a diagnostic endpoint for monitoring the operational status of the server and its critical dependencies.

## ⚙️ Mechanism (How?)
The `/health` endpoint performs a concurrent check on:
- **Supabase Connectivity** (Database/Auth)
- **Redis Connectivity** (Job Queues)
- **Firebase Status** (Push Notifications)
It returns a 200 if all are OK, or a 503 if any core dependency is down.

## 📦 Dependencies (What is it using?)
- Health check utilities from [[supabase.ts.md]], [[redis.ts.md]], and [[firebase.ts.md]].

## 🔗 Dependents (Where is it used?)
- Mounted in [[app.ts.md]] at `/api/v1/health`.

## 🗺️ Connections
- **Observability**: Used by infrastructure health monitors (e.g., Railway/AWS health checks).
