import { describe, expect, test } from "bun:test";
import { createPacer } from "./pacer";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createPacer", () => {
  test("a burst of 'soon' requests runs once, after a quiet moment", async () => {
    let runs = 0;
    const pacer = createPacer(() => runs++, { quietMs: 30, maxWaitMs: 1000, gapMs: 1000, jitterMs: 0 });
    pacer.ask();
    pacer.ask();
    await sleep(10);
    pacer.ask();
    expect(runs).toBe(0);
    await sleep(80);
    expect(runs).toBe(1);
  });

  test("a steady stream still runs within maxWaitMs", async () => {
    let runs = 0;
    const pacer = createPacer(() => runs++, { quietMs: 40, maxWaitMs: 100, gapMs: 1000, jitterMs: 0 });
    for (let i = 0; i < 12; i++) {
      pacer.ask();
      await sleep(15);
    }
    expect(runs).toBeGreaterThanOrEqual(1);
    pacer.cancel();
  });

  test("'later' waits for the gap since the last run and is never postponed", async () => {
    const runs: number[] = [];
    const start = Date.now();
    const pacer = createPacer(() => runs.push(Date.now() - start), {
      quietMs: 10,
      maxWaitMs: 50,
      gapMs: 150,
      jitterMs: 0,
    });
    pacer.ask();
    await sleep(40);
    expect(runs).toHaveLength(1);
    pacer.ask("later");
    await sleep(30);
    pacer.ask("later");
    await sleep(40);
    expect(runs).toHaveLength(1);
    await sleep(120);
    expect(runs).toHaveLength(2);
    expect(runs[1] - runs[0]).toBeGreaterThanOrEqual(140);
  });

  test("'soon' overtakes a pending 'later'", async () => {
    let runs = 0;
    const pacer = createPacer(() => runs++, { quietMs: 10, maxWaitMs: 50, gapMs: 10_000, jitterMs: 0 });
    pacer.ask("later");
    pacer.ask("soon");
    await sleep(60);
    expect(runs).toBe(1);
    pacer.cancel();
  });

  test("hide holds a pending run until show", async () => {
    let runs = 0;
    const pacer = createPacer(() => runs++, { quietMs: 10, maxWaitMs: 50, gapMs: 1000, jitterMs: 0 });
    pacer.ask();
    pacer.hide();
    await sleep(40);
    expect(runs).toBe(0);
    pacer.show();
    await sleep(40);
    expect(runs).toBe(1);
    pacer.show();
    await sleep(40);
    expect(runs).toBe(1);
    pacer.show(true);
    await sleep(40);
    expect(runs).toBe(2);
  });
});

describe("createPacer in a hidden tab", () => {
  const g = globalThis as { document?: unknown };
  test("holds ordinary runs, but not ones asked for in the background", async () => {
    g.document = { visibilityState: "hidden" };
    try {
      let runs = 0;
      const pacer = createPacer(() => runs++, { quietMs: 10, maxWaitMs: 50, gapMs: 1000, jitterMs: 0 });
      pacer.ask();
      await sleep(40);
      expect(runs).toBe(0);
      pacer.ask("soon", { hidden: true });
      pacer.hide();
      await sleep(40);
      expect(runs).toBe(1);
      // That run covered what was held back.
      pacer.show();
      await sleep(40);
      expect(runs).toBe(1);
    } finally {
      delete g.document;
    }
  });
});
