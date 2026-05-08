# Dependency Audit Report

Date: 2026-05-08

## Scope

Audited the root npm workspace for the Courier Platform:

- Root package: `courier-platform`
- Workspaces: `apps/backend`, `apps/mobile`, `packages/*`
- Primary command: `npm audit --json`
- Production-only check: `npm audit --omit=dev --json`
- Dependency chain checks: `npm ls` for the vulnerable dependency roots

The repo has a single root `package-lock.json`; there are no separate lockfiles under `apps/backend` or `apps/mobile`.

## Summary

`npm audit` reports 42 total vulnerabilities:

| Severity | Count |
| --- | ---: |
| Critical | 5 |
| High | 18 |
| Moderate | 14 |
| Low | 5 |
| Total | 42 |

Production-only audit still reports 37 vulnerabilities:

| Severity | Count |
| --- | ---: |
| Critical | 5 |
| High | 17 |
| Moderate | 14 |
| Low | 1 |
| Total | 37 |

The headline number is inflated by transitive dependency chains. The real causes collapse into these main groups:

1. Backend `firebase-admin@10.3.0` pulls vulnerable Google/Firebase transitive packages.
2. Mobile Expo SDK 51 packages pull vulnerable Expo CLI/config/tooling dependencies.
3. Mobile `react-native@0.74.3` pulls vulnerable React Native CLI XML tooling.
4. Mobile `@sentry/react-native@5.24.3` pulls vulnerable Sentry JS SDK packages.
5. Dev/test `jest-expo@51.0.4` pulls vulnerable `jsdom`/proxy dependencies.

## Main Causes

### 1. Backend Firebase Admin Chain

Direct dependency:

- `apps/backend/package.json`: `firebase-admin@^10.3.0`
- Installed/resolved: `firebase-admin@10.3.0`

Vulnerable chain:

```text
firebase-admin@10.3.0
├─ @google-cloud/firestore@4.15.1
│  ├─ google-gax@2.30.5
│  │  ├─ @grpc/grpc-js@1.6.12
│  │  ├─ @grpc/proto-loader@0.6.13
│  │  ├─ proto3-json-serializer@0.1.9
│  │  └─ protobufjs@6.11.3
│  └─ protobufjs@6.11.6
└─ jsonwebtoken@8.5.1
```

Issues reported:

- `protobufjs`: critical prototype pollution and arbitrary code execution advisories.
- `google-gax`: critical because it depends on vulnerable `protobufjs`, `@grpc/proto-loader`, and `proto3-json-serializer`.
- `@google-cloud/firestore`: reported critical due to vulnerable transitive chain and a Firestore key logging advisory.
- `jsonwebtoken`: high/moderate JWT validation/key handling advisories.
- `@grpc/grpc-js`: moderate memory allocation advisory.

Audit fix path:

- npm proposes `firebase-admin@13.9.0`.
- This is a major-version upgrade from v10 to v13 and must be tested against backend Firebase initialization, auth, Firestore/storage usage, and any emulator/test setup.

Impact:

- This is the highest-priority backend issue because it is in production dependencies.
- The backend currently uses Supabase heavily, but `firebase-admin` is still a production dependency and should not remain on v10 if it is used for notifications, auth, or service credentials.

### 2. Mobile Expo SDK 51 Chain

Direct dependencies:

- `expo@~51.0.14`
- `expo-constants@~16.0.2`
- `expo-linking@~6.3.1`
- `expo-notifications@~0.28.12`
- `expo-router@~3.5.18`
- `jest-expo@~51.0.3`

Installed/resolved key versions:

- `expo@51.0.39`
- `expo-constants@16.0.2`
- `expo-linking@6.3.1`
- `expo-notifications@0.28.19`
- `expo-router@3.5.24`
- `jest-expo@51.0.4`

Vulnerable chain examples:

```text
expo@51.0.39
├─ @expo/cli@0.18.31
│  ├─ @expo/plist@0.1.3
│  │  └─ @xmldom/xmldom@0.7.13
│  ├─ cacache@18.0.4
│  │  └─ tar@6.2.1
│  ├─ send
│  └─ @expo/metro-config
│     └─ postcss
├─ @expo/config
├─ @expo/config-plugins
└─ expo-asset
   └─ expo-constants
```

Issues reported:

- `@xmldom/xmldom`: high XML injection/DoS advisories.
- `tar`: high path traversal/file overwrite advisories.
- `postcss`: moderate CSS stringify XSS advisory.
- `send`: low template injection/XSS advisory.
- Multiple Expo packages are reported because they depend on the vulnerable underlying packages.

Audit fix path:

- npm suggests major/breaking package movements, including Expo-related upgrades or downgrades that should not be applied blindly.
- For Expo projects, the safer route is to upgrade by Expo SDK compatibility, not by raw `npm audit fix --force`.
- Target path should be a planned Expo SDK upgrade, likely SDK 55 based on the versions npm is trying to pull into the tree.

Impact:

- Many Expo findings are local build/tooling oriented, but they are still production dependency findings because Expo packages are app runtime/build dependencies.
- The risky parts are XML serialization, archive extraction, and dev server/static serving toolchains. These are most exploitable when processing untrusted project files, archives, XML/plist content, or build inputs.

