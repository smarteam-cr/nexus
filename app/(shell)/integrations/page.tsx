import { requireConsultantSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { leerEstadoDeJobs } from "@/lib/jobs/estado";
import { allJobs } from "@/lib/jobs/defs";
import HubspotSystemCard from "./HubspotSystemCard";
import GoogleMeetCard from "./GoogleMeetCard";
import ClaudeCard, { type GastoDeClaude } from "./ClaudeCard";
import OdooCard, { type EstadoDeOdoo } from "./OdooCard";
import JobsSemaforo from "./JobsSemaforo";
import { gastoResumidoDeClaude } from "@/lib/ai/gasto-en-integraciones";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
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

  /* ⛔ EL GASTO ES PLATA. `/integrations/gasto-ia` está gateada a los roles de costos y esta página
     la ve cualquier consultor interno, así que el número se CONSULTA solo si el rol lo permite:
     quien no lo tiene recibe `null`, no un dato escondido con CSS. Mismo criterio que la
     pantalla original («ni un byte de gasto entra al payload de un no autorizado»). */
  const ctx = await requireInternalUser().catch(() => null);

  /**
   * ⛔ LA MISMA LLAVE QUE SU ÍTEM DEL MENÚ, y hasta hoy no la tenía.
   *
   * El ítem del nav exige `configuracion.read` (lo tienen CSL, Marketing y Super Admin), pero esta
   * página entraba con la sola sesión de consultor: quien supiera la dirección entraba igual,
   * aunque el menú no se la mostrara. Los ESCRITOS nunca estuvieron abiertos —subir los logos e
   * importar de HubSpot exigen `configuracion.manage`—, así que lo que estaba de más era la vista,
   * no el poder.
   *
   * ⭐ Y lo que lo vuelve un arreglo y no una prolijidad: `HubspotSystemCard` ya está escrita
   * afirmando que «la página entra con `configuracion.read`». Era FALSO. Una premisa equivocada
   * escrita en el código es peor que una puerta abierta: la puerta se ve, la premisa se hereda.
   *
   * ⚠ Va ANTES de las consultas, igual que en `/integrations/odoo` y `/integrations/gasto-ia`: si
   * la lectura corriera primero, el dato ya salió de la base aunque después se redirija.
   */
  if (!ctx || !(await can(ctx.teamMember, "configuracion", "read"))) redirect("/clients");

  const puedeVerGasto = isCostosRole(ctx?.role);
  const resumen = puedeVerGasto ? await gastoResumidoDeClaude() : null;
  const gastoDeClaude: GastoDeClaude | null = resumen;
  /* El medidor puede no existir todavía (su migración es aditiva y puede llegar después del
     deploy). Solo se puede afirmar que falta cuando SÍ se lo fue a buscar. */
  const medidorListo = !puedeVerGasto || resumen !== null;
  /* Ídem Odoo: el detalle es `isCostosRole` (SOLO SUPER_ADMIN) con redirect ANTES de la query, así
     que el estado se consulta solo si el rol lo permite. Ver `OdooCard`. */
  const estadoDeOdoo: EstadoDeOdoo | null = puedeVerGasto
    ? await (async () => {
        const [corridas, facturas] = await Promise.all([
          prisma.syncOdooCorrida.findMany({
            orderBy: { iniciadaEn: "desc" },
            take: 20,
            select: { terminadaEn: true, ok: true },
          }),
          prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
        ]);
        const hayPassword = !!process.env.ODOO_PASSWORD;
        return {
          hayPassword,
          syncEncendido: hayPassword && process.env.ODOO_SYNC_ENABLED !== "0",
          facturas,
          ultimaCorrida:
            corridas[0]?.terminadaEn?.toISOString().slice(0, 10) ?? null,
          corridasConProblema: corridas.filter((c) => c.terminadaEn === null || !c.ok).length,
        };
      })()
    : null;

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
  /* B-03: el semáforo de los jobs del server. Lee CronJobState.lastResult bajo la clave de cada
     job del registry (lib/jobs/defs.ts); lo escribe el scheduler en cada corrida. */
  const jobs = await leerEstadoDeJobs(allJobs().map((j) => j.key));

  return (
    <div className={`flex-1 overflow-y-auto ${SHELL_DEFAULT}`}>
      <PageHeader
        title="Integraciones"
        description="Lo que Nexus conecta con el mundo, y la marca con la que sale. Configuración global, compartida por todos los clientes."
      />

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

        {/* Claude — el motor de IA. Es la integración MÁS usada del producto (~30 caminos) y
            era la única que no aparecía acá; su gasto vivía en una pantalla que hay que saber
            que existe. */}
        <ClaudeCard gasto={gastoDeClaude} medidorListo={medidorListo} />

        {/* Odoo — el ERP del que salen las facturas de cobranza. Su pantalla se mudó acá desde
            /settings, y sin esta tarjeta se quedaba sin ninguna entrada propia. */}
        <OdooCard estado={estadoDeOdoo} />

        {/* Jobs del server — el semáforo (B-03). Hasta hoy un job que fallaba era una línea en
            docker logs que nadie leía; acá se ve cómo terminó la última corrida de cada uno. */}
        <JobsSemaforo jobs={jobs} />

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
            hint="PNG, JPG, WebP o SVG · máx 300 KB."
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
                hint="PNG, JPG, WebP o SVG · máx 300 KB."
              />
            </div>
            <div className="rounded-lg border border-line p-4">
              <p className="text-xs font-semibold text-fg mb-3">Logo de Insider One</p>
              <LogoUploader
                currentUrl={insiderLogoUrl}
                endpoint="/api/system/brand-logos/insider"
                label="Logo de Insider One"
                hint="PNG, JPG, WebP o SVG · máx 300 KB."
              />
            </div>
          </div>
        </section>
      </div>

      {/* «Acerca del Workspace», que vivía en /settings. Se mudó acá porque es información del
          SISTEMA —qué es Nexus y con qué versión corre—, no una preferencia de quien mira. */}
      <div className="max-w-2xl mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span>Workspace de Consultoría IA</span>
        <span aria-hidden="true">·</span>
        <span>Versión 0.2.0</span>
        <span aria-hidden="true">·</span>
        <span>Powered by Claude AI</span>
      </div>
    </div>
  );
}
