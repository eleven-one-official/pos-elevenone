#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  POS ElevenOne — pull-based auto-deploy watcher (runs ON the VPS)
#
#  Driven by pos-deploy.timer every 2 minutes. Compares local HEAD against
#  origin/main and runs deploy.sh only when they differ, so a quiet repo costs
#  one cheap `git fetch` per tick and nothing else.
#
#  Why polling instead of a GitHub Actions trigger:
#    - the VPS provider's Anti-DDoS blocks inbound SSH from GitHub's hosted
#      runner IP ranges, so a hosted runner cannot reach this box
#    - a self-hosted runner on a PUBLIC repo would let fork pull requests run
#      code on a box that also serves six other production sites
#  Polling needs no inbound access, no secrets, and no runner, and works the
#  same whether the repo is public or private.
#
#  Logs:    journalctl -u pos-deploy -f
#  Status:  systemctl list-timers pos-deploy.timer
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/var/www/pos-elevenone"
LOCK_FILE="/run/lock/pos-deploy.lock"

# Never let two deploys overlap — a manual `bash deploy.sh` and a timer tick
# landing together would race on composer/npm/artisan. Second one exits quietly.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "A deploy is already running — skipping this tick."
  exit 0
fi

cd "$APP_DIR"

git fetch --quiet origin main

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [ "$LOCAL" = "$REMOTE" ]; then
  # Nothing to do. Stay silent so the journal only ever shows real deploys.
  exit 0
fi

echo "════════════════════════════════════════════════════════════"
echo "New commit on main: ${LOCAL:0:7} -> ${REMOTE:0:7}"
git --no-pager log --oneline "${LOCAL}..${REMOTE}" | sed 's/^/    /'
echo "════════════════════════════════════════════════════════════"

bash "$APP_DIR/deploy/deploy.sh"
