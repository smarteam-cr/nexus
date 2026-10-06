/**
 * lib/carga/queries.ts — lee la base y arma la carga del equipo de Customer Success. SERVER-ONLY.
 *
 * Lee reuniones, cronogramas, cuentas de la cartera y los supuestos guardados, y le pasa todo a los motores puros de
 * este módulo. Devuelve datos serializables (sin `Map`), listos para una pantalla.
 *
 * ── LO QUE LEE Y LO QUE NO ───────────────────────────────────────────────────
 * - Reuniones: solo inicio, duración, título, invitados y `resolvedClientId` (la fuente única de «de quién es»). No lee
 *   transcripciones ni resúmenes: esto mide tiempo, no arma contexto para un agente.
 * - Cronogramas de los proyectos de CARTERA (`proyectoDeCarteraWhere`), con el dueño de HubSpot como responsable.
 * - Cuentas: los clientes de la cartera con sus proyectos de cartera, su copia de HubSpot Partner y su industria.
 * ⛔ Sin montos ni salarios: la carga es de horas. El dinero vive en lib/rentabilidad.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { proyectoClasificableWhere, proyectoDeCarteraWhere } from "@/lib/projects/scope";
import { completarConfig, horasDisponibles, type ConfigCarga } from "./config";
import { filasDeCobertura, resumenDeCobertura, type FilaDeCobertura, type MedicionDeCarga } from "./cobertura";
import { correlacion, factorDeComplejidad, horasPorPuntoDeFactor, type FactorExplicado } from "./complejidad";
import { entregaEstimada, type CronogramaParaCarga } from "./entrega";
import { tiempoEnReuniones, type ReunionParaCarga, type TipoDeEmpresa } from "./reuniones";
import { diasEntre, etiquetaDelLunes, inicioDelLunes, lunesDe, lunesHasta, sumarSemanas } from "./semana";
import { cargaDePersona, cargaDelEquipo, horasPorCuenta, type CargaDelEquipo, type CargaDePersona } from "./utilizacion";

/** Pipelines de HubSpot cuyos proyectos son desarrollo o acompañamiento técnico (integraciones). */
export const PIPELINES_DE_DESARROLLO = ["Development", "Acompañamiento técnico"];
/** Roles que llevan cuentas. */
const ROLES_DE_CS = ["CSE", "CSL"] as const;
/** Semanas cerradas que se muestran y semanas que se proyectan. */
export const SEMANAS_VISTAS = 4;
export const SEMANAS_PROYECTADAS = 4;
/** Ventana para medir qué datos hay (un trimestre). */
const SEMANAS_DE_COBERTURA = 13;

// ── Supuestos ────────────────────────────────────────────────────────────────

export interface ConfigGuardada {
  config: ConfigCarga;
  /** Cuándo y quién guardó la que rige; null = rigen los de fábrica. */
  guardadaEn: string | null;
  guardadaPor: string | null;
  /** La tabla todavía no existe en esta base (falta correr su SQL): se usan los de fábrica. */
  sinTabla: boolean;
  historia: Array<{ id: string; en: string; por: string; motivo: string | null }>;
}

function esTablaFaltante(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022");
}

export async function cargarConfigCarga(): Promise<ConfigGuardada> {
  try {
    const filas = await prisma.configCarga.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    const ultima = filas[0];
    return {
      config: completarConfig(ultima?.valores ?? null),
      guardadaEn: ultima ? ultima.createdAt.toISOString() : null,
      guardadaPor: ultima?.creadoPor ?? null,
      sinTabla: false,
      historia: filas.map((f) => ({ id: f.id, en: f.createdAt.toISOString(), por: f.creadoPor, motivo: f.motivo })),
    };
  } catch (e) {
    if (!esTablaFaltante(e)) throw e;
    return { config: completarConfig(null), guardadaEn: null, guardadaPor: null, sinTabla: true, historia: [] };
  }
}

// ── La carga ─────────────────────────────────────────────────────────────────

export interface CuentaDeLaPersona {
  clienteId: string;
  nombre: string;
  horas: number;
  reuniones: number;
  preparacion: number;
  entrega: number;
  factor: number;
}

export type PersonaConCuentas = CargaDePersona & { cuentas: CuentaDeLaPersona[] };

