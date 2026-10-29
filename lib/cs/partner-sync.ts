/**
 * lib/cs/partner-sync.ts
 *
 * Sync del objeto Partner Clients de HubSpot → ClientPartnerSnapshot (+ creación
 * de Clients para los no matcheados, decisión de producto: TODO el book de partner
 * vive en Nexus).
 *
 * REGLAS DE ROBUSTEZ (post-revisión adversaria):
 *   - LOCK EN DB (CronJobState "cs-partner-sync-lock", compare-and-set con timeout
 *     de 15 min): el cron, el endpoint manual y el script comparten UNA corrida a
 *     la vez ENTRE LAS DOS MÁQUINAS que comparten la DB.
 *   - EL VÍNCULO EXISTENTE ES LA FUENTE #0 del match: un snapshot ya vinculado
 *     CONSERVA su Client. Nunca se degrada un vínculo a null sin reemplazo.
 *     ÚNICA excepción (2026-10-07, rehecha sobre el sync de hoy el 2026-10-29): un cliente
 *     vinculado a un registro INACTIVO pasa al registro ACTIVO, suelto, que coincide con él por
 *     company o dominio — con evidencia positiva, un solo candidato y en una transacción que
 *     suelta el viejo y vincula el nuevo (lib/cs/partner-cambio-de-registro.ts). Dos registros
 *     activos para el mismo cliente no se eligen: se reportan.
 *   - Si el batch de asociaciones falló (associationsOk=false), la corrida es
 *     "partial": actualiza propiedades/escalares pero NO re-matchea ni crea Clients.
 *   - Los índices de matching EXCLUYEN prospectos (un snapshot vinculado a un
 *     prospecto sería invisible para todo el módulo CS).
 *   - materialKey usa stringify con keys ORDENADAS (jsonb de Postgres reordena
 *     keys — comparar contra el orden de inserción JS marcaba cambio SIEMPRE).
 *   - Reconciliación: records que ya no existen en HubSpot → snapshot desvinculado
 *     (con guarda de sanidad: solo si el fetch trajo ≥50% del total conocido).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { fetchAllPartnerClients, type PartnerClientRecord } from "@/lib/hubspot/partner-clients";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { crearOReusarFicha } from "@/lib/clients/empresa-de-hubspot";
import { columnasDePartner, semanaIso } from "@/lib/cs/partner-columnas";
import {
  activoEnHubspot,
  matchPorEvidencia,
  mensajeSinElegir,
  planearCambiosDeRegistro,
  type CambioDeRegistro,
  type MotivoSinElegir,
  type ViaDelMatch,
} from "./partner-cambio-de-registro";

/** Un cliente que pasó de su registro inactivo al activo en esta corrida. */
export interface CambioDeRegistroHecho {
  clientId: string;
  cliente: string | null;
  desde: string;
  hacia: string;
  via: ViaDelMatch;
  /** Semanas de historial de uso del registro nuevo que quedaron a nombre del cliente. */
  semanasDeHistorial: number;
}

export interface PartnerSyncResult {
  supported: boolean;
  /** true = otra corrida (esta u otra máquina) tiene el lock — no se hizo nada. */
  locked?: boolean;
  /** false = asociaciones no confiables esta corrida (solo se refrescaron datos). */
  associationsOk?: boolean;
  total: number;
  matchedByCompany: number;
  matchedByDomain: number;
  alreadyLinked: number;
  unmatched: number;
  createdClients: Array<{ name: string; domain: string | null; hubspotCompanyId: string | null }>;
  wouldCreateClients: Array<{ name: string; domain: string | null; hubspotCompanyId: string | null }>;
  briefsMarkedStale: number;
  unlinkedGone: number;
  /** Clientes que pasaron de un registro inactivo al activo (lib/cs/partner-cambio-de-registro.ts). */
  cambiosDeRegistro: CambioDeRegistroHecho[];
  /** Con `cambiarRegistros: false`: los cambios que la corrida habría hecho y no hizo. */
  cambiosPendientes: Array<CambioDeRegistro & { cliente: string | null }>;
  /** Los que tocaba pasar y no se pudo (el vínculo cambió en el medio): siguen en el registro viejo. */
  cambiosFallidos: Array<CambioDeRegistro & { cliente: string | null; motivo: string }>;
  /** Clientes con un registro activo suelto que coincide y que NO se movieron: los mira una persona. */
  cambiosSinElegir: Array<{ clientId: string; cliente: string | null; motivo: MotivoSinElegir; actual: string; candidatos: string[] }>;
  errors: string[];
}

