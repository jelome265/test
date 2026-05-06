# copilot-instructions.md — Courier Platform

Purpose
- Provide repository-specific instructions so Copilot-style assistants can act effectively without reading every file.

1) Build / test / lint (where to run and single-test examples)

Root (monorepo, Turbo)
- Install: npm install
- Dev (start all apps): npm run dev
- Build all packages: npm run build
- Run all tests (root/turbo): npm run test
- Lint all: npm run lint
- Typecheck all: npm run typecheck

Run a single package's scripts (examples) — prefer turbo where helpful
- Run package-level tasks with Turborepo (recommended):
  - Run package tests: npx turbo run test --filter="@courier/backend..."  # replace @courier/backend with the workspace name
  - Run package lint: npx turbo run lint --filter="@courier/backend..."
  - Run package typecheck: npx turbo run typecheck --filter="@courier/backend..."

- Alternative: use npm workspace flags (works reliably in CI):
  - npm run test --workspace=@courier/backend --if-present
  - npm run lint --workspace=@courier/backend --if-present
  - npm run typecheck --workspace=@courier/backend --if-present

Run a single test file locally
- Backend (Vitest):
  - cd apps\backend && npx vitest path/to/file.spec.ts
  - Run by test name: cd apps\backend && npx vitest -t "test name regex"

- Mobile (Jest/Expo):
  - cd apps\mobile && npx jest path/to/test.file --testNamePattern="pattern"

Notes on "one test at a time"
- Local: to run a single package's test suite use the turbo filter or npm workspace command above.
- CI: workflows run checks per-package (matrix) so packages are tested/linited/typechecked individually (one package job per runner).

2) High-level architecture (big picture)

- Monorepo layout
  - apps/backend — Node.js + Express API (port 3000 in dev), vitest for tests, uses tsx for dev run and tsc for build.
  - apps/mobile — Expo-managed React Native app (expo-router), Jest for tests, EAS builds configured.
  - packages/shared-types — TypeScript interfaces shared between backend and mobile.
  - packages/shared-validation — Zod schemas reused across frontend and backend for consistent validation.
  - packages/shared-constants — Business constants and state-machine definitions.

- Infrastructure and integrations (surface-level)
  - Backend depends on Supabase (Postgres), BullMQ (Redis queues), Firebase Admin (push), Sentry (errors), Paychangu integration for payments.
  - Mobile integrates Supabase client, React Query, Zustand for state, and Expo services (notifications, location).

- How code references shared packages
  - Packages are referenced as workspace deps (e.g., "@courier/shared-types") so local changes propagate via workspace resolution.
  - When modifying shared packages, run the dependent package's build/typecheck/test to validate changes.

3) Key conventions and repository-specific rules

- Business / validation rules enforced in code
  - Max package weight: 10kg — enforced at client and server
  - Service regions: Only Lilongwe, Blantyre, Mzuzu
  - Money representation: use integer tambala (MWK * 100) to avoid floats

- TypeScript and linting
  - Strict TypeScript is used. Prefer shared-types for cross-package type definitions.
  - ESLint is configured with --max-warnings 0: CI and pre-commit expect zero warnings.

- Validation
  - Zod schemas live in packages/shared-validation and are the canonical source of input validation shared by backend and mobile forms.

- Testing and CI expectations
  - Backend uses vitest; Mobile uses jest. All tests are expected to pass before merging.
  - CI uses GitHub Actions and runs package-level jobs (test, lint, typecheck) using npm workspace commands and Turborepo where appropriate.
  - Mobile tests will be included in CI (jest for apps/mobile) per repository policy.

- Local dev notes
  - Backend dev server: tsx watch (no build step for rapid dev).
  - Mobile: use Expo dev tooling and EAS for builds.