export interface CuentaConCarga {
  clienteId: string;
  nombre: string;
  cseNombre: string | null;
  cseEmail: string | null;
  /** El dueño en HubSpot ya no está en el equipo. */
  cseDeBaja: string | null;
  factor: FactorExplicado;
  /** Horas por semana que le pide al equipo de CS (reuniones de cada persona + preparación + entrega). */
  horasSemana: number;
  /** Lo que su complejidad predice (k × factor). */
  horasEsperadas: number;
  /** horasSemana ÷ horasEsperadas: > 1,5 pide más de lo que explica su complejidad. */
  razon: number | null;
  reunionesEnLaVentana: number;
  ultimaReunion: string | null;
  etapas: string[];
}

export interface DatosDeLaCarga {
  hoy: string;
  medidoEn: string;
  semanas: Array<{ lunes: string; etiqueta: string }>;
  futuras: Array<{ lunes: string; etiqueta: string }>;
  configuracion: ConfigGuardada;
  equipo: CargaDelEquipo;
  personas: PersonaConCuentas[];
  cuentas: CuentaConCarga[];
  /** Horas por punto de factor de la cartera, y qué tanto explica el factor las horas vistas. */
  horasPorPunto: number;
  correlacion: number | null;
  /** Lo que piden por semana las cuentas sin un CSE vigente (alguien las va a tener que tomar). */
  sinCse: { horas: number; cuentas: number };
  /** Reuniones contadas y descartadas (día completo o sin duración) en la ventana. */
  reuniones: { contadas: number; descartadas: number };
  cobertura: { filas: FilaDeCobertura[]; resumen: ReturnType<typeof resumenDeCobertura> };
  /** Tareas de trabajo (no sesiones) de los cronogramas activos, por tipo de fase. */
  tareasPorTipo: Record<string, number>;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export async function cargarCargaDelEquipo(ahora = new Date()): Promise<DatosDeLaCarga> {
  const configuracion = await cargarConfigCarga();
  const config = configuracion.config;
  const lunesActual = lunesDe(ahora);
  const semanas = lunesHasta(sumarSemanas(lunesActual, -1), SEMANAS_VISTAS);
  const futuras = Array.from({ length: SEMANAS_PROYECTADAS }, (_, i) => sumarSemanas(lunesActual, i));
  const desde = inicioDelLunes(semanas[0]);
  const hasta = inicioDelLunes(lunesActual);
  const desdeCobertura = inicioDelLunes(sumarSemanas(lunesActual, -SEMANAS_DE_COBERTURA));

  const [miembros, { reuniones, empresas }, cronogramasDb, clientesDb] = await Promise.all([
    leerEquipo(),
    leerReuniones(desde, hasta),
    leerCronogramasDeCartera(),
    leerCuentasDeCartera(),
  ]);

  // Quiénes llevan cuentas, y quiénes ya no están.
  const deBaja = new Map(miembros.filter((m) => m.deactivatedAt).map((m) => [norm(m.email), m.name]));
  const equipoCs = miembros.filter(
    (m) => !m.deactivatedAt && (ROLES_DE_CS as readonly string[]).includes(m.roleEnum) && !esCuentaDePrueba(m.name),
  );
  const personasParaReuniones = miembros.map((m) => ({ email: norm(m.email), nombre: m.name, baja: m.deactivatedAt }));
  const tiempo = tiempoEnReuniones(reuniones, personasParaReuniones, equipoCs.map((m) => m.email));

  // La última reunión de cada cuenta (fuera de la ventana también), para la relación, y el factor de complejidad.
  const ultimaPorCliente = await ultimaReunionPorCliente(clientesDb.map((c) => c.id), ahora);
  const factores = factoresDeComplejidad(clientesDb, ultimaPorCliente, config, ahora);
  const factorDe = (clienteId: string) => factores.get(clienteId)?.factor ?? 1;

  // La entrega estimada de los cronogramas.
  const cronogramas = aCronogramas(cronogramasDb);
  const entrega = entregaEstimada(cronogramas, factorDe, config, ahora);

  // La carga de cada persona y del equipo.
  const nombreDe = new Map(clientesDb.map((c) => [c.id, c.name]));
  for (const e of empresas) if (!nombreDe.has(e.id)) nombreDe.set(e.id, e.name);
  const personas: PersonaConCuentas[] = equipoCs
    .map((m) => {
      // Quien entró dentro de la ventana no cuenta las semanas anteriores. `createdAt` es cuándo se dio de alta en
      // Nexus: para quien estaba desde la primera carga del equipo cae antes de la ventana y no corta nada.
      const desdeLunes = lunesDe(m.createdAt);
      const carga = cargaDePersona(
        { id: m.id, email: m.email, nombre: m.name, esCsl: m.roleEnum === "CSL", desde: desdeLunes > semanas[0] ? desdeLunes : null },
        tiempo,
        entrega,
        config,
        { semanas, futuras },
      );
      const cuentas = horasPorCuenta(m.email, tiempo, entrega, semanas, config).map((x) => ({
        ...x,
        nombre: nombreDe.get(x.clienteId) ?? "Cuenta",
        factor: factorDe(x.clienteId),
      }));
      return { ...carga, cuentas };
    })
    .sort((a, b) => Number(a.esCsl) - Number(b.esCsl) || b.promedio.utilizacion - a.promedio.utilizacion);
  const equipo = cargaDelEquipo(personas, config);

  // Las cuentas: lo que le piden al equipo de CS contra lo que su complejidad predice.
  const csEmails = new Set(equipoCs.map((m) => norm(m.email)));
  const n = semanas.length;
  const horasPorCliente = new Map<string, number>();
  for (const [clienteId, vista] of tiempo.porCuenta) {
    let h = 0;
    for (const [email, pp] of vista.porPersona) if (csEmails.has(email)) h += pp.minutos / 60 + (pp.reuniones * config.preparacionMin) / 60;
    horasPorCliente.set(clienteId, h);
  }
  for (const [, semanasDeLaPersona] of entrega.porPersona) {
    for (const l of semanas) {
      for (const [clienteId, h] of semanasDeLaPersona.get(l)?.porCliente ?? []) horasPorCliente.set(clienteId, (horasPorCliente.get(clienteId) ?? 0) + h);
    }
  }
  const base = clientesDb.map((c) => {
    const cse = cseDeLaCuenta(c, deBaja);
    const ultima = ultimaPorCliente.get(c.id) ?? null;
    return {
      clienteId: c.id,
      nombre: c.name,
      cseNombre: cse.nombre,
      cseEmail: cse.email,
      cseDeBaja: cse.deBaja,
      factor: factores.get(c.id)!,
      horasSemana: r1((horasPorCliente.get(c.id) ?? 0) / n),
      reunionesEnLaVentana: tiempo.porCuenta.get(c.id)?.reuniones ?? 0,
      ultimaReunion: ultima ? ultima.toISOString() : null,
      etapas: [...new Set(c.projects.map((p) => p.hubspotPipelineStageLabel).filter((x): x is string => !!x))],
    };
  });
  const k = horasPorPuntoDeFactor(base.map((c) => ({ factor: c.factor.factor, horasPorSemana: c.horasSemana })));
  const cuentas: CuentaConCarga[] = base
    .map((c) => {
      const horasEsperadas = r1(k * c.factor.factor);
      return { ...c, horasEsperadas, razon: horasEsperadas > 0 ? Math.round((c.horasSemana / horasEsperadas) * 100) / 100 : null };
    })
    .sort((a, b) => b.horasSemana - a.horasSemana);
  const sinCseLista = cuentas.filter((c) => !c.cseEmail);

  // Qué datos hay.
  const correosDelEquipo = new Set(miembros.filter((m) => !m.deactivatedAt).map((m) => norm(m.email)));
  const bloques = reuniones.filter(
    (r) => r.participantes.length === 1 && correosDelEquipo.has(norm(r.participantes[0])) && r.duracionMin > 0 && r.duracionMin < 480,
  );
  const cobertura = await medirCobertura({
    bloquesDeEjecucion: { eventos: bloques.length, personas: new Set(bloques.map((b) => norm(b.participantes[0]))).size },
    desde: desdeCobertura,
    hasta,
    cronogramas: cronogramasDb,
    clientes: clientesDb,
    ultimaPorCliente,
    atrasadasDelEquipo: [...entrega.atrasadas.entries()].filter(([e]) => csEmails.has(e)).reduce((a, [, x]) => a + x, 0),
    configuracion,
    deBaja,
  });

  return {
    hoy: ahora.toISOString().slice(0, 10),
    medidoEn: ahora.toISOString(),
    semanas: semanas.map((l) => ({ lunes: l, etiqueta: etiquetaDelLunes(l) })),
    futuras: futuras.map((l) => ({ lunes: l, etiqueta: etiquetaDelLunes(l) })),
    configuracion,
    equipo,
    personas,
    cuentas,
    horasPorPunto: Math.round(k * 100) / 100,
    correlacion: correlacion(cuentas.map((c) => [c.factor.factor, c.horasSemana])),
    sinCse: { horas: r1(sinCseLista.reduce((a, c) => a + c.horasSemana, 0)), cuentas: sinCseLista.length },
    reuniones: { contadas: tiempo.reunionesContadas, descartadas: tiempo.reunionesDescartadas },
    cobertura: { filas: cobertura, resumen: resumenDeCobertura(cobertura) },
    tareasPorTipo: cronogramasDb
      .flatMap((t) => t.phases.flatMap((f) => f.tasks.filter((x) => x.type !== "SESSION").map(() => f.activityType ?? "SIN")))
      .reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
  };
}

// ── Lecturas (las reusa lib/rentabilidad) ────────────────────────────────────

export async function leerEquipo() {
  return prisma.teamMember.findMany({ select: { id: true, email: true, name: true, roleEnum: true, deactivatedAt: true, createdAt: true } });
}
export type MiembroDelEquipo = Awaited<ReturnType<typeof leerEquipo>>[number];

/** Las reuniones de un período, con la empresa que materializó el clasificador (`resolvedClientId`). */
export async function leerReuniones(desde: Date, hasta: Date): Promise<{ reuniones: ReunionParaCarga[]; empresas: Array<{ id: string; name: string; kind: string }> }> {
  const sesiones = await prisma.firefliesSession.findMany({
    where: { date: { gte: desde, lt: hasta } },
    select: { id: true, date: true, duration: true, title: true, participants: true, resolvedClientId: true },
  });
  const ids = [...new Set(sesiones.map((s) => s.resolvedClientId).filter((x): x is string => !!x))];
  const empresas = ids.length ? await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, kind: true } }) : [];
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const reuniones = sesiones.map((s) => {
    const e = s.resolvedClientId ? porId.get(s.resolvedClientId) : undefined;
    return {
      id: s.id,
      inicio: s.date,
      duracionMin: s.duration,
      titulo: s.title,
      participantes: s.participants,
      cliente: e ? { id: e.id, nombre: e.name, tipo: e.kind as TipoDeEmpresa } : null,
    };
  });
  return { reuniones, empresas };
}

