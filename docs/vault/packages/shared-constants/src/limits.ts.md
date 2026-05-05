# limits.ts

## 🎯 Purpose (Why?)
Defines the hard physical and business constraints of the platform. By centralizing these, we ensure the backend and mobile app always agree on what is "too heavy" or "too far."

## ⚙️ Mechanism (How?)
Exports constant integers for:
- `MAX_SHIPMENT_WEIGHT_KG` (10kg)
- `MIN_SHIPMENT_WEIGHT_KG` (0.1kg)
- `DEFAULT_SAME_CITY_DISTANCE_KM` (5km)
Also includes utility functions like `tambalaToMwk` for UI display.

## 📦 Dependencies (What is it using?)
- None (Pure constants).

## 🔗 Dependents (Where is it used?)
- [[shipment.schemas.ts.md]] (for Zod validation)
- [[geo.service.ts.md]] (for fallbacks)
- [[pricing.service.ts.md]] (for math)

## 🗺️ Connections
- **Policy**: Business Constraint Management.