4) Where to look for authoritative docs
- AGENTS.md — project structure, commands, and business constraints (already present in repository).
- README.md — higher-level readme; check for onboarding and env var requirements.
- packages/* package.json files — quick view of per-package scripts.

5) Environment variables & secrets
- Supabase requires SUPABASE_URL and service role key for many backend operations. Do NOT commit .env files. Use .env.example as a template.

6) Other AI assistant / agent files to respect
- AGENTS.md is present and contains essential operational commands and constraints; include its rules when proposing changes.
- No CLAUDE.md, .cursorrules, or other assistant rule files detected.

7) Quick troubleshooting hints for assistants
- When asked to run or modify backend code, prefer executing package scripts in apps/backend rather than changing root scripts.
- When changing shared packages, update dependent packages and run typecheck/test locally (or via turbo) before pushing.
- If adding or changing environment-dependent behavior, list required env vars and add entries to .env.example (do NOT commit secrets).

8) CI notes (what was implemented)
- CI uses GitHub Actions (see .github/workflows/ci.yml) and runs a matrix of package-level jobs. Each job runs:
  - npm ci
  - npm run test --workspace=<package> --if-present
  - npm run lint --workspace=<package> --if-present
  - npm run typecheck --workspace=<package> --if-present
- This keeps work isolated: one package runs per runner, matching the "one package at a time" request.

---

If this file should incorporate additional docs (CONTRIBUTING.md, CI workflow rules, or CLAUDE.md when added), say which file to pull from and it will be merged into this guidance.


Purpose
- Provide repository-specific instructions so Copilot-style assistants can act effectively without reading every file.

1) Build / test / lint (where to run and single-test examples)

Root (monorepo, Turbo)
- Install: npm install
- Dev (start all apps): npm run dev
- Build all packages: npm run build
- Run all tests: npm run test
- Lint all: npm run lint
- Typecheck all: npm run typecheck

Run a single package's scripts (examples)
- Backend (Express + Vitest):
  - Start dev server: cd apps\backend && npm run dev
  - Run full tests: cd apps\backend && npm run test
  - Run a single vitest file: cd apps\backend && npx vitest path/to/file.spec.ts
  - Run by test name: cd apps\backend && npx vitest -t "test name regex"
  - Coverage: cd apps\backend && npm run test:coverage

- Mobile (Expo + Jest):
  - Start: cd apps\mobile && npm run start
  - Run a single jest test file: cd apps\mobile && npx jest path/to/test.file --testNamePattern="pattern"
  - Start Expo: cd apps\mobile && npx expo start

- Lint / Typecheck single package or file:
  - Lint package: cd apps\backend && npm run lint
  - Lint single file: npx eslint path/to/file --ext .ts,.tsx --max-warnings 0
  - Typecheck package: cd packages\shared-types && npm run typecheck

Notes
- Root scripts use Turborepo (turbo), and workspaces are defined in package.json (apps/* and packages/*).
- Node/npm versions: engines require Node >=20 and npm >=10.

2) High-level architecture (big picture)

- Monorepo layout
  - apps/backend — Node.js + Express API (port 3000 in dev), vitest for tests, uses tsx for dev run and tsc for build.
  - apps/mobile — Expo-managed React Native app (expo-router), Jest for tests, EAS builds configured.
  - packages/shared-types — TypeScript interfaces shared between backend and mobile.
  - packages/shared-validation — Zod schemas reused across frontend and backend for consistent validation.
  - packages/shared-constants — Business constants and state-machine definitions.

- Infrastructure and integrations (surface-level)
  - Backend depends on Supabase (Postgres), BullMQ (Redis queues), Firebase Admin (push), Sentry (errors), Paychangu integration for payments.
  - Mobile integrates Supabase client, React Query, Zustand for state, and Expo services (notifications, location).

- How code references shared packages
  - Packages are referenced as workspace deps (e.g., "@courier/shared-types") so local changes propagate via workspace resolution.
  - When modifying shared packages, run the dependent package's build/typecheck/test to validate changes.

3) Key conventions and repository-specific rules

- Business / validation rules enforced in code
  - Max package weight: 10kg — enforced at client and server
  - Service regions: Only Lilongwe, Blantyre, Mzuzu
  - Money representation: use integer tambala (MWK * 100) to avoid floats

- TypeScript and linting
  - Strict TypeScript is used. Prefer shared-types for cross-package type definitions.
  - ESLint is configured with --max-warnings 0: CI and pre-commit expect zero warnings.

- Validation
  - Zod schemas live in packages/shared-validation and are the canonical source of input validation shared by backend and mobile forms.

- Testing and CI expectations
  - Backend uses vitest; Mobile uses jest. All tests are expected to pass before merging.
  - Use the package-level test commands for focused runs; CI runs root-level turbo scripts.

- Local dev notes
  - Backend dev server: tsx watch (no build step for rapid dev).
  - Mobile: use Expo dev tooling and EAS for builds.

4) Where to look for authoritative docs
- AGENTS.md — project structure, commands, and business constraints (already present in repository).
- README.md — higher-level readme; check for onboarding and env var requirements.
- packages/* package.json files — quick view of per-package scripts.

5) Environment variables & secrets
- Supabase requires SUPABASE_URL and service role key for many backend operations. Do NOT commit .env files. Use .env.example as a template.

6) Other AI assistant / agent files to respect
- AGENTS.md is present and contains essential operational commands and constraints; include its rules when proposing changes.
- No CLAUDE.md, .cursorrules, or other assistant rule files detected.

7) Quick troubleshooting hints for assistants
- When asked to run or modify backend code, prefer executing package scripts in apps/backend rather than changing root scripts.
- When changing shared packages, update dependent packages and run typecheck/test locally (or via turbo) before pushing.
- If adding or changing environment-dependent behavior, list required env vars and add entries to .env.example (do NOT commit secrets).

---

If this file should incorporate additional docs (CONTRIBUTING.md, CI workflow rules, or CLAUDE.md when added), say which file to pull from and it will be merged into this guidance.
