# supabase.ts

## 🎯 Purpose (Why?)
The primary data gateway. It initializes and manages the connections to Supabase for both standard operations and privileged background tasks.

## ⚙️ Mechanism (How?)
Exports two singleton clients:
1. `supabaseAnon`: Used for client-side operations that respect RLS.
2. `supabaseServiceRole`: **Privileged**. Bypasses ALL RLS policies. Used only in background services (Audit, Shipment creation, Webhooks).

## 📦 Dependencies (What is it using?)
- `@supabase/supabase-js`
- `env` from [[env.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[auth.service.ts.md]]
- [[shipment.service.ts.md]]
- [[payment.service.ts.md]]

## 🗺️ Connections
- **Security Pattern**: Least Privilege (routing through service role only when necessary).
