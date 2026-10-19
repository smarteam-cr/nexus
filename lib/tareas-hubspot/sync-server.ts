/**
 * lib/tareas-hubspot/sync-server.ts — las tareas de HubSpot del equipo, en Tareas internas, en los dos sentidos
 * (2026-10-15, etapa 3 de docs/mi-dia-plan.md). SERVER-ONLY.
 *
 * Lo corre el job `tareas-hubspot` cada 15 minutos, y `reflejarTareaEnHubspot` justo después de que alguien cambia una
 * tarea de HubSpot desde Nexus (para no esperar la corrida). Las reglas de qué gana están en reglas.ts (`comparar`).
 *
 *   · Entran todas las tareas ABIERTAS de cada persona del equipo en HubSpot (también las de las secuencias), y las que
 *     se completaron esta semana. Las completadas en los últimos 7 días se miran para cerrar las que Nexus ya tiene. Una tarea que ya no es de nadie del equipo, o que se borró en HubSpot, pasa a
 *     «Ya no se hará» con el motivo.
 *   · Lo que cambia en HubSpot se aplica en Nexus por el escritor único de Tareas (lib/tareas/mutaciones.ts); lo que
 *     cambia en Nexus se escribe en HubSpot desde acá. Nada que nazca en Nexus se crea en HubSpot.
 *   · Un candado en la base: una copia a la vez entre el servidor y las dos PCs.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { claveDeEquipo } from "@/lib/tareas/equipos";
import { aplicarDesdeHubspot, anotarSincronizacionConHubspot, crearTareaDeHubspot, type CambiosDesdeHubspot } from "@/lib/tareas/mutaciones";
import { comoFecha, hoyEnCostaRica, lunesDeHoy } from "@/lib/tareas/semana";
import {
  DIAS_DE_COMPLETADAS,
  PROPIEDADES_DE_LA_TAREA,
  comparar,
  datosDeHubspot,
  leerAcordado,
  leerDatosDeHubspot,
  propiedadesParaHubspot,
  textoDelCuerpo,
  valoresDeHubspot,
  type DatosDeHubspot,
  type EstadoSincronizado,
  type PropsDeTarea,
  type ValoresSincronizados,
} from "./reglas";

type Hs = Awaited<ReturnType<typeof getSystemHubspotClient>>;

const LOCK_KEY = "tareas-hubspot-lock";
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export interface ResultadoDeTareasDeHubspot {
  locked?: true;
  traidas: number;
  nuevas: number;
  aplicadasEnNexus: number;
  escritasEnHubspot: number;
  cerradas: number;
  sinCambios: number;
  errores: string[];
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState.upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } }).catch((e) => {
    if ((e as { code?: string })?.code !== "P2002") throw e;
  });
  const r = await prisma.cronJobState.updateMany({
    where: { id: LOCK_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { lastRunAt: now },
  });
  return r.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

/* ── El equipo en HubSpot ────────────────────────────────────────────────────────────── */

interface EquipoEnHubspot {
  /** ownerId → la persona del equipo (activa). */
  porOwner: Map<string, { email: string; equipo: string }>;
  correoDe: (ownerId: string | null) => string | null;
  ownerDe: (email: string | null) => string | null;
  equipoDe: (email: string) => string | null;
}

async function equipoEnHubspot(hs: Hs): Promise<EquipoEnHubspot> {
  const [{ porOwner }, miembros] = await Promise.all([
    leerDuenos(hs),
    prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, area: true } }),
  ]);
  const casa = new Map(miembros.map((m) => [m.email.trim().toLowerCase(), claveDeEquipo(m.area, m.email)]));
  const delEquipo = new Map<string, { email: string; equipo: string }>();
  const ownerPorCorreo = new Map<string, string>();
  for (const d of porOwner.values()) {
    if (!d.email || d.archivado) continue;
    const equipo = casa.get(d.email);
    if (!equipo) continue;
    delEquipo.set(d.ownerId, { email: d.email, equipo });
    if (!ownerPorCorreo.has(d.email)) ownerPorCorreo.set(d.email, d.ownerId);
  }
  return {
    porOwner: delEquipo,
    correoDe: (o) => (o ? (delEquipo.get(o)?.email ?? null) : null),
    ownerDe: (e) => (e ? (ownerPorCorreo.get(e.toLowerCase()) ?? null) : null),
    equipoDe: (e) => casa.get(e.toLowerCase()) ?? null,
  };
}

