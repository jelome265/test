# status.ts

## 🎯 Purpose (Why?)
Defines the "nervous system" of the platform—the shipment lifecycle.

## ⚙️ Mechanism (How?)
Exports the `ALLOWED_TRANSITIONS` map, which is the source of truth for:
1. What state comes after `picked_up`?
2. Can a user cancel after `in_transit`? (No).
It also provides `STATUS_LABELS` for human-readable display in the app.

## 📦 Dependencies (What is it using?)
- [[shipment.types.ts.md]] (for the `ShipmentStatus` enum)

## 🔗 Dependents (Where is it used?)
- [[shipment-state-machine.ts.md]] (Validation)
- [[014_admin_rpc.sql.md]] (Database logic)
- Mobile state-tracking hooks.

## 🗺️ Connections
- **Logic**: Finite State Machine (FSM).