/** Los cronogramas de los proyectos de cartera, con el dueño de HubSpot de cada proyecto. */
export async function leerCronogramasDeCartera() {
  return prisma.projectTimeline.findMany({
    where: { project: proyectoDeCarteraWhere() },
    select: {
      anchorStartDate: true,
      project: { select: { id: true, clientId: true, hubspotOwnerEmail: true } },
      phases: {
        select: {
          order: true,
          durationWeeks: true,
          startWeek: true,
          activityType: true,
          sessionCount: true,
          tasks: { select: { weekIndex: true, status: true, party: true, type: true, dueDateOverride: true, statusChangedByEmail: true } },
        },
      },
    },
  });
}
type CronogramaDb = Awaited<ReturnType<typeof leerCronogramasDeCartera>>[number];

export function aCronogramas(filas: CronogramaDb[]): CronogramaParaCarga[] {
  return filas.map((t) => ({
    proyectoId: t.project.id,
    clienteId: t.project.clientId,
    responsableEmail: t.project.hubspotOwnerEmail,
    ancla: t.anchorStartDate,
    fases: t.phases.map((f) => ({
      orden: f.order,
      duracionSemanas: f.durationWeeks,
      semanaInicio: f.startWeek,
      tipo: f.activityType,
      tareas: f.tasks.map((x) => ({ weekIndex: x.weekIndex, estado: x.status, parte: x.party, tipo: x.type, fechaManual: x.dueDateOverride })),
    })),
  }));
}