/* ── Leer HubSpot ────────────────────────────────────────────────────────────────────── */

type Crudo = { id: string; p: PropsDeTarea };

async function buscar(hs: Hs, owners: string[], extra: Array<Record<string, unknown>>): Promise<Crudo[]> {
  const out: Crudo[] = [];
  for (let i = 0; i < owners.length; i += 100) {
    const lote = owners.slice(i, i + 100);
    let after: string | undefined;
    do {
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/tasks/search",
        body: {
          filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "IN", values: lote }, ...extra] }],
          properties: [...PROPIEDADES_DE_LA_TAREA],
          limit: 100,
          after,
        },
      });
      if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = (await r.json()) as { results?: Array<{ id: string; properties: PropsDeTarea }>; paging?: { next?: { after?: string } } };
      for (const t of data.results ?? []) out.push({ id: String(t.id), p: t.properties });
      after = data.paging?.next?.after;
    } while (after);
  }
  return out;
}

/** Las tareas por id (las que siguen existiendo; las borradas no vuelven). */
async function leerPorId(hs: Hs, ids: string[]): Promise<Crudo[]> {
  const out: Crudo[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/tasks/batch/read",
      body: { properties: [...PROPIEDADES_DE_LA_TAREA], inputs: ids.slice(i, i + 100).map((id) => ({ id })) },
    });
    // 207 = algunas no existen (se borraron): las demás vienen igual.
    if (!r.ok && r.status !== 207) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = (await r.json()) as { results?: Array<{ id: string; properties: PropsDeTarea }> };
    for (const t of data.results ?? []) out.push({ id: String(t.id), p: t.properties });
  }
  return out;
}

interface Asociadas {
  companyId?: string;
  dealId?: string;
  projectId?: string;
}

async function asociaciones(hs: Hs, ids: string[]): Promise<Map<string, Asociadas>> {
  const por = new Map<string, Asociadas>();
  const leer = async (hacia: string, campo: keyof Asociadas) => {
    for (let i = 0; i < ids.length; i += 100) {
      const r = await hs.apiRequest({
        method: "POST",
        path: `/crm/v4/associations/tasks/${hacia}/batch/read`,
        body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })) },
      });
      if (!r.ok && r.status !== 207) continue;
      const data = (await r.json()) as {
        results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number; associationTypes?: Array<{ label?: string | null }> }> }>;
      };
      for (const x of data.results ?? []) {
        const elegida = x.to?.find((t) => t.associationTypes?.some((a) => /primary/i.test(a.label ?? ""))) ?? x.to?.[0];
        if (!elegida) continue;
        const a = por.get(String(x.from.id)) ?? {};
        a[campo] = String(elegida.toObjectId);
        por.set(String(x.from.id), a);
      }
    }
  };
  await leer("deals", "dealId");
  await leer("companies", "companyId");
  await leer(OBJETO_PROYECTOS, "projectId");
  return por;
}

