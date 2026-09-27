import { redirect } from "next/navigation";

/** The task list lives on the hunt home; /h/[slug]/tasks just points there. */
export default async function TasksIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/h/${slug}`);
}