### 3. Mobile React Native CLI Chain

Direct dependency:

- `react-native@0.74.3`

Vulnerable chain:

```text
react-native@0.74.3
├─ @react-native-community/cli@13.6.9
├─ @react-native-community/cli-platform-android@13.6.9
│  └─ fast-xml-parser@4.5.6
└─ @react-native-community/cli-platform-ios@13.6.9
   └─ @react-native-community/cli-platform-apple@13.6.9
      └─ fast-xml-parser@4.5.6
```

Issues reported:

- `fast-xml-parser`: moderate XML comment/CDATA injection advisory.
- React Native CLI packages are reported because they depend on vulnerable XML tooling.

Audit fix path:

- npm proposes `react-native@0.85.3`, which is a major React Native jump from the Expo 51-compatible line.
- Do not apply this directly without coordinating an Expo SDK upgrade.

Impact:

- Primarily build/native tooling risk.
- Fix should be bundled with Expo SDK and React Native compatibility upgrades.

### 4. Mobile Sentry React Native Chain

Direct dependency:

- `@sentry/react-native@~5.24.3`

Vulnerable chain:

```text
@sentry/react-native@5.24.3
├─ @sentry/browser@7.117.0
└─ @sentry/react@7.117.0
   └─ @sentry/browser@7.117.0
```

Issue reported:

- `@sentry/browser <7.119.1`: moderate prototype pollution gadget advisory.

Audit fix path:

- npm proposes `@sentry/react-native@5.36.0`.
- This is not a semver-major upgrade, but it is outside the package's current `~5.24.3` range, so `package.json` must be updated intentionally.

Impact:

- This is a straightforward dependency update compared with the Expo/Firebase chains.
- It should be prioritized because it is a direct mobile dependency and has a non-major fix path.

### 5. Dev/Test Jest Expo Chain

Direct dev dependency:

- `jest-expo@~51.0.3`

Vulnerable chain:

```text
jest-expo@51.0.4
└─ jest-environment-jsdom@29.7.0
   └─ jsdom@20.0.3
      └─ http-proxy-agent@5.0.0
         └─ @tootallnate/once@2.0.1
```

Issues reported:

- `@tootallnate/once`: low control-flow advisory.
- The same `jest-expo` line also participates in Expo config advisories.

Audit fix path:

- npm proposes `jest-expo@55.0.17`, a breaking upgrade aligned with Expo SDK 55.

Impact:

- Mostly test/dev tooling.
- Best fixed together with the Expo SDK upgrade.

## Workspace Drift Observed

`npm ls --depth=0` reports several extraneous Sentry packages at the root, including:

- `@sentry/react-native@5.36.0`
- `@sentry/browser@7.119.1`
- `@sentry/react@7.119.1`
- related `@sentry/*` packages

This suggests `node_modules` and/or `package-lock.json` has been partially modified by a prior install/update attempt. The declared mobile dependency is still `@sentry/react-native@~5.24.3`, so the installed tree is not cleanly aligned with `package.json`.

Before applying fixes, do a clean install from the intended lockfile state and rerun audit:

```bash
npm ci
npm audit
```

If `npm ci` is not currently possible because of local lockfile edits, first decide whether the current `package-lock.json` changes are intended.

## Recommended Fix Plan

### Priority 1: Backend critical chain

Upgrade `firebase-admin` from v10 to the current supported major compatible with the backend, then test backend startup, notification/auth flows, and backend tests.

Expected package target from audit:

```text
firebase-admin@13.9.0
```

Do not use `npm audit fix --force` as the first step; update deliberately and verify.

### Priority 2: Mobile Sentry

Update:

```text
@sentry/react-native: ~5.24.3 -> ^5.36.0
```

Then run mobile typecheck/tests. This should clear the Sentry prototype pollution chain without requiring a full Expo upgrade.

### Priority 3: Expo / React Native SDK upgrade

Plan an Expo SDK upgrade instead of isolated package bumps. The vulnerable packages are tied together:

- `expo`
- `expo-router`
- `expo-constants`
- `expo-linking`
- `expo-notifications`
- `jest-expo`
- `react-native`
- React Native CLI transitive packages

Use Expo's supported upgrade path so native module versions remain compatible.

### Priority 4: Re-audit after clean install

After package updates:

```bash
npm install
npm audit
npm run typecheck
npm run test
```

For mobile SDK upgrades, also run the Expo doctor/check workflow before building Android.

## Commands Run

```bash
npm audit --json
npm audit --omit=dev --json
npm audit --audit-level=high
npm ls firebase-admin @google-cloud/firestore google-gax protobufjs jsonwebtoken --all
npm ls expo expo-constants expo-linking expo-notifications expo-router @expo/cli @xmldom/xmldom tar postcss --all
npm ls react-native @react-native-community/cli fast-xml-parser --all
npm ls @sentry/react-native @sentry/browser @sentry/react --all
npm ls jest-expo jsdom http-proxy-agent @tootallnate/once --all
npm ls --depth=0
```
