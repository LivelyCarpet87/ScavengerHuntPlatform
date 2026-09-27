# Deploying

Scavenger is one Node.js server with a SQLite database and a folder of
uploads. It needs no other services. This guide covers Docker, a plain Linux
server with systemd, HTTPS with Caddy or nginx, backups and upgrades.

Whatever you choose:

- **Serve it over HTTPS.** Phones only allow the camera, installing the app,
  push notifications and offline uploads on HTTPS pages.
- **Set `APP_URL`** to the public address (`https://hunt.example.com`), so QR
  posters, invite links and notification links point at the right place.
- **Set `VAPID_SUBJECT`** to a real contact (`mailto:you@example.com`).
- **Keep `DATA_DIR` on persistent storage and back it up.** It holds the
  database and every uploaded photo and video.

The full list of settings is in the [README](../README.md#configuration).

## Docker

The [Dockerfile](../Dockerfile) builds with Bun and runs the Next.js
standalone server on `node:22-slim` as the unprivileged `node` user. Data lives
in the `/data` volume. Database migrations run when the container starts.

### With Compose

```bash
APP_URL=https://hunt.example.com docker compose up -d --build
docker compose logs -f app
```

[docker-compose.yml](../docker-compose.yml) keeps data in the named volume
`scavenger-data`, restarts the app unless you stop it, and gives it 30 seconds
to finish in-flight requests and notifications when stopping. Put other
settings in a `.env` file next to it (Compose reads it) or under
`environment:`.

The app listens on port 3000 inside the container. Publish it only to the
reverse proxy (for example `127.0.0.1:3000:3000`) rather than to the world.

### Without Compose

```bash
docker build -t scavenger --build-arg APP_NAME="Scavenger" .
docker run -d --name scavenger --init --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v scavenger-data:/data \
  -e APP_URL=https://hunt.example.com \
  -e VAPID_SUBJECT=mailto:you@example.com \
  scavenger
```

`--init` gives the server a proper init process so it shuts down cleanly.

### Notes

- **App name.** `APP_NAME` is read at runtime for every page except the
  offline page, which is built once. Pass the same value as a build argument
  (`--build-arg APP_NAME=…`, or `build.args` in Compose) to keep them matching.
- **Bind mounts.** If you mount a host folder instead of a named volume, it must
  be writable by uid 1000: `sudo chown -R 1000:1000 ./data`.
- **Health check.** The image checks `GET /robots.txt` every 30 seconds;
  `docker ps` shows `healthy` once the server answers.
- **Memory.** Building needs about 3 GB of RAM (Next.js build plus type check).
  Running needs a few hundred MB; photo processing briefly adds more.

## A Linux server with systemd

You need Node.js 22 and Bun 1.4+ on the build machine; only Node.js on the
server.

### Build a self-contained server

`bun run build` produces `.next/standalone`: `server.js` plus the parts of
`node_modules` the server uses. Assemble a folder you can copy anywhere:

```bash
bun install --frozen-lockfile
bun run build

rm -rf dist && mkdir dist
cp -r .next/standalone/. dist/
cp -r .next/static dist/.next/static
cp -r public dist/public
cp -r drizzle dist/drizzle
# Native libraries loaded by computed paths, which output tracing can miss:
cp -r node_modules/@libsql node_modules/@img dist/node_modules/
```

The standalone server changes into its own folder when it starts, so a
relative `DATA_DIR` would end up inside `dist/` and disappear with the next
build. **Always give it an absolute `DATA_DIR`.**

Install it:

```bash
sudo useradd --system --home /var/lib/scavenger --shell /usr/sbin/nologin scavenger
sudo mkdir -p /opt/scavenger /var/lib/scavenger
sudo rsync -a --delete --exclude .next/cache dist/ /opt/scavenger/app/
sudo mkdir -p /opt/scavenger/app/.next/cache
sudo chown -R scavenger:scavenger /var/lib/scavenger /opt/scavenger/app/.next/cache
```

### The service

`/etc/systemd/system/scavenger.service`:

```ini
[Unit]
Description=Scavenger hunts
After=network-online.target
Wants=network-online.target

[Service]
User=scavenger
Group=scavenger
WorkingDirectory=/opt/scavenger/app
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/scavenger
Environment=APP_URL=https://hunt.example.com
Environment=VAPID_SUBJECT=mailto:you@example.com
# Optional overrides, one VAR=value per line:
EnvironmentFile=-/etc/scavenger.env
Restart=on-failure
# Lets in-flight requests and notifications finish on stop.
TimeoutStopSec=30

# Hardening: the app only writes to its data folder and Next's cache.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/scavenger -/opt/scavenger/app/.next/cache

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now scavenger
journalctl -u scavenger -f
```

The first visit to the site opens `/setup`, where you create the platform
admin account.

**Simpler alternative:** run straight from a checkout with the full
`node_modules`: `WorkingDirectory=/opt/scavenger/checkout` and
`ExecStart=/usr/bin/node node_modules/.bin/next start -H 127.0.0.1 -p 3000`.
It uses more disk space but skips the assembly step. It prints a warning
about the standalone output; it works regardless.

## HTTPS and the reverse proxy

Two parts of the app need the proxy's help:

- **Live updates** are Server-Sent Events at `/api/hunts/<id>/events`: long-lived
  responses that must not be buffered. The server sends a keep-alive event
  every 20 seconds. Every open tab holds one of these connections, so serve
  HTTP/2 to browsers (both configurations below do): over HTTP/1.1 a browser
  allows only six connections per host.
- **Uploads** arrive at `/api/hunts/<id>/submissions`, up to four files in one
  request. Allow at least 4 × `MAX_UPLOAD_MB` plus a few megabytes (about
  410 MB with the default 100 MB), and generous timeouts: phones on bad signal
  upload slowly. Server Actions accept up to 12 MB.

Pass the original host and scheme, and `X-Forwarded-For`: sign-in and join
rate limits key on its last entry, the address your proxy saw, so a proxy that
appends to it (nginx's `$proxy_add_x_forwarded_for`) works as well as one that
replaces it. When another proxy that forwards the client's address sits in
front (a CDN such as Cloudflare in front of Caddy, with Caddy's
`trusted_proxies` set to the CDN's ranges), set `TRUSTED_PROXY_HOPS=2`. Never
expose port 3000 itself: without a proxy the app can't tell a made-up header
from a real one.

### Caddy

Caddy gets and renews certificates automatically. `/etc/caddy/Caddyfile`:

```caddy
hunt.example.com {
	request_body {
		max_size 450MB
	}

	# Live updates: stream every event straight through, uncompressed.
	@events path_regexp events ^/api/hunts/[^/]+/events$
	handle @events {
		reverse_proxy 127.0.0.1:3000 {
			flush_interval -1
		}
	}

	handle {
		encode zstd gzip
		reverse_proxy 127.0.0.1:3000
	}
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name hunt.example.com;

    ssl_certificate     /etc/letsencrypt/live/hunt.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hunt.example.com/privkey.pem;

    client_max_body_size 450m;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $remote_addr;

    # Live updates (Server-Sent Events).
    location ~ ^/api/hunts/[^/]+/events$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    # Photo and video uploads: stream them to the app, give slow phones time.
    location ~ ^/api/hunts/[^/]+/submissions$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}

server {
    listen 80;
    server_name hunt.example.com;
    return 301 https://$host$request_uri;
}
```

## Backups

Everything is in `DATA_DIR` (`/data` in Docker): `app.db` (with `app.db-wal`
and `app.db-shm` next to it while the server runs) and `uploads/`.

**While the server runs**, take a consistent snapshot of the database, then
copy the uploads:

```bash
sqlite3 /var/lib/scavenger/app.db ".backup '/backups/app-$(date +%F).db'"
rsync -a /var/lib/scavenger/uploads/ /backups/uploads/
```

In Docker, where the image has no `sqlite3`, let the app's own libSQL driver
write the snapshot into the volume:

```bash
docker compose exec app node -e "require('@libsql/client').createClient({url:'file:/data/app.db'}).execute(\"VACUUM INTO '/data/backup.db'\").then(()=>console.log('saved /data/backup.db'))"
docker compose cp app:/data/backup.db ./app-$(date +%F).db
docker compose cp app:/data/uploads ./uploads
docker compose exec app rm /data/backup.db
```

**Or stop the server** and copy the whole folder.

**To restore**: stop the server, put `app.db` and `uploads/` back, delete any
leftover `app.db-wal` and `app.db-shm`, and start it. Generated push keys live
in the database, so notifications keep working after a restore.

## Upgrading

1. Back up (above).
2. Build the new version: `git pull`, then `docker compose up -d --build` — or
   `bun install --frozen-lockfile && bun run build`, reassemble `dist/`, copy
   it over with the same `rsync` command and `sudo systemctl restart scavenger`.
3. Migrations run on start. Watch the log for errors.

Pages always come fresh from the server, so everyone gets the new version as
soon as they open a page. When an upgrade also changes the service worker
(`sw/`, or the upload queue it runs), open apps install it in the background and
show "A new version is ready" with a Reload button; the big screen reloads by
itself.

Try not to upgrade during a hunt: the restart drops live connections for a few
seconds (they reconnect on their own, and queued uploads resend), but a failed
upgrade mid-event is stressful.

## Before the event

- [ ] The site opens over HTTPS on a phone, and `APP_URL` matches that address.
- [ ] Sign in as the admin; decide on invite-only or open sign-up under **Admin → Settings**.
- [ ] Invite your judges from the hunt's settings, and have each one accept on the device they'll judge from.
- [ ] Turn on notifications on an Android phone and on an iPhone (add it to the Home Screen first) and send a test announcement.
- [ ] Upload a large video through the proxy to check the body size limit and timeouts.
- [ ] Put a phone in airplane mode, submit a photo, reconnect, and watch it arrive.
- [ ] Print the hunt poster and team cards, and scan them.
- [ ] Take a backup, and know how to restore it.
