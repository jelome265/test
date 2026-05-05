# shipment.schemas.ts

## 🎯 Purpose (Why?)
Ensures that data entering the system is perfectly formatted, preventing "garbage in, garbage out" scenarios and SQL injection.

## ⚙️ Mechanism (How?)
Uses **Zod** to define runtime validation logic that matches our TypeScript interfaces. 
- `CreateShipmentSchema`: Validates full sender/receiver info.
- `QuoteSchema`: Validates lightweight inputs for price estimates.
- `AdminStatusUpdateSchema`: Validates transition notes and reasons.

## 📦 Dependencies (What is it using?)
- `zod`
- `SUPPORTED_CITIES` from [[regions.ts.md]]
- `MAX_SHIPMENT_WEIGHT_KG` from [[limits.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[validate.middleware.ts.md]]
- Mobile form validation hooks.

## 🗺️ Connections
- **Defense**: Application Perimeter Security.
