/** How long a reachability check may take before it counts as "no answer". */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Whether the server can be reached right now: a HEAD request for
 * /robots.txt, which is tiny and which the service worker never answers from
 * its caches (it only handles GETs). Client-only; never throws.
 */
export async function serverAnswers(): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("/robots.txt", { method: "HEAD", cache: "no-store", signal: abort.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
