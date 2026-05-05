# shipment.routes.ts

## 🎯 Purpose (Why?)
The primary interface for managing logistical data. Handles quotes, creation, and tracking for both customers and administrators.

## ⚙️ Mechanism (How?)
- **Public**: `/quote` for estimates and `/tracking/:trackingNumber` for redacted public lookups.
- **Customer**: `POST /` (create) and `GET /` (list own).
- **Admin**: Mounted separately at `/api/v1/admin/shipments` to allow status transitions (`picked_up`, `delivered`, etc.).

## 📦 Dependencies (What is it using?)
- `shipmentService` from [[shipment.service.ts.md]]
- `requireRole` from [[rbac.middleware.ts.md]]
- `CreateShipmentSchema` and `QuoteSchema` from [[shipment.schemas.ts.md]]

## 🔗 Dependents (Where is it used?)
- Mounted in [[app.ts.md]] at `/api/v1/shipments` and `/api/v1/admin`.

## 🗺️ Connections
- **Data Privacy**: Redacted public tracking (no PII).
- **Access Control**: Strict separation between customer and admin routers.
