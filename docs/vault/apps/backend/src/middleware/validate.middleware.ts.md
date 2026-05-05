# validate.middleware.ts

## 🎯 Purpose (Why?)
The primary defense against malformed data. It guarantees that the service layer only receives data that meets our strict schema definitions.

## ⚙️ Mechanism (How?)
Wraps **Zod** validation. It checks the request body, query, or params. If validation fails, it transforms the Zod error into a standardized `VALIDATION_ERROR` (400) containing field-level feedback for the client.

## 📦 Dependencies (What is it using?)
- `zod`
- `ValidationError` from [[app-error.ts.md]]

## 🔗 Dependents (Where is it used?)
- Almost every POST/PATCH route in the system.

## 🗺️ Connections
- **Pattern**: Schema Validation.
- **Shared Logic**: Uses schemas from [[shared-validation]].
