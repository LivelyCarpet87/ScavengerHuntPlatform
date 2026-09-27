import { describe, expect, test } from "bun:test";
import {
  appArea,
  belongsToHunt,
  freshPageVerdict,
  keepsSavedCopy,
  mediaBucket,
  pageTitle,
  pickWindow,
  streamedDigest,
  type WindowInfo,
  withHtmlAttribute,
} from "./sw-policy";

const html = (body: string) =>
  `<!DOCTYPE html><html lang="en" class="h-full"><head><title>Tasks – Campus Night Hunt</title></head><body>${body}</body></html>`;
const ok = { status: 200, type: "basic", contentType: "text/html; charset=utf-8" };

describe("keepsSavedCopy", () => {
  test("keeps player pages and the home page", () => {
    expect(keepsSavedCopy("/")).toBe(true);
    expect(keepsSavedCopy("/h/campus-night-hunt")).toBe(true);
    expect(keepsSavedCopy("/h/campus-night-hunt/team")).toBe(true);
    expect(keepsSavedCopy("/h/campus-night-hunt/tasks/abc")).toBe(true);
    expect(keepsSavedCopy("/join/482913")).toBe(true);
  });

  test("never keeps staff, account, checkpoint or offline pages", () => {
    for (const path of [
      "/login",
      "/signup",
      "/setup",
      "/invite/tok",
      "/admin",
      "/admin/settings",
      "/manage/abc/judge",
      "/dashboard",
      "/offline",
      "/h/campus-night-hunt/cp/FNT7Q2",
      "/h/campus-night-hunt/cp",
    ]) {
      expect(keepsSavedCopy(path)).toBe(false);
    }
    // Only whole segments count.
    expect(keepsSavedCopy("/administrators")).toBe(true);
    expect(keepsSavedCopy("/h/campus-night-hunt/cpx")).toBe(true);
  });
});

describe("freshPageVerdict", () => {
  test("saves normal pages", () => {
    expect(freshPageVerdict(ok, html("<main>Tasks</main>"))).toBe("save");
  });

  test("forgets pages that streamed notFound() or redirect()", () => {
    const notFound = html('<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template>');
    const redirected = html('<template data-dgst="NEXT_REDIRECT;replace;/h/campus-night-hunt;307;"></template>');
    expect(freshPageVerdict(ok, notFound)).toBe("forget");
    expect(freshPageVerdict(ok, redirected)).toBe("forget");
  });

  test("keeps the old copy after a streamed server error", () => {
    expect(freshPageVerdict(ok, html('<template data-dgst="3924818722"></template>'))).toBe("skip");
  });

  test("forgets pages that are gone or redirect, skips other failures", () => {
    expect(freshPageVerdict({ status: 0, type: "opaqueredirect", contentType: null }, null)).toBe("forget");
    expect(freshPageVerdict({ ...ok, status: 404 }, null)).toBe("forget");
    expect(freshPageVerdict({ ...ok, status: 403 }, null)).toBe("forget");
    expect(freshPageVerdict({ ...ok, status: 500 }, null)).toBe("skip");
    expect(freshPageVerdict({ ...ok, status: 502 }, null)).toBe("skip");
  });

  test("skips responses that aren't pages", () => {
    expect(freshPageVerdict({ ...ok, contentType: "image/webp" }, null)).toBe("skip");
    expect(freshPageVerdict({ ...ok, type: "cors" }, html(""))).toBe("skip");
  });

  test("user text can't pass for a digest", () => {
    // React escapes "<" in text and in inline flight data, so only its own markup matches.
    expect(streamedDigest(html("&lt;template data-dgst=&quot;NEXT_REDIRECT&quot;"))).toBeNull();
    expect(streamedDigest(html('<script>self.__next_f.push([1,"\\u003ctemplate data-dgst=x"])</script>'))).toBeNull();
  });
});

describe("pageTitle", () => {
  test("reads and decodes the title", () => {
    expect(pageTitle(html(""))).toBe("Tasks – Campus Night Hunt");
    expect(pageTitle("<title>Fish &amp; chips &#x27;n&#x27; &quot;more&quot; &lt;3</title>")).toBe(
      `Fish & chips 'n' "more" <3`,
    );
    expect(pageTitle("<title>Caf&#233; hunt</title>")).toBe("Café hunt");
    expect(pageTitle("<p>No title</p>")).toBeNull();
    expect(pageTitle("<title> </title>")).toBeNull();
  });
});

