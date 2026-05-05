# pricing.service.ts

## 🎯 Purpose (Why?)
The "brain" of the platform's revenue model. It calculates the exact cost of a shipment in tambala.

## ⚙️ Mechanism (How?)
It is a **pure mathematical service**. It loads the active `pricing_config` (cached for 30s) and applies the formula:
`Total = round((Base + (Dist * Rate) + (WeightOver1 * Rate) + Surcharge) * SizeMultiplier)`.
It mirrors the logic in the database's `calculate_shipment_price` function exactly to ensure consistency between app and database.

## 📦 Dependencies (What is it using?)
- `supabaseServiceRole` from [[supabase.ts.md]]
- `InternalError` from [[app-error.ts.md]]
- `PackageSize` types from [[shipment.types.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[shipment.service.ts.md]] (to set `quoted_price_mwk`)
- [[payment.service.ts.md]] (for amount verification)

## 🗺️ Connections
- **Accuracy**: Tambala-based integer math (ADR-020)
- **Caching**: In-memory config cache with 30s TTL.
