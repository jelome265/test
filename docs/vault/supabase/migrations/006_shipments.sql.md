# 006_shipments.sql

## 🎯 Purpose (Why?)
The "Heart" of the database. This table stores every physical and logical detail about a courier package.

## ⚙️ Mechanism (How?)
- **Schema**: Stores snapshots of sender/receiver data (address, phone, name) rather than linking to a dynamic address book, ensuring an immutable record for the receipt.
- **Tracking**: Generates human-readable tracking numbers (e.g., `SHIP-ABCD-1234`).
- **Security (RLS)**: Implements policies where:
	- `SELECT`: Owners can see their own; Admins can see all.
	- `INSERT`: Any authenticated user can create.
	- `UPDATE`: Only `SECURITY DEFINER` RPCs or Admins can change status.

## 📦 Dependencies (What is it using?)
- `user_profiles` table ([[004_user_profiles.sql.md]])
- `shipment_status` enum ([[002_enums.sql.md]])

## 🔗 Dependents (Where is it used?)
- Every logistical service and route in the backend.

## 🗺️ Connections
- **Integrity**: Enforces non-nullability on all critical delivery fields.
