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
per-IP login throttles on the `/api` credential endpoints into one shared
bucket for the whole restaurant and fill the audit log with Cloudflare
addresses. Re-run it if Cloudflare adds ranges.

## Redeploying

**Push to `main`.** That's it. `.github/workflows/deploy.yml` fires a
self-hosted runner on the VPS which runs `deploy/deploy.sh`: pull, build the
SPA, `composer install`, migrate, re-cache, fix permissions, reload PHP-FPM,
then health-check `https://pos.system11.app/up` and fail loudly if it's down.

Manual run (same script, no push needed):

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

### How the trigger works

`pos-deploy.timer` runs `watch-deploy.sh` every 2 minutes. It compares local
`HEAD` against `origin/main` and calls `deploy.sh` only when they differ, so a
quiet repo costs one `git fetch` per tick and logs nothing. Expect a deploy to
land within ~2 minutes of a push.

| Thing | Where |
|---|---|
| Timer / service | `pos-deploy.timer`, `pos-deploy.service` |
| Watcher | `deploy/watch-deploy.sh` |
| Lock | `/run/lock/pos-deploy.lock` (flock — a tick can't race a manual deploy) |
| Deploy key | `~/.ssh/id_ed25519_pos_elevenone`, alias `github-pos-elevenone` (unused while the repo is public) |

```sh
journalctl -u pos-deploy -f                      # watch deploys live
systemctl list-timers pos-deploy.timer           # when does it next check
sudo systemctl start pos-deploy.service          # force a check right now
sudo systemctl disable --now pos-deploy.timer    # pause auto-deploy
```

`Type=oneshot` means the service reads as `activating` for the ~60 s a deploy
takes, and `list-timers` shows `n/a` for the next run until it finishes — that
is normal, not a stuck timer.

**Why polling rather than GitHub Actions.** A GitHub-hosted runner cannot reach
this box (the provider's Anti-DDoS blocks inbound SSH from GitHub's runner IP
ranges — see the note in `order-food`'s workflow). A self-hosted runner would
work, but this repo is **public**, and a self-hosted runner on a public repo
lets fork pull requests execute code on a box that also serves six other
production sites. Polling needs no inbound access, no secrets and no runner.

> If you later switch to a GitHub Actions trigger, make the repo **private**
> first, and note that pushing any workflow file needs a token with the
> **Workflows: Read and write** permission.

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
