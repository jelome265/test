# auth.middleware.ts

## 🎯 Purpose (Why?)
Secures protected endpoints by verifying that the requester has a valid identity. It also hydrates the request with user profile data.

## ⚙️ Mechanism (How?)
1. Extracts the Bearer token from the `Authorization` header.
2. Calls `supabase.auth.getUser(token)`.
3. If valid, it fetches the full profile from the `user_profiles` table.
4. Attaches the result to `req.user`.

## 📦 Dependencies (What is it using?)
- `supabaseAnon` from [[supabase.ts.md]]
- `AuthenticationError` from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- Applied to all protected routes in [[auth.routes.ts.md]], [[shipment.routes.ts.md]], and [[payment.routes.ts.md]].

## 🗺️ Connections
- **Pattern**: Identity hydration.
- **Security**: Ensures that `req.user.id` is trusted for ownership checks.
