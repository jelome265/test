# 016_payment_rpcs.sql

## 🎯 Purpose (Why?)
Ensures that the link between "Money" and "Logistics" is unbreakable. It prevents the system from charging a customer but failing to advance their shipment.

## ⚙️ Mechanism (How?)
Defines the `advance_shipment_on_payment` PostgreSQL function. It runs inside a single database transaction. It performs a `FOR UPDATE NOWAIT` lock on the records to prevent race conditions from concurrent webhooks.

## 📦 Dependencies (What is it using?)
- `shipments` table ([[006_shipments.sql.md]])
- `payments` table ([[008_payments.sql.md]])
- `audit_log` table ([[010_audit_log.sql.md]])

## 🔗 Dependents (Where is it used?)
- [[payment.service.ts.md]] (via the `rpc` method).

## 🗺️ Connections
- **Database Pattern**: Atomic RPC (Remote Procedure Call).
- **Security**: `SECURITY DEFINER` (runs with owner privileges).
