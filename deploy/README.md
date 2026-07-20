# VPS deployment — pos.system11.app

Production lives on the shared Eleven One VPS (`208.122.28.102`), alongside
111command, order-food, komplichna, catering and byd-preorder. Nothing here is
exclusive to this app: nginx, PHP 8.2-FPM, MySQL 8, Composer, Node 22 and
certbot were already installed for those sites.

```
/var/www/pos-elevenone/
├── frontend/   # Vite build output (dist/ contents), served straight by nginx
└── backend/    # Laravel 12, served from backend/public via the `pos` FPM pool
```

Both are served from **one origin**, so the browser makes same-origin calls —
no CORS preflight, no mixed content:

| Path | Served by |
|---|---|
| `/` | `frontend/` (SPA, with `/index.html` fallback for client routes) |
| `/api/...` | Laravel, `unix:/run/php/php8.2-fpm-pos.sock` |
| `/storage/...` | uploaded menu images (public-disk symlink), straight off disk |
| `/up` | Laravel health endpoint |

## Files in this folder

| File | Installs to |
|---|---|
| `nginx-pos.conf` | `/etc/nginx/sites-available/pos` |
| `php-fpm-pos.conf` | `/etc/php/8.2/fpm/pool.d/pos.conf` |

The vhost also includes `/etc/nginx/snippets/cloudflare-realip.conf`, generated
on the server from Cloudflare's published ranges:

```sh
{ curl -fsS https://www.cloudflare.com/ips-v4 | sed 's/^/set_real_ip_from /; s/$/;/'
  curl -fsS https://www.cloudflare.com/ips-v6 | sed 's/^/set_real_ip_from /; s/$/;/'
  echo "real_ip_header CF-Connecting-IP;"
} | sudo tee /etc/nginx/snippets/cloudflare-realip.conf
```

Without it every visitor looks like a Cloudflare edge IP, which would turn the
per-IP login throttle (`throttle:10,1` on `/api/login`) into one shared bucket
for the whole restaurant and fill the audit log with Cloudflare addresses.
Re-run it if Cloudflare adds ranges.

## Redeploying

**Frontend.** `.env.production` pins `VITE_API_URL=https://pos.system11.app/api`,
but `.env.local` outranks it in Vite's precedence chain — move it aside for the
build or you will ship a bundle pointing at `127.0.0.1`:

```sh
cd frontend
mv .env.local .env.local.bak && npm run build; mv .env.local.bak .env.local
grep -o 'https://pos.system11.app/api' dist/assets/*.js   # verify before shipping
tar -czf /tmp/pos-frontend.tar.gz -C dist .
scp /tmp/pos-frontend.tar.gz pos-vps:/tmp/
ssh pos-vps 'tar -xzf /tmp/pos-frontend.tar.gz -C /var/www/pos-elevenone/frontend && rm /tmp/pos-frontend.tar.gz'
```

**Backend.** Ship source only — `vendor/` is built on the server and `.env`
must never be overwritten:

```sh
tar -czf /tmp/pos-backend.tar.gz --exclude='./vendor' --exclude='./node_modules' \
  --exclude='./.env' --exclude='./.git' --exclude='./storage/logs/*' \
  --exclude='./public/storage' -C backend .
scp /tmp/pos-backend.tar.gz pos-vps:/tmp/
ssh pos-vps 'set -e
  cd /var/www/pos-elevenone/backend
  tar -xzf /tmp/pos-backend.tar.gz -C . && rm /tmp/pos-backend.tar.gz
  composer install --no-dev --optimize-autoloader --no-interaction
  php artisan migrate --force
  php artisan config:cache && php artisan route:cache && php artisan view:cache
  sudo chown -R www-data:www-data storage bootstrap/cache
  sudo systemctl reload php8.2-fpm'
```

The FPM reload is **required**, not optional: the pool sets
`opcache.validate_timestamps = 0`, so PHP never re-stats files and new code
stays invisible until the pool reloads.

## Notes

- **Permissions.** Code is `ubuntu:www-data` and read-only to the web user;
  only `storage/` and `bootstrap/cache/` are writable by `www-data`. A web-tier
  compromise therefore cannot rewrite application source.
- **TLS.** Let's Encrypt via `certbot --nginx -d pos.system11.app`, auto-renewed
  by `certbot.timer`. Cloudflare's SSL/TLS mode must be **Full (strict)** — that
  setting is zone-wide across `system11.app`.
- **Issuing a new cert while the orange cloud is on** can fail, because
  Cloudflare may redirect the HTTP-01 challenge to HTTPS before the origin has a
  certificate. Set the record to "DNS only" for the issuance, then switch back.
  Ordinary *renewals* are fine proxied — the origin already has a valid cert.
- **Printing does not work from the cloud.** Receipt/kitchen printing relies on
  `pos-print-kiosk.bat` and LAN printers on the shop PC; a browser on
  `pos.system11.app` cannot reach them. That needs a separate design (local
  print agent or a bridge on the shop network).
