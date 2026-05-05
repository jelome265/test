# 011_pricing_config.sql

## 🎯 Purpose (Why?)
Enables the business to change shipping rates (e.g., fuel surcharges, discounts) without modifying or redeploying code.

## ⚙️ Mechanism (How?)
Stores versioned configuration rows. Only one row can be `is_active = true` at a time. It defines base prices, per-km rates, and multipliers for size and fragility.

## 📦 Dependencies (What is it using?)
- None (Configuration table).

## 🔗 Dependents (Where is it used?)
- [[pricing.service.ts.md]] (loads this data to calculate costs).

## 🗺️ Connections
- **Business Agility**: Dynamic rate management.
- **Database Pattern**: Singleton configuration with versioning.
