# AGENTS.md - Courier Platform

## Project Structure

```
courier-platform/
├── apps/
│   ├── backend/       # Node.js/Express API (port 3000)
│   └── mobile/        # Expo/React Native app
└── packages/
    ├── shared-types/      # TypeScript interfaces
    ├── shared-validation/ # Zod schemas
    └── shared-constants/  # App constants
```

## Commands

### Root (run from repo root)
- `npm run dev` - Start all apps in parallel
- `npm run build` - Build all packages (turbo)
- `npm run test` - Run all tests
- `npm run lint` - Lint all packages
- `npm run typecheck` - TypeScript check all packages

### Backend
- `cd apps/backend && npm run dev` - Start dev server (tsx watch)
- `cd apps/backend && npm run test` - Run vitest tests

### Mobile
- `cd apps/mobile && npx expo start` - Start Expo dev server
- `cd apps/mobile && npm run android` - Build/run on Android
- `cd apps/mobile && npm run build:android:dev` - EAS dev build

## Important Constraints (enforced in code)

- **Max package weight**: 10kg - reject at both client and backend
- **Service regions**: Only Lilongwe, Blantyre, Mzuzu - reject elsewhere
- **Payment**: Paychangu gateway for Airtel/TNM/bank integration

## Key Dependencies

- Backend: Express, Supabase, BullMQ (queues), Firebase Admin, Sentry
- Mobile: Expo 51, expo-router, React Query, Zustand, Supabase client

## Database

- Supabase (PostgreSQL) - requires `.env` with `SUPABASE_URL` and service role key

## Testing

- Backend: vitest (run in backend directory)
- Mobile: jest (run in mobile directory)
- All tests must pass before merge