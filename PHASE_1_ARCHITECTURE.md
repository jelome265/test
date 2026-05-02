# COURIER PLATFORM — PHASE 1: ARCHITECTURE & PROJECT FOUNDATION
## Enterprise React Native + Node.js + Supabase
## Play Store & App Store Deployment

---

> **What this document is.**
> This is the complete, executable Phase 1 deliverable for the courier platform.
> It covers every architecture decision, the complete monorepo setup, all
> shared packages with production-ready code, all config files, and the
> exact commands to run. Nothing is hand-wavy. Every file listed here is
> a real file you create. Follow it top to bottom.

---

## SYSTEM OVERVIEW

### What you are building

A regional courier platform for Malawi. Users request package pickups and
deliveries between Lilongwe, Blantyre, and Mzuzu. Admins approve requests.
Users pay via Airtel Money, TNM Mpamba, or bank transfer through Paychangu.
Couriers handle physical pickup and delivery. Every state change is tracked,
notified, and audited.

### The three enforced business rules that cannot be bypassed

1. Maximum package weight: **10kg** — enforced at backend, not just UI
2. Supported regions only: **Lilongwe, Blantyre, Mzuzu** — enforced at backend
3. Payment before dispatch: shipment cannot advance to `picked_up` without
   verified `payment_confirmed` status

### Stack decision log

| Concern | Decision | Why |
|---|---|---|
| Mobile | React Native (Expo managed) | One codebase for Android + iOS, fits Node.js team, EAS makes Play Store submission straightforward |
| Backend | Node.js + Express + TypeScript | Async I/O fits API orchestration, payments, webhooks; same language as mobile reduces context switching |
| Database | Supabase (PostgreSQL) | Managed auth, Postgres, RLS, Realtime, Storage — reduces infrastructure ops for v1 |
| Monorepo | Turborepo + npm workspaces | Shares types and validation schemas across mobile and backend without duplication |
| Job queues | BullMQ + Redis | Reliable notification delivery with retry, backoff, dead-letter handling |
| Payments | Paychangu | Single abstraction over Airtel Money, TNM Mpamba, bank transfers in Malawi |
| Push notifications | Firebase Cloud Messaging | Cross-platform, reliable, free tier covers early scale |
| Distance calculation | Google Maps Distance Matrix | Accurate road distances, city-center fallback when coordinates not available |
| Error tracking | Sentry | Cross-platform coverage for both backend and mobile |
| Money storage | INTEGER in tambala (MWK × 100) | Eliminates floating-point money errors entirely |

---

## SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                                    │
│                  React Native (Expo) — TypeScript                    │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Auth    │  │Shipments │  │ Payment  │  │  Admin Screens   │   │
│  │ Screens  │  │ Screens  │  │ Screens  │  │  (role-gated)    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │              │                  │             │
│  ┌────▼──────────────▼──────────────▼──────────────────▼─────────┐ │
│  │              API Client (Axios + token refresh)                │ │
│  │              Zustand State Store                               │ │
│  │              React Query (server state cache)                  │ │
│  └────────────────────────────────┬───────────────────────────────┘ │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │ HTTPS
                    ┌───────────────▼───────────────┐
                    │        NODE.JS API SERVER      │
                    │      Express + TypeScript       │
                    │                                │
                    │  ┌─────────────────────────┐  │
                    │  │ Auth / RBAC Middleware   │  │
                    │  │ Rate Limiting            │  │
                    │  │ Request Validation (Zod) │  │
                    │  └─────────────────────────┘  │
                    │                                │
                    │  ┌──────┐ ┌───────┐ ┌───────┐ │
                    │  │Auth  │ │Ship-  │ │Admin  │ │
                    │  │Route │ │ment   │ │Route  │ │
                    │  └──┬───┘ │Route  │ └──┬────┘ │
                    │     │     └──┬────┘    │      │
                    │  ┌──▼────────▼─────────▼────┐ │
                    │  │         Services Layer     │ │
                    │  │  auth · shipment · pricing │ │
                    │  │  payment · notification    │ │
                    │  │  geo · audit               │ │
                    │  └──────────────┬─────────────┘ │
                    │                 │               │
                    │  ┌──────────────▼───────────┐  │
                    │  │     BullMQ Job Queues     │  │
                    │  │  notification · payment   │  │
                    │  │  reconciliation workers   │  │
                    │  └──────────┬────────────────┘  │
                    └─────────────┼──────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
 ┌──────────▼────────┐  ┌─────────▼──────┐  ┌──────────▼────────┐
 │      SUPABASE      │  │     REDIS       │  │ EXTERNAL SERVICES │
 │                    │  │  (BullMQ jobs)  │  │                   │
 │  ┌──────────────┐  │  └────────────────┘  │  ┌─────────────┐  │
 │  │  PostgreSQL  │  │                       │  │  Paychangu  │  │
 │  │  + RLS       │  │                       │  │  (payments) │  │
 │  └──────────────┘  │                       │  └─────────────┘  │
 │  ┌──────────────┐  │                       │  ┌─────────────┐  │
 │  │  Auth        │  │                       │  │  Firebase   │  │
 │  │  (JWT/PKCE)  │  │                       │  │  FCM (push) │  │
 │  └──────────────┘  │                       │  └─────────────┘  │
 │  ┌──────────────┐  │                       │  ┌─────────────┐  │
 │  │  Realtime    │  │                       │  │ Google Maps │  │
 │  │  (WS)        │  │                       │  │ (distance)  │  │
 │  └──────────────┘  │                       │  └─────────────┘  │
 │  ┌──────────────┐  │                       │  ┌─────────────┐  │
 │  │  Storage     │  │                       │  │   Sentry    │  │
 │  │  (S3-compat) │  │                       │  │  (errors)   │  │
 │  └──────────────┘  │                       │  └─────────────┘  │
 └────────────────────┘                       └────────────────────┘
```

---

## SHIPMENT STATE MACHINE

This is the heart of the business logic. Every state transition is explicit,
validated server-side, and logged to an immutable audit trail.

```
                     ┌──────────────────┐
                     │  pending_approval │ ◄── Initial state on creation
                     └────────┬─────────┘
                              │
              ┌───────────────┼──────────────┐
              │                              │
              ▼                              ▼
        ┌──────────┐                  ┌──────────┐
        │ approved │                  │ rejected │  ◄── TERMINAL
        └────┬─────┘                  └──────────┘
             │
     ┌───────┼───────────────────────────┐
     │                                   │
     ▼                                   ▼
┌─────────────────┐               ┌───────────┐
│ payment_pending │               │ cancelled │  ◄── TERMINAL
└────────┬────────┘               └───────────┘
         │
    ┌────┴──────────────────┐
    │                       │
    ▼                       ▼
┌────────────────┐    ┌──────────┐
│payment_confirmed│   │ approved │  ◄── reverted if payment fails (retry)
└───────┬────────┘    └──────────┘
        │
        ▼
   ┌──────────┐
   │ picked_up│
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │in_transit│
   └────┬─────┘
        │
   ┌────┴──────────────┐
   │                   │
   ▼                   ▼
┌──────────┐      ┌──────────┐
│ delivered│      │  failed  │ ──► pending_approval (re-submit allowed)
└────┬─────┘      └──────────┘
     │
     ▼
