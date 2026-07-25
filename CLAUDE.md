# CLAUDE.md — Internship Coordination App

Guidance for Claude (or any LLM) working in this repository.

## What this is

Replaces a coordinator's Excel workbook for running an internship semester: student
records, assessor assignment, and — the thing Excel can't enforce — **each assessor's
individual maximum number of students as 1st assessor**. Runs locally, deploys to a
Hetzner server via Coolify. Everything is driven from the GUI; no hand-written SQL, no
terminal for day-to-day coordinator use.

Local project dir: `~/git/work/intern-management`. GitHub: `pimwillems/internship-manager`.

## Current state (read this first)

- Fully implemented across 7 commits on branch `feat/intern-management-app`, built on
  top of an `Initial commit`.
- **Not yet merged.** The remote's `master` branch exists but contains only the initial
  empty commit — the application code has not been pushed or opened as a PR yet.
- Local dev was verified against a **native Postgres 16** process (the sandboxed build
  environment couldn't pull `postgres:17` from Docker Hub), not the `docker-compose.yml`
  path. Re-verify against real Docker before trusting this fully.
- Automated tests exist (`tests/*.test.ts`, Playwright config) but were not run to
  completion end-to-end in the sandboxed environment — rerun `npm test` and the manual
  capacity check below before relying on this.

## Stack (versions verified against npm, keep pinned unless there's a reason to bump)

Next.js 16 (App Router, Server Actions, TS) · React 19 · PostgreSQL 17 · Drizzle ORM
0.45 + drizzle-kit 0.31 · Better Auth 1.6 · shadcn/ui (hand-authored, see below) +
Tailwind CSS 4 · TanStack Table 8 · Zod 4 · SheetJS `xlsx@0.18.5` (pinned — frozen npm
build with a known prototype-pollution advisory; acceptable because import input is
always the coordinator's own trusted workbook, not untrusted user upload) · postgres.js
3.4 as the driver.

**shadcn/ui components in `components/ui/` are hand-written**, not pulled via
`npx shadcn add`, because the sandboxed build environment's proxy blocked
`ui.shadcn.com` (403). They follow the standard shadcn "new-york" style source exactly.
If `ui.shadcn.com` is reachable in your environment, prefer the CLI for any *new*
primitives so you get the latest upstream source — don't assume the registry is always
blocked.

## The one rule that matters: 1st-assessor capacity

This is the entire reason the app exists. Get it right or the app has no purpose.

- Each assessor has a **per-semester** maximum number of students they'll take as 1st
  assessor (`assessor_capacity.max_as_first`, one row per `(assessor_id, semester_id)`).
- Enforcement is **hard**, not advisory: a server action inside `db.transaction()`
  locks the `assessor_capacity` row with `.for('update')`, counts current 1st-assessor
  students for that assessor+semester, and rejects the assignment with a readable error
  if it would exceed the max. This makes the check correct even with two browser tabs
  racing for the last slot.
- **`lib/capacity.ts` is the single source of truth.** The assessor combobox (read
  path), the student-detail server action (write path), the planning board, and the
  Excel import validator all call into it. Never reimplement the check anywhere else —
  if you find yourself writing a second "is this assessor full?" check, stop and route
  it through `lib/capacity.ts` instead.
- Row **existence** in `assessor_capacity` for `(assessor, semester)` means "this
  assessor is available this semester." No row = not assignable that semester, even if
  the assessor exists globally. This is how "available assessors change every
  semester" is modeled — see next section.
- 2nd-assessor load has **no cap**, it's just displayed as a number. Don't add
  enforcement there unless explicitly asked — it was a deliberate scope decision.

## The three reference-data workflows (don't let these regress)

These came from an explicit clarification mid-build and are structural, not
incidental — they're why the schema looks the way it does:

1. **Assessors change every semester.** An assessor's **team is fixed** (set once on
   the assessor record), but **availability + max-as-first are per semester** (the
   `assessor_capacity` row). `/assessors` is where the coordinator turns people on/off
   for the current semester and sets their cap, without touching other semesters' data.
2. **Topics belong to teams.** Topics are a **reusable catalog**, not semester-scoped —
   `topics.team_id` is the "which team manages which topic" fact. Managed in
   `/settings`.
3. **Students pick a topic; the topic's team drives (not gates) assessor suggestions.**
   On the student form, picking a topic surfaces that topic's owning-team assessors at
   the top of the combobox as a **soft preference** — assigning an off-team assessor is
   allowed and just shows a warning, never blocked. Only the capacity rule blocks.

Real catalog seeded in `scripts/seed.ts` (edit in `/settings` afterward, not by
re-running the seed):

```
Team 1  →  AI Machine Learning & Data, Applied Generative AI, Business IT & Data Analysis
Team 2  →  FED, FSD
Team 3  →  Cyber Security Essentials, Network & Cloud Automation, Intelligent Devices
Team 4  →  Game Design, Open Learning, Mobile Apps Development
```

## Data model (`db/schema.ts`)

- `user` / `session` / `account` / `verification` are **owned by Better Auth**
  (Drizzle adapter). Do not hand-add columns beyond the `role` additionalField
  declared in `lib/auth.ts`. Don't build a parallel `users` table — this was a draft
  mistake that got corrected before implementation.
- App tables: `semesters`, `teams`, `topics`, `assessors`, `assessor_capacity`,
  `students`, `audit_log`. FKs to `assessors` are `ON DELETE RESTRICT` — a assessor
  holding students can't be deleted out from under them.
- `students` has a check constraint so the same person can't be both 1st and 2nd
  assessor — written as `first_assessor_id IS NULL OR second_assessor_id IS NULL OR
  first_assessor_id <> second_assessor_id`, **not** a naive `IS DISTINCT FROM`. Two
  NULLs (unassigned) must be allowed; `IS DISTINCT FROM` treats `NULL, NULL` as
  distinct-enough-to-pass in a way that looked right but tripped an early seed run —
  the working form is the one above. If you touch this constraint, keep that in mind.
- `internship_status` enum: `none | pending | approved | rejected`. Dashboard flags:
  assigned-but-not-approved, and approved-but-unassigned.

## Auth

- Single coordinator account, **env-seeded**: `scripts/seed-coordinator.ts` /
  `lib/auth.ts::ensureCoordinatorSeeded()` creates the account from
  `COORDINATOR_EMAIL` + `COORDINATOR_PASSWORD` via Better Auth's own `signUpEmail` API
  (so password hashing matches what Better Auth expects) if no user exists yet — it's
  idempotent and safe to call on every login-page load.
- No public sign-up route (`app/api/auth/[...all]/route.ts` blocks `/sign-up` on the
  catch-all POST handler).
- `middleware.ts` does an optimistic cookie check via `getSessionCookie` from
  `better-auth/cookies`; the protected `(app)/layout.tsx` re-verifies server-side via
  `lib/session.ts::getSession()`. Every mutating server action should also call
  `lib/guard.ts::requireCoordinator()` — server actions are a public entry point
  regardless of what the UI hides.

## Migrations — programmatic, not drizzle-kit CLI, at runtime

`scripts/migrate.mjs` uses `drizzle-orm/postgres-js/migrator`'s `migrate()`, not the
`drizzle-kit` CLI. This is intentional: `drizzle-orm` is already a production
dependency in the Next standalone build, so the deployed container never needs
`drizzle-kit` (a dev-only tool used for `db:generate`). `scripts/start.sh` runs the
migrator then starts `server.js` — a schema change ships with a plain `git push`, no
terminal access to the Coolify server needed. Keep this split; don't switch to running
`drizzle-kit migrate` in production.

## File layout

```
db/schema.ts, db/index.ts, db/migrations/     Drizzle schema + committed SQL
drizzle.config.ts
scripts/migrate.mjs, seed.ts, seed-coordinator.ts, start.sh

lib/capacity.ts        single source of truth for the capacity rule (see above)
lib/auth.ts, auth-client.ts, session.ts, guard.ts
lib/semester.ts         active-semester resolution from a cookie, shared by all pages
lib/audit.ts            wraps mutating actions, writes audit_log
lib/excel/import.ts, export.ts

app/(auth)/login/
app/(app)/layout.tsx    protected shell: sidebar + semester switcher
app/(app)/page.tsx      dashboard
app/(app)/students/, assessors/, planning/, settings/, import/
app/api/auth/[...all]/, app/api/health/, app/api/export/
middleware.ts

components/ui/          hand-authored shadcn primitives (see Stack note above)
components/assessor-combobox.tsx   capacity-aware picker, reused in student form + planning
components/semester-switcher.tsx, app-sidebar.tsx, page-header.tsx, user-menu.tsx

Dockerfile, docker-compose.yml, .env.example, README.md
```

## Commands

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL, BETTER_AUTH_SECRET,
                                 # COORDINATOR_EMAIL, COORDINATOR_PASSWORD
docker compose up -d            # postgres:17 + adminer, local dev only
npm run db:migrate               # scripts/migrate.mjs
npm run db:seed                  # scripts/seed.ts — real teams/topics + dev placeholders
npm run dev
npm test                         # vitest — lib/capacity.ts, excel import parser
npm run db:generate               # drizzle-kit generate, after schema.ts changes
npm run db:studio                 # drizzle-kit studio, dev-only raw-data GUI
```

## Deployment

Deploy artifacts (`Dockerfile`, `scripts/start.sh`, `/api/health`) are built and were
verified by a **local `docker build`**, not a live Coolify deploy — deploying to
Coolify was explicitly scoped as "instructions only, coordinator runs it themselves,"
not something an agent session should do. The full runbook is in `README.md`. If asked
to "deploy this," don't push straight to Coolify — check whether the user actually
wants that done by an agent, or just wants the runbook followed by them.

## Things not to reintroduce

- No parallel capacity-check implementation outside `lib/capacity.ts`.
- No hard cap on 2nd-assessor load — deliberately unenforced, count-only.
- No semester-scoping on `topics` — deliberately a flat reusable catalog.
- No hand-rolled `users`/password table — Better Auth owns that schema.
- Don't assume `ui.shadcn.com` is unreachable forever; it was a proxy-specific block
  in one sandboxed session, re-check before hand-writing new primitives elsewhere.
