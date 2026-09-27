import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { busInfo, type HuntEventEnvelope, publish, REPLAY_MAX_AGE_MS, REPLAY_MAX_EVENTS, replaySince } from "./bus";
import { type EventViewer, eventForViewer } from "./filter";

let n = 0;
const newHunt = () => `test-hunt-${Date.now()}-${n++}`;

function replayed(huntId: string, since: number): HuntEventEnvelope[] {
  const missed = replaySince(huntId, since);
  if (missed === "gap") throw new Error("unexpected gap");
  return missed;
}

afterEach(() => setSystemTime());

describe("replaySince", () => {
  test("keeps what was published while nobody was listening", () => {
    const hunt = newHunt();
    const { seq } = busInfo();
    publish(hunt, { type: "tasks.changed" });
    publish(hunt, { type: "hunt.changed" });
    expect(replayed(hunt, seq).map((e) => e.type)).toEqual(["tasks.changed", "hunt.changed"]);
  });

  test("returns only what came after `since`, for that hunt only", () => {
    const hunt = newHunt();
    const other = newHunt();
    publish(hunt, { type: "tasks.changed" });
    const { seq } = busInfo();
    publish(other, { type: "hunt.changed" });
    publish(hunt, { type: "teams.changed", teamId: "t1" });
    const missed = replayed(hunt, seq);
    expect(missed.map((e) => e.type)).toEqual(["teams.changed"]);
    expect(missed[0].seq).toBeGreaterThan(seq);
    expect(replayed(hunt, busInfo().seq)).toEqual([]);
    expect(replayed(newHunt(), seq)).toEqual([]);
  });

  test("a gap once events the client missed are no longer kept", () => {
    const hunt = newHunt();
    const { seq } = busInfo();
    for (let i = 0; i <= REPLAY_MAX_EVENTS; i++) publish(hunt, { type: "scores.changed", teamId: "t1" });
    expect(replaySince(hunt, seq)).toBe("gap");
    // Recent enough: still replayable.
    expect(replayed(hunt, busInfo().seq - 10)).toHaveLength(10);
  });

  test("a gap once they are too old", () => {
    const hunt = newHunt();
    const { seq } = busInfo();
    publish(hunt, { type: "hunt.changed" });
    setSystemTime(new Date(Date.now() + REPLAY_MAX_AGE_MS + 1000));
    expect(replaySince(hunt, seq)).toBe("gap");
  });

  test("a gap for a sequence number from another server run", () => {
    expect(replaySince(newHunt(), busInfo().seq + 100)).toBe("gap");
  });
});

describe("eventForViewer", () => {
  const hunt = "h";
  const at = 1_000_000;
  const env = (event: Parameters<typeof publish>[1], extra: Partial<HuntEventEnvelope> = {}) =>
    ({ ...event, huntId: hunt, seq: 7, at, ...extra }) as HuntEventEnvelope;
  const judgedFor = (teamId: string) =>
    env({
      type: "submission.judged",
      submissionId: "s1",
      teamId,
      taskId: "k1",
      status: "approved",
      points: 100,
      teamName: "Otters",
    });
  const judged = judgedFor("other");
  const player: EventViewer = { staff: false, teamId: "mine" };
  const frozenPlayer: EventViewer = { ...player, frozen: (t) => t >= at };

  test("staff see everything, including decisions still in their undo window", () => {
    const held = { ...judged, audience: "staff" as const };
    expect(eventForViewer(held, { staff: true, teamId: null })).toBe(held);
    expect(eventForViewer(held, player)).toBeNull();
  });

  test("another team's rejected or reverted try isn't sent: it moves no score", () => {
    const wrong = env({
      type: "submission.judged",
      submissionId: "s2",
      teamId: "other",
      taskId: "k1",
      status: "rejected",
    });
    expect(eventForViewer(wrong, player)).toBeNull();
    const back = env({
      type: "submission.judged",
      submissionId: "s2",
      teamId: "other",
      taskId: "k1",
      status: "pending",
    });
    expect(eventForViewer(back, player)).toBeNull();
    expect(eventForViewer(wrong, { staff: true, teamId: null })).toBe(wrong);
  });

  test("another team's decision reaches players as a score change about someone else", () => {
    expect(eventForViewer(judged, player)).toEqual({ huntId: hunt, seq: 7, at, type: "scores.changed", mine: false });
    expect(eventForViewer(judged, { staff: false, teamId: null })).toMatchObject({
      type: "scores.changed",
      mine: false,
    });
    expect(eventForViewer(judgedFor("mine"), player)).toMatchObject({ teamId: "mine", teamName: "Otters" });
  });

  test("score and team changes say whether they are the viewer's own, without naming other teams", () => {
    expect(eventForViewer(env({ type: "scores.changed", teamId: "mine" }), player)).toMatchObject({ mine: true });
    const other = eventForViewer(env({ type: "teams.changed", teamId: "other" }), player);
    expect(other).toEqual({ huntId: hunt, seq: 7, at, type: "teams.changed", mine: false });
    expect(eventForViewer(env({ type: "scores.changed" }), player)).toEqual({
      huntId: hunt,
      seq: 7,
      at,
      type: "scores.changed",
    });
  });

  test("during the freeze other teams' score changes are dropped; the viewer's own and team renames are not", () => {
    expect(eventForViewer(judged, frozenPlayer)).toBeNull();
    expect(eventForViewer(env({ type: "scores.changed", teamId: "other" }), frozenPlayer)).toBeNull();
    expect(eventForViewer(env({ type: "scores.changed", teamId: "mine" }), frozenPlayer)).toMatchObject({ mine: true });
    expect(eventForViewer(env({ type: "scores.changed" }), frozenPlayer)).not.toBeNull();
    expect(eventForViewer(env({ type: "teams.changed", teamId: "other" }), frozenPlayer)).not.toBeNull();
    expect(eventForViewer({ ...judged, at: at - 1 }, frozenPlayer)).not.toBeNull();
  });

  test("replayed events are filtered like live ones", () => {
    const huntId = newHunt();
    const { seq } = busInfo();
    publish(huntId, { type: "submission.created", submissionId: "s", teamId: "other", taskId: "k" });
    publish(huntId, { type: "scores.changed", teamId: "other" }, { audience: "staff" });
    publish(huntId, { type: "announcement.created", announcementId: "a", title: "Hi" });
    const seen = replayed(huntId, seq)
      .map((e) => eventForViewer(e, player))
      .filter((e) => e != null);
    expect(seen.map((e) => e.type)).toEqual(["announcement.created"]);
  });
});