┌──────────┐
│ confirmed│  ◄── TERMINAL (receiver confirms receipt)
└──────────┘
```

**Legal transitions enforced server-side:**
```
pending_approval  → [approved, rejected]
approved          → [payment_pending, cancelled]
payment_pending   → [payment_confirmed, approved, failed]
payment_confirmed → [picked_up, cancelled]
picked_up         → [in_transit]
in_transit        → [delivered, failed]
delivered         → [confirmed]
confirmed         → []   (terminal)
rejected          → []   (terminal)
cancelled         → []   (terminal)
failed            → [pending_approval]
```

---

## MONOREPO COMPLETE DIRECTORY STRUCTURE

```
courier-platform/                          ← Git root
├── apps/
│   ├── mobile/                            ← React Native (Expo managed)
│   │   ├── app/                           ← Expo Router file-based routing
│   │   │   ├── _layout.tsx                ← Root layout (providers, session restore)
│   │   │   ├── index.tsx                  ← Auth redirect gate
│   │   │   ├── (auth)/
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   └── forgot-password.tsx
│   │   │   ├── (app)/                     ← Authenticated customer shell
│   │   │   │   ├── _layout.tsx            ← Bottom tab navigator
│   │   │   │   ├── home.tsx               ← Dashboard with recent shipments
│   │   │   │   ├── shipments/
│   │   │   │   │   ├── index.tsx          ← Shipment list with filter
│   │   │   │   │   ├── new.tsx            ← Multi-step create form (4 steps)
│   │   │   │   │   └── [id].tsx           ← Shipment detail + timeline
│   │   │   │   ├── payment/
│   │   │   │   │   └── [shipmentId].tsx   ← Payment method selection + initiation
│   │   │   │   ├── notifications.tsx      ← In-app notification inbox
│   │   │   │   └── profile.tsx            ← Account settings
│   │   │   ├── (admin)/                   ← Admin-only screens (role-gated)
│   │   │   │   ├── _layout.tsx
│   │   │   │   ├── dashboard.tsx          ← Stats, pending queue
│   │   │   │   ├── shipments/
│   │   │   │   │   ├── index.tsx          ← All shipments with search + filter
│   │   │   │   │   └── [id].tsx           ← Full detail + status controls
│   │   │   │   ├── users/
│   │   │   │   │   └── index.tsx          ← User management (super_admin)
│   │   │   │   └── disputes/
│   │   │   │       └── index.tsx
│   │   │   └── +not-found.tsx
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── client.ts              ← Axios instance + token refresh interceptor
│   │   │   │   ├── auth.api.ts            ← Auth endpoint wrappers
│   │   │   │   ├── shipment.api.ts
│   │   │   │   ├── payment.api.ts
│   │   │   │   └── notification.api.ts
│   │   │   ├── store/
│   │   │   │   ├── auth.store.ts          ← Zustand: user, tokens, login/logout
│   │   │   │   ├── shipment.store.ts      ← Zustand: draft shipment form state
│   │   │   │   └── notification.store.ts  ← Zustand: unread count
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useLocation.ts         ← Expo Location wrapper
│   │   │   │   ├── useNotifications.ts    ← FCM token + push handlers
│   │   │   │   └── useRealtime.ts         ← Supabase Realtime subscription
│   │   │   ├── components/
│   │   │   │   ├── ui/                    ← Design system primitives
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Input.tsx
│   │   │   │   │   ├── Card.tsx
│   │   │   │   │   ├── Badge.tsx
│   │   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   │   ├── EmptyState.tsx
│   │   │   │   │   └── ErrorBoundary.tsx
│   │   │   │   ├── shipment/
│   │   │   │   │   ├── ShipmentCard.tsx
│   │   │   │   │   ├── StatusBadge.tsx
│   │   │   │   │   ├── PriceBreakdown.tsx
│   │   │   │   │   ├── TrackingTimeline.tsx
│   │   │   │   │   └── CityPicker.tsx
│   │   │   │   └── forms/
│   │   │   │       ├── SenderForm.tsx     ← Step 1 of create flow
│   │   │   │       ├── ReceiverForm.tsx   ← Step 2
│   │   │   │       └── PackageForm.tsx    ← Step 3
│   │   │   ├── constants/
│   │   │   │   ├── theme.ts               ← Colors, spacing, typography, shadows
│   │   │   │   ├── regions.ts             ← Supported cities + city center coords
│   │   │   │   └── statusConfig.ts        ← Status label/color/icon map
│   │   │   └── utils/
│   │   │       ├── currency.ts            ← formatCurrency (tambala → MWK display)
│   │   │       ├── date.ts                ← formatDate, formatRelative
│   │   │       └── storage.ts             ← Expo SecureStore wrapper
│   │   ├── assets/
│   │   │   ├── icon.png                   ← 1024×1024 app icon
│   │   │   ├── splash.png                 ← Splash screen
│   │   │   ├── adaptive-icon.png          ← Android adaptive icon foreground
│   │   │   └── notification-icon.png      ← Android notification icon (white on transparent)
│   │   ├── app.json                       ← Expo config
│   │   ├── eas.json                       ← EAS Build profiles
│   │   ├── babel.config.js
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── google-services.json           ← Firebase config (gitignored, per env)
│   │
│   └── backend/                           ← Node.js API
│       ├── src/
│       │   ├── index.ts                   ← Server entry: start, graceful shutdown
│       │   ├── app.ts                     ← Express app factory
│       │   ├── config/
│       │   │   ├── env.ts                 ← Zod-validated env — process exits on bad config
│       │   │   ├── supabase.ts            ← Service role + anon clients
│       │   │   ├── firebase.ts            ← Firebase Admin SDK init
│       │   │   └── redis.ts               ← IORedis connection
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts      ← JWT verify → req.user
│       │   │   ├── rbac.middleware.ts      ← requireRole(...roles)
│       │   │   ├── validate.middleware.ts  ← validate(schema, target)
│       │   │   ├── rate-limit.middleware.ts
│       │   │   └── error.middleware.ts     ← AppError hierarchy + global handler
│       │   ├── routes/
│       │   │   ├── auth.routes.ts
│       │   │   ├── shipment.routes.ts
│       │   │   ├── payment.routes.ts
│       │   │   ├── notification.routes.ts
│       │   │   ├── admin.routes.ts
│       │   │   └── health.routes.ts
│       │   ├── services/
│       │   │   ├── auth.service.ts
│       │   │   ├── shipment.service.ts
│       │   │   ├── shipment-state-machine.ts
│       │   │   ├── pricing.service.ts
│       │   │   ├── payment.service.ts
│       │   │   ├── notification.service.ts
│       │   │   ├── geo.service.ts
│       │   │   └── audit.service.ts
│       │   ├── queues/
│       │   │   └── notification.queue.ts
│       │   ├── jobs/
│       │   │   └── notification.worker.ts
│       │   └── utils/
│       │       └── logger.ts
│       ├── test/
│       │   ├── unit/
│       │   │   ├── state-machine.test.ts
│       │   │   ├── pricing.test.ts
│       │   │   └── payment-webhook.test.ts
│       │   └── integration/
│       │       ├── auth.test.ts
│       │       └── shipment.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── .env.example
│       └── Dockerfile
│
├── packages/
│   ├── shared-types/                      ← TypeScript types used by BOTH apps
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── user.types.ts
│   │   │   ├── shipment.types.ts
│   │   │   ├── payment.types.ts
│   │   │   └── notification.types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared-validation/                 ← Zod schemas used by BOTH apps
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── auth.schemas.ts
│   │   │   ├── shipment.schemas.ts
│   │   │   ├── payment.schemas.ts
│   │   │   └── admin.schemas.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared-constants/                  ← Business constants (cities, pricing, limits)
│       ├── src/
│       │   ├── index.ts
│       │   ├── regions.ts
│       │   ├── limits.ts
│       │   └── status.ts
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   ├── migrations/                        ← Run in order, never modify committed ones
│   │   ├── 001_extensions.sql
│   │   ├── 002_enums.sql
│   │   ├── 003_shared_triggers.sql
│   │   ├── 004_user_profiles.sql
│   │   ├── 005_saved_addresses.sql
│   │   ├── 006_shipments.sql
│   │   ├── 007_shipment_status_events.sql
│   │   ├── 008_payments.sql
│   │   ├── 009_notifications.sql
│   │   ├── 010_audit_log.sql
│   │   ├── 011_pricing_config.sql
│   │   ├── 012_disputes.sql
│   │   ├── 013_realtime.sql
│   │   ├── 014_admin_rpc.sql
│   │   └── 015_storage.sql
│   ├── seed.sql                           ← Dev/staging only
│   └── config.toml
│
├── .github/
│   └── workflows/
│       ├── backend-ci.yml                 ← Test, lint, typecheck on PR
│       ├── mobile-ci.yml                  ← Expo typecheck + lint on PR
│       ├── backend-deploy.yml             ← Deploy to Railway/Fly on main merge
│       └── mobile-build.yml               ← EAS build on release tag
│
├── docs/
│   ├── api.md                             ← API reference
│   ├── architecture.md                    ← This file (living doc)
│   └── runbook.md                         ← Ops procedures
│
├── package.json                           ← Root workspace package.json
├── turbo.json                             ← Turborepo pipeline
├── tsconfig.base.json                     ← Base TS config extended by all packages
├── .eslintrc.base.js                      ← Base ESLint config
├── .prettierrc                            ← Prettier config
├── .gitignore
└── .env.example                           ← All env vars documented
```

---

## SETUP: COMMANDS TO RUN IN ORDER

```bash
# 1. Create the monorepo root
mkdir courier-platform && cd courier-platform
git init

