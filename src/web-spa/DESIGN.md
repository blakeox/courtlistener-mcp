# Web SPA design system (Tailwind CSS v4)

The portal UI (`src/web-spa/`) uses **Tailwind CSS v4** with a **token bridge**:
raw values live in `tokens.css`, Tailwind utilities are generated via `@theme`
in `theme.css`, and semantic component styles live in layered CSS files.

## Stack

| Piece                               | Role                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `tailwindcss` + `@tailwindcss/vite` | Utility engine and Vite integration                                                          |
| `src/styles.css`                    | Entry: `@import "tailwindcss"`, `@source`, token + component imports                         |
| `styles/tokens.css`                 | `:root` / `[data-theme='dark']` custom properties (source of truth)                          |
| `styles/theme.css`                  | `@theme inline` maps tokens → `text-ink`, `bg-bg`, `dark:*`, etc.                            |
| `styles/primitives.css`             | Global resets, body background, focus rings, keyframes (component recipes in `*-classes.ts`) |
| `styles/workspace.css`              | Reserved for shell-scoped rules that cannot be utilities (currently empty)                   |
| `styles/landing.css`                | Reserved for marketing rules not yet utilities (currently empty)                             |
| `lib/cn.ts`                         | `cn()` helper (`tailwind-merge`) for composing class names                                   |
| `lib/ui-classes.ts`                 | Tailwind class recipes for `components/ui.tsx` primitives                                    |
| `lib/landing-classes.ts`            | Tailwind recipes for the marketing landing page                                              |
| `lib/playground-classes.ts`         | Tailwind recipes for Playground chat, compare, and transcript UI                             |
| `lib/workspace-classes.ts`          | Tailwind recipes for workspace page layout (`stack`, `two-col`, tables, …)                   |
| `lib/shell-classes.ts`              | Tailwind recipes for `Shell.tsx` (sidebar, topbar, account menu)                             |
| `lib/toast-classes.ts`              | Tailwind recipes for toast notifications                                                     |
| `components/landing-layout.tsx`     | Thin layout wrappers for `LandingPage.tsx`                                                   |

## Stylesheet load order

```text
styles.css
  → tailwindcss (utilities)
  → tokens.css
  → theme.css (@theme bridge + dark variant)
  → primitives.css
  → workspace.css
  → landing.css
```

## When to use what

| Need                      | Use                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| New layout/spacing in TSX | Tailwind utilities (`flex`, `gap-3`, `p-4`, `md:grid-cols-2`)                                           |
| New colors in TSX         | Theme utilities (`text-ink`, `bg-card`, `text-accent`, `dark:bg-bg-soft`)                               |
| Reusable component look   | Export a recipe from `lib/*-classes.ts` and compose with `cn()` in TSX                                  |
| New color value           | Add to `tokens.css` (+ dark override), then wire in `theme.css` `@theme inline` if utilities are needed |

**Rule of thumb:** primary actions → shell blue (`btn primary` or `bg` utilities
from accent/shell tokens). Success → `brand` / `ok` tokens (green).

## Dark mode

- Set `data-theme="dark"` on `<html>` (theme toggle in shell).
- Token overrides: `tokens.css` `[data-theme='dark']`.
- Utilities: `dark:` variant via `@custom-variant dark` in `theme.css` (matches
  `data-theme="dark"`).

## Typography

- **Fonts:** Inter (`font-sans`), JetBrains Mono (`font-mono`) — loaded in
  `index.html`, registered in `@theme`.
- **Component scale:** `--text-*` tokens in CSS; map new sizes in `theme.css`
  when you need matching utilities.

## Breakpoints

Custom breakpoints in `@theme`:

| Token    | px   | Typical use                                            |
| -------- | ---- | ------------------------------------------------------ |
| `sm`     | 480  | Small phones                                           |
| `md`     | 768  | Tablets                                                |
| `topbar` | 640  | Stacked topbar actions / account menu                  |
| `shell`  | 1080 | Sidebar drawer / landing nav                           |
| `modal`  | 480  | Narrow modal / full-width buttons (`--size-modal-max`) |

Example: `shell:grid-cols-[var(--layout-shell-grid)]` or keep media queries in
component CSS for complex grids.

