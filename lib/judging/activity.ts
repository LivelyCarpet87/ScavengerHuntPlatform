import { formatSigned } from "@/lib/format";
import { formatMeasured, possessive } from "./labels";

/*
 * Turns audit log entries into plain-language sentences:
 *   "Sam approved Night Owls’ submission for 31 The red door (+100)"
 *
 * Judging and score actions (written by lib/judging/actions.ts) get tailored
 * wording from the data they record. Everything else other areas log
 * ("team.rename", "task.update", "hunt.publish" …) is described from its
 * dotted verb, the target's current name and any names in its data, so a new
 * action type still reads sensibly. Pure, so it's unit-tested.
 */

export const ACTIVITY_GROUPS = [
  { key: "judging", label: "Judging", prefixes: ["submission."] },
  { key: "scores", label: "Scores", prefixes: ["adjustment.", "score.", "scores.", "standings."] },
  { key: "teams", label: "Teams", prefixes: ["team.", "player."] },
  { key: "tasks", label: "Tasks", prefixes: ["task.", "hint.", "tasks."] },
  // Everything else: the hunt itself, staff, invites, announcements, exports.
  { key: "settings", label: "Settings", prefixes: [] },
] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number]["key"];

export function activityGroup(action: string): ActivityGroup {
  for (const group of ACTIVITY_GROUPS) {
    if (group.prefixes.some((p) => action.startsWith(p))) return group.key;
  }
  return "settings";
}

/** Prefixes that belong to a named group; "settings" is everything not listed. */
export function groupPrefixes(key: ActivityGroup): { include: string[]; exclude: string[] } {
  if (key !== "settings") {
    return { include: [...(ACTIVITY_GROUPS.find((g) => g.key === key)?.prefixes ?? [])], exclude: [] };
  }
  return { include: [], exclude: ACTIVITY_GROUPS.flatMap((g) => [...g.prefixes]) };
}

export type ActivityEntry = {
  action: string;
  targetKind: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
};

export type ActivityLookup = {
  teams: Record<string, string>;
  tasks: Record<string, { code: number; title: string }>;
  submissions: Record<string, { teamId: string; taskId: string }>;
};

export type Part = { text: string; strong?: boolean };

export type Described = {
  parts: Part[];
  /** A second line: feedback, a reason, a new value. */
  detail: string | null;
  href: string | null;
  group: ActivityGroup;
  tone: "approved" | "rejected" | "pending" | "neutral";
};

const VERBS: Record<string, string> = {
  create: "created",
  add: "added",
  update: "updated",
  edit: "edited",
  change: "changed",
  save: "saved",
  rename: "renamed",
  delete: "deleted",
  remove: "removed",
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  unarchive: "restored",
  restore: "restored",
  hide: "hid",
  unhide: "showed",
  show: "showed",
  reorder: "reordered",
  move: "moved",
  pin: "pinned",
  unpin: "unpinned",
  invite: "invited",
  revoke: "revoked",
  accept: "accepted",
  reveal: "revealed",
  lock: "locked",
  unlock: "unlocked",
  open: "opened",
  close: "closed",
  reset: "reset",
  regenerate: "made a new code for",
  duplicate: "duplicated",
  copy: "copied",
  import: "imported",
  export: "exported",
  start: "started",
  end: "ended",
  finish: "finished",
  freeze: "froze",
  unfreeze: "unfroze",
  send: "sent",
  kick: "removed",
  join: "joined",
  leave: "left",
  claim: "claimed",
  role: "changed the role of",
  promote: "promoted",
  demote: "changed the role of",
  merge: "merged",
  split: "split",
  approve: "approved",
  reject: "rejected",
  schedule: "scheduled",
};

const EXPORT_NAMES: Record<string, string> = {
  "standings.csv": "the standings",
  "submissions.csv": "all submissions",
  "teams.csv": "the team list",
  "media.zip": "the photos and videos",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** What a re-save of an accepted submission changed, most significant first. */
function rejudgeChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): "points" | "value" | "feedback" | "none" {
  const same = (key: string) => (before?.[key] ?? null) === (after?.[key] ?? null);
  if (!same("pointsOverride")) return "points";
  if (!same("contestValue")) return "value";
  if (!same("feedback")) return "feedback";
  return "none";
}

/** "a judge", "an organizer", "an owner" */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