/** Para quién es cada tarea, por lo que tiene asociado en HubSpot: el proyecto, si no el negocio, si no la empresa. */
async function paraQuien(asoc: Map<string, Asociadas>) {
  const todas = [...asoc.values()];
  const [proyectos, negocios, clientes] = await Promise.all([
    prisma.project.findMany({
      where: proyectoClasificableWhere({ hubspotServiceId: { in: todas.map((a) => a.projectId).filter((x): x is string => !!x) } }),
      select: { id: true, clientId: true, hubspotServiceId: true },
    }),
    prisma.negocioAbierto
      .findMany({ where: { hubspotDealId: { in: todas.map((a) => a.dealId).filter((x): x is string => !!x) } }, select: { hubspotDealId: true, clientId: true } })
      .catch(() => []),
    prisma.client.findMany({ where: { hubspotCompanyId: { in: todas.map((a) => a.companyId).filter((x): x is string => !!x) } }, select: { id: true, hubspotCompanyId: true } }),
  ]);
  const proyectoPor = new Map(proyectos.map((p) => [p.hubspotServiceId!, p]));
  const negocioPor = new Map(negocios.map((n) => [n.hubspotDealId, n.clientId]));
  const clientePor = new Map(clientes.map((c) => [c.hubspotCompanyId!, c.id]));
  return (taskId: string): { clientId: string | null; projectId: string | null; registro: DatosDeHubspot["registro"] } => {
    const a = asoc.get(taskId) ?? {};
    const proyecto = a.projectId ? proyectoPor.get(a.projectId) : undefined;
    const clientId = proyecto?.clientId ?? (a.dealId ? (negocioPor.get(a.dealId) ?? null) : null) ?? (a.companyId ? (clientePor.get(a.companyId) ?? null) : null);
    const registro: DatosDeHubspot["registro"] = a.dealId
      ? { objeto: "deal", id: a.dealId }
      : a.companyId
        ? { objeto: "company", id: a.companyId }
        : a.projectId
          ? { objeto: "0-970", id: a.projectId }
          : null;
    return { clientId, projectId: proyecto?.id ?? null, registro };
  };
}

/* ── Una tarea ───────────────────────────────────────────────────────────────────────── */

const SELECT = {
  id: true,
  version: true,
  titulo: true,
  estado: true,
  venceEl: true,
  prioridad: true,
  responsableEmail: true,
  contexto: true,
  clientId: true,
  projectId: true,
  updatedAt: true,
  archivadaAt: true,
  hubspotTaskId: true,
  hubspotAcordado: true,
  hubspotDatos: true,
} satisfies Prisma.TareaSelect;

type TareaDeHubspot = Prisma.TareaGetPayload<{ select: typeof SELECT }>;

type Desenlace = "nueva" | "nexus" | "hubspot" | "ambos" | "cerrada" | "nada" | "saltada";

/**
 * Compara una tarea de Nexus con la de HubSpot y aplica lo que corresponda en cada lado. `p` null = ya no existe en
 * HubSpot. `donde` = para quién es (solo para las nuevas: el cliente de una tarea que ya existe lo decide la persona).
 */