**Note:** `@media` rules cannot use `var()` — use literal `480px` (or
`--breakpoint-modal`) in CSS files; the design-system check enforces this.

## Local development

```bash
npm run dev:spa
```

Opens Vite at `http://127.0.0.1:5173`. Worker routes (`/api`, `/auth`, `/oauth`,
`/mcp`, `/health`, `/.well-known`, …) proxy to `http://localhost:3001` when
`wrangler dev` (or the local HTTP transport) is running — required for hosted
sign-in and MCP OAuth from the dev SPA.

## Checks

```bash
pnpm run ci:check:design-system   # Tailwind wired, class-recipe modules, token-only CSS, production CSS budget
npm run test:spa                 # Vitest (design-system wiring; skips production build — see below)
npm run test:spa:design          # Playwright layout/token smoke (landing, workspace, usage, observability, …)
```

The design-system script also verifies class-recipe modules export hook classes
(`landing-page`, `stack`, `chat-stream`, …), require `cn()` composition, block
raw layout class strings in workspace page TSX, and fail if the production CSS
bundle exceeds **92 kB** (builds the SPA as part of the check).

`ci:local-gate` and CI Full Validation run the full check (including the
production build + CSS budget). Vitest sets
`DESIGN_SYSTEM_SKIP_PRODUCTION_BUILD=1` so `test:spa` does not run a second Vite
production build.

## Composing classes with `cn()` and `tailwind-merge`

Class recipes live in `lib/*-classes.ts` and are composed with `cn()` from
`lib/cn.ts` (`tailwind-merge`).

**Hook classes last:** stable selectors used by tests and Playwright smoke
(`text-link`, `ui-card`, `stack`, `chat-stream`, …) must appear **after**
conflicting Tailwind utilities in `cn()`, or `tailwind-merge` may drop them.
Example from `ui-classes.ts`:

```ts
export const textLinkClass = cn(
  'font-semibold text-accent underline …',
  'text-link', // hook class — keep last
);
```

## Adding a new style

1. Run `pnpm run ci:check:design-system`.
2. Add tokens in `tokens.css` (and dark block if needed).
3. If utilities are needed, add `--color-*` / `--spacing-*` aliases in
   `theme.css` `@theme inline`.
4. Prefer Tailwind utilities in TSX for one-off layout; add semantic classes for
   repeated patterns.
5. For `components/ui.tsx` primitives, add recipes in `lib/ui-classes.ts` and
   compose with `cn()`.
6. For `LandingPage.tsx`, add layout recipes in `lib/landing-classes.ts` and
   wire through `landing-layout.tsx`.
7. For `PlaygroundPage.tsx` chat/transcript UI, add recipes in
   `lib/playground-classes.ts`.
8. For workspace pages (`AccountPage`, `UsagePage`, …), add layout recipes in
   `lib/workspace-classes.ts`.
9. Run `npm run test:spa` and `npm run test:spa:design`.

## Hook classes (stable selectors)

Recipes in `*-classes.ts` attach **hook class names** alongside Tailwind
utilities. These are not defined in component CSS anymore; they exist for tests,
Playwright smoke, and debugging.

| Hook class               | Module                  | Role                         |
| ------------------------ | ----------------------- | ---------------------------- |
| `btn` / `primary`        | `ui-classes.ts`         | Primary shell action         |
| `nav-card-link`          | `shell-classes.ts`      | Sidebar navigation item      |
| `page-hero`              | `ui-classes.ts`         | In-app hero panel            |
| `ui-card`                | `ui-classes.ts`         | Content card shell           |
| `eyebrow-label`          | `ui-classes.ts`         | Section label above headings |
| `text-link`              | `ui-classes.ts`         | Accent inline link           |
| `landing-page`           | `landing-classes.ts`    | Marketing root wrapper       |
| `stack` / `two-col`      | `workspace-classes.ts`  | Workspace page layout        |
| `chat-stream`            | `playground-classes.ts` | Playground chat column       |
| `table` / `table-scroll` | `workspace-classes.ts`  | Usage route table            |

`primitives.css` and `landing.css` / `workspace.css` hold only global resets and
reserved placeholders — not component layout. Add new UI via the matching
`*-classes.ts` module and compose with `cn()`.
