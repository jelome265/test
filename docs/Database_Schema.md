---
type: documentation
status: complete
tags: [database, schema, migrations]
---
# 🗄️ Supabase Migration Index

This document tracks the evolution of the database schema through its migration files.

## 📅 Timeline
| Order | Migration | Purpose | Key Tables/Functions |
| :--- | :--- | :--- | :--- |
| `001` | `extensions` | Enables GIS, UUID, and Crypto plugins. | `pgcrypto`, `postgis` |
| `002` | `enums` | Establishes status and role sets. | `shipment_status`, `user_role` |
| `003` | `shared_triggers` | Common utility triggers. | `update_timestamp()` |
| `004` | `user_profiles` | Identity and profile storage. | `user_profiles` |
| `005` | `saved_addresses`| Address book management. | `saved_addresses` |
| `006` | `shipments` | **Core Business Table**. | `shipments` (RLS + Indices) |
| `007` | `status_events` | Immutable timeline tracking. | `shipment_status_events` |
| `008` | `payments` | Financial transaction records. | `payments` |
| `009` | `notifications` | Message queue for push/in-app. | `notifications` |
| `010` | `audit_log` | Security and integrity logging. | `audit_log` |
| `011` | `pricing_config` | Versioned regional rates. | `pricing_config` |
| `012` | `disputes` | Conflict resolution management. | `disputes` |
| `013` | `realtime` | Live broadcast configuration. | `supabase_realtime` |
| `014` | `admin_rpc` | Super-user transition logic. | `admin_transition_shipment` |
| `015` | `storage` | File system buckets. | `shipment-attachments` |
| `016` | `payment_rpcs` | Atomic webhook logic. | `advance_shipment_on_payment` |

## 🛡️ Security Patterns
- **RLS (Row Level Security):** Every table has strict policies. Customers can only see their own rows; admins can see everything.
- **SECURITY DEFINER:** Critical RPCs run with high privilege to bypass RLS, but are only accessible via the backend's `service_role` key.
- **Optimistic Concurrency:** State transitions use `WHERE status = $expected` to prevent race conditions.