function quote(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  return `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”`;
}

export function describeActivity(
  entry: ActivityEntry,
  lookup: ActivityLookup,
  opts: { huntId: string; actor: string },
): Described {
  const data = entry.data ?? {};
  const group = activityGroup(entry.action);
  const [noun, ...rest] = entry.action.split(".");
  const verb = rest[rest.length - 1] ?? "";
  const base = `/manage/${opts.huntId}`;
  const actor: Part = { text: opts.actor, strong: true };

  // Resolve the team and task this entry is about, from its data or the current names.
  const sub = entry.targetKind === "submission" && entry.targetId ? lookup.submissions[entry.targetId] : undefined;
  const teamId = str(data.teamId) ?? sub?.teamId ?? (entry.targetKind === "team" ? entry.targetId : null);
  const taskId = str(data.taskId) ?? sub?.taskId ?? (entry.targetKind === "task" ? entry.targetId : null);
  const teamName =
    str(data.teamName) ??
    (teamId ? lookup.teams[teamId] : undefined) ??
    (entry.targetKind === "team" ? str(data.name) : null) ??
    "a team";
  const currentTask = taskId ? lookup.tasks[taskId] : undefined;
  const taskCode = num(data.taskCode) ?? currentTask?.code ?? null;
  const taskTitle = str(data.taskTitle) ?? currentTask?.title ?? null;
  const taskLabel = taskTitle ? `${taskCode != null ? `${taskCode} ` : ""}${taskTitle}` : "a task";

  if (noun === "submission") {
    const before = obj(data.before);
    const after = obj(data.after);
    const points = num(data.points);
    const beforeStatus = str(before?.status) ?? "pending";
    const whose: Part[] = [{ text: possessive(teamName), strong: true }, { text: " submission for " }];
    const task: Part = { text: taskLabel, strong: true };
    const href = verb === "delete" || !entry.targetId ? null : `${base}/submissions/${entry.targetId}`;
    const feedback = str(after?.feedback);
    const pts = points != null ? ` (${formatSigned(points)})` : "";

    if (verb === "approve") {
      let parts: Part[];
      let detail = feedback ? quote(feedback) : null;
      if (beforeStatus === "approved") {
        const change = rejudgeChange(before, after);
        const phrase = {
          points: " changed the points on ",
          value: " changed the measured value on ",
          feedback: " updated the feedback on ",
          none: " confirmed ",
        }[change];
        parts = [actor, { text: phrase }, ...whose, task, { text: pts }];
        if (change === "value" && num(after?.contestValue) != null) {
          detail = `Now ${formatMeasured(num(after?.contestValue) as number, null)}${detail ? `. ${detail}` : ""}`;
        }
      } else if (beforeStatus === "rejected") {
        parts = [actor, { text: " changed " }, ...whose, task, { text: ` to accepted${pts}` }];
      } else {
        parts = [actor, { text: " approved " }, ...whose, task, { text: pts }];
      }
      return { parts, detail, href, group, tone: "approved" };
    }
    if (verb === "reject") {
      let parts: Part[];
      if (beforeStatus === "approved")
        parts = [actor, { text: " changed " }, ...whose, task, { text: " to not accepted" }];
      else if (beforeStatus === "rejected") parts = [actor, { text: " updated the feedback on " }, ...whose, task];
      else parts = [actor, { text: " rejected " }, ...whose, task];
      return { parts, detail: feedback ? quote(feedback) : null, href, group, tone: "rejected" };
    }
    if (verb === "revert") {
      return {
        parts: [actor, { text: " put " }, ...whose, task, { text: " back in review" }],
        detail: null,
        href,
        group,
        tone: "pending",
      };
    }
    if (verb === "delete") {
      const text = str(data.text);
      return {
        parts: [actor, { text: " deleted " }, ...whose, task],
        detail: text ? quote(text) : null,
        href: null,
        group,
        tone: "neutral",
      };
    }
  }

  if (noun === "adjustment") {
    const points = num(data.points) ?? 0;
    const kind = points >= 0 ? "bonus" : "penalty";
    const size = `${Math.abs(points)}-point ${kind}`;
    const reason = str(data.reason);
    const href = `${base}/scoreboard#adjustments`;
    if (verb === "create") {
      return {
        parts: [
          actor,
          { text: " gave " },
          { text: teamName, strong: true },
          { text: ` a ${size} (${formatSigned(points)})` },
        ],
        detail: reason,
        href,
        group,
        tone: "neutral",
      };
    }
    if (verb === "delete") {
      return {
        parts: [actor, { text: " removed " }, { text: possessive(teamName), strong: true }, { text: ` ${size}` }],
        detail: reason,
        href,
        group,
        tone: "neutral",
      };
    }
  }

  if (noun === "export") {
    const what = EXPORT_NAMES[str(data.kind) ?? ""] ?? "an export";
    return { parts: [actor, { text: ` downloaded ${what}` }], detail: null, href: null, group, tone: "neutral" };
  }

  // ---- Other areas' actions -----------------------------------------------
  const say = (parts: Part[], extra: { detail?: string | null; href?: string | null } = {}): Described => ({
    parts: [actor, { text: " " }, ...parts],
    detail: extra.detail ?? null,
    href: extra.href ?? null,
    group,
    tone: "neutral",
  });
  const strong = (text: string): Part => ({ text, strong: true });
  const plain = (text: string): Part => ({ text });
  const teamHref = teamId && lookup.teams[teamId] ? `${base}/teams/${teamId}` : null;
  const taskHref = taskId && lookup.tasks[taskId] ? `${base}/tasks/${taskId}` : null;
  const fromTo = (value: unknown) => {
    const o = obj(value);
    return o ? { from: o.from, to: o.to } : null;
  };

  switch (noun) {
    case "team": {
      const nameChange = fromTo(data.name);
      if (verb === "update" && nameChange && str(nameChange.from) && str(nameChange.to)) {
        return say(
          [
            plain("renamed team "),
            strong(str(nameChange.from) as string),
            plain(" to "),
            strong(str(nameChange.to) as string),
          ],
          {
            detail:
              typeof data.hidden === "boolean"
                ? data.hidden
                  ? "Also hid it from the scoreboard."
                  : "Also put it back on the scoreboard."
                : null,
            href: teamHref,
          },
        );
      }
      if (verb === "update" && typeof data.hidden === "boolean") {
        return say(
          data.hidden
            ? [plain("hid team "), strong(teamName), plain(" from the scoreboard")]
            : [plain("put team "), strong(teamName), plain(" back on the scoreboard")],
          { href: teamHref },
        );
      }
      if (verb === "code")
        return say([plain("gave team "), strong(teamName), plain(" a new team code")], { href: teamHref });
      if (verb === "bulk_create") {
        const names = Array.isArray(data.names) ? data.names.filter((n): n is string => typeof n === "string") : [];
        const n = num(data.count) ?? names.length;
        return say([plain(`created ${n} ${n === 1 ? "team" : "teams"}`)], {
          detail: names.length
            ? `${names.slice(0, 6).join(", ")}${names.length > 6 ? ` and ${names.length - 6} more` : ""}`
            : null,
          href: `${base}/teams`,
        });
      }
      if (verb === "delete") {
        const subs = num(data.submissions);
        return say([plain("deleted team "), strong(str(data.name) ?? teamName)], {
          detail: subs ? `Its ${subs} ${subs === 1 ? "submission was" : "submissions were"} deleted too.` : null,
        });
      }
      const from = str(data.from) ?? str(data.oldName);
      const to = str(data.to) ?? str(data.newName);
      if (verb === "rename" && from && to) {
        return say([plain("renamed team "), strong(from), plain(" to "), strong(to)], { href: teamHref });
      }
      return say([plain(`${VERBS[verb] ?? "changed"} team `), strong(to ?? teamName)], { href: teamHref });
    }
    case "player": {
      const name = str(data.name) ?? str(data.playerName) ?? "a player";
      if (verb === "rename" && str(data.from) && str(data.to)) {
        return say(
          [plain("renamed player "), strong(str(data.from) as string), plain(" to "), strong(str(data.to) as string)],
          {
            href: teamHref,
          },
        );
      }
      if (verb === "move") {
        const toTeam = str(data.to);
        const toName = toTeam ? lookup.teams[toTeam] : undefined;
        return say([plain("moved "), strong(name), plain(" to "), strong(toName ?? "another team")], {
          href: toTeam && toName ? `${base}/teams/${toTeam}` : null,
        });
      }
      if (verb === "remove")
        return say([plain("removed "), strong(name), plain(" from "), strong(teamName)], { href: teamHref });
      if (verb === "captain")
        return say([plain("made "), strong(name), plain(" captain of "), strong(teamName)], { href: teamHref });
      return say([plain(`${VERBS[verb] ?? "changed"} player `), strong(name)], { href: teamHref });
    }
    case "task":
    case "tasks": {
      const title = str(data.title) ?? taskTitle;
      const code = num(data.code) ?? taskCode;
      const label = title ? `${code != null ? `${code} ` : ""}${title}` : "a task";
      if (noun === "tasks") return say([plain(`${VERBS[verb] ?? "changed"} the tasks`)], { href: `${base}/tasks` });
      if (verb === "update") {
        const changed = Array.isArray(data.changed)
          ? data.changed.filter((c): c is string => typeof c === "string")
          : [];
        const points = fromTo(data.points);
        const words = changed.map((c) =>
          c === "points" && points && num(points.from) != null && num(points.to) != null
            ? `points (${num(points.from)} to ${num(points.to)})`
            : c
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/[_-]/g, " ")
                .toLowerCase(),
        );
        return say([plain("updated task "), strong(label)], {
          detail: words.length ? `Changed ${words.join(", ")}.` : null,
          href: taskHref,
        });
      }
      if (verb === "reorder") {
        const dir = str(data.direction);
        return say([plain("moved task "), strong(label), plain(dir ? ` ${dir} the list` : " in the list")], {
          href: taskHref,
        });
      }
      if (verb === "attach" || verb === "detach") {
        const file = str(data.name) ?? "a file";
        return say(
          verb === "attach"
            ? [plain("attached "), strong(file), plain(" to task "), strong(label)]
            : [plain("removed "), strong(file), plain(" from task "), strong(label)],
          { href: taskHref },
        );
      }
      if (verb === "duplicate") return say([plain("made a copy of a task: "), strong(label)], { href: taskHref });
      return say([plain(`${VERBS[verb] ?? "changed"} task `), strong(label)], {
        href: verb === "delete" ? null : taskHref,
      });
    }
    case "hint": {
      const cost = num(data.cost);
      const costChange = fromTo(data.cost);
      if (verb === "create") {
        return say([plain("added a hint for "), strong(taskLabel)], {
          detail: cost != null ? `It costs ${cost} ${cost === 1 ? "point" : "points"}.` : null,
          href: taskHref,
        });
      }
      if (verb === "update") {
        const from = costChange ? num(costChange.from) : null;
        const to = costChange ? num(costChange.to) : null;
        return say([plain("changed a hint for "), strong(taskLabel)], {
          detail: from != null && to != null && from !== to ? `Cost ${from} to ${to} points.` : null,
          href: taskHref,
        });
      }
      if (verb === "delete") {
        const reveals = num(data.reveals);
        return say([plain("deleted a hint for "), strong(taskLabel)], {
          detail: reveals ? `${reveals} ${reveals === 1 ? "team had" : "teams had"} revealed it.` : null,
          href: taskHref,
        });
      }
      return say([plain(`${VERBS[verb] ?? "changed"} a hint for `), strong(taskLabel)], { href: taskHref });
    }
    case "hunt": {
      const settings = `${base}/settings`;
      const phrases: Record<string, string> = {
        update: "updated the hunt settings",
        schedule: "changed the hunt’s schedule",
        visibility: "changed who can see the scoreboard and gallery",
        registration: "changed registration for the hunt",
        join_code: "made a new join code for the hunt",
        cover: "changed the hunt’s cover image",
        cover_remove: "removed the hunt’s cover image",
        feedback_templates: "updated the saved replies for judges",
        reset: "reset the hunt",
        create: "created the hunt",
        publish: "published the hunt",
        unpublish: "took the hunt back to draft",
        archive: "archived the hunt",
        unarchive: "restored the hunt",
        restore: "restored the hunt",
        delete: "deleted the hunt",
      };
      if (verb === "duplicate") {
        const from = str(data.fromName);
        return say([plain("created this hunt"), ...(from ? [plain(" as a copy of "), strong(from)] : [])], {
          href: settings,
        });
      }
      if (verb === "registration" && typeof data.open === "boolean") {
        return say([plain(data.open ? "opened registration" : "closed registration")], { href: settings });
      }
      return say([plain(phrases[verb] ?? `${VERBS[verb] ?? "changed"} the hunt`)], { href: settings });
    }
    case "announcement": {
      const title = str(data.title) ?? str(data.body);
      const phrase = verb === "create" ? "posted an announcement" : `${VERBS[verb] ?? "changed"} an announcement`;
      return say([plain(phrase)], { detail: title ? quote(title, 100) : null, href: `${base}/announcements` });
    }
    case "staff": {
      const who = str(data.name) ?? str(data.userName) ?? str(data.email) ?? "a staff member";
      if (verb === "role") {
        const from = str(data.from);
        const to = str(data.to);
        return say([plain("changed "), strong(who), plain(from && to ? `’s role from ${from} to ${to}` : "’s role")], {
          href: `${base}/settings`,
        });
      }
      if (verb === "remove")
        return say([plain("removed "), strong(who), plain(" from the staff")], { href: `${base}/settings` });
      const role = str(data.role);
      return say(
        [plain(`${VERBS[verb] ?? "changed"} `), strong(who), ...(role ? [plain(` as ${withArticle(role)}`)] : [])],
        {
          href: `${base}/settings`,
        },
      );
    }
    case "invite": {
      const role = str(data.role);
      if (verb === "accept")
        return say([plain(`joined the staff${role ? ` as ${withArticle(role)}` : ""} with an invite link`)]);
      if (verb === "revoke") return say([plain("revoked an invite link")], { href: `${base}/settings` });
      return say([plain(`${VERBS[verb] ?? "changed"} an invite link${role ? ` for ${withArticle(role)}` : ""}`)], {
        href: `${base}/settings`,
      });
    }
    case "print": {
      const what = rest.join(" ").replace(/[_-]/g, " ").trim();
      const PRINTS: Record<string, string> = {
        poster: "the join poster",
        checkpoints: "the checkpoint codes",
        teams: "the team cards",
        "team cards": "the team cards",
      };
      return say([plain(`printed ${PRINTS[what] ?? (what ? `the ${what}` : "a page")}`)]);
    }
    default: {
      const name = str(data.name) ?? str(data.title);
      const thing = noun.replace(/[-_]/g, " ");
      return say([
        plain(`${VERBS[verb] ?? "changed"} `),
        ...(name ? [plain(`${thing} `), strong(name)] : [plain(thing)]),
      ]);
    }
  }
}

