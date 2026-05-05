# shipment.service.ts

## 🎯 Purpose (Why?)
Handles core business operations for shipments: creation, listing, tracking, and history.

## ⚙️ Mechanism (How?)
- **Creation**: An atomic operation that combines geo-calculation, pricing, and record insertion (ADR-023).
- **Listing**: Implements stable keyset (cursor-based) pagination using `created_at` and `id` (ADR-025).
- **Ownership**: Enforces strict user isolation—customers can only see their own shipments.
- **Admin**: Provides bulk listing and search capabilities for administrative staff.

## 📦 Dependencies (What is it using?)
- `geoService` from [[geo.service.ts.md]]
- `pricingService` from [[pricing.service.ts.md]]
- `shipmentStateMachine` from [[shipment-state-machine.ts.md]]
- `auditService` from [[audit.service.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[shipment.routes.ts.md]]
- [[payment.service.ts.md]] (via shipment data lookups)

## 🗺️ Connections
- **Architecture**: Atomic creation (ADR-023)
- **Pagination**: Keyset/Cursor pattern (ADR-025)
