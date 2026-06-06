# SimonsVoss System 3060 Incident Capture

A mobile-first structured diagnostic memory system for SimonsVoss System 3060 access control environments. Captures support incidents in a medically-inspired triage format — platform, hardware layers, symptoms, mechanism, root cause, contra-indicators, and intervention — stored as Markdown files with YAML frontmatter, committed and pushed to GitHub after every submission.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/incident-capture run dev` — run the frontend (port 22138)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `GITHUB_TOKEN` (PAT with `repo` scope), `GITHUB_REPO_URL` (e.g. `https://github.com/user/repo.git`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, react-hook-form, Zod, TanStack Query
- API: Express 5 (artifact: `artifacts/api-server`)
- No database — incidents stored as Markdown files under `cases/{platform}/{yyyy-mm-dd}-{id}.md`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `artifacts/api-server/src/routes/incidents.ts` — POST /incident, GET /incident/:id, GET /search
- `artifacts/incident-capture/src/pages/IncidentCapture.tsx` — main form page
- `artifacts/incident-capture/src/lib/constants.ts` — all domain constants (platforms, hardware, layers)
- `cases/` — incident Markdown files, gitignored locally but committed + pushed via API

## Architecture decisions

- **No database** — incidents are plain Markdown files with YAML frontmatter. Enables git-native history, human readability, and future RAG/embedding workflows without schema migrations.
- **Git commit + push per incident** — every `POST /incident` runs `git add`, `git commit`, `git push` to the configured GitHub remote. Push failures are non-fatal and surfaced as `pushed: false` in the response.
- **OpenAPI-first** — all API shapes defined in `lib/api-spec/openapi.yaml`; frontend uses generated React Query hooks from `@workspace/api-client-react`.
- **Domain constants in frontend** — all platform/hardware/layer/tool lists live in `src/lib/constants.ts`, not hardcoded in components.
- **Confidence stored as 0–1 float** — slider is 0–100 in the UI, divided by 100 before submission.

## Product

- 8-section structured incident form (Platform → System Layers → Hardware → Symptoms → Mechanism → Root Cause → Contra-Indicators → Intervention)
- Dynamic tag-entry lists for symptoms and contra-indicators
- Confidence slider (0–100%)
- Submit → validates schema → writes Markdown file → git commit → push to GitHub
- Success/warning banner shows incident ID and GitHub push status
- Collapsible search panel below the form for full-text search across all stored incidents

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `GITHUB_TOKEN` must have `repo` scope (classic PAT) or `contents: write` (fine-grained PAT)
- `GITHUB_REPO_URL` must be the HTTPS URL (not SSH), e.g. `https://github.com/user/repo.git`
- Git push uses a remote named `incidents` (separate from `origin`) — avoids conflicting with the Replit project's own git remote
- The `cases/` directory is created at runtime; ensure the git repo has at least one commit before the first push

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
