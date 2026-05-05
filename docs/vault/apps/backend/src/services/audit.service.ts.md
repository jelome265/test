# audit.service.ts

## 🎯 Purpose (Why?)
This service provides a centralized mechanism for logging security-sensitive events and critical business operations. It ensures that every important action (registration, login, status changes) has an immutable trail for forensic analysis and compliance.

## ⚙️ Mechanism (How?)
It wraps the `audit_log` table in Supabase. It uses the `supabaseServiceRole` client to bypass RLS, ensuring logs are written even when a user's permissions might otherwise restrict them. It captures actor ID, IP, user-agent, target entity, and a flexible JSON payload.

## 📦 Dependencies (What is it using?)
- `supabaseServiceRole` from [[supabase.ts.md]]
- `logger` from [[logger.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[auth.service.ts.md]] (logs logins and registrations)
- [[payment.service.ts.md]] (logs initiation and webhook events)
- [[shipment.service.ts.md]] (logs status transitions)

## 🗺️ Connections
- **Security Pattern**: Audit Trail
- **Database Table**: `audit_log`
