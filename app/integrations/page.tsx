import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import HubspotSystemCard from "./HubspotSystemCard";
import GoogleMeetCard from "./GoogleMeetCard";
import { LogoUploader } from "@/components/ui/LogoUploader";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface HubspotStatus {
  connected: boolean;
  hubName?: string | null;
  hubspotPortalId?: string | null;
  updatedAt?: string;
}

interface GoogleStatus {
  connected: boolean;
  adminEmail: string | null;
}

// ── Helper: header Cookie forwarding TODAS las cookies del request actual ────
// Pasa las cookies de sesión Supabase Auth (sb-*) al fetch interno para que el
// middleware deje pasar la request.
async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

// ── Fetch del estado de Google Meet (server-side) ────────────────────────────

async function getGoogleStatus(): Promise<GoogleStatus> {
  try {
    const res = await fetch(
      `${process.env.APP_URL}/api/integrations/google/status`,
      {
        headers: { Cookie: await getCookieHeader() },
        cache: "no-store",
      }
    );

    if (!res.ok) return { connected: false, adminEmail: null };
    return res.json();
  } catch {
    return { connected: false, adminEmail: null };
  }
}

// ── Fetch del estado de HubSpot del sistema (server-side) ─────────────────────

async function getHubspotSystemStatus(): Promise<HubspotStatus> {
  const account = await prisma.hubspotAccount.findFirst({
    where: { isSystem: true },
    select: { hubName: true, hubspotPortalId: true, updatedAt: true },
  });

  if (!account) return { connected: false };

  return {
    connected: true,
    hubName: account.hubName,
    hubspotPortalId: account.hubspotPortalId,
    updatedAt: account.updatedAt.toISOString(),
  };
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ hs_connected?: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { hs_connected } = await searchParams;
  const [hubspot, google, googleMeetCount, systemCfg] = await Promise.all([
    getHubspotSystemStatus(),
    getGoogleStatus(),
    prisma.firefliesSession.count({ where: { source: "google_meet" } }),
    prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { smarteamLogoUrl: true, hubspotLogoUrl: true, insiderLogoUrl: true },
    }),
  ]);
  const smarteamLogoUrl = systemCfg?.smarteamLogoUrl ?? null;
  const hubspotLogoUrl = systemCfg?.hubspotLogoUrl ?? null;
  const insiderLogoUrl = systemCfg?.insiderLogoUrl ?? null;

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-fg mb-1">Configuración general</h1>
          <p className="text-sm text-fg-muted">
            Marca e integraciones de Nexus — configuración global, compartida por todos los clientes.
          </p>
        </div>

        {/* Grid de integraciones */}
        <div className="max-w-2xl grid grid-cols-1 gap-4">
          {/* HubSpot sistema — siempre primero */}
          <HubspotSystemCard
            status={hubspot}
            justConnected={hs_connected === "1"}
          />

          {/* Google Meet / Gemini — fuente única de sesiones */}
          <GoogleMeetCard
            connected={google.connected}
            adminEmail={google.adminEmail}
            sessionCount={googleMeetCount}
          />

          {/* Logo de Smarteam — config global de marca (páginas externas) */}
          <section className="rounded-xl bg-surface border border-line p-5">
            <h2 className="text-sm font-semibold text-fg mb-1">Logo de Smarteam</h2>
            <p className="text-xs text-fg-muted mb-4">
              Se muestra en el encabezado y pie de las páginas externas del cliente (kickoff y cronograma) y en la cabecera de los business cases. Si no subís uno, se usa el logo por defecto.
            </p>
            <LogoUploader
              currentUrl={smarteamLogoUrl}
              endpoint="/api/system/smarteam-logo"
              label="Logo de Smarteam"
              hint="PNG, JPG, WebP o SVG · máx 4MB."
            />
          </section>

          {/* Logos de plataforma (HubSpot / Insider One) — brand-row de BCs y kickoffs */}
          <section className="rounded-xl bg-surface border border-line p-5">
            <h2 className="text-sm font-semibold text-fg mb-1">Logos de plataforma</h2>
            <p className="text-xs text-fg-muted mb-4">
              Se muestran junto al logo del cliente en los business cases y kickoffs. Sin logo,
              el business case muestra el nombre como texto.
            </p>
            <div className="space-y-4">
              <div className="rounded-lg border border-line p-4">
                <p className="text-xs font-semibold text-fg mb-3">Logo de HubSpot</p>
                <LogoUploader
                  currentUrl={hubspotLogoUrl}
                  endpoint="/api/system/brand-logos/hubspot"
                  label="Logo de HubSpot"
                  hint="PNG, JPG, WebP o SVG · máx 4MB."
                />
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="text-xs font-semibold text-fg mb-3">Logo de Insider One</p>
                <LogoUploader
                  currentUrl={insiderLogoUrl}
                  endpoint="/api/system/brand-logos/insider"
                  label="Logo de Insider One"
                  hint="PNG, JPG, WebP o SVG · máx 4MB."
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
