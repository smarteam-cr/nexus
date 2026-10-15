/**
 * lib/ventas/sync-negocios-abiertos.ts — copia los negocios ABIERTOS de HubSpot a `NegocioAbierto`, y el dueño de cada
 * empresa de Nexus a `Client.hubspotOwnerId`/`hubspotOwnerEmail` (2026-10-14, «Para ti» por equipo, etapa 1).
 *
 * Solo LEE HubSpot. Lo corre el job `negocios-abiertos` cada hora de 6:00 a 20:00 (Costa Rica) y el botón «Actualizar»
 * de la cartera de Ventas. Mismas reglas que la copia de lo ganado (lib/ventas/sync-ganadas.ts):
 *   · un candado en la base: una corrida a la vez entre el servidor y las dos PCs;
 *   · nunca se borra una fila: un negocio que dejó de volver queda `abierto = false` (se ganó, se perdió o se borró);
 *   · si la búsqueda trae menos de la mitad de los abiertos que ya se conocían, no se cierra nada (un 429 de HubSpot no
 *     puede vaciar la cartera de nadie);
 *   · la empresa es la PRIMARIA del negocio, no la primera que devuelve HubSpot;
 *   · lo que escribe una persona desde Nexus (la propuesta, «Ahora no», quién respondió) no se toca.
 *
 * De paso lee el siguiente paso de cada equipo (las propiedades «siguiente_paso_*») de los negocios y de las empresas de
 * Nexus, y lo que alguien cambió en HubSpot vuelve a `SiguientePaso` (lib/siguiente-paso/copia-server.ts, etapa 2).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { dealPipelineMeta } from "@/lib/hubspot/deals";
import { ETAPAS_GANADAS, ETAPAS_PERDIDAS, PIPELINES_VENTA_PROPIA, labelDePipeline } from "./pipelines";
import { propiedadesALeer } from "@/lib/siguiente-paso/reglas";
import { copiarPasosDeHubspot, type EntradaDeHubspot } from "@/lib/siguiente-paso/copia-server";

const LOCK_KEY = "negocios-abiertos-lock";
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const PROPIEDADES = [
  "dealname",
  "pipeline",
  "dealstage",
  "closedate",
  "hs_deal_stage_probability",
  "amount",
  "deal_currency_code",
  "hs_next_step",
  "notes_next_activity_date",
  "notes_last_updated",
  "createdate",
  "hubspot_owner_id",
  ...propiedadesALeer(),
];

export interface SyncNegociosResult {
  locked?: boolean;
  parcial?: boolean;
  traidos: number;
  altas: number;
  actualizados: number;
  sinCambio: number;
  cerrados: number;
  /** Empresas de Nexus a las que se les actualizó el dueño en HubSpot. */
  duenosActualizados: number;
  /** Siguientes pasos que alguien cambió (nuevos) o borró (cerrados) en HubSpot. */
  pasos: { nuevos: number; cerrados: number };
  errores: string[];
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
  const claimed = await prisma.cronJobState.updateMany({
    where: { id: LOCK_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

const numOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fechaOrNull = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

/**
 * El DÍA de cierre, en hora de Costa Rica: HubSpot guarda un instante, y el 31 de octubre a las 20:00 de Costa Rica ya
 * es 1 de noviembre en UTC.
 */
const diaDeCierre = (d: Date) => new Date(`${new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

type Crudo = { id: string; p: Record<string, string | null> };

async function buscarAbiertos(hs: Awaited<ReturnType<typeof getSystemHubspotClient>>): Promise<Crudo[]> {
  const crudos: Crudo[] = [];
  let after: string | undefined;
  do {
    const r = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/deals/search",
      body: {
        filterGroups: [
          {
            filters: [
              { propertyName: "pipeline", operator: "IN", values: [...PIPELINES_VENTA_PROPIA] },
              { propertyName: "dealstage", operator: "NOT_IN", values: [...ETAPAS_GANADAS, ...ETAPAS_PERDIDAS] },
            ],
          },
        ],
        properties: PROPIEDADES,
        limit: 100,
        after,
      },
    });
    if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as {
      results?: Array<{ id: string; properties: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    };
    for (const d of data.results ?? []) crudos.push({ id: d.id, p: d.properties });
    after = data.paging?.next?.after;
  } while (after);
  return crudos;
}

export async function syncNegociosAbiertos(opciones: { dryRun?: boolean } = {}): Promise<SyncNegociosResult> {
  const now = new Date();
  const res: SyncNegociosResult = {
    traidos: 0,
    altas: 0,
    actualizados: 0,
    sinCambio: 0,
    cerrados: 0,
    duenosActualizados: 0,
    pasos: { nuevos: 0, cerrados: 0 },
    errores: [],
  };
  if (!opciones.dryRun && !(await tomarLock(now))) return { ...res, locked: true };

  try {
    const hs = await getSystemHubspotClient();
    const crudos = await buscarAbiertos(hs);
    res.traidos = crudos.length;
    const meta = await dealPipelineMeta(hs);

    // ── La empresa primaria de cada negocio ──
    const companyDe = new Map<string, string>();
    for (let i = 0; i < crudos.length; i += 100) {
      const lote = crudos.slice(i, i + 100);
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v4/associations/deals/companies/batch/read",
        body: { inputs: lote.map((d) => ({ id: d.id })) },
      });
      if (!r.ok) {
        res.errores.push(`empresas de los negocios, lote ${i / 100 + 1}: HTTP ${r.status}`);
        continue;
      }
      const data = (await r.json()) as {
        results?: Array<{
          from: { id: string };
          to: Array<{ toObjectId: string | number; associationTypes?: Array<{ label?: string | null; typeId?: number }> }>;
        }>;
      };
      for (const x of data.results ?? []) {
        const primaria = x.to?.find((t) => t.associationTypes?.some((a) => a.typeId === 5 || /primary/i.test(a.label ?? "")));
        const elegida = primaria ?? x.to?.[0];
        if (elegida) companyDe.set(x.from.id, String(elegida.toObjectId));
      }
    }

    // ── Los clientes de Nexus, y las empresas a las que hay que leerles nombre y dueño ──
    const clientes = await prisma.client.findMany({
      where: { hubspotCompanyId: { not: null } },
      select: { id: true, hubspotCompanyId: true, hubspotOwnerId: true, hubspotOwnerEmail: true },
    });
    const clientePorCompany = new Map(clientes.map((c) => [c.hubspotCompanyId!, c]));
    const empresas = new Set<string>([...companyDe.values(), ...clientes.map((c) => c.hubspotCompanyId!)]);
    const datosDeEmpresa = new Map<string, { nombre: string | null; ownerId: string | null; props: Record<string, string | null> }>();
    const lista = [...empresas];
    for (let i = 0; i < lista.length; i += 100) {
      const lote = lista.slice(i, i + 100);
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/companies/batch/read",
        body: { properties: ["name", "hubspot_owner_id", ...propiedadesALeer()], inputs: lote.map((id) => ({ id })) },
      });
      // 207 = algunas no existen (fusionadas o borradas): las demás vienen igual.
      if (!r.ok && r.status !== 207) {
        res.errores.push(`empresas, lote ${i / 100 + 1}: HTTP ${r.status}`);
        continue;
      }
      const data = (await r.json()) as { results?: Array<{ id: string; properties: Record<string, string | null> }> };
      for (const c of data.results ?? []) {
        datosDeEmpresa.set(String(c.id), {
          nombre: (c.properties.name ?? "").trim() || null,
          ownerId: (c.properties.hubspot_owner_id ?? "").trim() || null,
          props: c.properties,
        });
      }
    }

    // ── Dueños de HubSpot → personas de Nexus ──
    let correoDe: (ownerId: string | null) => string | null = () => null;
    let personaDe: (ownerId: string | null) => string | null = () => null;
    let duenosLeidos = false;
    try {
      const { porOwner } = await leerDuenos(hs);
      const equipo = await prisma.teamMember.findMany({ select: { id: true, email: true } });
      const porCorreo = new Map(equipo.map((m) => [m.email.trim().toLowerCase(), m.id]));
      correoDe = (ownerId) => (ownerId ? (porOwner.get(ownerId)?.email ?? null) : null);
      personaDe = (ownerId) => {
        const email = correoDe(ownerId);
        return email ? (porCorreo.get(email) ?? null) : null;
      };
      duenosLeidos = true;
    } catch (e) {
      res.errores.push(`dueños de HubSpot: ${e instanceof Error ? e.message : String(e)} — los negocios quedan sin vendedor.`);
    }

    // ── Guarda: una búsqueda que trajo sospechosamente poco no cierra nada ──
    const conocidosAbiertos = await prisma.negocioAbierto.count({ where: { abierto: true } });
    const parcial = conocidosAbiertos > 0 && crudos.length < conocidosAbiertos * 0.5;
    if (parcial) {
      res.errores.push(`La búsqueda trajo ${crudos.length} negocios contra ${conocidosAbiertos} abiertos conocidos: no se cierra ninguno.`);
    }

    // ── Upsert ──
    const previos = new Map(
      (await prisma.negocioAbierto.findMany({ where: { hubspotDealId: { in: crudos.map((d) => d.id) } } })).map((n) => [n.hubspotDealId, n]),
    );
    const sinCambio: string[] = [];
    const vistos = new Set<string>();
    for (const d of crudos) {
      if (vistos.has(d.id)) continue;
      vistos.add(d.id);
      const cierre = fechaOrNull(d.p.closedate);
      const monto = numOrNull(d.p.amount);
      const prob = numOrNull(d.p.hs_deal_stage_probability);
      const companyId = companyDe.get(d.id) ?? null;
      const ownerId = (d.p.hubspot_owner_id ?? "").trim() || null;
      const pipelineId = d.p.pipeline ?? "";
      const etapaId = d.p.dealstage ?? "";
      const datos = {
        nombre: (d.p.dealname ?? "").trim() || `(negocio ${d.id})`,
        pipelineId,
        pipelineLabel: meta.labels.get(pipelineId) ?? labelDePipeline(pipelineId),
        etapaId,
        etapaLabel: meta.stages.get(pipelineId)?.get(etapaId) ?? null,
        probabilidad: prob === null ? null : Math.max(0, Math.min(1, prob)),
        fechaCierre: cierre ? diaDeCierre(cierre) : null,
        monto: monto === null ? null : new Prisma.Decimal(monto),
        moneda: (d.p.deal_currency_code ?? "USD").trim() || "USD",
        siguientePasoHubspot: (d.p.hs_next_step ?? "").trim() || null,
        proximaActividadAt: fechaOrNull(d.p.notes_next_activity_date),
        ultimaActividadAt: fechaOrNull(d.p.notes_last_updated),
        creadoEnHubspot: fechaOrNull(d.p.createdate),
        hubspotOwnerId: ownerId,
        ...(duenosLeidos ? { vendedorId: personaDe(ownerId) } : {}),
        hubspotCompanyId: companyId,
        empresaNombre: companyId ? (datosDeEmpresa.get(companyId)?.nombre ?? null) : null,
        clientId: companyId ? (clientePorCompany.get(companyId)?.id ?? null) : null,
        abierto: true,
        cerradoEn: null,
      };
      const previo = previos.get(d.id);
      if (!previo) {
        res.altas++;
        if (!opciones.dryRun) await prisma.negocioAbierto.create({ data: { hubspotDealId: d.id, ...datos, sincronizadoEn: now } });
        continue;
      }
      const igual =
        previo.nombre === datos.nombre &&
        previo.etapaId === datos.etapaId &&
        previo.pipelineId === datos.pipelineId &&
        (previo.etapaLabel ?? null) === datos.etapaLabel &&
        (previo.probabilidad ?? null) === datos.probabilidad &&
        (previo.fechaCierre?.getTime() ?? null) === (datos.fechaCierre?.getTime() ?? null) &&
        (previo.monto === null ? null : Number(previo.monto)) === monto &&
        previo.moneda === datos.moneda &&
        (previo.siguientePasoHubspot ?? null) === datos.siguientePasoHubspot &&
        (previo.proximaActividadAt?.getTime() ?? null) === (datos.proximaActividadAt?.getTime() ?? null) &&
        (previo.ultimaActividadAt?.getTime() ?? null) === (datos.ultimaActividadAt?.getTime() ?? null) &&
        (previo.hubspotOwnerId ?? null) === ownerId &&
        (!duenosLeidos || (previo.vendedorId ?? null) === datos.vendedorId) &&
        (previo.hubspotCompanyId ?? null) === companyId &&
        (previo.empresaNombre ?? null) === datos.empresaNombre &&
        (previo.clientId ?? null) === datos.clientId &&
        previo.abierto;
      if (igual) {
        res.sinCambio++;
        sinCambio.push(previo.id);
        continue;
      }
      res.actualizados++;
      if (!opciones.dryRun) await prisma.negocioAbierto.update({ where: { id: previo.id }, data: { ...datos, sincronizadoEn: now } });
    }
    if (!opciones.dryRun && sinCambio.length) {
      await prisma.negocioAbierto.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: now } });
    }

    // ── Los que ya no volvieron como abiertos ──
    if (!parcial) {
      const cerrar = await prisma.negocioAbierto.findMany({
        where: { abierto: true, hubspotDealId: { notIn: [...vistos] } },
        select: { id: true },
      });
      res.cerrados = cerrar.length;
      if (!opciones.dryRun && cerrar.length) {
        await prisma.negocioAbierto.updateMany({
          where: { id: { in: cerrar.map((c) => c.id) } },
          data: { abierto: false, cerradoEn: now, sincronizadoEn: now },
        });
      }
    }

    // ── El dueño de cada empresa de Nexus ──
    if (duenosLeidos) {
      for (const c of clientes) {
        const datos = datosDeEmpresa.get(c.hubspotCompanyId!);
        if (!datos) continue; // la empresa no volvió (fusionada o borrada): no se toca lo que había
        const email = correoDe(datos.ownerId);
        if ((c.hubspotOwnerId ?? null) === datos.ownerId && (c.hubspotOwnerEmail ?? null) === email) continue;
        res.duenosActualizados++;
        if (!opciones.dryRun) {
          await prisma.client.update({ where: { id: c.id }, data: { hubspotOwnerId: datos.ownerId, hubspotOwnerEmail: email } });
        }
      }
    }

    // ── El siguiente paso que alguien cambió en HubSpot ──
    if (duenosLeidos) {
      try {
        const ids = await prisma.negocioAbierto.findMany({
          where: { hubspotDealId: { in: [...vistos] } },
          select: { id: true, hubspotDealId: true, clientId: true },
        });
        const crudoDe = new Map(crudos.map((d) => [d.id, d.p]));
        const entradas: EntradaDeHubspot[] = [
          ...ids.map((n) => ({
            objeto: "negocio" as const,
            objetoId: n.id,
            clientId: n.clientId,
            hubspotObjectType: "deals",
            hubspotObjectId: n.hubspotDealId,
            props: crudoDe.get(n.hubspotDealId) ?? {},
          })),
          ...clientes
            .filter((c) => datosDeEmpresa.has(c.hubspotCompanyId!))
            .map((c) => ({
              objeto: "empresa" as const,
              objetoId: c.id,
              clientId: c.id,
              hubspotObjectType: "companies",
              hubspotObjectId: c.hubspotCompanyId!,
              props: datosDeEmpresa.get(c.hubspotCompanyId!)!.props,
            })),
        ];
        const r = await copiarPasosDeHubspot(entradas, correoDe, now, { dryRun: opciones.dryRun });
        res.pasos = { nuevos: r.nuevos, cerrados: r.cerrados };
      } catch (e) {
        res.errores.push(`siguientes pasos de HubSpot: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { ...res, parcial: parcial || undefined };
  } finally {
    if (!opciones.dryRun) await soltarLock();
  }
}

/** Cuándo terminó la última copia (la fila más nueva), o null si nunca corrió. */
export async function ultimaCopiaDeNegocios(): Promise<Date | null> {
  const r = await prisma.negocioAbierto.aggregate({ _max: { sincronizadoEn: true } });
  return r._max.sincronizadoEn ?? null;
}