/** The sentence as plain text (tests, titles, exports). */
export function activityText(d: Described): string {
  return d.parts.map((p) => p.text).join("");
}

/**
 * Compact wording for one submission's own history, where the team and task
 * go without saying: "approved it (+100)", "put it back in review".
 */
export function describeSubmissionEvent(entry: Pick<ActivityEntry, "action" | "data">): {
  text: string;
  detail: string | null;
  tone: Described["tone"];
} {
  const data = entry.data ?? {};
  const before = obj(data.before);
  const after = obj(data.after);
  const beforeStatus = str(before?.status) ?? "pending";
  const points = num(data.points);
  const pts = points != null ? ` (${formatSigned(points)})` : "";
  const feedback = str(after?.feedback);
  const value = num(after?.contestValue);
  const detailParts = [
    value != null ? `Measured ${formatMeasured(value, null)}` : null,
    feedback ? quote(feedback) : null,
  ];
  const detail = detailParts.filter(Boolean).join(". ") || null;
  switch (entry.action) {
    case "submission.approve":
      if (beforeStatus === "approved") {
        const text = {
          points: "changed the points",
          value: "changed the measured value",
          feedback: "updated the feedback",
          none: "confirmed it",
        }[rejudgeChange(before, after)];
        return { text: `${text}${pts}`, detail, tone: "approved" };
      }
      return {
        text: `${beforeStatus === "rejected" ? "changed it to accepted" : "approved it"}${pts}`,
        detail,
        tone: "approved",
      };
    case "submission.reject":
      return {
        text:
          beforeStatus === "approved"
            ? "changed it to not accepted"
            : beforeStatus === "rejected"
              ? "updated the feedback"
              : "rejected it",
        detail,
        tone: "rejected",
      };
    case "submission.revert":
      return { text: "put it back in review", detail: null, tone: "pending" };
    default: {
      const verb = entry.action.split(".").pop() ?? "";
      return { text: `${VERBS[verb] ?? "changed"} it`, detail: null, tone: "neutral" };
    }
  }
}
