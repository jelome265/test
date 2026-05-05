# ⚡ Automation & Templates

## 📝 Templater: New Feature Note
Use this template to quickly scaffold a new feature document.

```markdown
<%*
let title = await tp.system.prompt("Feature Name");
let phase = await tp.system.prompt("Project Phase");
-%>
---
type: feature
phase: <% phase %>
status: in-progress
created: <% tp.date.now("YYYY-MM-DD") %>
---
# 🚀 <% title %>

## 📋 Requirements
- [ ] 

## 🏗️ Architecture
- **Service:** 
- **Endpoint:** 

## 🧪 Testing Strategy
- [ ] Unit
- [ ] Integration
```

## 🏎️ QuickAdd: Bug Report
Setup a QuickAdd "Template" choice to capture bugs instantly.

1. **Template:** Points to a `Bug Template.md`.
2. **File Name:** `docs/bugs/BUG-{{DATE}}.md`
3. **Capture:** Enable "Append to MOC" to link it automatically in `docs/00_Obsidian_Setup.md`.

## 🛠️ Scripting: Version Bumper
You can use Templater to read `package.json` and display the current project version in your notes.

```javascript
<%*
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
tR += `Current Version: ${pkg.version}`;
-%>
```
