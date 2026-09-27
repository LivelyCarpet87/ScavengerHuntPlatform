import type { Metadata } from "next";
import type { ReactNode } from "react";
import { type InviteLinkRow, InviteLinks } from "@/components/admin/invite-links";
import { SignupModeForm } from "@/components/admin/signup-mode-form";
import { requireAdmin } from "@/lib/auth/access";
import { serverConfig } from "@/lib/platform/admin";
import { invitePath, listPlatformInvites } from "@/lib/platform/invites";
import { getSignupMode } from "@/lib/platform/settings";
import { baseUrl } from "@/lib/url";

export const metadata: Metadata = { title: "Settings" };

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 border-t border-line py-8 first:border-t-0 first:pt-0 md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 className="font-cond text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-ink-2">{description}</p>
      </div>
      <div className="mt-5 min-w-0 md:mt-0">{children}</div>
    </section>
  );
}

function ConfigRow({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0">
        <span className="font-medium break-words">{value}</span>
        {hint ? <p className="mt-0.5 text-sm text-ink-2">{hint}</p> : null}
      </dd>
    </div>
  );
}

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [mode, invites, origin] = await Promise.all([getSignupMode(), listPlatformInvites(), baseUrl()]);
  const config = serverConfig();
  const rows: InviteLinkRow[] = invites.map((i) => ({
    id: i.id,
    url: `${origin}${invitePath(i.id)}`,
    status: i.status,
    creatorName: i.creatorName,
    createdAt: i.createdAt.getTime(),
    expiresAt: i.expiresAt?.getTime() ?? null,
    uses: i.uses,
    maxUses: i.maxUses,
  }));

  return (
    <div>
      <Section
        title="Organizer sign-up"
        description="Who can create an account to run hunts. Players never need an account, whatever you choose."
      >
        <SignupModeForm mode={mode} />
      </Section>

      <Section
        id="invites"
        title="Invite links"
        description="Each link lets someone create an organizer account, even while sign-up is invite-only."
      >
        <InviteLinks invites={rows} serverNow={Date.now()} />
      </Section>

      <Section
        title="Server"
        description="What this server is running with. Change these with environment variables and restart."
      >
        <dl className="divide-y divide-line">
          <ConfigRow
            label="Site address"
            value={config.appUrl ?? "Not set"}
            hint={
              config.appUrl
                ? "Used in QR codes, share links and notifications (APP_URL)."
                : "Links and QR codes use whatever address people opened. Set APP_URL so posters always point at the right place."
            }
          />
          <ConfigRow
            label="Name"
            value={config.appName}
            hint="Shown in the header and on installed phones (APP_NAME)."
          />
          <ConfigRow
            label="Database"
            value={config.remoteDatabase ? "Remote libSQL database" : "SQLite file in the data folder"}
            hint={
              config.remoteDatabase ? "DATABASE_URL" : "Back up the data folder to keep hunts, accounts and photos."
            }
          />
          <ConfigRow
            label="Data folder"
            value={config.dataDir}
            hint="Uploaded photos and videos live here (DATA_DIR)."
          />
          <ConfigRow
            label="Largest upload"
            value={`${config.maxUploadMb} MB`}
            hint="Per photo or video (MAX_UPLOAD_MB)."
          />
          <ConfigRow
            label="Secure cookies"
            value={config.cookieSecure ? "Always" : "Automatic"}
            hint={
              config.cookieSecure
                ? "Sign-in cookies only travel over HTTPS."
                : "Cookies are marked secure when a request arrives over HTTPS through your proxy. Set APP_URL to an https:// address to always require it."
            }
          />
          <ConfigRow
            label="Push notifications"
            value={config.vapidFromEnv ? "Keys from the environment" : "Keys generated on this server"}
            hint={
              config.vapidSubjectIsDefault
                ? "Set VAPID_SUBJECT to a real contact address (mailto: or https:) so push services can reach you about delivery problems."
                : `Contact: ${config.vapidSubject}`
            }
          />
        </dl>
      </Section>
    </div>
  );
}
