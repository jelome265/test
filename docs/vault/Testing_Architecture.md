# 🧪 Testing Architecture

This project follows a strict **Red-Green-Refactor** TDD lifecycle. Tests are divided into two primary categories: **Unit** and **Integration**.

## 📁 Directory Structure
All tests are located in `apps/backend/test/`.

- **`unit/`**:
	- **Target**: Individual services and pure logic functions.
	- **Mocking**: Extensive. Supabase, Paychangu, and external APIs are fully mocked using `vi.mock`.
	- **Files**: [[auth.service.test.ts.md]], [[pricing.service.test.ts.md]], [[geo.service.test.ts.md]], [[payment.service.test.ts.md]], [[shipment-state-machine.test.ts.md]].
	- **Goal**: Verify mathematical accuracy, error mapping, and business rule branching.

- **`integration/`**:
	- **Target**: The full HTTP layer (Routes + Middleware).
	- **Mechanism**: Uses `supertest` to mount the Express app without binding to a port.
	- **Validation**: Verifies Zod schemas, JWT verification, and Role-Based Access Control.
	- **Files**: [[auth.integration.test.ts.md]], [[shipment.integration.test.ts.md]], [[payment.integration.test.ts.md]], [[health.test.ts.md]].

## 🛠️ Tooling
- **Vitest**: The primary test runner (fast, Vite-native).
- **Supertest**: For HTTP assertions.
- **Turbo**: Orchestrates testing across the monorepo workspace.

## 🚦 Verification Policy
Before any commit is accepted:
1. `npm run typecheck`: Ensures zero TypeScript errors.
2. `npm run test`: Ensures all 198+ assertions pass.
3. `npm run lint`: Enforces zero warnings (maximum warnings = 0).

## 🗺️ Connections
- **Service Layer**: Tests verify [[shipment.service.ts.md]], [[payment.service.ts.md]], etc.
- **Milestone**: Current coverage at Version 1.6.0.
