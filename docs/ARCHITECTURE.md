# Architecture

Scavenger is a self-hostable platform for running scavenger hunts: organizers
create hunts, teams join from their phones with a code, submit proof for tasks
(photos, videos, answers, checkpoint scans, contest entries), judges review,
and everyone watches a live scoreboard. Many hunts can run at once.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router (Turbopack), React 19.2, Server Components + Server Actions |
| Package manager / scripts / tests | **Bun** (`bun install`, `bun run dev`, `bun test`) |
| Database | SQLite via libSQL (`@libsql/client`) + Drizzle ORM. `DATABASE_URL` can point at Turso for remote hosting |
| Styling | Tailwind CSS v4 with semantic tokens (see DESIGN.md) |
| Validation | zod v4 |
| Images | sharp (derivatives made once at upload time) |
| Realtime | Server-Sent Events from an in-process event bus |
| Push | Web Push (`web-push`), VAPID keys auto-generated and stored in the DB |
| Offline | Service worker (built from `sw/` by `bun build`), IndexedDB upload queue, `experimental.useOffline` |

Next.js 16 differs from older versions: read the relevant guide in
`node_modules/next/dist/docs/` before using an unfamiliar API. Notably:
`params`, `searchParams`, `cookies()`, `headers()` are async; middleware is now
`proxy.ts`; `revalidateTag` needs a profile; use `refresh()` / `revalidatePath()`
from `next/cache` after mutations. Never use Bun-only APIs (`Bun.*`,
`bun:sqlite`) in app code — the server runs on Node. They are fine in
`scripts/` and tests.

## Directory map

```
app/
  page.tsx                      landing: enter a hunt code, your hunts, organizer entry
  join/[code]/                  hunt join-code links (QR posters point here)
  h/[slug]/(play)/…             player pages, wrapped in PlayerShell (layout.tsx)
  h/[slug]/screen/              big-screen scoreboard (no shell)
  manage/[huntId]/…             organizer & judge pages, wrapped in StaffShell (layout.tsx)
  dashboard/                    organizer's hunt list, create hunt
  admin/                        platform admin
  (auth)/login, signup, setup, invite/[token]
  api/hunts/[huntId]/…          route handlers (uploads, SSE events, exports, feeds)
  files/[id]/[variant]/         access-checked file serving (Range support)
components/
  ui/                           design-system primitives (shared — see DESIGN.md)
  shells/                       PlayerShell, StaffShell, SiteHeader
  live/                         useHuntEvents, LiveRefresh, PlayerLive, StaffLive
  pwa/                          service worker registration, offline banner, install/push UI
  <area>/                       feature components (player/, staff/, judge/, scoreboard/ …)
lib/
  db/schema.ts                  the data model (read it first)
  db/index.ts                   `db` (drizzle) — import { db } from "@/lib/db"
  auth/session.ts               device sessions: getSession, ensureSession, signInUser, signOutUser
  auth/access.ts                requireUser, requireAdmin, requireStaff, getStaffRole, getPlayer, getPlayerHunt, requirePlayer
  hunts.ts                      getHuntBy*, huntPhase, isTaskVisible, submissionBlockReason, canViewScoreboard, scoreboardCutoff, canViewGallery
  tasks.ts                      kindLabel, judgingNote, describeScoring, scoringCurve, acceptAttr, taskAvailability
  scoring/engine.ts             pure scoring engine (+ engine.test.ts)
  scoring/service.ts            getStandings(huntId, { cutoff }) — cached until the next hunt event
  player/progress.ts            getTeamProgress, getRevealedHints, getTaskSubmissions
  realtime/bus.ts               publish(huntId, event) / subscribe — every mutation publishes
  push.ts                       notifyTeam, notifyHuntPlayers, notifyHuntStaff, saveSubscription …
  storage.ts                    storeUpload, storePoster, fileUrl, filesFor, deleteFiles, deleteHuntStorage
  files-access.ts               canViewFile
  actions.ts                    ActionState, ok, fail, parseForm, zCheckbox, zInt, zOptionalInt, zOptionalText, zOptionalDate
  rate-limit.ts                 rateLimit, clientIp
  audit.ts                      audit({ huntId, actorUserId, action, … })
  ids.ts                        newId, newToken, newJoinCode, newCode, normalizeCode, formatCode, slugify
  format.ts                     formatPoints, formatSigned, ordinal, formatClock, formatRelative, formatDateTime …
  palette.ts                    ACCENT_SWATCHES, TEAM_COLORS, TEAM_EMOJI, pickRandom
  url.ts                        baseUrl, absoluteUrl, links.* (canonical player URLs)
  jobs.ts                       registerJob(name, everyMs, fn) — periodic in-process jobs
sw/                             service worker source (TypeScript, bundled to public/sw.js)
scripts/                        seed.ts, shot.ts, generate-icons.ts
drizzle/                        SQL migrations (applied automatically on boot by instrumentation.ts)
```

