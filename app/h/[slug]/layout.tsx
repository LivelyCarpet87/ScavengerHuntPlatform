import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getHuntBySlug } from "@/lib/hunts";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunt = await getHuntBySlug(slug);
  if (!hunt || hunt.status === "draft") return {};
  return {
    title: hunt.name,
    description: hunt.tagline ?? undefined,
    openGraph: { title: hunt.name, description: hunt.tagline ?? undefined },
  };
}

export default function HuntLayout({ children }: { children: ReactNode }) {
  return children;
}