# 2. Install Turborepo globally
npm install -g turbo

# 3. Create all directories
mkdir -p apps/mobile apps/backend
mkdir -p packages/shared-types/src
mkdir -p packages/shared-validation/src
mkdir -p packages/shared-constants/src
mkdir -p supabase/migrations
mkdir -p .github/workflows docs

# 4. After placing all config files below, install deps
npm install                              # installs workspace root deps + all packages

# 5. Install Supabase CLI (macOS / Linux)
brew install supabase/tap/supabase
# or: npm install -g supabase

# 6. Initialize Expo app inside apps/mobile
cd apps/mobile
npx create-expo-app@latest . --template blank-typescript
cd ../..

# 7. Initialize backend
cd apps/backend && npm init -y && cd ../..

# 8. Install EAS CLI for Play Store builds
npm install -g eas-cli
eas login    # login with Expo account

# 9. Link EAS project (run from apps/mobile)
cd apps/mobile && eas init && cd ../..

# 10. Initialize Supabase project
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 11. Verify everything builds
npm run typecheck
npm run lint
```

---

## FILE: package.json (root)

```json
{
  "name": "courier-platform",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.6",
    "typescript": "^5.4.5",
    "@typescript-eslint/eslint-plugin": "^7.13.0",
    "@typescript-eslint/parser": "^7.13.0",
    "eslint": "^8.57.0",
    "eslint-plugin-import": "^2.29.1",
    "prettier": "^3.3.2"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

---

## FILE: turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".expo/**", "build/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "env": ["NODE_ENV", "SUPABASE_URL"]
    },
    "test:coverage": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## FILE: tsconfig.base.json (root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

---

## FILE: .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

---

## FILE: .eslintrc.base.js (root)

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // TypeScript strictness
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // Imports
    'import/no-duplicates': 'error',
    'import/order': ['error', {
      'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'always',
      'alphabetize': { 'order': 'asc' }
    }],

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
  },
};
```

---

## FILE: .gitignore

```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.expo/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# Firebase (per-environment, not committed)
apps/mobile/google-services.json
apps/mobile/GoogleService-Info.plist

# EAS
apps/mobile/.expo/
apps/mobile/ios/
apps/mobile/android/

# Coverage
coverage/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor
.vscode/settings.json
.idea/
*.swp

# Supabase
supabase/.branches/
supabase/.temp/
```

---

## FILE: .env.example (root)

```bash
# ═══════════════════════════════════════════════════════════════════
# COURIER PLATFORM — ENVIRONMENT VARIABLES
# Copy this to .env in each app directory that needs it.
# NEVER commit .env files. This file is committed as documentation.
# ═══════════════════════════════════════════════════════════════════

# ─── SUPABASE ─────────────────────────────────────────────────────
# Found in: Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres

# ─── BACKEND SERVER ───────────────────────────────────────────────
PORT=3000
NODE_ENV=development
# Comma-separated list of allowed CORS origins
CORS_ALLOWED_ORIGINS=http://localhost:8081,https://yourcourier.com

# ─── PAYCHANGU PAYMENT GATEWAY ────────────────────────────────────
# Found in: Paychangu Dashboard → API Keys
# Secret used for webhook HMAC signature verification (min 32 chars)
PAYCHANGU_PUBLIC_KEY=pub_live_xxxxxxxxxxxxxxxx
PAYCHANGU_SECRET_KEY=sec_live_xxxxxxxxxxxxxxxx
PAYCHANGU_WEBHOOK_SECRET=your-webhook-signing-secret-minimum-32-characters
PAYCHANGU_BASE_URL=https://api.paychangu.com

# ─── FIREBASE (FCM PUSH NOTIFICATIONS) ────────────────────────────
# Found in: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
# Private key — keep the \n newline escaping when pasting into .env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG...\n-----END PRIVATE KEY-----\n"

# ─── GOOGLE MAPS ──────────────────────────────────────────────────
# Two keys: server key (backend Distance Matrix API) + client key (mobile Maps SDK)
GOOGLE_MAPS_SERVER_KEY=AIzaSy_server_key_here
# EXPO_PUBLIC_ prefix makes it available in Expo mobile code
EXPO_PUBLIC_GOOGLE_MAPS_KEY=AIzaSy_client_key_here

# ─── REDIS (BULLMQ JOB QUEUES) ────────────────────────────────────
# Local dev: redis://localhost:6379
# Production: Redis Cloud, Upstash, or Railway Redis addon
REDIS_URL=redis://localhost:6379

# ─── SENTRY ERROR TRACKING ────────────────────────────────────────
# Found in: Sentry Dashboard → Settings → Projects → Client Keys (DSN)
SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=development

# ─── MOBILE (Expo Public — visible in mobile bundle) ──────────────
# EXPO_PUBLIC_ prefix required for Expo to embed in app bundle
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## PACKAGE: shared-types

### packages/shared-types/package.json

```json
{
  "name": "@courier/shared-types",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts --max-warnings 0"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

### packages/shared-types/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

### packages/shared-types/src/user.types.ts

```typescript
export type UserRole = 'customer' | 'admin' | 'super_admin';

export interface UserProfile {
  id: string;                    // UUID — same as auth.users.id
  email: string;
  full_name: string;
  phone_number: string;
  role: UserRole;
  is_active: boolean;
  fcm_token: string | null;      // Firebase Cloud Messaging token
  created_at: string;            // ISO 8601
  updated_at: string;
}

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;                 // 'Home', 'Office', etc.
  street: string;
  area: string;
  city: SupportedCity;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Re-export for convenience
export type { SupportedCity } from './shipment.types.js';
```

### packages/shared-types/src/shipment.types.ts

```typescript
import type { UserRole } from './user.types.js';

export type SupportedCity = 'Lilongwe' | 'Blantyre' | 'Mzuzu';

export type PackageSize = 'small' | 'medium' | 'large';

