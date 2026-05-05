# geo.service.ts

## 🎯 Purpose (Why?)
Calculates road distance between pickup and delivery locations to drive the pricing engine.

## ⚙️ Mechanism (How?)
Implements a **three-tier fallback strategy** (ADR-021):
1. **Google Maps Distance Matrix**: Real-time road distance using coordinates.
2. **Inter-city Presets**: Lookups from a static table in [[regions.ts.md]] for known city pairs (Lilongwe, Blantyre, Mzuzu).
3. **Default**: A 5km fallback for same-city deliveries.

## 📦 Dependencies (What is it using?)
- `axios` for external API calls.
- `CITY_CENTERS` & `INTER_CITY_DISTANCES_KM` from [[regions.ts.md]]
- `env` from [[env.ts.md]] (for Google Maps key)

## 🔗 Dependents (Where is it used?)
- [[shipment.service.ts.md]] (during creation)
- [[pricing.service.ts.md]] (indirectly provides the `distance_km` input)

## 🗺️ Connections
- **Algorithm**: Multi-tier resolution
- **Optimization**: Silent fallback (logs as warn, not error)
