---
name: verify
description: How to build, launch, and drive this POS app to verify frontend changes end-to-end.
---

# Verifying pos-elevenone frontend changes

## Launch

Vite dev server is normally already running, pinned to port **5180**
(`frontend/vite.config.ts`; kiosk printing depends on this port). Check with
`curl -s -o /dev/null -w "%{http_code}" http://localhost:5180/` — if not up,
`cd frontend && npm run dev`.

Backend Laravel runs on **:8001** (BYD owns :8000), but the admin side works
without it for UI verification (placeholder data + `?admin-preview`).

## Dev-only URL params (compiled out of prod builds)

- `?admin-preview` — boot straight into the admin side, no credentials.
- `?pos-tab=<menu>/<item>` — jump to an admin screen, e.g.
  `?pos-tab=Products/Products`, `?pos-tab=Products/Pricelists`,
  `?pos-tab=Reporting`.
- `?pp-menu=filters|groupby|favorites` + `?pp-sub` — pre-open a SearchMenus
  dropdown/submenu.
- `?product-new`, `?product-view=<index>`, `?product-tab=<name>`,
  `?action-open`, `?pos-login=<config>` — see PosProducts/PosProductDetail.

Example: `http://localhost:5180/?admin-preview&pos-tab=Products/Products`

## Drive it (headless browser)

No Playwright in the repo. Install `playwright-core` (no browser download) in
the session scratchpad and drive system Chrome:

```js
const { chromium } = require('playwright-core')
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})
```

Write the script as `.cjs`, screenshot to the scratchpad.

## Gotchas

- JSX collapses whitespace: a header rendered as `{label} <span>({n})</span>`
  yields `textContent` of `Goods(39)` — no space. Assert accordingly.
- Facet chips have `aria-label="Remove <label>"`; `getByRole('button',
  {name})` matches substrings, so use `exact: true` for menu items or scope
  to the open dropdown (`page.locator('div.absolute')`).
- The word "Favorites" appears both as a top-bar menu and a filter item.
- User's browser may show a stale Vite bundle — hard refresh (Ctrl+Shift+R)
  before trusting a "not working" report.