// ─── State machine — all valid states ─────────────────────────────
export type ShipmentStatus =
  | 'pending_approval'     // Submitted — awaiting admin review
  | 'approved'             // Admin approved — customer must pay
  | 'payment_pending'      // Payment initiated with provider
  | 'payment_confirmed'    // Payment verified via webhook
  | 'picked_up'            // Courier collected package
  | 'in_transit'           // En route to destination
  | 'delivered'            // Marked delivered — awaiting receiver confirm
  | 'confirmed'            // Receiver confirmed receipt (TERMINAL)
  | 'rejected'             // Admin rejected (TERMINAL)
  | 'cancelled'            // Cancelled by user or admin (TERMINAL)
  | 'failed';              // Delivery failed (can re-submit)

export const TERMINAL_STATUSES: ShipmentStatus[] = [
  'confirmed',
  'rejected',
  'cancelled',
];

export const ACTIVE_STATUSES: ShipmentStatus[] = [
  'approved',
  'payment_pending',
  'payment_confirmed',
  'picked_up',
  'in_transit',
  'delivered',
];

// ─── Shipment record ───────────────────────────────────────────────
export interface Shipment {
  id: string;
  tracking_number: string;       // e.g. "CRR-20240101-A3F9C2"
  user_id: string;

  // Sender snapshot (immutable after creation)
  sender_name: string;
  sender_phone: string;
  sender_email: string | null;
  sender_address: string;
  sender_city: SupportedCity;
  sender_lat: number | null;
  sender_lng: number | null;

  // Receiver snapshot (immutable after creation)
  receiver_name: string;
  receiver_phone: string;
  receiver_email: string | null;
  receiver_address: string;
  receiver_city: SupportedCity;
  receiver_lat: number | null;
  receiver_lng: number | null;

  // Package
  weight_kg: number;
  package_size: PackageSize;
  package_description: string;
  is_fragile: boolean;
  declared_value_mwk: number | null;   // Customer-declared value, tambala

  // Routing
  pickup_city: SupportedCity;
  delivery_city: SupportedCity;
  distance_km: number;

  // Pricing — stored as INTEGER in tambala (MWK × 100)
  quoted_price_mwk: number;
  final_price_mwk: number | null;

  // State
  status: ShipmentStatus;
  rejection_reason: string | null;
  delivery_notes: string | null;
  proof_of_delivery_url: string | null;

  // Admin
  reviewed_by: string | null;
  reviewed_at: string | null;

  // Key timestamps
  estimated_delivery_date: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Status event (immutable audit trail entry) ────────────────────
export interface ShipmentStatusEvent {
  id: string;
  shipment_id: string;
  from_status: ShipmentStatus | null;   // null for first event
  to_status: ShipmentStatus;
  notes: string | null;
  actor_id: string;
  actor_role: UserRole;
  ip_address: string | null;
  created_at: string;
}

// ─── Price breakdown for UI display ───────────────────────────────
export interface PriceBreakdown {
  base_price_mwk: number;
  distance_charge_mwk: number;
  weight_charge_mwk: number;
  fragile_surcharge_mwk: number;
  total_mwk: number;
  distance_km: number;
}
```

### packages/shared-types/src/payment.types.ts

```typescript
export type PaymentMethod =
  | 'airtel_money'
  | 'tnm_mpamba'
  | 'bank_transfer'
  | 'card';

export type PaymentStatus =
  | 'pending'      // Record created, not sent to provider
  | 'processing'   // Sent to provider, awaiting callback
  | 'paid'         // Webhook confirmed success
  | 'failed'       // Webhook confirmed failure
  | 'refunded'     // Refund processed
  | 'expired';     // Timed out (30 min) without resolution

export interface Payment {
  id: string;
  shipment_id: string;
  user_id: string;
  amount_mwk: number;                    // Tambala (MWK × 100)
  method: PaymentMethod;
  status: PaymentStatus;
  provider_reference: string | null;     // Paychangu tx_ref
  provider_transaction_id: string | null;
  idempotency_key: string;               // UUID generated by client
  phone_number: string | null;           // For mobile money methods
  callback_received_at: string | null;
  callback_payload: Record<string, unknown> | null;  // Raw webhook body
  failure_reason: string | null;
  expires_at: string | null;             // 30 min from creation
  created_at: string;
  updated_at: string;
}

export interface PaymentInitiateRequest {
  shipment_id: string;
  method: PaymentMethod;
  phone_number?: string;                 // Required for mobile money
}

export interface PaymentInitiateResponse {
  payment_id: string;
  provider_reference: string;
  status: PaymentStatus;
  expires_at: string;
}
```

### packages/shared-types/src/notification.types.ts

```typescript
export type NotificationType =
  | 'shipment_created'
  | 'shipment_approved'
  | 'shipment_rejected'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'shipment_picked_up'
  | 'shipment_in_transit'
  | 'shipment_delivered'
  | 'shipment_confirmed'
  | 'admin_new_request';

export interface AppNotification {
  id: string;
  user_id: string;
  shipment_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string>;   // For deep linking
  is_read: boolean;
  push_sent: boolean;
  push_sent_at: string | null;
  push_failed_at: string | null;
  push_error: string | null;
  created_at: string;
}

export interface DisputeTicket {
  id: string;
  shipment_id: string;
  user_id: string;
  category:
    | 'package_damaged'
    | 'package_lost'
    | 'not_delivered'
    | 'wrong_delivery'
    | 'payment_issue'
    | 'other';
  description: string;
  evidence_urls: string[];
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### packages/shared-types/src/index.ts

```typescript
export * from './user.types.js';
export * from './shipment.types.js';
export * from './payment.types.js';
export * from './notification.types.js';
```

---

## PACKAGE: shared-validation

### packages/shared-validation/package.json

```json
{
  "name": "@courier/shared-validation",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts --max-warnings 0"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

### packages/shared-validation/src/auth.schemas.ts

```typescript
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  full_name: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name is too long')
    .trim(),
  phone_number: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number (9-15 digits)'),
});

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const UpdateFCMTokenSchema = z.object({
  fcm_token: z.string().min(1).max(500),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
    confirm_password: z.string().min(1),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type RegisterInput       = z.infer<typeof RegisterSchema>;
export type LoginInput          = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
```

### packages/shared-validation/src/shipment.schemas.ts

```typescript
import { z } from 'zod';

// ─── Canonical city list (single source of truth) ─────────────────
export const SUPPORTED_CITIES = ['Lilongwe', 'Blantyre', 'Mzuzu'] as const;

// ─── Business constraints ──────────────────────────────────────────
export const MAX_WEIGHT_KG   = 10.0;
export const MIN_WEIGHT_KG   = 0.1;
export const MAX_DESCRIPTION = 300;

// ─── Building blocks ──────────────────────────────────────────────
const PhoneSchema = z
  .string()
  .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number');

const GeoPointSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// ─── Sender details ───────────────────────────────────────────────
export const SenderSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .trim(),
  phone_number: PhoneSchema,
  email: z.string().email().nullable().optional(),
  address: z
    .string()
    .min(5, 'Please enter a complete address')
    .max(500)
    .trim(),
  city: z.enum(SUPPORTED_CITIES, {
    errorMap: () => ({
      message: `City must be one of: ${SUPPORTED_CITIES.join(', ')}`,
    }),
  }),
  coordinates: GeoPointSchema.nullable().optional(),
});

