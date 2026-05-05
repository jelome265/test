# regions.ts

## 🎯 Purpose (Why?)
Canonical list of supported operating areas in Malawi.

## ⚙️ Mechanism (How?)
Stores the `SUPPORTED_CITIES` array ('Lilongwe', 'Blantyre', 'Mzuzu') and the `CITY_CENTERS` coordinate map. Also contains the `INTER_CITY_DISTANCES_KM` lookup table.

## 📦 Dependencies (What is it using?)
- [[shipment.types.ts.md]] (for `GeoPoint` types)

## 🔗 Dependents (Where is it used?)
- [[geo.service.ts.md]]
- [[shipment.schemas.ts.md]]

## 🗺️ Connections
- **Geography**: Service Area Definition.