const LOCK_KEY = "cs-partner-sync-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/** Lock cross-machine vía CronJobState (lastRunAt = "lock tomado en"). */
async function acquireSyncLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => { if ((e as { code?: string })?.code !== "P2002") throw e; });
  const claimed = await prisma.cronJobState.updateMany({
    where: {
      id: LOCK_KEY,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }],
    },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}
async function releaseSyncLock(): Promise<void> {
  await prisma.cronJobState
    .updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } })
    .catch(() => {});
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
};
const dateOrNull = (v: string | undefined): Date | null => {
  if (!v) return null;
  // HubSpot v3 devuelve ISO o epoch ms según la property.
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) && !Number.isNaN(t) ? new Date(t) : null;
};

/** stringify determinístico (keys ordenadas recursivamente) — jsonb reordena keys,
 *  así que comparar stringify de orden de inserción marcaba "cambio" siempre. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Dominio del record, normalizado: con el que se busca al cliente por `emailDomains`. */
function dominioDelRegistro(rec: PartnerClientRecord): string | null {
  return (rec.resolved.domain ?? rec.resolved.domainFallback ?? "").toLowerCase() || null;
}

/** Escalares del snapshot a partir de los campos resueltos por label. */
function buildScalars(rec: PartnerClientRecord) {
  const r = rec.resolved;
  const seat = (k: string) => intOrNull(r[`seats${k}`]);
  const seats = {
    core: { assigned: seat("CoreAssigned"), available: seat("CoreAvailable"), limit: seat("CoreLimit") },
    sales: { assigned: seat("SalesAssigned"), available: seat("SalesAvailable"), limit: seat("SalesLimit") },
    service: { assigned: seat("ServiceAssigned"), available: seat("ServiceAvailable"), limit: seat("ServiceLimit") },
  };
  const renewalsByHub = {
    marketing: dateOrNull(r.renewalMarketing)?.toISOString() ?? null,
    sales: dateOrNull(r.renewalSales)?.toISOString() ?? null,
    service: dateOrNull(r.renewalService)?.toISOString() ?? null,
    ops: dateOrNull(r.renewalOps)?.toISOString() ?? null,
  };
  const hubEditions = {
    marketing: r.editionMarketing ?? null,
    sales: r.editionSales ?? null,
    service: r.editionService ?? null,
    ops: r.editionOps ?? null,
    content: r.editionContent ?? null,
    commerce: r.editionCommerce ?? null,
  };
  return {
    domain: dominioDelRegistro(rec),
    associatedCompanyIds: rec.associatedCompanyIds,
    uusScore: numOrNull(r.uusScore),
    // Float directo: sondeado contra los 157 records (2026-07-10) — siempre número plano.
    uusTrend: numOrNull(r.uusTrend),
    activationScore: numOrNull(r.activationScore),
    toolUsageScore: numOrNull(r.toolUsageScore),
    valueMetricsScore: numOrNull(r.valueMetricsScore),
    consumptionScore: numOrNull(r.consumptionScore),
    marketingScore: numOrNull(r.marketingScore),
    salesScore: numOrNull(r.salesScore),
    serviceScore: numOrNull(r.serviceScore),
    commerceScore: numOrNull(r.commerceScore),
    seats,
    marketingContactsLimit: intOrNull(r.marketingContactsLimit),
    marketingContactsUsed: intOrNull(r.marketingContactsUsed),
    mrrTotal: numOrNull(r.mrrTotal),
    mrrManaged: numOrNull(r.mrrManaged),
    mrrUpForRenewal: numOrNull(r.mrrUpForRenewal),
    nextRenewalAt: dateOrNull(r.nextRenewalAt),
    renewalsByHub,
    managedExpiryAt: dateOrNull(r.managedExpiryAt),
    cancellationHubs: r.cancellationHubs ?? null,
    revenueSignal: r.revenueSignal ?? null,
    revenueSignalDetail: r.revenueSignalDetail ?? null,
    hubEditions,
    activeProducts: r.activeProducts ?? null,
    hsCsmName: r.hsCsmName ?? null,
    hsCsmEmail: r.hsCsmEmail ?? null,
    hsGrowthName: r.hsGrowthName ?? null,
    hsGrowthEmail: r.hsGrowthEmail ?? null,
    cslImplementaciones: r.cslImplementaciones ?? null,
    country: r.country ?? null,
    portalLink: r.portalLink ?? null,
  };
}