// ─── Receiver details ─────────────────────────────────────────────
// Same shape as sender — separate schema for independent validation messages
export const ReceiverSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .trim(),
  phone_number: PhoneSchema,
  email: z.string().email().nullable().optional(),
  address: z
    .string()
    .min(5, 'Please enter a complete address')
    .max(500)
    .trim(),
  city: z.enum(SUPPORTED_CITIES, {
    errorMap: () => ({
      message: `City must be one of: ${SUPPORTED_CITIES.join(', ')}`,
    }),
  }),
  coordinates: GeoPointSchema.nullable().optional(),
});

// ─── Package details ──────────────────────────────────────────────
export const PackageSchema = z.object({
  weight_kg: z
    .number({
      required_error: 'Package weight is required',
      invalid_type_error: 'Weight must be a number',
    })
    .min(MIN_WEIGHT_KG, `Minimum weight is ${MIN_WEIGHT_KG}kg`)
    .max(MAX_WEIGHT_KG, `Maximum weight is ${MAX_WEIGHT_KG}kg`)
    // Allow one decimal place only (0.1kg precision)
    .refine((v) => Math.round(v * 10) / 10 === v, {
      message: 'Weight must have at most one decimal place (e.g. 2.5)',
    }),
  size: z.enum(['small', 'medium', 'large']),
  description: z
    .string()
    .min(3, 'Please describe the package contents')
    .max(MAX_DESCRIPTION)
    .trim(),
  is_fragile: z.boolean().default(false),
  declared_value_mwk: z
    .number()
    .min(0)
    .max(100_000_000)   // 1 million MWK in tambala
    .nullable()
    .optional(),
});

// ─── Full create shipment schema ───────────────────────────────────
export const CreateShipmentSchema = z
  .object({
    sender:        SenderSchema,
    receiver:      ReceiverSchema,
    package:       PackageSchema,
    delivery_notes: z.string().max(500).trim().optional(),
  })
  .refine(
    (data) => data.sender.city === data.receiver.city
      || SUPPORTED_CITIES.includes(data.receiver.city),
    {
      message: 'Delivery city is not in a supported region',
      path: ['receiver', 'city'],
    },
  );

// ─── Quote schema (no auth required) ─────────────────────────────
export const QuoteSchema = z.object({
  pickup_city:   z.enum(SUPPORTED_CITIES),
  delivery_city: z.enum(SUPPORTED_CITIES),
  weight_kg:     z.coerce.number().min(MIN_WEIGHT_KG).max(MAX_WEIGHT_KG),
  is_fragile:    z.coerce.boolean().optional().default(false),
});

// ─── Admin status update ───────────────────────────────────────────
export const AdminStatusUpdateSchema = z.object({
  status: z.enum([
    'approved',
    'rejected',
    'picked_up',
    'in_transit',
    'delivered',
    'cancelled',
  ]),
  notes:            z.string().max(500).trim().optional(),
  rejection_reason: z.string().max(500).trim().optional(),
});

export type CreateShipmentInput  = z.infer<typeof CreateShipmentSchema>;
export type QuoteInput           = z.infer<typeof QuoteSchema>;
export type AdminStatusUpdateInput = z.infer<typeof AdminStatusUpdateSchema>;
```

### packages/shared-validation/src/payment.schemas.ts

```typescript
import { z } from 'zod';

export const InitiatePaymentSchema = z.object({
  shipment_id: z
    .string()
    .uuid('Invalid shipment ID'),
  method: z.enum(
    ['airtel_money', 'tnm_mpamba', 'bank_transfer', 'card'],
    { errorMap: () => ({ message: 'Please select a payment method' }) },
  ),
  phone_number: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, 'Enter a valid phone number')
    .optional(),
});

export const DisputeCreateSchema = z.object({
  shipment_id: z.string().uuid(),
  category: z.enum([
    'package_damaged',
    'package_lost',
    'not_delivered',
    'wrong_delivery',
    'payment_issue',
    'other',
  ]),
  description: z
    .string()
    .min(20, 'Please provide at least 20 characters describing the issue')
    .max(2000)
    .trim(),
  evidence_urls: z.array(z.string().url()).max(5).optional().default([]),
});

