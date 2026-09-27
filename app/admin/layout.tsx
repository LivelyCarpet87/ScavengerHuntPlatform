import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountNav } from "@/components/auth/account-nav";
import { SiteHeader } from "@/components/shells/site-header";
import { PageHeader } from "@/components/ui/misc";
import { NavTabs } from "@/components/ui/nav-tabs";
import { requireAdmin } from "@/lib/auth/access";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: { default: "Platform admin", template: `%s – Admin – ${env.appName}` } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader>
        <AccountNav user={user} hide={["admin"]} />
      </SiteHeader>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 md:pt-10">
        <PageHeader
          title="Platform admin"
          description={`People, hunts and sign-up settings for everyone on ${env.appName}.`}
        />
        <NavTabs
          className="mt-6"
          tabs={[
            { href: "/admin", label: "Users", exact: true },
            { href: "/admin/hunts", label: "Hunts" },
            { href: "/admin/settings", label: "Settings" },
          ]}
        />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
