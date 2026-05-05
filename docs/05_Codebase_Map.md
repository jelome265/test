---
type: documentation
status: complete
tags: [architecture, overview, files]
---
# 🗺️ Codebase Map & File Explanations

This document provides a comprehensive explanation of every file and directory in the Courier Platform repository.

## 🏗️ Monorepo Structure
This project uses **Turborepo** with **npm workspaces**. It is divided into `apps` (deployable services) and `packages` (shared code).

---

## 📁 Root Directory
Global configuration and project milestones.

- **`.env.example`**: Template for environment variables. Defines required keys for Supabase, Firebase, Redis, and Paychangu.
- **`.eslintrc.base.js`**: Base ESLint configuration inherited by all packages.
- **`.gitignore`**: Specifies files and folders for Git to ignore (e.g., `node_modules`, `.env`).
- **`.npmrc`**: Configures npm behavior (e.g., hoisting).
- **`.nvmrc`**: Specifies the recommended Node.js version (v20+).
- **`.prettierrc`**: Global code formatting rules.
- **`AGENTS.md`**: Specialized instructions for AI agents working on this codebase.
- **`GEMINI.md`**: Core project mandates and engineering standards.
- **`package.json`**: Root workspace configuration and global dev dependencies.
- **`turbo.json`**: Turborepo pipeline configuration (defines how `build`, `lint`, and `test` tasks run).
- **`tsconfig.base.json`**: Base TypeScript configuration inherited by all apps and packages.

### 🏁 Milestones (Phases)
- **`PHASE_1_ARCHITECTURE.md`**: Technical specification and initial monorepo setup.
- **`PHASE_2_DATABASE_SCHEMA.md`**: Supabase/PostgreSQL schema design and ERD.
- **`PHASE_3_BACKEND_CORE.md`**: Backend server foundation, error handling, and basic health checks.
- **`PHASE_4_AUTH_SYSTEM.md`**: Supabase Auth integration and RBAC.
- **`PHASE_5_SHIPMENT_ENGINE.md`**: Pricing, geo-calculation, and shipment lifecycle.
- **`PHASE_6_PAYMENT_SYSTEM.md`**: Paychangu integration and webhook handling.

---

## 📁 `apps/backend`
The Express-based API server.

### `src/config/`
- **`env.ts`**: Validates `process.env` using Zod and exports a typed `env` object.
- **`firebase.ts`**: Initializes the Firebase Admin SDK singleton.
- **`redis.ts`**: Initializes the IORedis client for background jobs.
- **`supabase.ts`**: Initializes Supabase clients (`anon` and `service_role`).

### `src/services/`
- **`audit.service.ts`**: Logs security and business events to the `audit_log` table.
- **`auth.service.ts`**: Handles registration, login, profile management, and password changes.
- **`geo.service.ts`**: Calculates distances using Google Maps or local fallbacks.
- **`payment.service.ts`**: Manages the Paychangu payment flow and idempotency.
- **`pricing.service.ts`**: Pure mathematical service for shipment cost calculation.
- **`shipment.service.ts`**: Core CRUD and state management for shipments.
- **`shipment-state-machine.ts`**: Validates legal status transitions.

### `src/routes/`
- **`auth.routes.ts`**: Endpoints for authentication and profile management.
- **`health.routes.ts`**: System health and dependency checks.
- **`payment.routes.ts`**: Endpoints for initiating and tracking payments.
- **`shipment.routes.ts`**: Endpoints for shipment lifecycle and admin oversight.
- **`webhook.routes.ts`**: Public handler for payment provider callbacks.

### `src/middleware/`
- **`auth.middleware.ts`**: Verifies JWTs and loads user profiles.
- **`error.middleware.ts`**: Global error handler that normalizes errors for the API.
- **`rbac.middleware.ts`**: Enforces Role-Based Access Control.
- **`validate.middleware.ts`**: Validates request bodies/queries using Zod schemas.

---

## 📁 `packages/`
Shared libraries used by both Mobile and Backend.

- **`shared-constants`**: Business rules (regions, limits, inter-city distances).
- **`shared-types`**: TypeScript interfaces for shipments, users, and payments.
- **`shared-validation`**: Zod schemas for all API inputs and forms.

---

## 📁 `supabase/`
Database infrastructure.

- **`config.toml`**: Local Supabase configuration.
- **`migrations/`**: SQL files (`001` to `016`) defining the database schema, RLS policies, triggers, and RPC functions.