export type InitiatePaymentInput = z.infer<typeof InitiatePaymentSchema>;
export type DisputeCreateInput   = z.infer<typeof DisputeCreateSchema>;
```

### packages/shared-validation/src/index.ts

```typescript
export * from './auth.schemas.js';
export * from './shipment.schemas.js';
export * from './payment.schemas.js';
```

---

## PACKAGE: shared-constants

### packages/shared-constants/package.json

```json
{
  "name": "@courier/shared-constants",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

### packages/shared-constants/src/regions.ts

```typescript
import type { SupportedCity, GeoPoint } from '@courier/shared-types';

// City center coordinates — used as fallback for distance calculation
// when user does not share precise location
export const CITY_CENTERS: Record<SupportedCity, GeoPoint> = {
  Lilongwe: { latitude: -13.9626, longitude: 33.7741 },
  Blantyre: { latitude: -15.7867, longitude: 35.0018 },
  Mzuzu:    { latitude: -11.4634, longitude: 34.0175 },
} as const;

// Preset road distances between cities in km
// Source: verified against Google Maps road network distances
// Used as fallback if Google Maps API is unavailable
export const INTER_CITY_DISTANCES_KM: Record<string, number> = {
  'Lilongwe-Blantyre': 312,
  'Blantyre-Lilongwe': 312,
  'Lilongwe-Mzuzu':    382,
  'Mzuzu-Lilongwe':    382,
  'Blantyre-Mzuzu':    548,
  'Mzuzu-Blantyre':    548,
} as const;

// Default same-city distance when coordinates not available
export const DEFAULT_SAME_CITY_DISTANCE_KM = 5;

export const SUPPORTED_CITIES = ['Lilongwe', 'Blantyre', 'Mzuzu'] as const;
```

### packages/shared-constants/src/limits.ts

```typescript
// ─── Package limits ────────────────────────────────────────────────
export const MAX_WEIGHT_KG        = 10.0;
export const MIN_WEIGHT_KG        = 0.1;
export const MAX_DECLARED_VALUE_MWK = 100_000_000;  // 1,000,000 MWK in tambala

// ─── Monetary ─────────────────────────────────────────────────────
// All amounts stored in tambala (MWK × 100) to avoid floating point
export const TAMBALA_PER_MWK = 100;

export function mkwToTambala(mwk: number): number {
  return Math.round(mwk * TAMBALA_PER_MWK);
}

export function tambalaToMwk(tambala: number): number {
  return tambala / TAMBALA_PER_MWK;
}

export function formatMwk(tambala: number): string {
  return `MWK ${tambalaToMwk(tambala).toLocaleString('en-MW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Payment ──────────────────────────────────────────────────────
export const PAYMENT_EXPIRY_MINUTES = 30;

// ─── Rate limiting ────────────────────────────────────────────────
export const GLOBAL_RATE_LIMIT_PER_15MIN  = 100;
export const AUTH_RATE_LIMIT_PER_15MIN    = 10;
export const PAYMENT_RATE_LIMIT_PER_HOUR  = 20;

// ─── Pagination ───────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE     = 100;

// ─── File uploads ─────────────────────────────────────────────────
export const MAX_PROOF_OF_DELIVERY_SIZE_BYTES = 5 * 1024 * 1024;   // 5MB
export const MAX_DISPUTE_EVIDENCE_SIZE_BYTES  = 10 * 1024 * 1024;  // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
```

### packages/shared-constants/src/status.ts

```typescript
import type { ShipmentStatus } from '@courier/shared-types';

// Human-readable labels for each status
export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending_approval:  'Pending Review',
  approved:          'Approved',
  payment_pending:   'Awaiting Payment',
  payment_confirmed: 'Payment Confirmed',
  picked_up:         'Picked Up',
  in_transit:        'In Transit',
  delivered:         'Delivered',
  confirmed:         'Delivery Confirmed',
  rejected:          'Rejected',
  cancelled:         'Cancelled',
  failed:            'Delivery Failed',
} as const;

// Status descriptions for user-facing copy
export const STATUS_DESCRIPTIONS: Record<ShipmentStatus, string> = {
  pending_approval:  'Your request is being reviewed by our team.',
  approved:          'Your request is approved. Please complete payment to proceed.',
  payment_pending:   'Your payment is being processed.',
  payment_confirmed: 'Payment received. Your package will be picked up shortly.',
  picked_up:         'Your package has been collected by our courier.',
  in_transit:        'Your package is on its way to the destination.',
  delivered:         'Your package has been delivered. Please confirm receipt.',
  confirmed:         'Delivery confirmed. Thank you for using CourierApp.',
  rejected:          'Your request was not approved. Check details for the reason.',
  cancelled:         'This shipment has been cancelled.',
  failed:            'Delivery was unsuccessful. You may re-submit your request.',
} as const;

// Legal transitions — used by both backend state machine and frontend
// to determine which actions to show
export const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  pending_approval:  ['approved', 'rejected'],
  approved:          ['payment_pending', 'cancelled'],
  payment_pending:   ['payment_confirmed', 'approved', 'failed'],
  payment_confirmed: ['picked_up', 'cancelled'],
  picked_up:         ['in_transit'],
  in_transit:        ['delivered', 'failed'],
  delivered:         ['confirmed'],
  confirmed:         [],
  rejected:          [],
  cancelled:         [],
  failed:            ['pending_approval'],
} as const;

export function isTerminalStatus(status: ShipmentStatus): boolean {
  return ['confirmed', 'rejected', 'cancelled'].includes(status);
}

export function isActiveStatus(status: ShipmentStatus): boolean {
  return [
    'approved',
    'payment_pending',
    'payment_confirmed',
    'picked_up',
    'in_transit',
    'delivered',
  ].includes(status);
}

export function canPay(status: ShipmentStatus): boolean {
  return status === 'approved';
}

export function canConfirm(status: ShipmentStatus): boolean {
  return status === 'delivered';
}

export function canCancel(status: ShipmentStatus): boolean {
  return ['pending_approval', 'approved', 'payment_confirmed'].includes(status);
}
```

### packages/shared-constants/src/index.ts

```typescript
export * from './regions.js';
export * from './limits.js';
export * from './status.js';
```

---

## MOBILE APP: apps/mobile

### apps/mobile/package.json

```json
{
  "name": "@courier/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "build:android:dev": "eas build --platform android --profile development",
    "build:android:preview": "eas build --platform android --profile preview",
    "build:android:prod": "eas build --platform android --profile production",
    "submit:android": "eas submit --platform android --profile production",
    "lint": "eslint . --ext .ts,.tsx --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "jest --passWithNoTests"
  },
  "dependencies": {
    "@courier/shared-types": "*",
    "@courier/shared-validation": "*",
    "@courier/shared-constants": "*",
    "expo": "~51.0.14",
    "expo-router": "~3.5.18",
    "expo-status-bar": "~1.12.1",
    "expo-secure-store": "~13.0.2",
    "expo-location": "~17.0.1",
    "expo-image-picker": "~15.0.7",
    "expo-notifications": "~0.28.12",
    "expo-device": "~6.0.2",
    "expo-constants": "~16.0.2",
    "expo-linking": "~6.3.1",
    "react": "18.2.0",
    "react-native": "0.74.3",
    "@react-navigation/native": "^6.1.17",
    "@react-navigation/bottom-tabs": "^6.5.20",
    "react-native-safe-area-context": "^4.10.5",
    "react-native-screens": "~3.31.1",
    "react-native-gesture-handler": "~2.16.1",
    "react-native-reanimated": "~3.10.1",
    "@supabase/supabase-js": "^2.43.5",
    "zustand": "^4.5.4",
    "zod": "^3.23.8",
    "@tanstack/react-query": "^5.45.1",
    "axios": "^1.7.2",
    "react-hook-form": "^7.52.1",
    "@hookform/resolvers": "^3.6.0",
    "date-fns": "^3.6.0",
    "react-native-toast-message": "^2.2.0",
    "@expo/vector-icons": "^14.0.2",
    "@react-native-async-storage/async-storage": "^1.23.1"
  },
  "devDependencies": {
    "@babel/core": "^7.24.9",
    "@types/react": "~18.2.79",
    "@types/react-native": "^0.73.0",
    "typescript": "^5.4.5",
    "jest": "^29.7.0",
    "jest-expo": "~51.0.3",
    "@testing-library/react-native": "^12.5.1"
  }
}
```

### apps/mobile/tsconfig.json

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@courier/shared-types": ["../../packages/shared-types/src/index.ts"],
      "@courier/shared-validation": ["../../packages/shared-validation/src/index.ts"],
      "@courier/shared-constants": ["../../packages/shared-constants/src/index.ts"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.d.ts",
    "expo-env.d.ts"
  ]
}
```

### apps/mobile/app.json

```json
{
  "expo": {
    "name": "CourierApp",
    "slug": "courier-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "scheme": "courierapp",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0A1628"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.yourcourier.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "We need your location to calculate delivery pickup coordinates and show nearby areas.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "We use your location to find your position for pickup requests.",
        "NSCameraUsageDescription": "We need camera access to capture proof of delivery photos.",
        "NSPhotoLibraryUsageDescription": "We need photo library access to attach evidence for disputes.",
        "NSPhotoLibraryAddUsageDescription": "We need permission to save delivery photos."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0A1628"
      },
      "package": "com.yourcourier.app",
      "versionCode": 1,
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.USE_BIOMETRIC"
      ],
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow CourierApp to use your location for pickup address and delivery routing."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#0A1628",
          "sounds": [],
          "mode": "production"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow CourierApp to access your photos for delivery evidence and dispute resolution."
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": "REPLACE_WITH_YOUR_EAS_PROJECT_ID"
      }
    }
  }
}
```

### apps/mobile/eas.json

```json
{
  "cli": {
    "version": ">= 7.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "http://192.168.1.100:3000/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-dev-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-dev-anon-key"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-staging.yourcourier.com/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-staging-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-staging-anon-key"
      }
    },
    "production": {
      "autoIncrement": "version",
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "credentialsSource": "remote"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.yourcourier.com/api",
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-prod-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-prod-anon-key"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-service-account.json",
        "track": "internal",
        "releaseStatus": "draft"
      }
    }
  }
}
```

### apps/mobile/babel.config.js

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for Reanimated
      'react-native-reanimated/plugin',
    ],
  };
};
```

---

## BACKEND APP: apps/backend

### apps/backend/package.json

```json
{
  "name": "@courier/backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start:prod": "node dist/index.js",
    "lint": "eslint . --ext .ts --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@courier/shared-types": "*",
    "@courier/shared-validation": "*",
    "@courier/shared-constants": "*",
    "@sentry/node": "^8.13.0",
    "@supabase/supabase-js": "^2.43.5",
    "axios": "^1.7.2",
    "bullmq": "^5.10.2",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "firebase-admin": "^12.2.0",
    "helmet": "^7.1.0",
    "ioredis": "^5.4.1",
    "morgan": "^1.10.0",
    "pino": "^9.2.0",
    "pino-http": "^10.2.0",
    "pino-pretty": "^11.2.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/compression": "^1.7.5",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/morgan": "^1.9.9",
    "@types/node": "^20.14.9",
    "@vitest/coverage-v8": "^1.6.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.16.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

### apps/backend/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@courier/shared-types": ["../../packages/shared-types/src/index.ts"],
      "@courier/shared-validation": ["../../packages/shared-validation/src/index.ts"],
      "@courier/shared-constants": ["../../packages/shared-constants/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*", "dist/**/*"]
}
```

### apps/backend/tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": false,
    "declarationMap": false
  },
  "exclude": ["test/**/*", "**/*.test.ts", "**/*.spec.ts"]
}
```

