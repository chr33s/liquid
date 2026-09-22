# LiquidJS

A simple, expressive, extensible Liquid template engine for JavaScript — Shopify, Jekyll and GitHub Pages compatible, for Node.js, browsers, and the CLI, with TypeScript support. TypeScript in `src/`, bundles in `dist/`. Documentation in `docs/`, rendered by TypeDoc to Markdown and published to the GitHub Wiki.

## Layout

| Path | Contents |
| --- | --- |
| `src/parser`, `src/render`, `src/tags`, `src/filters` | Template parse and render |
| `src/context`, `src/template`, `src/tokens` | Scope, templates, token stream |
| `src/util/async.ts` | `toPromise`, lifecycle-aware generator evaluation |
| `src/cli.ts` | CLI source; bundled to `dist/liquid.cli.mjs` (the published `bin`) |
| `bin/*.mts` | Repo tooling, run by Node type stripping (needs Node >= 22.18) |
| `test/` | Vitest |
| `docs/Home.md`, `docs/source/` | Authored Markdown; section roots list their pages in front matter `children:` |
| `typedoc.json` | The one documentation build: API plus authored documents |
| `.local/` | Scratch, repro, PoC (gitignored) |

## Commands

```
npm run build          # after src/ changes, before npm test
npm test
npm run lint           # oxlint + oxfmt --check
npm run format         # oxfmt
npm run typecheck      # tsc --noEmit over src + test
npm run check          # build + build:docs + test + test:spec + test:diff + lint + typecheck + perf:diff (manual)
npm run build:docs     # typedoc -> .local/wiki, then check:docs
npm run publish:docs   # push .local/wiki to the wiki repo (git credentials, or GITHUB_TOKEN in CI)
npm run perf:diff
npm run test:spec      # Shopify/liquid-spec conformance, four profiles (Ruby; gated in CI)
npm run test:diff      # seeded random templates vs the pinned Ruby engine (gated in CI)
```

PR CI (`pull_request`): build, lint, test, coverage, performance, docs, liquid-spec and differential tests. Docs render and validate on PRs; the wiki is published only from `main`.

PR titles: conventional format (`feat:`, `fix:`, `docs:`, …) — checked by CI. Releases on `main` use semantic-release from merged commits.

Backward-compatible API changes expected unless doing an intentional major break.

## Architecture

All core logic is one `function *` per feature. Use `yield` where you'd normally `await` a potentially async value.

- `toPromise(generator, options?)` — Promise completion using the shared generator driver.
- Nested evaluation, context lookups, providers, and emitters join the owning operation.
- Yield or await every direct emitter write. Web streams can suspend writes under backpressure.
- Execution and provider APIs have no Sync counterparts or execution-mode flags. Pure computation and in-memory parsing remain synchronous.

## Style

Make minimal changes only. Avoid sweeping edits. Always check after you made changes.

- Change only what the task requires. No drive-by refactors, test harnesses, or extra files unless asked.
- Match existing patterns in the file you edit.
- Repro, PoC, and scratch files go in `.local/` — not tracked `poc/` folders or one-off scripts under `docs/`.

### Comments

- Do not add narrative comments. Code should be clear from structure and naming; if it needs explanation, refactor instead.
- Comments follow existing repo usage only: non-obvious invariants, `@deprecated`, JSDoc on public API where TypeDoc needs it. Not for explaining changes to the author, migration history, or restating what the code already says.
- Comments document the code; they do not fix unclear code.

### Tests

- Assert observable behavior, not internal implementation details.
- Avoid duplicate coverage; keep test diffs minimal.
- **E2E** (`test/e2e/`): import from the package root (resolves to `dist/` via `package.json`). Do not import from `src/` — e2e must match what npm consumers get.
- **Integration/unit** (`test/integration/`, etc.): may import from `src/` against current TypeScript sources.

### Docs

- Plain Markdown only. No Hexo tags (`{% note %}`, `{% since %}`) and no Hexo `raw` wrappers around prose.
- Front matter `title:` is plain text (no backticks) and must not contain `.` or `/` — the wiki page name derives from it.
- A new page needs an entry in the owning root's `children:` (`docs/source/tutorials/index.md`, `docs/source/tags/overview.md`, `docs/source/filters/overview.md`).
- Link between documents with relative `.md` paths, and to the API with `{@link Name}` or `{@link Name.member}`. Cross-document fragments are dropped by the renderer, so name the section in the link text instead; same-page anchors use `<a href="#slug">`.
- `docs/llms.txt` — pointer list for web agents (llms.txt spec); its wiki URLs are checked by `check:docs`.
- After changes: `npm run build:docs`, then read the rendered pages under `.local/wiki`.

### README

- Research original sources before reordering contributors, logos, or lists.

## Verify

- Do not commit, push, amend, or open a PR unless asked.
- After changes: verify yourself via CLI or UI (tests, `npm run build:docs`, browser) before reporting done. Do not tell the user to check instead.
- Before push on sweeping changes: run `npm run check`.
- Confirm facts from `.github/workflows`, `package.json`, and library docs — not stale human docs or assumptions.
- When replacing or integrating a library: read its docs and understand what the previous setup did before changing behavior.

### Security fixes

- Reproduce on current `main` first. Smallest fix that addresses the reported issue.
- If Shopify/Ruby Liquid behaves the same, document unsafe usage in filter/docs instead of changing behavior.

## Docs

- Published: https://github.com/chr33s/liquid/wiki
- Repo agent instructions: this file (`AGENTS.md`)
