# 📊 Dataview Queries

Dataview allows us to turn our documentation into a dynamic database.

## 🏁 Phase Tracker
View the status of all project phases defined in the root `.md` files.

```dataview
TABLE status as "Status", version as "Version"
FROM "docs"
WHERE type = "phase"
SORT phase ASC
```

## 🛠️ Endpoint Index
List all implemented API endpoints with their auth requirements.

```dataview
LIST
FROM "docs/endpoints"
WHERE auth = "Required"
GROUP BY phase
```

## 📝 Pending Tasks
Aggregate all `TODO` items across the `docs` folder.

```dataview
TASK
FROM ""
WHERE !completed
```

## 📅 Recent Changes
See what files were modified in the last 7 days.

```dataview
LIST
WHERE file.mday >= date(today) - dur(7 days)
SORT file.mday DESC
```
