# package.json (root)

## 🎯 Purpose (Why?)
The manifest for the entire monorepo. It manages the high-level workspace and cross-cutting developer tools.

## ⚙️ Mechanism (How?)
- **Workspaces**: Defines `apps/*` and `packages/*` as npm workspaces.
- **Turborepo**: Configures `turbo` for task orchestration.
- **Scripts**: Provides unified commands like `npm run build` or `npm run test` that run across all packages in parallel.

## 📦 Dependencies (What is it using?)
- `turbo`
- `eslint`
- `prettier`

## 🔗 Dependents (Where is it used?)
- The starting point for any developer workflow.

## 🗺️ Connections
- **Architecture**: Monorepo orchestration.
- **Milestone**: Current version 1.6.0.
