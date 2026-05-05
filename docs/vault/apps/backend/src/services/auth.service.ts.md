# auth.service.ts

## 🎯 Purpose (Why?)
Manages the application-level authentication lifecycle, bridging the gap between Supabase Auth and our internal `user_profiles`.

## ⚙️ Mechanism (How?)
- **Registration**: Calls Supabase `signUp`, then waits for the database trigger to create a profile. It includes a cleanup step to delete the auth user if the profile creation fails.
- **Login**: Validates credentials and checks if the account is active.
- **Tokens**: Handles refresh token rotation using Supabase's single-use token pattern.
- **Security**: Forces global session revocation on logout or password change.

## 📦 Dependencies (What is it using?)
- `supabaseAnon` & `supabaseServiceRole` from [[supabase.ts.md]]
- `auditService` from [[audit.service.ts.md]]
- `logger` from [[logger.ts.md]]
- `AppError` types from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- [[auth.routes.ts.md]] (the primary consumer)
- [[auth.middleware.ts.md]] (indirectly via shared profile concepts)

## 🗺️ Connections
- **Pattern**: Identity Management
- **Architecture**: Two-phase atomic registration (ADR-015)
