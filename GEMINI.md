# Courier Platform — Project Overview

This is a comprehensive regional courier platform for Malawi, built with a modern TypeScript monorepo architecture. It facilitates package pickups and deliveries between Lilongwe, Blantyre, and Mzuzu, featuring real-time tracking, payment integration, and administrative oversight.

## 🚀 Tech Stack

- **Mobile:** React Native (Expo managed) with Expo Router, Zustand (state), and React Query.
- **Backend:** Node.js + Express + TypeScript.
- **Database/Auth:** Supabase (PostgreSQL, Auth, RLS, Realtime).
- **Monorepo Tooling:** Turborepo + npm workspaces.
- **Infrastructure:** Redis + BullMQ (jobs), Firebase Cloud Messaging (push), Paychangu (payments), Sentry (error tracking).

## 📁 Project Structure

- `apps/mobile`: React Native / Expo mobile application.
- `apps/backend`: Express-based API server.
- `packages/shared-types`: Shared TypeScript interfaces and types.
- `packages/shared-validation`: Shared Zod validation schemas.
- `packages/shared-constants`: Business rules, regional data, and state machine constants.
- `supabase/`: Database migrations and configuration.

## 🛠️ Building and Running

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Turbo CLI (`npm install -g turbo`)
- Expo CLI and EAS CLI (for mobile development)

### Key Commands
- **Install dependencies:** `npm install`
- **Start all services (Dev):** `npm run dev`
- **Build all packages:** `npm run build`
- **Run tests:** `npm run test`
- **Lint check:** `npm run lint`
- **Type check:** `npm run typecheck`
- **Clean build artifacts:** `npm run clean`

## ⚖️ Business Rules (Phase 1)

1. **Maximum weight:** 10kg (enforced server-side).
2. **Supported Regions:** Lilongwe, Blantyre, Mzuzu only.
3. **Payment Model:** Payment must be confirmed before shipment status advances to `picked_up`.
4. **Money Storage:** Stored as `INTEGER` in tambala (MWK × 100) to prevent floating-point errors.

## ⚙️ Development Conventions

- **TypeScript:** Strict type checking is enabled. Prefer shared types from `packages/shared-types`.
- **Validation:** Use shared Zod schemas from `packages/shared-validation` for both frontend and backend request/form validation.
- **State Machine:** Follow the shipment state machine defined in `packages/shared-constants/src/status.ts`.
- **Linting:** Shared ESLint configuration in `.eslintrc.base.js`.
- **Monorepo Safety:** Never stage or commit changes to `.env` files. Use `.env.example` as a template.
- **Git:** Use conventional commit messages.

## 📝 Roadmap & Architecture

Refer to `PHASE_1_ARCHITECTURE.md` for the deep-dive technical specification, including the shipment state machine and legal transitions.
