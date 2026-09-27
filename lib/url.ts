import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** Public origin for building share links and QR codes, e.g. "https://hunt.example.com". */
export async function baseUrl(): Promise<string> {
  if (env.appUrl) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto.split(",")[0].trim()}://${host}`;
}

export async function absoluteUrl(path: string): Promise<string> {
  return new URL(path, await baseUrl()).toString();
}

/** Links players use. Keep these in one place so QR posters and share sheets agree. */
export const links = {
  hunt: (slug: string) => `/h/${slug}`,
  join: (joinCode: string) => `/join/${joinCode}`,
  teamInvite: (slug: string, teamCode: string) => `/h/${slug}/join/${teamCode}`,
  checkpoint: (slug: string, code: string) => `/h/${slug}/cp/${code}`,
  task: (slug: string, taskId: string) => `/h/${slug}/tasks/${taskId}`,
  scoreboard: (slug: string) => `/h/${slug}/scoreboard`,
  screen: (slug: string) => `/h/${slug}/screen`,
  manage: (huntId: string) => `/manage/${huntId}`,
};