/** Los clientes de la cartera con lo que pide el factor de complejidad. */
export async function leerCuentasDeCartera() {
  return prisma.client.findMany({
    where: { AND: [CS_CLIENT_WHERE, { projects: { some: proyectoDeCarteraWhere() } }] },
    select: {
      id: true,
      name: true,
      industry: true,
      partnerSnapshot: { select: { hubEditions: true, seats: true, uusTrend: true, fetchedAt: true } },
      projects: {
        where: proyectoDeCarteraWhere(),
        select: { hubspotOwnerEmail: true, hubspotOwnerName: true, hubspotPipelineStageLabel: true, tags: true },
      },
      _count: { select: { projects: { where: proyectoClasificableWhere({ hubspotPipelineName: { in: PIPELINES_DE_DESARROLLO } }) } } },
    },
  });
}
export type CuentaDb = Awaited<ReturnType<typeof leerCuentasDeCartera>>[number];

/** La última reunión de cada cuenta (sin ventana), para saber si la relación está fría. */
export async function ultimaReunionPorCliente(ids: string[], ahora: Date): Promise<Map<string, Date | null>> {
  if (ids.length === 0) return new Map();
  const ultimas = await prisma.firefliesSession.groupBy({
    by: ["resolvedClientId"],
    where: { resolvedClientId: { in: ids }, date: { lt: ahora }, duration: { gt: 0, lt: 480 } },
    _max: { date: true },
  });
  return new Map(ultimas.map((u) => [u.resolvedClientId as string, u._max.date]));
}

