import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/** Stands in for the browser's EventSource: records connections and lets tests play the server. */
class FakeEventSource {
  static all: FakeEventSource[] = [];
  url: string;
  closed = false;
  onerror: (() => void) | null = null;
  listeners = new Map<string, ((m: { data: string }) => void)[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.all.push(this);
  }
  addEventListener(type: string, fn: (m: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) });
  }
}

const g = globalThis as Record<string, unknown>;
const noop = () => {};
let subscribe: typeof import("./use-hunt-events").subscribe;

beforeAll(async () => {
  g.EventSource = FakeEventSource;
  g.document = { visibilityState: "visible", addEventListener: noop, removeEventListener: noop };
  g.window = { addEventListener: noop, removeEventListener: noop };
  ({ subscribe } = await import("./use-hunt-events"));
});

afterAll(() => {
  delete g.EventSource;
  delete g.document;
  delete g.window;
});

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const open = (huntId: string) => FakeEventSource.all.filter((s) => !s.closed && s.url.includes(`/${huntId}/`));
const event = (seq: number) => ({ type: "tasks.changed", huntId: "h", seq, at: 0 });

describe("the shared hunt stream", () => {
  test("everything on the page shares one connection per hunt", async () => {
    const seen: string[] = [];
    const offA = subscribe("h1", { onEvent: (e) => seen.push(`a${e.seq}`) });
    const offB = subscribe("h1", { onEvent: (e) => seen.push(`b${e.seq}`) });
    const offC = subscribe("h2", { onEvent: noop });
    await tick();
    expect(open("h1")).toHaveLength(1);
    expect(open("h1")[0].url).toBe("/api/hunts/h1/events");
    expect(open("h2")).toHaveLength(1);
    open("h1")[0].emit("hunt", event(4));
    expect(seen).toEqual(["a4", "b4"]);
    for (const off of [offA, offB, offC]) off();
  });

  test("a dropped connection resumes after the last event it saw", async () => {
    const off = subscribe("h3", { onEvent: noop });
    await tick();
    const first = open("h3")[0];
    first.emit("hello", { boot: "run1", seq: 10 });
    first.emit("hunt", event(12));
    first.onerror?.();
    expect(first.closed).toBe(true);
    await tick(1100);
    expect(open("h3").map((s) => s.url)).toEqual(["/api/hunts/h3/events?since=12&boot=run1"]);
    off();
  });

  test("when the server can't replay, subscribers are told to reload", async () => {
    let resyncs = 0;
    const off = subscribe("h4", { onEvent: noop, onResync: () => resyncs++ });
    await tick();
    open("h4")[0].emit("resync", {});
    expect(resyncs).toBe(1);
    off();
  });

  test("a different viewer (the player joined a team) reopens the connection from scratch", async () => {
    const offPage = subscribe("h5", { onEvent: noop });
    await tick();
    const visitor = open("h5")[0];
    visitor.emit("hello", { boot: "run1", seq: 3 });
    const offPlayer = subscribe("h5", { onEvent: noop, viewer: "team:t1" });
    await tick();
    expect(visitor.closed).toBe(true);
    expect(open("h5").map((s) => s.url)).toEqual(["/api/hunts/h5/events"]);
    offPage();
    offPlayer();
  });

  test("the connection closes a moment after the last subscriber leaves, and survives a quick remount", async () => {
    const off = subscribe("h6", { onEvent: noop });
    await tick();
    const source = open("h6")[0];
    off();
    const again = subscribe("h6", { onEvent: noop });
    await tick();
    expect(source.closed).toBe(false);
    again();
    await tick(3100);
    expect(source.closed).toBe(true);
  });
});
