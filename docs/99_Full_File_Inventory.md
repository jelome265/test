---
type: documentation
status: complete
tags: [inventory, architecture, files]
---
# 📦 Full File Inventory

This document provides a flat list of every significant file in the Courier Platform codebase with a concise explanation of its purpose.

## 📁 Root Configuration
| File | Description |
| :--- | :--- |
| `.env.example` | Template for environment variables required by the system. |
| `.eslintrc.base.js` | Base ESLint configuration for consistent code style. |
| `.eslintrc.cjs` | Main ESLint configuration applying linting rules. |
| `.gitignore` | Defines files/folders excluded from Git (node_modules, .env). |
| `.npmrc` | Configuration for npm, specifying package-level settings. |
| `.nvmrc` | Sets the recommended Node.js version (v20+). |
| `.prettierrc` | Configures Prettier for uniform code formatting. |
| `AGENTS.md` | Guidelines and context for AI agents working in this repository. |
| `GEMINI.md` | High-level project overview and core mandates. |
| `package.json` | Project-wide dependencies, scripts, and monorepo workspace config. |
| `tsconfig.base.json` | Shared TypeScript configuration inherited by all packages. |
| `turbo.json` | Configures Turborepo for optimized task execution and caching. |

## 📁 Backend (`apps/backend`)
| File | Description |
| :--- | :--- |
| `Dockerfile` | Instructions for building the backend Docker container. |
| `package.json` | Dependencies and scripts specific to the Express API. |
| `src/index.ts` | Entry point that bootstraps and starts the Express server. |
| `src/app.ts` | Configures the Express application, middleware, and route mounting. |
| `src/config/env.ts` | Validates and exports environment variables using Zod. |
| `src/config/firebase.ts` | Initializes the Firebase Admin SDK singleton. |
| `src/config/redis.ts` | Configures the Redis client for background job queues. |
| `src/config/supabase.ts` | Initializes Supabase clients (anon and service_role). |
| `src/clients/paychangu.client.ts` | Typed HTTP wrapper for the Paychangu payment gateway API. |
| `src/errors/app-error.ts` | Standardized application error hierarchy. |
| `src/middleware/auth.middleware.ts` | Verifies JWTs and loads user profiles from Supabase. |
| `src/middleware/error.middleware.ts` | Centralized global error handler and formatter. |
| `src/middleware/rate-limit.middleware.ts` | Limits API request volume per client to prevent abuse. |
| `src/middleware/raw-body.middleware.ts` | Captures raw request bytes for HMAC webhook verification. |
| `src/middleware/rbac.middleware.ts` | Enforces Role-Based Access Control on protected routes. |
| `src/middleware/validate.middleware.ts` | Validates request data against Zod schemas. |
| `src/routes/auth.routes.ts` | Endpoints for user registration, login, and profile. |
| `src/routes/health.routes.ts` | System health check and dependency status. |
| `src/routes/payment.routes.ts` | Endpoints for initiating and tracking payments. |
| `src/routes/shipment.routes.ts` | Endpoints for shipment management and admin oversight. |
| `src/routes/webhook.routes.ts` | Public handler for payment provider callbacks. |
| `src/services/audit.service.ts` | Business-level logging for security and auditing. |
| `src/services/auth.service.ts` | Business logic for identity and session management. |
| `src/services/geo.service.ts` | Distance calculation with Google Maps and local fallback. |
| `src/services/payment.service.ts` | Orchestrates the payment lifecycle and idempotency. |
| `src/services/pricing.service.ts` | Cost calculation engine using tambala math. |
| `src/services/shipment.service.ts` | Core shipment CRUD and status advancement. |
| `src/services/shipment-state-machine.ts` | Validates legal status transitions between states. |

## 📁 Shared Packages (`packages/`)
| File | Description |
| :--- | :--- |
| `shared-constants/src/limits.ts` | Business limits (e.g., max weight, size bounds). |
| `shared-constants/src/regions.ts` | List of supported cities and coordinates. |
| `shared-constants/src/status.ts` | Canonical shipment status and transition rules. |
| `shared-types/src/index.ts` | Re-exports all shared TypeScript interfaces. |
| `shared-validation/src/auth.schemas.ts` | Zod schemas for authentication inputs. |
| `shared-validation/src/payment.schemas.ts` | Zod schemas for payment inputs. |
| `shared-validation/src/shipment.schemas.ts` | Zod schemas for shipment creation/updates. |

## 📁 Database (`supabase/migrations`)
| File | Description |
| :--- | :--- |
| `002_enums.sql` | Defines custom types for roles and statuses. |
| `004_user_profiles.sql` | Tables and RLS policies for user data. |
| `006_shipments.sql` | Core shipment table with complex access control. |
| `011_pricing_config.sql` | Versioned pricing rules and regional rates. |
| `014_admin_rpc.sql` | PostgreSQL functions for administrative tasks. |
| `016_payment_rpcs.sql` | Atomic logic for advancing shipments upon payment. |
