# VPS deployment — pos.system11.app

Production lives on the shared Eleven One VPS (`208.122.28.102`), alongside
111command, order-food, komplichna, catering and byd-preorder. Nothing here is
exclusive to this app: nginx, PHP 8.2-FPM, MySQL 8, Composer, Node 22 and
certbot were already installed for those sites.

`/var/www/pos-elevenone` is a **git clone of this repo on the `main` branch**,
pulled by the self-hosted runner on every push:

```
/var/www/pos-elevenone/
├── frontend/
│   └── dist/   # Vite build output — this is what nginx serves
└── backend/    # Laravel 12, served from backend/public via the `pos` FPM pool
```

Two files on the VPS are **not** in git and must survive any redeploy:
`backend/.env` and everything under `backend/storage/` (uploaded menu photos).

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

**Push to `main`.** That's it. `.github/workflows/deploy.yml` fires a
self-hosted runner on the VPS which runs `deploy/deploy.sh`: pull, build the
SPA, `composer install`, migrate, re-cache, fix permissions, reload PHP-FPM,
then health-check `https://pos.system11.app/up` and fail loudly if it's down.

Manual run (same script, no push needed) — or use **Actions → Deploy to VPS →
Run workflow**:

```sh
ssh pos-vps 'bash /var/www/pos-elevenone/deploy/deploy.sh'
```

The FPM reload inside the script is **required**, not optional: the pool sets
`opcache.validate_timestamps = 0`, so PHP never re-stats files and new code
stays invisible until the pool reloads.

### Why the build is fenced in

This box has ~2 GB RAM and six other production sites. `deploy.sh` therefore
reinstalls `node_modules` only when `package-lock.json` changes, caps the V8
heap at 512 MB, and runs the build under `nice`. It also greps the built bundle
for the production API URL and aborts if it's missing — cheap insurance against
shipping a bundle that points at `127.0.0.1`.

### Runner and access

| Thing | Where |
|---|---|
| Runner service | `actions.runner.eleven-one-official-pos-elevenone.pos-vps.service` |
| Runner labels | `self-hosted`, `pos-elevenone` |
| Runner dir | `/home/ubuntu/actions-runner-pos-elevenone` |
| Deploy key | `~/.ssh/id_ed25519_pos_elevenone`, alias `github-pos-elevenone` (read-only) |

Runner logs: `journalctl -u actions.runner.eleven-one-official-pos-elevenone.pos-vps -f`

> **The repo must stay private.** A self-hosted runner on a public repo lets
> anyone open a fork pull request that runs code on this box — which also
> serves five other production sites. The workflow triggers only on
> push-to-`main` (fork PRs cannot fire a push event); do not add
> `pull_request` to it.

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
