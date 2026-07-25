#!/bin/sh
# Container entrypoint: apply pending migrations, then serve.
# Deploying a schema change is therefore just a `git push` — no terminal on the
# server. If migrations fail we exit non-zero so the deploy fails loudly rather
# than starting an app against the wrong schema.
#
# The coordinator account is created by the app itself on the first visit to
# /login, from COORDINATOR_EMAIL / COORDINATOR_PASSWORD.
set -e

echo "Applying database migrations…"
node dist/migrate.mjs

echo "Starting server…"
exec node server.js
