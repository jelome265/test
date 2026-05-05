# payment.service.ts

## 🎯 Purpose (Why?)
Orchestrates the entire payment lifecycle, from initiation to webhook-driven shipment advancement.

## ⚙️ Mechanism (How?)
- **Initiation**: Enforces client-generated idempotency keys (ADR-026) to prevent double charges. It creates a `pending` payment record before calling the provider.
- **Integration**: Communicates with Paychangu via [[paychangu.client.ts.md]].
- **Webhooks**: Processes verified callbacks using atomic database RPCs ([[016_payment_rpcs.sql.md]]) to ensure shipments advance only on successful payment.
- **Integrity**: Verifies that the amount reported by the provider matches our internal calculation.

## 📦 Dependencies (What is it using?)
- `paychanguClient` from [[paychangu.client.ts.md]]
- `auditService` from [[audit.service.ts.md]]
- `supabaseServiceRole` from [[supabase.ts.md]]
- `tambalaToMwk` from [[limits.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[payment.routes.ts.md]]
- [[webhook.routes.ts.md]]

## 🗺️ Connections
- **Pattern**: Idempotency (ADR-026)
- **Transaction**: Atomic status advancement (ADR-029)
