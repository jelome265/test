# rbac.middleware.ts

## 🎯 Purpose (Why?)
Enforces business-level authorization beyond simple identity. It ensures that only users with the correct role (e.g., `admin`) can access sensitive logistical management tools.

## ⚙️ Mechanism (How?)
A higher-order function that accepts a list of allowed roles. It checks `req.user.role` (populated by [[auth.middleware.ts.md]]). If the user doesn't have the required role, it throws an `AuthorizationError` (403).

## 📦 Dependencies (What is it using?)
- [[auth.middleware.ts.md]] (Pre-requisite)
- `AuthorizationError` from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- Administrative routes in [[shipment.routes.ts.md]] and [[auth.routes.ts.md]].

## 🗺️ Connections
- **Security**: Role-Based Access Control (RBAC).