### apps/backend/Dockerfile

```dockerfile
# ─── Build stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/shared-constants/package.json ./packages/shared-constants/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/backend/ ./apps/backend/
COPY packages/ ./packages/
COPY tsconfig.base.json ./

# Build
RUN cd apps/backend && npm run build

# ─── Production stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S courier -u 1001

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=courier:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=courier:nodejs /app/apps/backend/package.json ./

# Install production deps only
RUN npm ci --omit=dev

USER courier

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
```

### apps/backend/.env.example

```bash
# Backend-specific env vars
# Copy to .env (never commit .env)

NODE_ENV=development
PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:8081,https://yourcourier.com

SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

PAYCHANGU_PUBLIC_KEY=pub_live_xxx
PAYCHANGU_SECRET_KEY=sec_live_xxx
PAYCHANGU_WEBHOOK_SECRET=minimum-32-character-secret-here
PAYCHANGU_BASE_URL=https://api.paychangu.com

FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

GOOGLE_MAPS_SERVER_KEY=AIzaSy_xxx

REDIS_URL=redis://localhost:6379

SENTRY_DSN=https://xxx@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=development

ADMIN_EMAIL=admin@yourcourier.com
```

---

## SUPABASE: supabase/config.toml

```toml
[api]
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
port = 54323
enabled = true

[inbucket]
port = 54324
smtp_port = 54325
pop3_port = 54326

[storage]
file_size_limit = "50MiB"

[auth]
# Development: localhost mobile dev server
site_url = "http://localhost:8081"
additional_redirect_urls = [
  "https://yourcourier.com",
  "courierapp://",
  "exp+courierapp://"
]
jwt_expiry = 3600
enable_signup = true
# Mobile apps skip email confirmation — verify via phone or magic link in prod
email_confirm_changes = false

[auth.email]
enable_confirmations = false
secure_password_change = true

[auth.sms]
enable_signup = false

[realtime]
enabled = true
# Tables using realtime: shipments, notifications (added in migration 013)
```

---

## CI/CD: .github/workflows/backend-ci.yml

```yaml
name: Backend CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'apps/backend/**'
      - 'packages/**'
      - 'package.json'
      - 'turbo.json'
  pull_request:
    branches: [main, develop]
    paths:
      - 'apps/backend/**'
      - 'packages/**'

jobs:
  ci:
    name: Lint · Typecheck · Test
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint -- --filter=@courier/backend

      - name: Typecheck
        run: npm run typecheck -- --filter=@courier/backend

      - name: Run tests
        run: npm run test -- --filter=@courier/backend
        env:
          NODE_ENV: test
          REDIS_URL: redis://localhost:6379
          SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
          PAYCHANGU_WEBHOOK_SECRET: test-webhook-secret-minimum-32-chars
          GOOGLE_MAPS_SERVER_KEY: test-key
          FIREBASE_PROJECT_ID: test-project
          FIREBASE_CLIENT_EMAIL: test@test.iam.gserviceaccount.com
          FIREBASE_PRIVATE_KEY: test-key
          PAYCHANGU_PUBLIC_KEY: test
          PAYCHANGU_SECRET_KEY: test
          PAYCHANGU_BASE_URL: https://api.paychangu.com
          CORS_ALLOWED_ORIGINS: http://localhost:3000
          ADMIN_EMAIL: admin@test.com

      - name: Build
        run: npm run build -- --filter=@courier/backend
```

---

## CI/CD: .github/workflows/mobile-ci.yml

```yaml
name: Mobile CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'apps/mobile/**'
      - 'packages/**'
  pull_request:
    branches: [main, develop]
    paths:
      - 'apps/mobile/**'
      - 'packages/**'

jobs:
  ci:
    name: Lint · Typecheck
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint -- --filter=@courier/mobile

      - name: Typecheck
        run: npm run typecheck -- --filter=@courier/mobile
```

---

## CI/CD: .github/workflows/mobile-build.yml

```yaml
name: Mobile Build (EAS)

on:
  push:
    tags:
      - 'v*'        # Triggers on version tags: v1.0.0, v1.1.0, etc.
  workflow_dispatch:
    inputs:
      profile:
        description: 'EAS build profile'
        required: true
        default: 'preview'
        type: choice
        options:
          - development
          - preview
          - production

jobs:
  build:
    name: EAS Build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build Android
        working-directory: apps/mobile
        run: |
          PROFILE="${{ github.event.inputs.profile || 'production' }}"
          eas build --platform android --profile $PROFILE --non-interactive

      - name: Submit to Play Store (production only)
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
        working-directory: apps/mobile
        run: eas submit --platform android --profile production --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

---

## DEVELOPMENT WORKFLOW

### First-time local setup

```bash
# Clone
git clone https://github.com/yourorg/courier-platform.git
cd courier-platform

# Install all workspace dependencies
npm install

# Set up environment
cp .env.example apps/backend/.env
cp .env.example apps/mobile/.env
# Edit both .env files with your actual credentials

# Start Supabase locally
supabase start
# This outputs: API URL, anon key, service role key — copy to .env files

# Run migrations against local Supabase
supabase db push

# Start backend in dev mode (hot reload)
npm run dev -- --filter=@courier/backend

# In a new terminal: start mobile
cd apps/mobile
npx expo start
# Scan QR with Expo Go app, or press 'a' for Android emulator
```

### Daily development

```bash
# Run all quality checks
npm run typecheck
npm run lint
npm run test

# Build all packages
npm run build

# Wipe and reinstall everything
npm run clean && npm install
```

### Creating a Play Store build

```bash
# Install EAS CLI if not installed
npm install -g eas-cli

# Login to Expo account
eas login

# Build preview APK (for testing on real devices)
cd apps/mobile
eas build --platform android --profile preview

# Build production AAB (for Play Store)
eas build --platform android --profile production

# Submit to Play Store (internal testing track)
eas submit --platform android --profile production
```

---

## ARCHITECTURE DECISION RECORDS

### ADR-001: Monorepo with Turborepo

**Decision:** Single Git repository containing mobile app, backend, and shared packages.

**Rationale:** TypeScript types and Zod validation schemas are used by both the
mobile app and the backend. Without a monorepo, these would diverge — a
breaking backend schema change would not be caught until runtime. Turborepo
handles incremental builds so you only rebuild what changed.

**Consequences:** All developers work in one repo. Shared packages must be
carefully versioned. CI pipeline needs to scope jobs to affected workspaces.

---

### ADR-002: Tambala (integer) for all monetary values

**Decision:** All money is stored as INTEGER in tambala (1 MWK = 100 tambala).

**Rationale:** JavaScript and PostgreSQL floating point arithmetic is
unsuitable for money. MWK 15.30 cannot be represented precisely in IEEE 754
floating point. Storing tambala as integers makes all arithmetic exact.

**Example:**
```typescript
// WRONG — floating point
const price = 150.30 + 0.10;   // 150.39999999999998

