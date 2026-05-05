# app-error.ts

## 🎯 Purpose (Why?)
Defines the project's **Universal Error Language**. By using a standard set of error classes, we ensure that every layer of the app (Service, Route, Middleware) communicates failures in a way the global error handler understands.

## ⚙️ Mechanism (How?)
Exports a base `AppError` class that extends `Error`. It adds properties for `statusCode`, `errorCode` (slugs like `NOT_FOUND`), and `details` (for validation field errors). It provides specialized subclasses:
- `AuthenticationError` (401)
- `AuthorizationError` (403)
- `ConflictError` (409)
- `BusinessRuleError` (422)

## 📦 Dependencies (What is it using?)
- None (Base classes).

## 🔗 Dependents (Where is it used?)
- Every service (to throw logical errors).
- [[error.middleware.ts.md]] (to catch and format them).

## 🗺️ Connections
- **Pattern**: Standardized Error Handling.
- **Contract**: Error slugs match the mobile app's error-handling logic.