/** Subset que define "cambio material" (dispara staleAt del brief). */
function materialKey(s: {
  uusScore: number | null; marketingScore: number | null; salesScore: number | null;
  serviceScore: number | null; seats: unknown; mrrTotal: number | null;
  mrrUpForRenewal: number | null; nextRenewalAt: Date | null; cancellationHubs: string | null;
  revenueSignal: string | null;
}): string {
  return stableStringify({
    uus: s.uusScore, mk: s.marketingScore, sl: s.salesScore, sv: s.serviceScore,
    seats: s.seats, mrr: s.mrrTotal, mrrRen: s.mrrUpForRenewal,
    ren: s.nextRenewalAt?.toISOString() ?? null, cancel: s.cancellationHubs,
    signal: s.revenueSignal,
  });
}

/** Lo que se escribe en el snapshot de un record (todo menos el vínculo). */
function datosDelSnapshot(
  rec: PartnerClientRecord,
  scalars: ReturnType<typeof buildScalars>,
  associationsOk: boolean,
  nombres: Map<string, string> | null,
) {
  // U29: lo vendido, las fechas de la relación, la comisión y el MRR por hub, a columnas.
  const columnas = columnasDePartner(rec.properties as Record<string, unknown>);
  const mrrByHub = columnas.mrrByHub ? (columnas.mrrByHub as Prisma.InputJsonValue) : Prisma.DbNull;
  return {
    fetchedAt: new Date(),
    fetchStatus: associationsOk ? "ok" : "partial",
    properties: conUltimoActivo(rec, nombres) as Prisma.InputJsonValue,
    ...scalars,
    seats: scalars.seats as Prisma.InputJsonValue,
    renewalsByHub: scalars.renewalsByHub as Prisma.InputJsonValue,
    hubEditions: scalars.hubEditions as Prisma.InputJsonValue,
    ...columnas,
    mrrByHub,
  };
}

/**
 * Pasa al cliente de su registro inactivo al activo, en UNA transacción:
 *   1. suelta el viejo, solo si todavía es del cliente (`clientId` es @unique: primero se suelta);
 *   2. vincula el nuevo, solo si sigue suelto (en la misma escritura que lo comprueba; si no existe todavía, lo crea
 *      con sus datos, y si otro lo creó entretanto, el índice único frena la creación);
 *   3. el historial semanal pasa con el registro: las filas del viejo dejan de ser del cliente y
 *      las del nuevo que no eran de nadie pasan a serlo. Así la ficha y el vigía, que lo leen por
 *      cliente, y `ultimoUsoConocido`, que lo lee por registro, ven la MISMA serie, la del portal
 *      vivo, sin mezclar dos portales en una curva;
 *   4. el resumen de la cuenta queda desactualizado (cambió todo el bloque de Partner).
 * Si 1 o 2 no se cumple (el vínculo cambió entre la lectura y la escritura), la transacción se
 * deshace entera: nada se escribe y el cliente sigue con el registro viejo. Exportada para la prueba de integración.
 */
export async function aplicarCambioDeRegistro(
  c: CambioDeRegistro,
  crear: ReturnType<typeof datosDelSnapshot>,
  ahora: Date,
): Promise<{ semanasDeHistorial: number; briefsMarcados: number }> {
  return prisma.$transaction(async (tx) => {
    const soltado = await tx.clientPartnerSnapshot.updateMany({
      where: { hubspotPartnerClientId: c.desde, clientId: c.clientId },
      data: { clientId: null },
    });
    if (soltado.count !== 1) throw new Error(`el registro ${c.desde} ya no tiene al cliente`);

    const vinculado = await tx.clientPartnerSnapshot.updateMany({
      where: { hubspotPartnerClientId: c.hacia, clientId: null },
      data: { clientId: c.clientId },
    });
    if (vinculado.count !== 1) {
      const existe = await tx.clientPartnerSnapshot.findUnique({ where: { hubspotPartnerClientId: c.hacia }, select: { id: true } });
      if (existe) throw new Error(`el registro ${c.hacia} ya tiene otro cliente`);
      await tx.clientPartnerSnapshot.create({ data: { hubspotPartnerClientId: c.hacia, clientId: c.clientId, ...crear } });
    }

    await tx.partnerUsageSnapshot.updateMany({
      where: { hubspotPartnerClientId: c.desde, clientId: c.clientId },
      data: { clientId: null },
    });
    const semanas = await tx.partnerUsageSnapshot.updateMany({
      where: { hubspotPartnerClientId: c.hacia, clientId: null },
      data: { clientId: c.clientId },
    });
    const briefs = await tx.csAccountBrief.updateMany({
      where: { clientId: c.clientId, staleAt: null },
      data: { staleAt: ahora },
    });
    return { semanasDeHistorial: semanas.count, briefsMarcados: briefs.count };
  });
}