// RIGHT — integer tambala
const price = 15030 + 10;      // 15040 (exactly MWK 150.40)
```

**Consequence:** All display code must divide by 100. The `formatMwk(tambala)`
utility in shared-constants handles this. Never store or pass raw MWK floats.

---

### ADR-003: Sender/receiver stored as flat columns, not foreign keys

**Decision:** Shipment rows store sender and receiver details as flat columns
(sender_name, sender_phone, etc.) not as references to user_profiles.

**Rationale:** A shipment is a point-in-time snapshot. If a user later changes
their name or phone number, that change must not retroactively alter a
historical shipment record. Denormalized snapshot is the correct data model
for immutable business events.

**Consequence:** No JOIN is needed to display shipment sender/receiver
details. Updates to user_profiles do not cascade to shipments.

---

### ADR-004: Backend service role bypasses RLS; mobile uses anon key

**Decision:** The backend API uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses
all RLS policies. The mobile app uses `SUPABASE_ANON_KEY` and all access is
mediated through RLS.

**Rationale:** Business logic enforcement belongs in the backend, not in
database RLS policies alone. RLS on the mobile path prevents direct API
abuse (bypassing the backend). The backend enforces the full business rules.

**Consequence:** The service role key must never be shipped to the mobile
app. It lives only in backend environment variables. Backend code is the
trust boundary.

---

### ADR-005: Optimistic concurrency for shipment state transitions

**Decision:** Shipment status updates use `UPDATE ... WHERE status = $expected`
to detect concurrent modifications.

**Rationale:** Two admin users approving the same shipment simultaneously must
not both succeed. By conditioning the update on the current status, the second
update will affect 0 rows, which we detect and return as a 409 Conflict.

**Implementation:**
```typescript
const { data } = await supabase
  .from('shipments')
  .update({ status: newStatus })
  .eq('id', shipmentId)
  .eq('status', currentStatus)   // ← concurrency guard
  .select()
  .single();

if (!data) {
  throw new ConflictError('Shipment was modified concurrently. Please retry.');
}
```

---

### ADR-006: Idempotency keys for payment initiation

**Decision:** The mobile app generates a UUID before calling `/api/payments/initiate`
and sends it as `X-Idempotency-Key`. The backend returns the existing payment
record if the same key is used again.

**Rationale:** Mobile networks are unreliable. The user may tap "Pay" and the
request may time out before a response arrives. Without idempotency, retrying
would create a duplicate payment. With idempotency, retrying returns the same
payment safely.

**Implementation:**
```typescript
// Mobile: generate once before sending
const idempotencyKey = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  `${shipmentId}-${userId}-${Date.now()}`,
);

// Backend: check before processing
const existing = await supabase
  .from('payments')
  .select('*')
  .eq('idempotency_key', key)
  .maybeSingle();

if (existing.data) return existing.data;  // Return without reprocessing
```

---

### ADR-007: BullMQ for notification delivery

**Decision:** Notifications are not sent synchronously during request handling.
They are enqueued to BullMQ and processed by a separate worker.

**Rationale:** FCM calls can be slow (200-2000ms). Waiting for them synchronously
would add latency to every status change. If FCM is down, the main request
should still succeed. The queue provides retry with exponential backoff and
a dead-letter queue for failed notifications.

**Consequence:** Notifications may arrive slightly after the status change.
This is acceptable — push notifications are best-effort. In-app notifications
are persisted to the database and visible when the user opens the app.

---

## PHASE 1 COMPLETION CHECKLIST

Work through this list before starting Phase 2.

```
□ courier-platform/ Git repository created
□ All directories created per structure above
□ Root package.json placed and npm install succeeds
□ turbo.json placed
□ tsconfig.base.json placed
□ .prettierrc placed
□ .eslintrc.base.js placed
□ .gitignore placed
□ .env.example placed

□ packages/shared-types/ — all 5 files placed
□ packages/shared-validation/ — all 5 files placed
□ packages/shared-constants/ — all 5 files placed
□ npm run typecheck passes on all packages

□ apps/mobile/ — Expo app initialized
□ apps/mobile/package.json — dependencies installed
□ apps/mobile/tsconfig.json — placed
□ apps/mobile/app.json — placed with correct package names
□ apps/mobile/eas.json — placed, EAS project ID filled in
□ apps/mobile/babel.config.js — placed

□ apps/backend/ — directory created
□ apps/backend/package.json — dependencies installed
□ apps/backend/tsconfig.json — placed
□ apps/backend/tsconfig.build.json — placed
□ apps/backend/Dockerfile — placed
□ apps/backend/.env.example — placed
□ apps/backend/.env — created from example, real keys filled in

□ supabase/ — initialized with supabase init
□ supabase/config.toml — placed
□ supabase start — local Supabase running
□ supabase db push — migrations applied (Phase 2 delivers migrations)

□ .github/workflows/ — all 3 CI files placed
□ GitHub repo secrets configured:
    □ EXPO_TOKEN
    □ SUPABASE_TEST_URL
    □ SUPABASE_TEST_SERVICE_ROLE_KEY
    □ SUPABASE_TEST_ANON_KEY

□ EAS project linked (eas init in apps/mobile)
□ Google Play Developer account active
□ Firebase project created, google-services.json downloaded
□ Paychangu account active, API keys obtained
□ Supabase project created (non-local), URL + keys noted

□ npm run typecheck — PASSES with zero errors
□ npm run lint — PASSES with zero warnings
□ npm run build — PASSES (after Phase 2 adds real code)
```

---

## WHAT COMES NEXT

**Phase 2 — Database Schema & Migrations**
All 15 SQL migration files for Supabase. Covers enums, user_profiles,
shipments, payments, notifications, audit_log, pricing_config, disputes,
realtime config, storage buckets, and admin RPC functions.

**Phase 3 — Backend API Core Infrastructure**
Express app factory, env validation, Supabase clients, Redis, logger,
all error classes, auth middleware, validation middleware, rate limiting,
health route, audit service.

**Phase 4 — Authentication System**
Register, login, refresh token, logout, FCM token update routes and services.

**Phase 5 — Shipment Engine**
State machine enforcement, create shipment, status transitions, pricing
calculation, geolocation/distance, all shipment routes.

**Phase 6 — Payment Integration (Paychangu)**
Payment initiation, webhook signature verification, idempotent processing,
payment failure recovery, reconciliation worker.

**Phase 7 — Notification System (FCM + BullMQ)**
Notification templates, FCM dispatch, in-app notification store, BullMQ
queue and worker, retry/dead-letter handling.

**Phase 8 — Admin API**
All admin routes: shipment list/detail/status update, user management,
audit log access, stats RPC, dispute management.

**Phase 9 — React Native Foundation**
Root layout, auth store, API client with token refresh, secure storage,
theme constants, all UI primitives, push notification setup.

**Phase 10-14 — All Mobile Screens**
Auth screens, home dashboard, shipment create form (4-step), shipment
detail + timeline, payment screen, notifications inbox, profile,
admin dashboard, admin shipment management.

**Phase 15 — Testing Suite**
Unit tests for state machine, pricing, webhook verification.
Integration tests for auth flows, shipment CRUD, payment webhooks.
React Native component tests.

**Phase 16 — CI/CD Pipeline**
Full GitHub Actions setup, environment separation, EAS build automation,
automatic Play Store submission on release tags.

**Phase 17 — Play Store Release**
Asset requirements, store listing, content rating, release tracks,
production checklist.

**Phase 18 — Observability & Production Ops**
Sentry integration (backend + mobile), structured logging, alert rules,
runbook, incident response.

---

**Deliverable:** This file — `PHASE_1_ARCHITECTURE.md`

**Next step:** Create all files from this document in the courier-platform/ directory, run `npm install`, confirm `npm run typecheck` passes, then move to Phase 2 (Database Schema & Migrations).