describe("withHtmlAttribute", () => {
  test("adds the attribute to the html element only", () => {
    const out = withHtmlAttribute(html("<p>html</p>"), "data-saved-copy", "2026-09-28T12:03:00.000Z");
    expect(out).toStartWith('<!DOCTYPE html><html data-saved-copy="2026-09-28T12:03:00.000Z" lang="en"');
    expect(out).toContain("<p>html</p>");
    expect(withHtmlAttribute("<html>", "data-x", "a")).toBe('<html data-x="a">');
  });

  test("escapes the value", () => {
    expect(withHtmlAttribute("<html>", "data-x", `"><script>`)).toBe('<html data-x="&#34;&#62;&#60;script&#62;">');
  });
});

describe("mediaBucket", () => {
  test("public images and fonts are always kept", () => {
    expect(mediaBucket("/terrain/BAJ60utR1UwEI1c3", "/manage/abc")).toBe("media");
    expect(mediaBucket("/icons/icon-192.png", null)).toBe("media");
  });

  test("photos go where the page that shows them says", () => {
    expect(mediaBucket("/files/f1/display", "/h/campus-night-hunt/tasks/t1")).toBe("media");
    expect(mediaBucket("/files/f1/thumb", "/h/campus-night-hunt/team")).toBe("media");
    expect(mediaBucket("/files/f1/thumb", "/h/campus-night-hunt/gallery")).toBe("gallery");
    expect(mediaBucket("/files/f1/display", "/h/campus-night-hunt/screen")).toBe("gallery");
  });

  test("photos on staff pages, or from no page, aren't kept", () => {
    expect(mediaBucket("/files/f1/display", "/manage/abc/judge")).toBeNull();
    expect(mediaBucket("/files/f1/thumb", "/dashboard")).toBeNull();
    expect(mediaBucket("/files/f1/thumb", null)).toBeNull();
  });
});

describe("belongsToHunt", () => {
  test("covers the hunt's pages and the home page", () => {
    expect(belongsToHunt("/h/night", "night")).toBe(true);
    expect(belongsToHunt("/h/night/team", "night")).toBe(true);
    expect(belongsToHunt("/", "night")).toBe(true);
    expect(belongsToHunt("/h/night-owls/team", "night")).toBe(false);
    expect(belongsToHunt("/h/other", "night")).toBe(false);
  });
});

describe("pickWindow", () => {
  const target = new URL("https://hunt.example/h/night/tasks/t2");
  const win = (id: string, path: string, extra: Partial<WindowInfo> = {}): WindowInfo => ({
    id,
    url: `https://hunt.example${path}`,
    visible: false,
    focused: false,
    controlled: true,
    ...extra,
  });

  test("appArea", () => {
    expect(appArea("/h/night/tasks/t1")).toBe("/h/night");
    expect(appArea("/manage/abc/judge")).toBe("/manage/abc");
    expect(appArea("/dashboard/new")).toBe("/dashboard");
    expect(appArea("/")).toBe("/");
  });

  test("a window already on the page just comes forward, whatever its query", () => {
    const windows = [win("a", "/h/night"), win("b", "/h/night/tasks/t2?welcome=1")];
    expect(pickWindow(windows, target)).toEqual({ id: "b", open: false });
  });

  test("prefers a window on the same hunt, then any visible one", () => {
    const windows = [win("staff", "/manage/abc/judge", { visible: true }), win("player", "/h/night/team")];
    expect(pickWindow(windows, target)).toEqual({ id: "player", open: true });
    expect(pickWindow([win("staff", "/manage/abc/judge", { visible: true })], target)).toEqual({
      id: "staff",
      open: true,
    });
  });

  test("among equals, a controlled and focused window wins", () => {
    const windows = [
      win("uncontrolled", "/h/night", { controlled: false, focused: true, visible: true }),
      win("hidden", "/h/night/team"),
      win("visible", "/h/night/updates", { visible: true, focused: true }),
    ];
    expect(pickWindow(windows, target)).toEqual({ id: "visible", open: true });
  });

  test("never takes over the big screen, a hidden window elsewhere or another site", () => {
    expect(pickWindow([win("screen", "/h/night/screen", { visible: true })], target)).toBeNull();
    expect(pickWindow([win("other", "/dashboard")], target)).toBeNull();
    expect(pickWindow([{ ...win("x", "/"), url: "https://elsewhere.example/h/night/tasks/t2" }], target)).toBeNull();
    expect(pickWindow([], target)).toBeNull();
  });
});
