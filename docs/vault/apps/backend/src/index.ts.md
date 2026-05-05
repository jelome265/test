# index.ts

## 🎯 Purpose (Why?)
The physical entry point of the server process. It bootstraps the environment and opens the network port.

## ⚙️ Mechanism (How?)
1. Loads `.env` file.
2. Calls `createApp()` from [[app.ts.md]].
3. Starts the HTTP listener (default port 3000).
4. Implements **Graceful Shutdown**: Listens for SIGTERM/SIGINT and closes database connections before exiting.

## 📦 Dependencies (What is it using?)
- [[app.ts.md]]
- `http` node module.
- `logger` from [[logger.ts.md]]

## 🔗 Dependents (Where is it used?)
- Primary process for production and development deployments.

## 🗺️ Connections
- **Lifecycle**: Process bootstrapping and cleanup.
