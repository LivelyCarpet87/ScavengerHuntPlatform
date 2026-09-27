# Design: Score-O

A scavenger hunt is what orienteers call a **Score-O**: controls scattered
across a map, visited in any order, each worth points, against the clock. The
interface borrows that world's printed artifacts — the map, the course
overprint, the control card, the race bib — instead of generic app chrome.
The hedgehog with the magnifying glass is the mascot.

Look at `/styleguide` (dev only) for every primitive in context.

## Who and where

* **Players** — on phones, outdoors, one hand, bright sun or dark evenings,
  patchy signal, in a hurry and excited. Everything they need must be
  thumb-reachable, high-contrast and fast.
* **Judges/organizers** — laptops at HQ or phones while walking around,
  processing a stream of photos quickly and fairly.
* **The room** — a projector showing the live board.

## Palette (ISOM map colors)

| Token | Day | Role |
| --- | --- | --- |
| `paper` | #FFFFFF | page and surfaces (map white) |
| `ink` | #000000 | text, strong strokes (map black) |
| `ink-2`, `ink-3` | greys | secondary/tertiary text |
| `mist`, `mist-2` | #F2F3F0 … | sunken surfaces: inputs, wells, side rails |
| `line`, `line-strong` | greys | hairlines, borders |
| `overprint` / `accent` | #A3129B | **the course**: controls, primary actions, "you" — the only loud color |
| `sun` | #FFC21A | open-land yellow: pending review, highlighter for your team |
| `forest` | #1B7A3E | accepted |
| `danger` | #C4152F | rejected, destructive |
| `water` | #0068AD | information |
| `contour` | #C36A2D | topographic texture lines only |

Night-O (dark) swaps every token automatically. Components must use tokens
(`bg-paper`, `text-ink-2`, `border-line`, `bg-accent text-accent-ink`, …) —
never raw hex, and avoid `dark:` overrides. Inside a hunt, `data-accent` on
the shell swaps `accent` for the hunt's chosen map color; use `accent` (not
`overprint`) for anything that should follow the hunt.

## Type

One family — **Archivo** — used through its width axis:

* `font-bib` (62% width, 800 weight, tabular) — scores, ranks, countdowns,
  control codes, join codes. Big numerals are the loudest type on a screen.
* `font-cond` (75%) + `font-extrabold` — headings and hunt names.
  Tight tracking (`tracking-tight`) at display sizes.
* 100% width, 400/500/600 — reading text, labels, buttons.

Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows above
headings, no mono-font data labels, no accenting a single word in a headline.

## Course symbols (components/ui/control.tsx, punch.tsx)

* **Control marker** — circle with the task's code (e.g. 31). A task's state is
  shown by shape *and* color: ring (to do), dashed ring on yellow (in review),
  solid disc (accepted), slashed ring (not accepted), dotted grey (locked).
* **Start triangle / finish double circle** — schedule start and end.
* **Pin punch** — every task has a unique punch pattern (`PunchMark`, seeded
  by task id). It appears on the team's **control card** (`ControlCard`) when
  a task is accepted. The punch animation is the product's one celebratory
  moment — don't add confetti or other effects.
* **Race bib** (`Bib`) — rank and score on the team dashboard. Use once per
  screen.
* **Contour art** (`ContourArt seed={hunt.id}`) — the hunt's generated terrain.
  Used on hunt headers, dashboard hunt cards and the big screen. Put text on
  a solid `paper` plate or keep contours `strength="faint"` behind body text.

Task codes are identifiers, not a sequence: don't present tasks as numbered
steps. There are no lines connecting controls (in a Score-O you choose the order).

## Layout

* Player pages: single column, `max-w-3xl`, bottom tab bar on phones (Tasks,
  Scores, Team, Updates), header tabs from `md`. 48px+ touch targets; primary
  actions reachable at the bottom of the screen on phones.
* Staff pages: sidebar on desktop, header menu on phones; content `max-w-6xl`.
  Dense but calm: lists and tables over card grids.
* Cards are for things that are objects (a hunt, a submission photo, a team
  card to print) — not a wrapper for every section. Prefer lists with dividers
  (`divide-y divide-line`), headings and whitespace. Vary radius by hierarchy
  (controls round, buttons 10px, panels 14px). No drop shadows except
  overlays (`shadow-pop`). No gradients.
* Left-align text. Center only empty states and single-purpose screens (join
  code entry, scan success).

## Motion

Only motion that answers something: the punch when a task is accepted, a toast
arriving, rank changes sliding on the big screen, a sheet opening. No
fade-in-on-scroll, no hover lifts on cards. `prefers-reduced-motion` is
honoured globally.

## Writing

* Name things the way players say them: "tasks", "team code", "scoreboard",
  "photo", "hint". Organizers: "hunt", "judge", "submissions", "adjust score".
* Buttons say exactly what happens and keep that name through the flow:
  "Submit photo" → toast "Photo sent". "Create team", "Join team", "Approve",
  "Reject", "Reveal hint (−10)". Never "Submit", "OK", "Click here". No "→" in labels.
* Errors say what happened and how to fix it, without apology:
  "That code doesn't match a hunt. Check the six digits on the poster."
* Empty states invite the next action: "No tasks yet. Add the first one —
  most hunts start with 10–15."
* Use the real minus sign (−) for negative points (`formatSigned`).
* No filler, no exclamation marks except genuine celebration ("Punched!").

## Quality floor

* Works at 360px wide; no horizontal scroll on phones.
* Keyboard: visible focus (built in), logical order, all actions reachable.
* Every image has alt text or is decorative (`alt=""`); icon-only buttons have
  `aria-label`.
* Color is never the only signal (status uses glyph + word).
* Contrast AA at minimum; test Night-O too (`--dark` in scripts/shot.ts).
* Loading: use `loading.tsx` skeletons that match the final layout for slow
  routes; buttons show pending state.
