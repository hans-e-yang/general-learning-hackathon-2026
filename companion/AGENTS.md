<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Lane B ownership (branch: `session`)

This app is the Lane B backend for Circlr (see GitHub issues `#10`, `#11`, `#12`,
`#14`-`#17`, `#20`, `#22`-`#23`, all labelled `lane:backend`).

**Owns**: the HTTP/SSE surface, the in-process session store, the AgentLoop, and the
LLM adapter seam. The Chrome extension (Lane A) and the Worksheet UI (Lane C) build
against stubs derived from `src/lib/contracts.ts`; do not change the wire shapes
without updating `openapi.yaml`, the matching `*.test.ts`, and a tracked migration
on those lanes.

**Freeze order** (do not skip): `#10` contracts -> `#11` skeleton -> `#12` adapter ->
`#14` extraction -> `#15` status ticks -> `#16` tutor turns -> `#17` export ->
`#20` resume. `#22`-`#23` ship last as the live-tutoring watcher.

**Spec discipline**: Live read `CONTEXT.md` (Session, Capture, Tutor, Worksheet,
Board, Practice Loop) before naming types, routes, or events. The Practice Loop is
deferred out of the first build - only `#19`'s stub is in scope.
