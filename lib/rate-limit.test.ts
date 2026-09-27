import { describe, expect, mock, test } from "bun:test";

// The module is server-only; outside Next's server bundle the marker package throws.
mock.module("server-only", () => ({}));
const { pickClientIp, rateLimit } = await import("./rate-limit");

describe("pickClientIp", () => {
  test("uses the entry our proxy wrote, not what the client sent", () => {
    expect(pickClientIp("198.51.100.7")).toBe("198.51.100.7");
    // nginx $proxy_add_x_forwarded_for, Cloudflare, load balancers: the client's claim comes first.
    expect(pickClientIp("203.0.113.9, 198.51.100.7")).toBe("198.51.100.7");
    expect(pickClientIp("1.1.1.1, 2.2.2.2, 198.51.100.7")).toBe("198.51.100.7");
  });

  test("counts trusted hops from the right", () => {
    // Client → CDN → Caddy: the CDN wrote the client, Caddy appended the CDN.
    expect(pickClientIp("203.0.113.9, 198.51.100.7, 192.0.2.1", 2)).toBe("198.51.100.7");
    expect(pickClientIp("198.51.100.7", 2)).toBe("198.51.100.7");
  });

  test("normalizes ports, mapped IPv4 and IPv6 blocks", () => {
    expect(pickClientIp("198.51.100.7:51234")).toBe("198.51.100.7");
    expect(pickClientIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(pickClientIp("2001:db8:0:12::1")).toBe("2001:db8:0:12::/64");
    expect(pickClientIp("[2001:DB8:0:12:aaaa:bbbb:cccc:dddd]:443")).toBe("2001:db8:0:12::/64");
    expect(pickClientIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  test("an empty or missing header is one shared bucket", () => {
    expect(pickClientIp(null)).toBe("unknown");
    expect(pickClientIp(" , ")).toBe("unknown");
  });

  test("rotating the client-sent part no longer escapes a limit", () => {
    const key = (i: number) => `test-join:${pickClientIp(`203.0.113.${i}, 198.51.100.200`)}`;
    const results = Array.from({ length: 12 }, (_, i) => rateLimit(key(i), 10, 60_000).ok);
    expect(results.filter((ok) => !ok)).toHaveLength(2);
  });
});