/**
 * Records de partner que NUNCA se convierten en Client aunque no matcheen:
 * los portales internos de Smarteam y los records sin nombre real. Post-mortem
 * 2026-07-10: crearlos rompió el resolver de sesiones (dos "Smarteam" = token
 * ambiguo → el cliente Smarteam cayó de 1313 sesiones resueltas a 1). Sus
 * snapshots se sincronizan igual, solo que sin vincular (invisibles en CS).
 */
export const PARTNER_CREATE_SKIP = /^(smarteam([ _].*)?|hub id:.*)$/i;

/**
 * La clave que la copia SUMA a las propiedades crudas de cada registro: quién de Smarteam trabajó por última vez en
 * el portal (2026-10-09). HubSpot da solo el id de usuario (`hs_last_active_partner_employee`); se traduce con los
 * dueños del portal y, si la persona está en el equipo, con su nombre de Nexus. La lee lib/cs/lectura-partner.ts.
 */
export const CLAVE_ULTIMO_ACTIVO = "nexus_ultimo_activo";

/** id de usuario de HubSpot → cómo se llama (el nombre del equipo, el de HubSpot o el correo). null si falla. */
async function nombresDeUsuarios(): Promise<Map<string, string> | null> {
  try {
    const hs = await getSystemHubspotClient();
    const { porUsuario } = await leerDuenos(hs);
    const equipo = await prisma.teamMember.findMany({ select: { name: true, email: true } });
    const porCorreo = new Map(equipo.map((m) => [m.email.trim().toLowerCase(), m.name]));
    const out = new Map<string, string>();
    for (const [id, d] of porUsuario) {
      const nombre = (d.email && porCorreo.get(d.email)) || d.nombre || d.email;
      if (nombre) out.set(id, nombre);
    }
    return out;
  } catch (e) {
    console.error("[partner-sync] no se pudieron traducir los usuarios de HubSpot:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Las propiedades crudas del registro con quién trabajó por última vez, si se sabe. */
function conUltimoActivo(rec: PartnerClientRecord, nombres: Map<string, string> | null): Record<string, unknown> {
  const props = rec.properties as Record<string, unknown>;
  const id = props.hs_last_active_partner_employee;
  const nombre = id !== null && id !== undefined && id !== "" ? nombres?.get(String(id)) : undefined;
  return nombre ? { ...props, [CLAVE_ULTIMO_ACTIVO]: nombre } : props;
}

export async function syncPartnerClients(
  options: {
    createClients?: boolean;
    /** false = el cambio de registro solo se planea y se devuelve en `cambiosPendientes`: no se mueve ningún cliente.
     *  Lo usa `scripts/run-partner-sync.ts` sin `--apply`, que se corre «para ver». Por defecto true (el job y el botón). */
    cambiarRegistros?: boolean;
  } = {},
): Promise<PartnerSyncResult> {
  /* Por defecto NO crea clientes (revisión de la juntura, 2026-10-24): crearlos es una decisión, y la toma quien llama
     —el botón del panel y `scripts/run-partner-sync.ts --apply` lo piden explícito; el job diario, solo con
     `CS_PARTNER_CREA_CLIENTES`—. Una llamada nueva sin opciones ya no fabrica fichas. */
  const createClients = options.createClients ?? false;
  const cambiarRegistros = options.cambiarRegistros ?? true;
  const result: PartnerSyncResult = {
    supported: true, total: 0, matchedByCompany: 0, matchedByDomain: 0, alreadyLinked: 0,
    unmatched: 0, createdClients: [], wouldCreateClients: [], briefsMarkedStale: 0,
    unlinkedGone: 0, cambiosDeRegistro: [], cambiosPendientes: [], cambiosFallidos: [], cambiosSinElegir: [], errors: [],
  };

  const now = new Date();
  if (!(await acquireSyncLock(now))) {
    result.locked = true;
    result.errors.push("otra corrida del sync tiene el lock — no se hizo nada");
    return result;
  }

  try {
    const fetched = await fetchAllPartnerClients();
    if (!fetched.supported) {
      result.supported = false;
      return result;
    }
    if (fetched.records.length === 0) {
      // Error transitorio (API caída): no pisar snapshots existentes.
      result.errors.push("0 records — posible error transitorio de la API; no se tocó nada");
      return result;
    }
    result.total = fetched.records.length;
    result.associationsOk = fetched.associationsOk;
    const nombres = await nombresDeUsuarios();
    const canRelink = fetched.associationsOk; // sin asociaciones confiables NO se re-matchea ni se crean Clients

    // ── Índices de matching (SIN prospectos: un vínculo a prospecto es invisible
    //    para el módulo CS) + estado actual de vínculos ────────────────────────
    const clients = await prisma.client.findMany({
      where: { ...CS_CLIENT_WHERE },
      select: { id: true, name: true, hubspotCompanyId: true, emailDomains: true },
    });
    const byCompanyId = new Map<string, string>();
    const byDomain = new Map<string, string>();
    for (const c of clients) {
      if (c.hubspotCompanyId) byCompanyId.set(c.hubspotCompanyId, c.id);
      for (const d of c.emailDomains) byDomain.set(d.toLowerCase(), c.id);
    }
    /* R7b (2026-10-24): la empresa de HubSpot es de UNA sola ficha. Las de arriba no ven prospectos ni aliados; esta sí,
       para no crear una segunda ficha con la empresa de un prospecto (antes la creaba, y el índice único de hoy le
       daría un error). Ese registro queda sin vincular y se reporta: decidir si el prospecto ya es cliente es de la CSL. */
    const fichaDeLaEmpresa = new Map<string, { id: string; name: string; kind: string }>();
    for (const c of await prisma.client.findMany({ where: { hubspotCompanyId: { not: null } }, select: { id: true, name: true, kind: true, hubspotCompanyId: true } })) {
      fichaDeLaEmpresa.set(c.hubspotCompanyId!, c);
    }
    const existingSnapshots = await prisma.clientPartnerSnapshot.findMany({
      select: {
        hubspotPartnerClientId: true, clientId: true,
        uusScore: true, marketingScore: true, salesScore: true, serviceScore: true,
        seats: true, mrrTotal: true, mrrUpForRenewal: true, nextRenewalAt: true,
        cancellationHubs: true, revenueSignal: true,
      },
    });
    const existingByPartnerId = new Map(existingSnapshots.map((s) => [s.hubspotPartnerClientId, s]));
    // partnerId → clientId: el vínculo con el que el bucle procesa cada record.
    const vinculoActual = new Map<string, string>();
    // clientId → partnerId dueño actual del vínculo (clientId es @unique en el snapshot).
    const linkOwner = new Map<string, string>();
    for (const s of existingSnapshots) {
      if (!s.clientId) continue;
      vinculoActual.set(s.hubspotPartnerClientId, s.clientId);
      linkOwner.set(s.clientId, s.hubspotPartnerClientId);
    }

    // ── Cambio de registro: el cliente que quedó en un registro INACTIVO pasa al ACTIVO que
    //    coincide con él (reglas en lib/cs/partner-cambio-de-registro.ts). Va ANTES del bucle,
    //    para que cada record se procese ya con su vínculo nuevo. ─────────────────────────
    const nombreDelCliente = new Map(clients.map((c) => [c.id, c.name]));
    const recordPorId = new Map(fetched.records.map((r) => [r.id, r]));
    const plan = planearCambiosDeRegistro({
      registros: fetched.records.map((r) => ({
        id: r.id,
        activo: activoEnHubspot(r.properties),
        associatedCompanyIds: r.associatedCompanyIds,
        domain: dominioDelRegistro(r),
      })),
      vinculos: vinculoActual,
      porCompany: byCompanyId,
      porDominio: byDomain,
      asociacionesConfiables: canRelink,
      duenoDeLaEmpresa: new Map([...fichaDeLaEmpresa].map(([companyId, ficha]) => [companyId, ficha.id])),
    });
    // Los clientes que ya tienen su línea en `errors` por esta regla: el bucle no la repite.
    const yaReportados = new Set<string>();
    for (const s of plan.sinElegir) {
      const cliente = nombreDelCliente.get(s.clientId) ?? null;
      result.cambiosSinElegir.push({ ...s, cliente });
      result.errors.push(mensajeSinElegir(s, cliente));
      yaReportados.add(s.clientId);
    }
    for (const c of plan.cambios) {
      const rec = recordPorId.get(c.hacia);
      if (!rec) continue; // el plan sale de estos records: no pasa
      const cliente = nombreDelCliente.get(c.clientId) ?? null;
      if (!cambiarRegistros) {
        result.cambiosPendientes.push({ ...c, cliente });
        yaReportados.add(c.clientId);
        continue;
      }
      try {
        const hecho = await aplicarCambioDeRegistro(c, datosDelSnapshot(rec, buildScalars(rec), fetched.associationsOk, nombres), now);
        vinculoActual.delete(c.desde);
        vinculoActual.set(c.hacia, c.clientId);
        linkOwner.set(c.clientId, c.hacia);
        result.briefsMarkedStale += hecho.briefsMarcados;
        result.cambiosDeRegistro.push({ ...c, cliente, semanasDeHistorial: hecho.semanasDeHistorial });
        // El rastro para deshacerlo a mano, venga de donde venga la corrida (job, botón o script): el estado
        // guardado se pisa en la corrida siguiente, el log del servidor no.
        console.log(`[partner-sync] cambio de registro: ${cliente ?? "?"} (${c.clientId}) ${c.desde}→${c.hacia} por ${c.via}`);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "error";
        result.cambiosFallidos.push({ ...c, cliente, motivo });
        result.errors.push(
          `no se pudo pasar a ${cliente ?? c.clientId} del registro ${c.desde} al ${c.hacia} (${motivo}): sigue con ${c.desde}`,
        );
        yaReportados.add(c.clientId);
      }
    }

    for (const rec of fetched.records) {
      try {
        const scalars = buildScalars(rec);
        const existing = existingByPartnerId.get(rec.id);
        const activo = activoEnHubspot(rec.properties);
        const name =
          rec.resolved.clientName?.trim() ||
          rec.resolved.accountName?.trim() ||
          scalars.domain ||
          `Partner ${rec.id}`;

        // ── Match — FUENTE #0: el vínculo existente se conserva ─────────────
        // (`vinculoActual`, no `existing`: un cambio de registro de esta corrida ya soltó el viejo.)
        let clientId: string | null = vinculoActual.get(rec.id) ?? null;
        let via: ViaDelMatch | null = null;
        if (clientId) {
          result.alreadyLinked++;
        } else if (canRelink) {
          // La MISMA regla que usa el plan de cambio de registro.
          const match = matchPorEvidencia({ associatedCompanyIds: rec.associatedCompanyIds, domain: scalars.domain }, byCompanyId, byDomain);
          clientId = match?.clientId ?? null;
          via = match?.via ?? null;

          // Los portales INTERNOS de Smarteam y los records basura NO se convierten
          // en Client: el resolver de sesiones matchea por nombre/dominio, y un
          // segundo "Smarteam" vuelve ambiguo el token — el 2026-07-10 eso desplomó
          // la resolución del cliente Smarteam de 1313 sesiones a 1 (INV1/INV2 rojos).
          // Tampoco los records SIN dominio NI company asociada: no hay nada con qué
          // matchearlos — un Client solo-nombre roba sesiones por el fallback débil
          // de título (caso real: "Alejandro Rodríguez" se llevó 57 sesiones internas).
          // El snapshot igual se sincroniza (queda sin vincular, invisible en CS).
          // ⚠ Sin `continue`: el registro se copia igual, sin vincular. Hasta el 2026-10-09 se saltaba entero y sus
          // datos quedaban congelados en la primera copia (siete registros del 10 jul, entre ellos RSM Costa Rica).
          const unmatchable = !scalars.domain && rec.associatedCompanyIds.length === 0;
          // Tampoco un registro que HubSpot da por INACTIVO (2026-10-07): es un portal que ya no está en el book. Sobre
          // todo el que suelta un cambio de registro: si su dominio o su company ya no apuntan al cliente, crearlo
          // duplicaría al cliente que se acaba de mudar al registro activo. Se sincroniza igual, sin vincular.
          const noSeCrea = !clientId && (PARTNER_CREATE_SKIP.test(name) || unmatchable || activo === false);
          if (noSeCrea) result.unmatched++;

          // Una empresa asociada que ya es de otra ficha (un prospecto, un aliado): no se crea otra.
          const yaEsDeOtra = !clientId && !noSeCrea ? rec.associatedCompanyIds.map((id) => fichaDeLaEmpresa.get(id)).find(Boolean) : undefined;
          if (yaEsDeOtra) {
            result.unmatched++;
            result.errors.push(`partner ${rec.id} («${name}»): su empresa de HubSpot ya es la ficha «${yaEsDeOtra.name}» (${yaEsDeOtra.kind}); queda sin vincular`);
          }

          // Crear Client si no hay match (decisión de producto).
          if (!clientId && !noSeCrea && !yaEsDeOtra) {
            const draft = {
              name,
              domain: scalars.domain,
              hubspotCompanyId: rec.associatedCompanyIds[0] ?? null,
            };
            if (!createClients) {
              result.wouldCreateClients.push(draft);
              result.unmatched++;
            } else {
              const crear = () =>
                prisma.client.create({
                  data: {
                    name,
                    hubspotCompanyId: draft.hubspotCompanyId,
                    emailDomains: scalars.domain ? [scalars.domain] : [],
                    kind: "CLIENTE",
                  },
                  select: { id: true, name: true, kind: true },
                });
              /* Con empresa de HubSpot, por el módulo único (lib/clients/empresa-de-hubspot.ts): si otro camino la creó
                 mientras corría la copia, el índice frena esta y se usa la que ganó (si es cliente). */
              let created: { id: string; name: string; kind: string; gano?: true };
              if (draft.hubspotCompanyId) {
                const r = await crearOReusarFicha(draft.hubspotCompanyId, crear);
                created = r.creado ? { id: r.clientId, name, kind: "CLIENTE" } : { ...r.ficha, gano: true };
              } else {
                created = await crear();
              }
              if (created.gano && created.kind !== "CLIENTE") {
                result.errors.push(`partner ${rec.id} («${name}»): su empresa de HubSpot ya es la ficha «${created.name}» (${created.kind}); queda sin vincular`);
              } else {
                clientId = created.id;
                if (draft.hubspotCompanyId) {
                  byCompanyId.set(draft.hubspotCompanyId, created.id);
                  fichaDeLaEmpresa.set(draft.hubspotCompanyId, created);
                }
                if (scalars.domain) byDomain.set(scalars.domain, created.id);
                if (!created.gano) result.createdClients.push(draft);
              }
            }
          }

          // clientId es @unique en el snapshot: si otro record ya es dueño del
          // vínculo, este queda sin vincular (el dueño se conserva). Se avisa solo si este
          // record NO está inactivo y su cliente no tiene ya su aviso: un registro inactivo cuyo
          // cliente vive en otro registro es lo esperable (p. ej. el que soltó un cambio de
          // registro), y repetirlo cada día en los errores sería ruido.
          if (clientId) {
            const owner = linkOwner.get(clientId);
            if (owner && owner !== rec.id) {
              if (activo !== false && !yaReportados.has(clientId)) {
                result.errors.push(`client ${clientId} ya vinculado al partner record ${owner} — ${rec.id} queda sin vincular`);
              }
              clientId = null;
            } else {
              linkOwner.set(clientId, rec.id);
              if (via === "company") result.matchedByCompany++;
              else if (via === "domain") result.matchedByDomain++;
            }
          }
        } else {
          result.unmatched += clientId ? 0 : 1;
        }

        // ── Upsert + staleAt del brief si cambió lo material ────────────────
        // La CREACIÓN también cuenta como cambio material: un brief redactado antes
        // del primer sync no cita el bloque entero de partner que acaba de aparecer.
        const changedMaterially = !existing || materialKey(existing) !== materialKey(scalars);

        const base = datosDelSnapshot(rec, scalars, fetched.associationsOk, nombres);
        const { isManaged, soldMrr, projectedCommission, mrrByHub } = base;
        await prisma.clientPartnerSnapshot.upsert({
          where: { hubspotPartnerClientId: rec.id },
          create: { hubspotPartnerClientId: rec.id, clientId, ...base },
          // El vínculo NUNCA se degrada: solo se escribe cuando hay match positivo.
          update: { ...base, ...(clientId ? { clientId } : {}) },
        });

        if (changedMaterially && clientId) {
          const marked = await prisma.csAccountBrief.updateMany({
            where: { clientId, staleAt: null },
            data: { staleAt: new Date() },
          });
          result.briefsMarkedStale += marked.count;
        }

        // ── Historial SEMANAL de uso (el UUS se recalcula semanalmente): una fila
        //    por (record, semana ISO); el sync diario pisa la de la semana en curso
        //    → queda la última foto de cada semana para tendencia propia. Su clientId es
        //    el cliente del record: cuando el cliente pasa a otro record, la serie pasa con
        //    él (`aplicarCambioDeRegistro`), así la ficha y el vigía, que la leen por cliente,
        //    no mezclan dos portales. ────────
        const weekKey = semanaIso(now);
        const usageRow = {
          clientId,
          uusScore: scalars.uusScore,
          activationScore: scalars.activationScore,
          toolUsageScore: scalars.toolUsageScore,
          valueMetricsScore: scalars.valueMetricsScore,
          consumptionScore: scalars.consumptionScore,
          marketingScore: scalars.marketingScore,
          salesScore: scalars.salesScore,
          serviceScore: scalars.serviceScore,
          marketingContactsUsed: scalars.marketingContactsUsed,
          marketingContactsLimit: scalars.marketingContactsLimit,
          seats: scalars.seats as Prisma.InputJsonValue,
          mrrTotal: scalars.mrrTotal,
          nextRenewalAt: scalars.nextRenewalAt,
          isManaged,
          mrrManaged: scalars.mrrManaged,
          soldMrr,
          projectedCommission,
          mrrByHub,
          capturedAt: new Date(),
        };
        await prisma.partnerUsageSnapshot.upsert({
          where: { hubspotPartnerClientId_weekKey: { hubspotPartnerClientId: rec.id, weekKey } },
          create: { hubspotPartnerClientId: rec.id, weekKey, ...usageRow },
          update: usageRow,
        });
      } catch (e) {
        result.errors.push(`record ${rec.id}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    // ── Reconciliación: records que YA NO existen en HubSpot → desvincular el
    //    snapshot (su clientId @unique bloquearía el re-vínculo para siempre).
    //    Guarda de sanidad: solo con un fetch razonablemente completo. ────────
    if (fetched.records.length >= existingByPartnerId.size * 0.5) {
      const fetchedIds = new Set(fetched.records.map((r) => r.id));
      const gone = [...existingByPartnerId.values()].filter(
        (s) => s.clientId && !fetchedIds.has(s.hubspotPartnerClientId),
      );
      for (const s of gone) {
        await prisma.clientPartnerSnapshot
          .update({ where: { hubspotPartnerClientId: s.hubspotPartnerClientId }, data: { clientId: null } })
          .catch(() => {});
        result.unlinkedGone++;
      }
    }

    return result;
  } finally {
    await releaseSyncLock();
    // Persistir el resultado del ÚLTIMO run CONCLUYENTE — la fuente de verdad de
    // "¿el scope está autorizado?" para los paneles de CS (fila cs-partner-sync-status).
    // Concluyente = 403 de scope (supported:false) o una corrida real con records.
    // Las corridas locked y los "0 records" transitorios NO pisan el último resultado
    // bueno (el propio job los trata como transitorios y reintenta, lib/jobs/defs.ts).
    await persistSyncStatus(result);
  }
}

/** Cuántos errores de una corrida se guardan con su texto. Los demás se cuentan en `errors`. */
export const MAX_ERRORES_GUARDADOS = 50;

/** Escribe cs-partner-sync-status.lastResult si la corrida fue concluyente. Best-effort:
 *  un fallo acá no debe tumbar el sync (los datos ya están persistidos). */
async function persistSyncStatus(result: PartnerSyncResult): Promise<void> {
  const conclusive = !result.locked && (!result.supported || result.total > 0);
  if (!conclusive) return;
  const lastResult = {
    supported: result.supported,
    total: result.total,
    matched: result.matchedByCompany + result.matchedByDomain + result.alreadyLinked,
    unmatched: result.unmatched,
    wouldCreate: result.wouldCreateClients.length,
    created: result.createdClients.length,
    errors: result.errors.length,
    // U29: el texto, no solo la cuenta (la corrida del 23 oct tuvo 10 errores y nadie sabía cuáles).
    errorDetail: result.errors.slice(0, MAX_ERRORES_GUARDADOS),
    cambiosDeRegistro: result.cambiosDeRegistro.length,
    // De qué registro a cuál: para poder deshacer un cambio a mano (el viejo queda sin cliente y sin rastro de quién era).
    cambiosDeRegistroDetalle: result.cambiosDeRegistro.map(({ clientId, cliente, desde, hacia, via }) => ({ clientId, cliente, desde, hacia, via })),
    cambiosSinElegir: result.cambiosSinElegir.length,
    at: new Date().toISOString(),
  };
  await prisma.cronJobState
    .upsert({
      where: { id: "cs-partner-sync-status" },
      create: { id: "cs-partner-sync-status", lastResult },
      update: { lastResult },
    })
    .catch((e) => console.error("[partner-sync] no se pudo persistir cs-partner-sync-status:", e));
}

/** Shape del lastResult de cs-partner-sync-status (lo leen los loaders de CS). */
export interface PartnerSyncStatus {
  supported: boolean;
  total: number;
  matched: number;
  unmatched: number;
  wouldCreate: number;
  created: number;
  errors: number;
  /** El texto de los primeros `MAX_ERRORES_GUARDADOS` errores. Ausente en las corridas de antes del 2026-10-25. */
  errorDetail?: string[];
  /** Clientes que pasaron a su registro activo (ausente en corridas anteriores al 2026-10-29). */
  cambiosDeRegistro?: number;
  /** De qué registro a cuál pasó cada uno (ausente antes del 2026-10-29). */
  cambiosDeRegistroDetalle?: Array<{ clientId: string; cliente: string | null; desde: string; hacia: string; via: ViaDelMatch }>;
  /** Clientes con un registro activo que coincide y que no se movieron: los mira una persona. */
  cambiosSinElegir?: number;
  at: string;
}
