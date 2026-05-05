# shipment.types.ts

## 🎯 Purpose (Why?)
The primary data contract for logistical information across the entire stack.

## ⚙️ Mechanism (How?)
Defines strict TypeScript interfaces for:
- `Shipment`: The full database model.
- `ShipmentStatus`: The set of valid strings.
- `PackageSize`: 'small' | 'medium' | 'large'.
- `GeoPoint`: { latitude, longitude }.

## 📦 Dependencies (What is it using?)
- None (Base types).

## 🔗 Dependents (Where is it used?)
- [[shipment.service.ts.md]]
- [[shipment.routes.ts.md]]
- Mobile UI components.

## 🗺️ Connections
- **Contract**: Cross-package Type Safety.
