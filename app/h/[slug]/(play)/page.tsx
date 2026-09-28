import { HuntHome } from "@/components/home/hunt-home";
import { HuntIntro } from "@/components/join/hunt-intro";
import { getPlayerHunt } from "@/lib/auth/access";

/**
 * /h/[slug] — the hunt's front page. Visitors see the hunt and how to join;
 * team members get their dashboard.
 */
export default async function HuntPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { hunt, me, staffRole } = await getPlayerHunt(slug);
  if (!me) return <HuntIntro hunt={hunt} staffRole={staffRole} searchParams={query} />;
  return <HuntHome hunt={hunt} me={me} staffRole={staffRole} welcome={query.welcome === "1"} />;
}
