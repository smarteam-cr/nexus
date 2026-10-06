import { requireConsultantSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { leerEstadoDeJobs } from "@/lib/jobs/estado";
import { allJobs } from "@/lib/jobs/defs";
import { motivoApagado, motivoSchedulerApagado } from "@/lib/jobs/requisitos";
import HubspotSystemCard from "./HubspotSystemCard";
import GoogleMeetCard from "./GoogleMeetCard";
import ClaudeCard, { type GastoDeClaude } from "./ClaudeCard";
import OdooCard, { type EstadoDeOdoo } from "./OdooCard";
import MercuryCard, { type EstadoDeMercury } from "./MercuryCard";
import TipoDeCambioCard from "./TipoDeCambioCard";
import { estadoDelTipoDeCambio } from "@/lib/finanzas/tipo-cambio-server";
import { crDateParts } from "@/lib/jobs/time";
import { estadoDeLaCopia, type EstadoDeLaCopia } from "./estado-de-la-copia";
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
        return {
          motivoApagado: motivoApagado("odoo-espejo-daily", process.env),
          facturas,
          ultimaCorrida:
            corridas[0]?.terminadaEn?.toISOString().slice(0, 10) ?? null,
          corridasConProblema: corridas.filter((c) => c.terminadaEn === null || !c.ok).length,
        };
      })()
    : null;

  /* Mercury, con el MISMO gate que Odoo y por el mismo motivo: su detalle es plata y
     `/finanzas/integraciones` corta por rol de costos. El emparejado se cuenta aparte del total
     porque es lo que decide si la conexión sirve de algo — medido el 2026-10-05: 0 de 30. */
  const estadoDeMercury: EstadoDeMercury | null = puedeVerGasto
    ? await (async () => {
        const [clientes, emparejados, facturas, corrida] = await Promise.all([
          prisma.clienteMercury.count(),
          prisma.clienteMercury.count({ where: { cuentaId: { not: null } } }),
          prisma.facturaMercury.count(),
          prisma.syncMercuryCorrida.findFirst({
            orderBy: { iniciadaEn: "desc" },
            // `ok` y `error`: sin ellos la tarjeta decía «Responde» en verde aunque la última copia hubiera fallado.
            select: { terminadaEn: true, ok: true, error: true },
          }),
        ]);
        /* Falló = terminó y no quedó bien. Una corrida sin `terminadaEn` está copiando AHORA (su `ok` vale false
           hasta que termina): esa todavía no es un fallo. */
        const ultimaFallo = !!corrida?.terminadaEn && !corrida.ok;
        return {
          motivoApagado: motivoApagado("mercury-espejo-daily", process.env),
          clientes,
          emparejados,
          facturas,
          ultimaCorrida: corrida?.terminadaEn?.toISOString().slice(0, 10) ?? null,
          ultimaFallo,
          errorDeLaUltima: ultimaFallo ? (corrida?.error ?? null) : null,
        };
      })()
    : null;

  /* ⭐ Quien NO ve costos ve igual SI LA COPIA ANDA (decisión de Elías, 2026-10-05): apagada con su motivo, al día, o
     falló la última con su fecha. Hasta esa fecha sus dos tarjetas decían «Conectado» fijo. ⛔ Solo eso: de la última
     corrida que terminó se lee cuándo y si salió bien — ni conteos, ni el texto del error (puede traer datos de
     cuentas). Ver `estado-de-la-copia.ts`. */
  const [copiaDeOdoo, copiaDeMercury]: [EstadoDeLaCopia | null, EstadoDeLaCopia | null] = puedeVerGasto
    ? [null, null]
    : await Promise.all([
        prisma.syncOdooCorrida
          .findFirst({ where: { terminadaEn: { not: null } }, orderBy: { iniciadaEn: "desc" }, select: { terminadaEn: true, ok: true } })
          .then((c) => estadoDeLaCopia(motivoApagado("odoo-espejo-daily", process.env), c)),
        prisma.syncMercuryCorrida
          .findFirst({ where: { terminadaEn: { not: null } }, orderBy: { iniciadaEn: "desc" }, select: { terminadaEn: true, ok: true } })
          .then((c) => estadoDeLaCopia(motivoApagado("mercury-espejo-daily", process.env), c)),
      ]);

  const [hubspot, google, googleMeetCount, systemCfg, tipoDeCambio, puedeVerHistoricoDelTC] = await Promise.all([
    getHubspotSystemStatus(),
    getGoogleStatus(),
    prisma.firefliesSession.count({ where: { source: "google_meet" } }),
    prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { smarteamLogoUrl: true, hubspotLogoUrl: true, insiderLogoUrl: true },
    }),
    // El tipo de cambio del BCCR (2026-10-06): sin gate de costos, una tasa publicada no es plata de nadie.
    estadoDelTipoDeCambio(),
    can(ctx.teamMember, "cobranza", "read"),
  ]);
  const smarteamLogoUrl = systemCfg?.smarteamLogoUrl ?? null;
  const hubspotLogoUrl = systemCfg?.hubspotLogoUrl ?? null;
  const insiderLogoUrl = systemCfg?.insiderLogoUrl ?? null;
  /* B-03: el semáforo de los jobs del server. Lee CronJobState.lastResult bajo la clave de cada
     job del registry (lib/jobs/defs.ts); lo escribe el scheduler en cada corrida. El motivo de
     apagado sale de la misma regla que usa `shouldRun`, leída contra el entorno de ESTE servidor. */
  const jobs = (await leerEstadoDeJobs(allJobs().map((j) => j.key))).map((estado) => ({
    ...estado,
    motivoApagado: motivoApagado(estado.key, process.env),
  }));
  const schedulerApagado = motivoSchedulerApagado(process.env);

  return (
    <div className={`flex-1 overflow-y-auto ${SHELL_DEFAULT}`}>
      <PageHeader
        title="Integraciones"
        description="Lo que Nexus conecta con el mundo, y la marca con la que sale. Configuración global, compartida por todos los clientes."
      />

      {/* ── LAS CONEXIONES ───────────────────────────────────────────────────
          Rediseño 2026-10-05: las cinco van juntas y con el MISMO esqueleto
          (`TarjetaDeConexion`). Antes vivían en una columna donde además se mezclaban con el
          semáforo del servidor y con los cargadores de logo, que no son una conexión. */}
      <section className="max-w-5xl space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          Conexiones
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <OdooCard estado={estadoDeOdoo} copia={copiaDeOdoo} />

          {/* Mercury — el banco. La última en tener tarjeta propia, y la que obligó a que el
              estado de una conexión no sea un booleano: responde, copia todo y no sirve para
              nada mientras sus clientes no estén emparejados. */}
          <MercuryCard estado={estadoDeMercury} copia={copiaDeMercury} />

          {/* Tipo de cambio — la tasa de cada día del Banco Central, con la que Nexus pasa colones a dólares
              (2026-10-05). Su job corría sin tarjeta: si un día no llegaba la tasa, nadie lo veía. */}
          <TipoDeCambioCard
            estado={tipoDeCambio}
            ultimaCorrida={jobs.find((j) => j.key === "tipo-cambio-daily")?.resultado ?? null}
            motivoApagado={motivoApagado("tipo-cambio-daily", process.env)}
            hoyISO={crDateParts(new Date()).dateKey}
            puedeVerHistorico={puedeVerHistoricoDelTC}
          />
        </div>
      </section>

      {/* ── EL RELOJ DEL SERVIDOR ────────────────────────────────────────────
          No es una conexión: es si las corridas automáticas están pasando. Sección propia. */}
      <section className="max-w-5xl space-y-3 mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          El reloj del servidor
        </h2>
        <JobsSemaforo jobs={jobs} schedulerApagado={schedulerApagado} />
      </section>

      {/* ── LA MARCA ─────────────────────────────────────────────────────────
          Los tres logos salen en los documentos del CLIENTE. Tampoco son una conexión, y
          pesaban lo mismo que HubSpot por estar en la misma columna. */}
      <section className="max-w-5xl space-y-3 mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          Marca de los documentos del cliente
        </h2>
        <div className="grid grid-cols-1 gap-4">
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
      </section>

      {/* «Acerca del Workspace», que vivía en /settings. Se mudó acá porque es información del
          SISTEMA —qué es Nexus y con qué versión corre—, no una preferencia de quien mira. */}
      <div className="max-w-5xl mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span>Workspace de Consultoría IA</span>
        <span aria-hidden="true">·</span>
        <span>Versión 0.2.0</span>
        <span aria-hidden="true">·</span>
        <span>Powered by Claude AI</span>
      </div>
    </div>
  );
}