export function factoresDeComplejidad(cuentas: CuentaDb[], ultimaPorCliente: Map<string, Date | null>, config: ConfigCarga, ahora: Date): Map<string, FactorExplicado> {
  const factores = new Map<string, FactorExplicado>();
  for (const c of cuentas) {
    const ps = c.partnerSnapshot;
    const ediciones = ps?.hubEditions && typeof ps.hubEditions === "object" ? (ps.hubEditions as Record<string, string | null>) : null;
    const ultima = ultimaPorCliente.get(c.id) ?? null;
    factores.set(
      c.id,
      factorDeComplejidad(
        {
          ediciones,
          usuarios: usuariosDe(ps?.seats),
          integracion: c._count.projects > 0,
          migracion: c.projects.some((p) => p.tags.includes("crm_migration")),
          etapas: [...new Set(c.projects.map((p) => p.hubspotPipelineStageLabel).filter((x): x is string => !!x))],
          industria: c.industry?.trim() || null,
          tendenciaDeUso: ps?.uusTrend ?? null,
          diasSinReunion: ultima ? diasEntre(ultima, ahora) : null,
          nivelEscala: null,
        },
        config,
      ),
    );
  }
  return factores;
}

/** El CSE de una cuenta: el dueño en HubSpot de la mayoría de sus proyectos de cartera, o nadie si ya no está. */
export function cseDeLaCuenta(c: CuentaDb, deBaja: Map<string, string>): { nombre: string | null; email: string | null; deBaja: string | null } {
  const conteo = new Map<string, { nombre: string | null; n: number }>();
  for (const p of c.projects) {
    const e = norm(p.hubspotOwnerEmail);
    if (!e) continue;
    const x = conteo.get(e) ?? { nombre: p.hubspotOwnerName, n: 0 };
    x.n++;
    conteo.set(e, x);
  }
  const [email, dueno] = [...conteo.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? [null, null];
  const baja = email ? deBaja.get(email) ?? null : null;
  return baja ? { nombre: null, email: null, deBaja: dueno?.nombre ?? baja } : { nombre: dueno?.nombre ?? null, email, deBaja: null };
}

/** Asientos asignados (core + ventas + servicio), o null si la copia de Partner no los trae. */
export function usuariosDe(seats: unknown): number | null {
  if (!seats || typeof seats !== "object") return null;
  const s = seats as Record<string, { assigned?: number | null; limit?: number | null } | null>;
  if (!s.core?.limit && !s.sales?.limit) return null;
  return ["core", "sales", "service"].reduce((a, k) => a + (s[k]?.assigned ?? 0), 0);
}

// ── Qué datos hay ────────────────────────────────────────────────────────────

interface EntradaDeCobertura {
  /** Eventos de una sola persona del equipo, sin nadie más (bloques de foco o de ejecución), en la ventana de la carga. */
  bloquesDeEjecucion: { eventos: number; personas: number };
  desde: Date;
  hasta: Date;
  cronogramas: Array<{
    anchorStartDate: Date | null;
    phases: Array<{ sessionCount: number | null; tasks: Array<{ status: string; party: string | null; type: string | null; statusChangedByEmail: string | null }> }>;
  }>;
  clientes: Array<{
    id: string;
    industry: string | null;
    partnerSnapshot: { hubEditions: unknown; uusTrend: number | null; fetchedAt: Date } | null;
    projects: Array<{ hubspotOwnerEmail: string | null; hubspotPipelineStageLabel: string | null }>;
    _count: { projects: number };
  }>;
  ultimaPorCliente: Map<string, Date | null>;
  atrasadasDelEquipo: number;
  configuracion: ConfigGuardada;
  deBaja: Map<string, string>;
}

async function medirCobertura(e: EntradaDeCobertura): Promise<FilaDeCobertura[]> {
  const enVentana = { date: { gte: e.desde, lt: e.hasta } };
  const [total, conDuracion, diaCompleto, promedio] = await Promise.all([
    prisma.firefliesSession.count({ where: enVentana }),
    prisma.firefliesSession.count({ where: { ...enVentana, duration: { gt: 0 } } }),
    prisma.firefliesSession.count({ where: { ...enVentana, duration: { gte: 480 } } }),
    prisma.firefliesSession.aggregate({ where: { ...enVentana, duration: { gt: 0, lt: 480 } }, _avg: { duration: true } }),
  ]);

  const tareas = e.cronogramas.flatMap((t) => t.phases.flatMap((f) => f.tasks));
  const fases = e.cronogramas.flatMap((t) => t.phases);
  const proyectosDeBaja = e.clientes.flatMap((c) => c.projects).filter((p) => e.deBaja.has(norm(p.hubspotOwnerEmail)));
  const partnerAl = e.clientes.reduce<Date | null>((a, c) => (c.partnerSnapshot && (!a || c.partnerSnapshot.fetchedAt > a) ? c.partnerSnapshot.fetchedAt : a), null);

  const m: MedicionDeCarga = {
    ventana: { desde: e.desde.toISOString().slice(0, 10), hasta: new Date(+e.hasta - 86_400_000).toISOString().slice(0, 10) },
    reuniones: { total, conDuracion, diaCompleto, promedioMin: Math.round(promedio._avg.duration ?? 0) },
    bloquesDeEjecucion: e.bloquesDeEjecucion,
    tareas: {
      total: tareas.length,
      sesiones: tareas.filter((t) => t.type === "SESSION").length,
      deTrabajo: tareas.filter((t) => t.type !== "SESSION").length,
      conParte: tareas.filter((t) => t.party).length,
      conHoras: 0,
      cronogramas: e.cronogramas.length,
      cronogramasConFecha: e.cronogramas.filter((t) => t.anchorStartDate).length,
      abiertasDelEquipoVencidas: e.atrasadasDelEquipo,
      cerradasConQuien: tareas.filter((t) => t.status === "DONE" && t.statusChangedByEmail).length,
    },
    cuentas: {
      total: e.clientes.length,
      conPartner: e.clientes.filter((c) => c.partnerSnapshot?.hubEditions).length,
      partnerAl: partnerAl ? partnerAl.toISOString().slice(0, 10) : null,
      conIntegracion: e.clientes.filter((c) => c._count.projects > 0).length,
      conIndustria: e.clientes.filter((c) => c.industry?.trim()).length,
      conEtapa: e.clientes.filter((c) => c.projects.some((p) => p.hubspotPipelineStageLabel)).length,
      conReunion: e.clientes.filter((c) => e.ultimaPorCliente.get(c.id)).length,
      conEscala: 0,
      conTendencia: e.clientes.filter((c) => c.partnerSnapshot?.uusTrend != null).length,
    },
    fases: { total: fases.length, conSesiones: fases.filter((f) => f.sessionCount != null).length },
    capacidad: { guardada: !!e.configuracion.guardadaEn, personasAjustadas: Object.keys(e.configuracion.config.personas).length },
    duenos: { proyectosDeBaja: proyectosDeBaja.length, personasDeBaja: new Set(proyectosDeBaja.map((p) => norm(p.hubspotOwnerEmail))).size },
  };
  return filasDeCobertura(m);
}

/** Horas disponibles de un CSE nuevo con los supuestos vigentes (para la contratación). */
export function horasDeUnCse(config: ConfigCarga): number {
  return horasDisponibles(config, "__nuevo__");
}

/** Cuántas cuentas tienen el dato de cada variable del factor (para «Cómo se calcula»). */
export function coberturaDeVariables(cuentas: CuentaConCarga[]): Record<string, { con: number; total: number }> {
  const out: Record<string, { con: number; total: number }> = {};
  for (const c of cuentas) {
    for (const v of c.factor.variables) {
      const x = (out[v.clave] ??= { con: 0, total: 0 });
      x.total++;
      if (v.estado !== "falta") x.con++;
    }
  }
  return out;
}
