# Internship Coordination

Replaces the internship-semester Excel workbook with a web app: students,
assessors, per-semester capacity, and the one thing the spreadsheet could not
do — **enforce each assessor's individual maximum as 1st assessor**.

Everything is managed from the GUI. No SQL, no terminal for day-to-day use.

## What it does

- **Students** — number, name, email, semester topic, internship status,
  company, assignment description, remarks, and both assessors. Search, filter
  by status/topic/assignment, edit status and remarks inline.
- **Assessors** — each belongs to one team (fixed). **Availability and the
  1st-assessor maximum are set per semester**: an assessor takes students in a
  semester only when you give them a maximum there. Last semester's setup is
  never disturbed.
- **Topics** — a catalog of semester topics, each owned by a team. The student's
  topic decides which assessors are suggested first.
- **The capacity rule** — picking a 1st assessor who is at their maximum is
  impossible: they appear in the picker but are disabled, and the server
  re-checks inside a database transaction, so two open tabs cannot both claim
  the last slot.
- **Team matching is a preference, not a rule** — assessors from the team that
  owns the student's topic sort to the top; picking someone else is allowed and
  just shows a warning.
- **Planning board** — remaining capacity per assessor, plus the "will this
  semester even fit" number, with unassigned students assignable in place.
- **Dashboard** — per-semester totals and two attention lists: students with
  assessors but no approved internship, and approved students still missing one.
- **Excel** — guided import (map columns, preview every row with its errors
  before anything is written) and one-click export.
- **Semesters** — switch between them at the top of the page; past semesters
  stay browsable and untouched.

## Stack

Next.js 16 (App Router, Server Actions) · PostgreSQL · Drizzle ORM ·
Better Auth · shadcn/ui + Tailwind 4 · TanStack Table · Zod · SheetJS.

## Local development

Requirements: Node 22+, Docker (for Postgres).

```bash
cp .env.example .env          # then edit the values, see below
docker compose up -d          # Postgres on :5432, Adminer on :8080
npm install
npm run db:migrate            # create the schema
npm run db:seed               # the 4 teams + 11 topics, plus demo data
npm run dev                   # http://localhost:3000
```

Sign in with the `COORDINATOR_EMAIL` / `COORDINATOR_PASSWORD` from `.env` — the
account is created automatically the first time you open `/login`. There is no
public sign-up.

### Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Long random string — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The app's public URL (`http://localhost:3000` in dev) |
| `COORDINATOR_EMAIL` | Login for the first (and only) account |
| `COORDINATOR_PASSWORD` | Its password — change it in Settings after first login |
| `COORDINATOR_NAME` | Optional display name |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed teams, topics and demo data |
| `npm run db:studio` | Drizzle Studio — a GUI over the raw tables |
| `npm test` | Run the test suite (needs the database running) |
| `npm run typecheck` | TypeScript, no emit |

### Changing the schema

Edit `db/schema.ts`, then `npm run db:generate` and commit the generated SQL in
`db/migrations/`. Deployments apply pending migrations automatically at startup.

## Deploying to Coolify

Two resources in one Coolify project: a **PostgreSQL** service and the **app**
built from this repo's `Dockerfile`.

### 1. Create the Postgres service

1. In your Coolify project: **+ New** → **Database** → **PostgreSQL** (17).
2. Give it a name, deploy it.
3. Copy the **internal** connection URL Coolify shows (it looks like
   `postgres://postgres:<password>@<service-name>:5432/postgres`). The app talks
   to Postgres over the internal network — do **not** expose it publicly.
4. Open **Backups** on the service and enable a scheduled backup (daily is
   fine), to local disk or S3.

### 2. Create the app

1. **+ New** → **Application** → **Public/Private Repository**, point it at this
   repo and branch.
2. Set **Build Pack** to **Dockerfile**. Coolify picks up `/Dockerfile`; no
   build command is needed.
3. Set the **Port** to `3000`.

### 3. Environment variables

On the application, under **Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The internal URL from step 1.3 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — keep it secret; changing it later signs everyone out |
| `BETTER_AUTH_URL` | `https://your-domain` (must match the real domain exactly) |
| `COORDINATOR_EMAIL` | Your login |
| `COORDINATOR_PASSWORD` | A strong initial password |

### 4. Domain and TLS

Set the **Domain** on the application to `https://your-domain`. Coolify requests
the Let's Encrypt certificate automatically. Make sure `BETTER_AUTH_URL` matches
that domain exactly, including `https://`.

### 5. Healthcheck

Under **Healthchecks**, enable it and set the path to `/api/health`. That
endpoint runs a real query, so a deploy fails visibly if the database is
unreachable instead of serving a broken app.

### 6. Deploy

Press **Deploy**. In the deployment log you should see:

```
Applying database migrations…
Migrations applied.
Starting server…
▲ Next.js 16.x
```

### 7. First login and setup

1. Open `https://your-domain/login`. The coordinator account is created from the
   environment variables on this first visit.
2. Sign in.
3. **Settings → Account** — change the password. You can then remove
   `COORDINATOR_PASSWORD` from Coolify if you prefer; it is only used when no
   user exists yet.
4. **Settings → Semesters** — create the current semester and set it active.
5. **Settings → Teams / Topics** — a fresh production database starts empty.
   Add your teams and the topic catalog here (each topic gets its owning team),
   or let the import create them.
6. **Assessors** — add assessors, assign each to a team, and set their maximum
   for this semester. That maximum is what makes them assignable.
7. **Import / Export** — bring in the workbook.

### Afterwards

- **Deploying a change**: `git push`. Coolify rebuilds; pending migrations run
  before the new version serves traffic.
- **Rolling back**: use Coolify's previous-deployment button. If the bad deploy
  included a migration, restore the database backup too — migrations are not
  automatically reversed.
- **Inspecting data**: everything is in the GUI. For the rare exception, run
  `npm run db:studio` locally against a copy.

## Testing

```bash
docker compose up -d     # tests need a real Postgres
npm test
```

49 tests cover the parts most expensive to get wrong: the capacity rule
(including two transactions racing for the last slot), the database
constraints, the Excel parser, an export → import round-trip, and the
transactional import.
