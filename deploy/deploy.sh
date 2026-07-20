#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  POS ElevenOne — deploy script (runs ON the VPS)
#
#  Invoked automatically by the self-hosted GitHub Actions runner on every
#  push to main, or manually:  bash /var/www/pos-elevenone/deploy/deploy.sh
#
#  Pulls latest main, builds the React SPA, builds the Laravel API, migrates,
#  re-caches, reloads PHP-FPM. Idempotent — safe to run repeatedly. It does
#  NOT seed the database (seeding is a one-time bootstrap step; re-running it
#  would resurrect the default `password` logins).
#
#  Unlike order-food, the frontend IS built here — pos.system11.app serves the
#  SPA and the API from one origin, there is no Vercel deployment.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/var/www/pos-elevenone"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
PHP_FPM="php8.2-fpm"        # matches the installed PHP-FPM (run: ls /run/php/)
DEPLOY_USER="$(id -un)"     # user running the script (owns the files)
WEB_GROUP="www-data"        # group nginx / php-fpm run as

echo "==> Pulling latest code..."
# Fetch only main and fast-forward explicitly. A bare `git pull --ff-only` can
# abort with "Cannot fast-forward to multiple branches" when FETCH_HEAD lists
# more than one ref for-merge, which would silently fail the deploy (set -e).
git -C "$APP_DIR" fetch origin main
git -C "$APP_DIR" merge --ff-only origin/main

# ───────────────────────── Frontend (React SPA) ─────────────────────
cd "$FRONTEND_DIR"

# This box has ~2 GB RAM and runs six other production sites, so the build is
# deliberately fenced in:
#   - node_modules is reinstalled ONLY when package-lock.json actually changes
#     (npm ci wipes and refetches the tree — expensive and pointless otherwise)
#   - the V8 heap is capped so a runaway build cannot swap the box out
#   - nice(1) keeps the live sites ahead of the build for CPU
LOCK_HASH_FILE="node_modules/.deploy-lock-hash"
CURRENT_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
if [ ! -d node_modules ] || [ ! -f "$LOCK_HASH_FILE" ] \
   || [ "$(cat "$LOCK_HASH_FILE")" != "$CURRENT_LOCK_HASH" ]; then
  echo "==> package-lock.json changed — installing frontend dependencies..."
  npm ci --no-audit --no-fund
  echo "$CURRENT_LOCK_HASH" > "$LOCK_HASH_FILE"
else
  echo "==> Frontend dependencies unchanged — skipping npm ci."
fi

echo "==> Building frontend..."
# .env.production pins VITE_API_URL=https://pos.system11.app/api. There is no
# .env.local on the VPS (it is gitignored and dev-only), so nothing outranks it
# here — but verify the built bundle below rather than trusting that.
NODE_OPTIONS="--max-old-space-size=512" nice -n 10 npm run build

if ! grep -rq 'https://pos.system11.app/api' dist/assets/*.js; then
  echo "!! Built bundle does not contain the production API URL — aborting." >&2
  echo "!! Check frontend/.env.production and any stray .env.local." >&2
  exit 1
fi
echo "==> Frontend build verified."

# ───────────────────────── Backend (Laravel API) ────────────────────
cd "$BACKEND_DIR"

echo "==> Ensuring writable storage structure exists..."
# Fresh clones don't carry these empty dirs — create them so cache/logs work.
mkdir -p storage/framework/views storage/framework/cache/data \
         storage/framework/sessions storage/logs bootstrap/cache

echo "==> Installing PHP dependencies (production)..."
composer install --no-dev --optimize-autoloader --no-interaction

echo "==> Running database migrations..."
php artisan migrate --force

# Symlink public/storage -> storage/app/public so uploaded menu photos are
# served. Test first: `artisan storage:link` prints a red ERROR when the link
# already exists, which looks like a failed deploy in the Actions log.
echo "==> Linking public storage..."
if [ -L public/storage ]; then
  echo "    already linked."
else
  php artisan storage:link
fi

echo "==> Rebuilding caches..."
php artisan config:cache
php artisan route:cache
[ -d resources/views ] && php artisan view:cache || true
php artisan event:cache || true

echo "==> Fixing permissions..."
# Application code stays read-only to the web user; only storage/ and
# bootstrap/cache/ are writable, so a web-tier compromise cannot rewrite source.
# setgid on dirs makes new files inherit the www-data group.
sudo chown -R "$DEPLOY_USER:$WEB_GROUP" storage bootstrap/cache
sudo chmod -R ug+rwX storage bootstrap/cache
sudo find storage bootstrap/cache -type d -exec chmod g+s {} \;
# nginx (www-data) must be able to read the built SPA and Laravel's public dir.
sudo chown -R "$DEPLOY_USER:$WEB_GROUP" "$FRONTEND_DIR/dist"
sudo chmod -R a+rX "$FRONTEND_DIR/dist"

echo "==> Reloading PHP-FPM..."
# Required, not cosmetic: the pos pool sets opcache.validate_timestamps=0, so
# PHP never re-stats files and new code stays invisible until this reload.
sudo systemctl reload "$PHP_FPM"

echo "==> Verifying site is up..."
# Fail the deploy loudly if the app is not actually serving after all that.
HEALTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://pos.system11.app/up || echo 000)"
SPA="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://pos.system11.app/ || echo 000)"
echo "    /up -> $HEALTH    / -> $SPA"
if [ "$HEALTH" != "200" ] || [ "$SPA" != "200" ]; then
  echo "!! Post-deploy health check FAILED." >&2
  exit 1
fi

echo ""
echo "==> Deploy complete. ✅"
echo "    https://pos.system11.app"