async function sincronizarUna(
  hs: Hs,
  eq: EquipoEnHubspot,
  t: TareaDeHubspot | null,
  crudo: Crudo | null,
  donde: { clientId: string | null; projectId: string | null; registro: DatosDeHubspot["registro"] } | null,
  ahora: Date,
  dryRun: boolean,
): Promise<{ desenlace: Desenlace; error?: string }> {
  // Se borró en HubSpot.
  if (t && !crudo) {
    if (t.estado !== "pendiente" && t.estado !== "en_curso") return { desenlace: "nada" };
    if (dryRun) return { desenlace: "cerrada" };
    const r = await aplicarDesdeHubspot(
      t.id,
      t.version,
      { estado: "no_se_hara", motivo: "Se borró en HubSpot." },
      { datos: (t.hubspotDatos ?? {}) as object, acordado: (t.hubspotAcordado ?? {}) as object, conflictos: [] },
      ahora,
    );
    return { desenlace: r === "aplicado" ? "cerrada" : "saltada" };
  }
  if (!crudo) return { desenlace: "nada" };

  const hub = valoresDeHubspot(crudo.p, eq.correoDe);
  const datosPrevios = t ? leerDatosDeHubspot(t.hubspotDatos) : null;
  const datos = datosDeHubspot(crudo.p, donde?.registro ?? datosPrevios?.registro ?? null);
  const contexto = textoDelCuerpo(crudo.p.hs_task_body);

  // Nueva. Una completada entra solo si se completó esta semana: es trabajo de la semana que se revisa; lo de antes ya
  // se revisó (y una limpieza de HubSpot no llena la historia de nadie).
  if (!t) {
    if (!hub.responsable) return { desenlace: "nada" };
    if (hub.estado === "hecha") {
      const completada = Date.parse(crudo.p.hs_task_completion_date ?? "");
      if (!Number.isFinite(completada) || hoyEnCostaRica(new Date(completada)) < lunesDeHoy(ahora)) return { desenlace: "nada" };
    }
    const equipo = eq.equipoDe(hub.responsable);
    if (!equipo) return { desenlace: "nada" };
    if (dryRun) return { desenlace: "nueva" };
    const c = await crearTareaDeHubspot(
      {
        hubspotTaskId: crudo.id,
        titulo: hub.titulo,
        contexto,
        estado: hub.estado,
        completadaAt: hub.estado === "hecha" ? new Date(Date.parse(crudo.p.hs_task_completion_date ?? "") || ahora.getTime()) : null,
        venceEl: hub.vence,
        prioridad: hub.prioridad,
        responsableEmail: hub.responsable,
        equipo,
        clientId: donde?.clientId ?? null,
        projectId: donde?.projectId ?? null,
        datos: datos as unknown as object,
        acordado: hub as unknown as object,
      },
      ahora,
    );
    return { desenlace: c ? "nueva" : "nada" };
  }

  // Pasó a alguien de afuera del equipo (o quedó sin dueño).
  if (!hub.responsable) {
    if (t.estado !== "pendiente" && t.estado !== "en_curso") return { desenlace: "nada" };
    if (dryRun) return { desenlace: "cerrada" };
    const r = await aplicarDesdeHubspot(
      t.id,
      t.version,
      { estado: "no_se_hara", motivo: "En HubSpot pasó a alguien que no está en el equipo de Nexus." },
      { datos: datos as unknown as object, acordado: (t.hubspotAcordado ?? {}) as object, conflictos: [] },
      ahora,
    );
    return { desenlace: r === "aplicado" ? "cerrada" : "saltada" };
  }

  const estadoNexus: EstadoSincronizado | null = t.estado === "pendiente" || t.estado === "en_curso" || t.estado === "hecha" ? t.estado : null;
  const nexus = {
    titulo: t.titulo,
    estado: estadoNexus,
    vence: comoFecha(t.venceEl),
    prioridad: (t.prioridad === "alta" || t.prioridad === "baja" ? t.prioridad : "media") as ValoresSincronizados["prioridad"],
    responsable: t.responsableEmail,
  };
  const acordado = leerAcordado(t.hubspotAcordado);
  const cambioHubspotAt = new Date(Date.parse(crudo.p.hs_lastmodifieddate ?? "") || 0);
  const cmp = comparar(acordado, nexus, hub, t.updatedAt, cambioHubspotAt);
  const hayANexus = Object.keys(cmp.aNexus).length > 0 || (contexto ?? null) !== (t.contexto ?? null);
  const hayAHubspot = Object.keys(cmp.aHubspot).length > 0;
  if (!hayANexus && !hayAHubspot && acordado) {
    if (!dryRun && JSON.stringify(datos) !== JSON.stringify(datosPrevios)) {
      await anotarSincronizacionConHubspot(t.id, { datos: datos as unknown as object, error: null }, ahora);
    }
    return { desenlace: "nada" };
  }
  if (dryRun) return { desenlace: hayANexus && hayAHubspot ? "ambos" : hayANexus ? "nexus" : hayAHubspot ? "hubspot" : "nada" };

  // 1. Lo que cambió en Nexus se escribe en HubSpot. Si no se puede, lo acordado de esos campos queda como estaba (la
  //    corrida siguiente lo vuelve a intentar) y la tarea dice por qué.
  let error: string | null = null;
  const acordadoFinal: ValoresSincronizados = { ...cmp.acordado };
  const escritos: string[] = [];
  if (hayAHubspot) {
    const { properties, sinOwner } = propiedadesParaHubspot(cmp.aHubspot, datos, eq.ownerDe);
    if (sinOwner) error = "La persona responsable no tiene usuario en HubSpot: el responsable no se cambió allá.";
    if (Object.keys(properties).length) {
      try {
        const r = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/tasks/${crudo.id}`, body: { properties } });
        if (!r.ok) throw new Error(`HubSpot ${r.status}: ${(await r.text()).slice(0, 200)}`);
        escritos.push(...Object.keys(cmp.aHubspot).filter((k) => k !== "responsable" || !sinOwner));
      } catch (e) {
        error = `No se pudo escribir en HubSpot: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400);
        for (const k of Object.keys(cmp.aHubspot) as Array<keyof ValoresSincronizados>) {
          (acordadoFinal as unknown as Record<string, unknown>)[k] = acordado ? acordado[k] : hub[k];
        }
      }
    }
  }

  // 2. Lo que cambió en HubSpot se aplica en Nexus (con su historia).
  if (hayANexus) {
    const c: CambiosDesdeHubspot = {};
    if (cmp.aNexus.titulo !== undefined) c.titulo = cmp.aNexus.titulo;
    if (cmp.aNexus.estado !== undefined) {
      c.estado = cmp.aNexus.estado;
      if (cmp.aNexus.estado === "hecha") c.completadaAt = new Date(Date.parse(crudo.p.hs_task_completion_date ?? "") || ahora.getTime());
    }
    if (cmp.aNexus.vence !== undefined) c.venceEl = cmp.aNexus.vence;
    if (cmp.aNexus.prioridad !== undefined) c.prioridad = cmp.aNexus.prioridad;
    if (cmp.aNexus.responsable) {
      const equipo = eq.equipoDe(cmp.aNexus.responsable);
      if (equipo) c.responsable = { email: cmp.aNexus.responsable, equipo };
    }
    if ((contexto ?? null) !== (t.contexto ?? null)) c.contexto = contexto;
    const r = await aplicarDesdeHubspot(
      t.id,
      t.version,
      c,
      { datos: datos as unknown as object, acordado: acordadoFinal as unknown as object, conflictos: cmp.conflictos, error },
      ahora,
    );
    if (r === "cambio-en-nexus") return { desenlace: "saltada" };
    if (escritos.length) await anotarSincronizacionConHubspot(t.id, { error, escritos, conflictos: cmp.conflictos }, ahora);
    return { desenlace: escritos.length ? "ambos" : "nexus", ...(error ? { error } : {}) };
  }

  await anotarSincronizacionConHubspot(
    t.id,
    { acordado: acordadoFinal as unknown as object, datos: datos as unknown as object, error, escritos, conflictos: cmp.conflictos },
    ahora,
  );
  return { desenlace: escritos.length ? "hubspot" : "nada", ...(error ? { error } : {}) };
}

