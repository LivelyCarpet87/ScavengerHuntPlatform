# Scavenger

Self-hosted scavenger hunts that run on people's phones. Organizers write the
tasks, teams join with a six-digit code and send photo proof, judges review it
as it arrives, and a live scoreboard runs on the big screen. It is built for
events outdoors on patchy signal: uploads wait on the phone and go out when the
signal comes back.

The interface borrows from orienteering's Score-O format — controls on a map,
visited in any order, each worth points — so tasks are controls, a team's
progress is a punched control card, and the scoreboard is a race bib.

## What it does

**For organizers.** Create hunts — several can run at the same time — with a
schedule, rules and a map colour. Write tasks of four kinds, choose how each one
scores, add hints that cost points, and decide who sees the scoreboard and
when it freezes. Invite judges and co-organizers with a link, post
announcements, adjust scores, and export the results when it's over.

**For players.** No accounts and no app store. Open the site, type the hunt code
(or scan the poster's QR code), create a team or join one with its team code,
and start sending proof. Results arrive as notifications, and the team's control
card fills with punches.

**For judges.** A queue of incoming submissions with photos and videos up front,
one-tap feedback, points overrides for partial credit, and a claim on each
submission so two judges never review the same one. Works on a laptop at HQ or a
phone while walking the course.

**For the room.** A big-screen scoreboard for a projector, with the countdown,
rank changes as they happen and a wall of accepted photos.

## Features

- **Many hunts at once**, each with its own staff, teams, tasks, schedule and accent colour.
- **Join without accounts**: six-digit hunt codes and QR posters for the hunt, six-character codes and QR cards for teams. Lost phone? Join the team again with its code.
- **Task types**: photo or video proof; typed answers checked instantly (with attempt limits) or by a judge; checkpoints scanned from a QR code posted on location; contests where judges record a value and the top places score.
- **Scoring modes**: fixed points; rarity (a task's value drops for everyone as more teams solve it); race (earlier solvers earn more); contest placements; hint costs and manual bonuses or penalties. See [docs/SCORING.md](docs/SCORING.md).
- **Judging queue** with feedback templates, points overrides, auto-accept for low-stakes tasks, and an activity log of every staff action.
- **Live everything**: the scoreboard, team dashboards, judging queue and announcements update over Server-Sent Events. The scoreboard can freeze before the end for a dramatic reveal.
- **Big screen** mode for a projector.
- **Offline uploads**: submissions made without signal are stored on the phone (IndexedDB) and sent automatically when it's back, including through Background Sync after the app is closed. Recently opened pages still open offline.
- **Push notifications** for results, announcements and new tasks (Android, desktop, and iPhone once the app is on the Home Screen).
- **Installable app (PWA)** with its own icon, full-screen display and an in-app update prompt.
- **Staff accounts** with per-hunt roles (judge, organizer, owner), platform admins, invite-only or open sign-up, and invite links.
- **One small server**: Next.js on Node with SQLite. No external services required.

## Quick start

You need [Bun](https://bun.sh) 1.4+ (package manager and scripts) and Node.js 22
(Next.js runs on Node).

```bash
bun install
bun run db:seed --reset   # demo hunts, teams and submissions
bun run dev               # http://localhost:3000
```

Demo sign-ins (at `/login`):

| Account | Password | What it can do |
| --- | --- | --- |
| `admin@example.com` | `hunt-admin` | Platform admin, owner of every demo hunt |
| `judge@example.com` | `hunt-judge` | Judge on "Campus Night Hunt" |

To play, open the home page and enter the hunt code **482913** (Campus Night Hunt).

Starting without demo data? A fresh database sends you to `/setup`, where the
first account is created as the platform admin.

## Configuration

Every setting has a working default. For development put them in `.env.local`
(see [.env.example](.env.example)); in production set them in the environment.

| Variable | Default | What it does |
| --- | --- | --- |
| `APP_URL` | *(unset)* | Public address, e.g. `https://hunt.example.com`. Used for QR codes, share and invite links, and notification links. When unset, links use the address of the incoming request. An `https://` value also turns on Secure cookies. **Set it in production.** |
| `APP_NAME` | `Scavenger` | Name in the header, browser tab and on installed phones. The static offline page picks it up at build time, so set it for the build too. |
| `DATA_DIR` | `./data` | Folder for the SQLite database (`app.db`) and uploaded photos and videos (`uploads/`). Use an absolute path in production. |
| `DATABASE_URL` | `file:$DATA_DIR/app.db` | Set to `libsql://…` to use a remote libSQL/Turso database. Uploads still live in `DATA_DIR`. |
| `DATABASE_AUTH_TOKEN` | *(unset)* | Token for a remote libSQL database. |
| `MAX_UPLOAD_MB` | `100` | Largest photo or video file, in megabytes. A submission can carry up to 4 files. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | *(generated)* | Web Push keys. When unset they're generated on first use and stored in the database. Set them to keep existing push subscriptions working if you ever start from a new database. |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact address push services can use about delivery problems. Use a real `mailto:` or `https:` address. |
| `COOKIE_SECURE` | on when `APP_URL` is `https://` | Force Secure cookies on (`true`) or off (`false`). |
| `PORT`, `HOSTNAME` | `3000`, all interfaces | Where the server listens. |

Platform settings that change at runtime — who may create organizer accounts,
invite links — live in the admin area at `/admin`.

## Running in production

Migrations run automatically when the server starts; there is no separate
migrate step.

**With Bun and Node, from a checkout:**

```bash
bun install --frozen-lockfile
bun run build
DATA_DIR=/var/lib/scavenger APP_URL=https://hunt.example.com bun run start
```

`next start` prints a warning that it "does not work with output: standalone".
It does; the warning points at the leaner standalone server, which
[docs/DEPLOY.md](docs/DEPLOY.md) explains along with a systemd unit.

**With Docker:**

```bash
APP_URL=https://hunt.example.com docker compose up -d --build
```

The image runs the standalone Node server as a non-root user and keeps
everything in the `/data` volume. Details, proxy configurations for Caddy and
nginx, backups and upgrades are in [docs/DEPLOY.md](docs/DEPLOY.md).

### HTTPS is required on phones

Browsers only allow the camera (QR scanning), installing the app, push
notifications and the service worker (offline uploads) on HTTPS pages.
`http://localhost` is the one exception, which is why development works — but a
phone opening `http://192.168.1.20:3000` gets none of them. For a real event,
serve the app over HTTPS: Caddy does it with automatic certificates. To try it
on your own phone during development, use a tunnel that gives the dev server a
public HTTPS address (for example `cloudflared tunnel --url http://localhost:3000`)
and set `APP_URL` to it. `bunx next dev --experimental-https` only helps on the
computer itself: phones don't trust its self-signed certificate.

### Behind a reverse proxy

- **Live updates** stream from `/api/hunts/<id>/events` (Server-Sent Events).
  Turn off response buffering for that path and allow long-lived connections;
  the server sends a keep-alive every 20 seconds. The response already carries
  `X-Accel-Buffering: no` for nginx.
- **Uploads** go to `/api/hunts/<id>/submissions` as one request of up to four
  files: allow request bodies of at least 4 × `MAX_UPLOAD_MB` plus a few
  megabytes (about 410 MB with the defaults), and generous read timeouts for
  slow phone connections.
- **Headers**: pass `Host`, `X-Forwarded-Proto` and `X-Forwarded-For` (set to
  the client's address, not appended to what the client sent — sign-in rate
  limits key on it). Or set `APP_URL`.

### Backups

Everything lives in `DATA_DIR`: the database `app.db` (plus `app.db-wal` and
`app.db-shm` while the server runs) and the `uploads/` folder.

- A consistent copy of a running database:
  `sqlite3 "$DATA_DIR/app.db" ".backup '/backups/app-$(date +%F).db'"`,
  then copy `uploads/` (e.g. `rsync -a "$DATA_DIR/uploads/" /backups/uploads/`).
- Or stop the server and copy the whole folder.
- The generated push keys are stored in the database, so a restored database
  keeps notifications working.

To restore, stop the server, put `app.db` and `uploads/` back (removing any old
`app.db-wal`/`app.db-shm`), and start it again.

### Scaling

One app instance with SQLite in WAL mode is the intended setup, and it handles a
large event on a small server: readers (scoreboards, live feeds) never wait for
writers, standings are computed once per change and cached per hunt, photo
derivatives are made once at upload, and the realtime bus is in-process.
`scripts/load-test.ts` simulates dozens of teams submitting while phones hold
live connections, so you can measure your own hardware.

Going beyond one instance means replacing the in-process pieces: move the
database to a libSQL server (`DATABASE_URL`), put `DATA_DIR/uploads` on shared
storage, swap the event bus in `lib/realtime/bus.ts` and the rate limiter in
`lib/rate-limit.ts` for shared ones (e.g. Redis), set the same
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` everywhere, and pin each browser to one
instance for its event stream.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Builds the service worker, starts the dev server on :3000 |
| `bun run build` | Service worker + production build (`.next/standalone`) |
| `bun run start` | Starts the production server |
| `bun run db:seed [--reset]` | Demo data; `--reset` wipes every table and upload first |
| `bun run db:generate` | Creates a migration after editing `lib/db/schema.ts` |
| `bun run db:studio` | Browses the database in Drizzle Studio |
| `bun run sw:build` | Bundles `sw/index.ts` into `public/sw.js` |
| `bun run icons` | Regenerates the app icons in `public/icons/` from the mascot |
| `bun run shot <path> [--as admin] [--mobile] [--dark]` | Screenshots the running dev server |
| `bun scripts/load-test.ts` | Load test against a running production server |
| `bun scripts/import-mvp.ts` | Imports an event from the original MVP as a new hunt |

## Upgrading from the MVP

This is a rewrite, not an in-place upgrade: the old `scavenger-hunt-platform/`
app, its `/api/seed` endpoint and its environment variables (`EVENT_NAME`,
`JWT_SECRET_KEY`, `TEAM_KEY`, `ADMIN_KEY`, `ADMIN_PASSWD`) are gone.

- **Staff** get real accounts: the first one is created at `/setup`, the rest
  join through invite links (hunt Settings → Staff, or Admin → Settings).
- **Teams** no longer register with a shared key and password. They type the
  hunt's six-digit code (or scan its poster) and pick a team name; teammates
  join with the team's code or QR.
- **Challenges and competitions** are now tasks: challenges become photo/video
  tasks (their decaying value maps to *rarity* scoring), competitions become
  *contest* tasks (MAX/MIN/MAX_SUM/FIRST → highest/lowest/total/earliest).

To bring a past event across — tasks, teams, every submission with its judge
decision and feedback, and the uploaded photos and videos:

```bash
bun scripts/import-mvp.ts --db old/data.db --uploads old/uploads \
  --owner you@example.com --name "Spring Hunt 2025"
```

It creates a draft hunt owned by `--owner` (create that account first) and
prints its join code. Admin accounts aren't copied (the MVP stored bcrypt
hashes); invite those people from the hunt's settings. `--dry-run` shows what
would be imported.

## Testing

```bash
bun test                                   # unit tests (lib/)
bunx tsc --noEmit && bunx tsc --noEmit -p sw
bunx biome check
bun run e2e                                # end-to-end smoke tests against a running server
```

CI (`.github/workflows/ci.yml`) runs the type checks, lint, unit tests and a
production build for every pull request and every push to `main`.

## Project structure

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the stack, directory map, data model, access rules and the
  patterns every feature follows (read this first).
- [docs/DESIGN.md](docs/DESIGN.md) — the Score-O design system: palette, type, course symbols, writing.
- [docs/SCORING.md](docs/SCORING.md) — how every point is computed, with worked examples.
- [docs/DEPLOY.md](docs/DEPLOY.md) — Docker, bare metal with systemd, reverse proxies, backups and upgrades.
