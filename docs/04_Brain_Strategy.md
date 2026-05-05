# 🧠 Second Brain Strategy

## 🕸️ The Graph View
In Obsidian, the **Graph View** is your architectural map. 

### Linking Strategy:
- **Vertical Links:** Link notes to their Phase MOC (e.g., `[[PHASE_6_PAYMENT_SYSTEM]]`).
- **Horizontal Links:** Link services to their dependencies (e.g., `payment.service.ts` should link to `paychangu.client.ts`).
- **Color Coding:** Use groups in Graph View:
	- `path:apps/backend` -> Red
	- `path:apps/mobile` -> Blue
	- `path:packages` -> Green

## 🎨 Obsidian Canvas
Use **Canvas** for high-level system design.

1. Create a new Canvas: `Architecture_Overview.canvas`.
2. Drag in `apps/backend/src/app.ts` as the central hub.
3. Use arrows to connect to `routes/` and then to `services/`.
4. Add **Sticky Notes** for infrastructure (Redis, Supabase, Firebase).

## 🗂️ Zettelkasten for Logic
Don't just document *what* the code does, document *why*.
- Use "Atomic Notes" for complex business rules (e.g., "Why we use single-use refresh tokens").
- Link these atomic notes to the relevant Phase documentation.
- Use the `[[Parent Note ^block-id]]` syntax to reference specific paragraphs in the source files.