/* ── La copia ────────────────────────────────────────────────────────────────────────── */

export async function copiarTareasDeHubspot(opciones: { dryRun?: boolean } = {}, ahora = new Date()): Promise<ResultadoDeTareasDeHubspot> {
  const res: ResultadoDeTareasDeHubspot = { traidas: 0, nuevas: 0, aplicadasEnNexus: 0, escritasEnHubspot: 0, cerradas: 0, sinCambios: 0, errores: [] };
  const dryRun = !!opciones.dryRun;
  if (!dryRun && !(await tomarLock(ahora))) return { ...res, locked: true };
  try {
    const hs = await getSystemHubspotClient();
    const eq = await equipoEnHubspot(hs);
    const owners = [...eq.porOwner.keys()];
    if (owners.length === 0) {
      res.errores.push("Nadie del equipo tiene usuario en HubSpot.");
      return res;
    }
    const desde = new Date(ahora.getTime() - DIAS_DE_COMPLETADAS * 86_400_000).toISOString();
    const [abiertas, completadas] = await Promise.all([
      buscar(hs, owners, [{ propertyName: "hs_task_status", operator: "NEQ", value: "COMPLETED" }]),
      buscar(hs, owners, [
        { propertyName: "hs_task_status", operator: "EQ", value: "COMPLETED" },
        // Por la fecha en que se completó: la de modificación la mueve HubSpot solo (una limpieza vieja la mueve toda).
        { propertyName: "hs_task_completion_date", operator: "GTE", value: desde },
      ]),
    ]);
    const crudos = new Map<string, Crudo>();
    for (const c of [...completadas, ...abiertas]) crudos.set(c.id, c);

    // Lo que Nexus tiene abierto y no volvió: se pregunta por id (se completó hace más de 7 días, cambió de dueño o se borró).
    const conocidas = await prisma.tarea.findMany({ where: { origen: "hubspot", archivadaAt: null, hubspotTaskId: { not: null } }, select: SELECT });
    const faltan = conocidas.filter((t) => !crudos.has(t.hubspotTaskId!) && (t.estado === "pendiente" || t.estado === "en_curso")).map((t) => t.hubspotTaskId!);
    if (faltan.length) for (const c of await leerPorId(hs, faltan)) crudos.set(c.id, c);
    res.traidas = crudos.size;

    const porId = new Map(conocidas.map((t) => [t.hubspotTaskId!, t]));
    const nuevas = [...crudos.keys()].filter((id) => !porId.has(id));
    const donde = nuevas.length ? await paraQuien(await asociaciones(hs, nuevas)) : () => null;

    const ids = new Set<string>([...crudos.keys(), ...faltan]);
    for (const id of ids) {
      try {
        const r = await sincronizarUna(hs, eq, porId.get(id) ?? null, crudos.get(id) ?? null, porId.has(id) ? null : donde(id), ahora, dryRun);
        if (r.desenlace === "nueva") res.nuevas++;
        else if (r.desenlace === "nexus") res.aplicadasEnNexus++;
        else if (r.desenlace === "hubspot") res.escritasEnHubspot++;
        else if (r.desenlace === "ambos") {
          res.aplicadasEnNexus++;
          res.escritasEnHubspot++;
        } else if (r.desenlace === "cerrada") res.cerradas++;
        else res.sinCambios++;
        if (r.error) res.errores.push(`tarea ${id}: ${r.error}`);
      } catch (e) {
        res.errores.push(`tarea ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return res;
  } finally {
    if (!dryRun) await soltarLock();
  }
}

// Una escritura a HubSpot por tarea a la vez (instancia única, RUNBOOK invariante #1). Desde el 2026-10-19 la ruta la
// corre después de responder (`after()`): marcar hecha y deshacer enseguida dejaba dos escrituras en carrera, y la que
// terminaba última podía dejar en HubSpot el estado de antes.
const enCurso = new Map<string, Promise<void>>();

/**
 * Justo después de que alguien cambia una tarea de HubSpot desde Nexus: la escribe allá sin esperar la corrida. Nunca
 * lanza: si HubSpot no responde, queda el error en la tarea y la corrida de los 15 minutos lo reintenta. Va en fila por
 * tarea, y cada vuelta lee la tarea como está en ese momento: la última escritura es la del último cambio.
 */
export function reflejarTareaEnHubspot(tareaId: string): Promise<void> {
  const anterior = enCurso.get(tareaId) ?? Promise.resolve();
  const p = anterior.then(() => reflejarUna(tareaId, new Date()));
  enCurso.set(tareaId, p);
  void p.then(() => {
    if (enCurso.get(tareaId) === p) enCurso.delete(tareaId);
  });
  return p;
}

async function reflejarUna(tareaId: string, ahora: Date): Promise<void> {
  try {
    const t = await prisma.tarea.findUnique({ where: { id: tareaId }, select: SELECT });
    if (!t?.hubspotTaskId) return;
    const hs = await getSystemHubspotClient();
    const [eq, crudos] = await Promise.all([equipoEnHubspot(hs), leerPorId(hs, [t.hubspotTaskId])]);
    await sincronizarUna(hs, eq, t, crudos[0] ?? null, null, ahora, false);
  } catch (e) {
    console.error(`[tareas-hubspot] no se pudo reflejar ${tareaId}:`, e instanceof Error ? e.message : e);
  }
}