## Identity and access

* **Sessions are per device.** A random token in the httpOnly cookie
  `shp_session`; the DB stores its sha256. `getSession()` is read-only and safe
  in Server Components; `ensureSession()` (actions/route handlers only) creates
  one on first use.
* **Players have no passwords.** Joining a hunt creates a `players` row linking
  the device session to a team. Teammates join with the team's 6-character code
  (or its QR). Lost phone? Join again with the team code.
* **Staff** sign in with email + password (`signInUser` attaches the user to the
  device session, so a judge can also play). Roles per hunt: judge < organizer <
  owner; platform admins act as owner everywhere. Use `requireStaff(huntId, min)`
  in every staff page and action — never trust a huntId from the client without it.
* In Server Actions, re-check authorization inside the action (actions are
  public endpoints). Scope every query by `huntId`.

## Mutations: the pattern

```ts
"use server";
export async function renameTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(Schema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  await db.update(teams).set({ … }).where(and(eq(teams.id, …), eq(teams.huntId, hunt.id)));
  await audit({ huntId: hunt.id, actorUserId: user.id, action: "team.rename", targetKind: "team", targetId: … });
  publish(hunt.id, { type: "teams.changed", teamId: … });   // live updates + cache invalidation
  after(() => notifyTeam(…));                                 // optional push, never blocks
  revalidatePath(`/manage/${hunt.id}/teams`);
  return ok("Team renamed.");
}
```

* **Always `publish()` after changing anything players or the scoreboard can
  see.** Standings are cached per hunt and invalidated by bus events.
* Use `after()` from `next/server` for push notifications and other slow side
  effects.
* Validation errors are user-facing sentences ("Team names can be up to 32
  characters."), returned via `fail()` / `parseForm`.
* Forms use `useActionState` + `<SubmitButton>` + `<FormMessage>` + `fieldError()`
  from `components/ui/form.tsx`.

## Contracts between areas

**Submission upload API** — `POST /api/hunts/[huntId]/submissions`
(`multipart/form-data`): `taskId`, `clientId` (device-generated idempotency
key), `text?`, `files` (0–4 files), `poster?` (video poster frame, image),
`lat?`, `lng?`, `accuracy?`. The signed-in player's team is implied by the
session cookie. Responses:
* `200 { ok: true, duplicate?: boolean, submission: { id, status, feedback, points } }`
* `4xx { ok: false, error: string, retryable: false }` — do not retry (invalid, closed, limit reached)
* `429/5xx` or network error — retry later
The offline queue (`lib/offline/queue.ts`) and the task page both use it;
the service worker flushes the same queue on Background Sync
(tag `QUEUE_SYNC_TAG`).

**Live events** — mutations call `publish(huntId, event)` (types in
`lib/realtime/bus.ts`; attach `teamName`/`taskTitle`/`points`/`feedback` where
you have them). Browsers receive them via `/api/hunts/[huntId]/events`
(filtered per viewer by `lib/realtime/filter.ts`). In pages, use
`<LiveRefresh huntId on={[…]} />` to re-render on events, or
`useHuntEvents(huntId, handler)` for custom behaviour. PlayerShell already
mounts `PlayerLive` (result toasts); StaffShell mounts `StaffLive`.

**Push** — `notifyTeam(teamId, payload)`, `notifyHuntPlayers(huntId, payload)`,
`notifyHuntStaff(huntId, payload)` in `lib/push.ts`. Payload:
`{ title, body, url?, tag? }`. Browsers subscribe through `/api/push`.

**Scores** — only through `getStandings(huntId, { cutoff })`; compute `cutoff`
with `scoreboardCutoff(hunt, viewer)`. Never re-implement scoring in a page.

**Files** — upload with `storeUpload({ file, huntId, ownerKind, ownerId, allow })`;
render with `fileUrl(file, "thumb" | "display" | "original" | "poster")`.
`/files/…` enforces `canViewFile`.

## Development

```bash
bun install
bun run db:seed --reset     # demo hunts, teams, submissions (see script header for logins)
bun run dev                 # http://localhost:3000
bun test                    # unit tests
bunx tsc --noEmit && bunx biome check
```

Demo logins: `admin@example.com` / `hunt-admin`, `judge@example.com` / `hunt-judge`.
`bun scripts/shot.ts <path> --as admin|judge|player-1 [--mobile] [--dark] [--full]`
screenshots the running dev server as a demo user.

Schema changes: edit `lib/db/schema.ts`, then `bun run db:generate` to add a
migration. Migrations run automatically at server start.
