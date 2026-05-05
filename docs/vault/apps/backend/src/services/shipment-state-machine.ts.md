# shipment-state-machine.ts

## 🎯 Purpose (Why?)
Acts as the central authority for status transition rules. It prevents shipments from moving into illegal states (e.g., `delivered` -> `pending_approval`).

## ⚙️ Mechanism (How?)
It is a fast, application-layer validator. It uses the `ALLOWED_TRANSITIONS` constant from [[status.ts.md]] to check if a move is valid. It also layers **Role-Based Authority**:
- Customers can only `confirm` or `cancel`.
- Admins can perform logistical transitions (`picked_up`, `in_transit`, etc.).

## 📦 Dependencies (What is it using?)
- `ALLOWED_TRANSITIONS` from [[status.ts.md]]
- `BusinessRuleError` from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[shipment.service.ts.md]]
- [[shipment.routes.ts.md]] (via admin transition validation)

## 🗺️ Connections
- **Pattern**: Dual-layer enforcement (ADR-022)
- **Shared Logic**: Synchronized with Supabase RPCs.
