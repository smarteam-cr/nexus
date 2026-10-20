/**
 * lib/mi-dia/inicio-server.ts — los datos del inicio de cada equipo (ficha D, 2026-10-17). SERVER-ONLY, solo lectura.
 *
 *   · las cuentas que se ven a la derecha: las tuyas (CSE), toda la cartera (CSL) o los clientes con proyecto de
 *     desarrollo activo (Desarrollo), cada una con su acción de la semana, su reunión de los próximos 8 días y, a quien
 *     la puede ver, el color de la cuenta (la lectura de Éxito del cliente, lib/cs/lectura-de-la-cuenta.ts);
 *   · tus tareas de hoy (las que vencen hoy o ya vencieron, y tus reuniones planeadas de hoy);
 *   · tus tareas internas (Marketing): las de Smarteam, SmartAgro y demás trabajo interno, por ámbito.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { CLIENTE_NO_EXCLIENTE_WHERE } from "@/lib/cs/exclientes";
import { esProyectoDePipelineCS } from "@/lib/projects/scope";
import { pipelineByKey } from "@/lib/projects/kind";
import { encargadoDeLaCuenta, proyectoQueLleva } from "@/lib/cuentas/encargado";
import { nombresDelEquipo } from "@/lib/cuentas/encargado-server";
import { lecturasDelPedido } from "./lecturas-server";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { tareasDisponible } from "@/lib/tareas/servidor";
import { ABIERTAS_WHERE, PROPUESTAS_WHERE } from "@/lib/tareas/donde";
import { ambitoConDatos, datosDeAmbito } from "@/lib/tareas/ambito-server";
import type { Alcance } from "@/lib/para-ti/alcance-server";
import { servicioDeLasCuentas, type ServicioDeLaCuenta } from "./servicio-server";
import type { TareaParaUnHueco, VarianteDelInicio } from "./inicio";

export type SaludVista = "riesgo" | "senales" | "bien" | "espera" | "sin-datos";

export interface CuentaDelInicio {
  clientId: string;
  empresa: string;
  /** Quién la lleva (la CSL ve toda la cartera). */
  lleva: string | null;
  proyectos: string[];
  /** null = quien mira no ve el color de esta cuenta. */
  salud: SaludVista | null;
  /** La línea del color, o lo que se sabe de la cuenta. */
  porque: string | null;
  servicio: ServicioDeLaCuenta | null;
}

const SALUD: Record<string, SaludVista> = {
  "en-riesgo": "riesgo",
  "en-friccion": "senales",
  saludable: "bien",
  "en-espera": "espera",
  "sin-datos": "sin-datos",
};

const SELECT_PROYECTO = {
  id: true,
  name: true,
  status: true,
  serviceType: true,
  hubspotServiceId: true,
  hubspotPipelineId: true,
  proyectoInterno: true,
  hermanoCsProjectId: true,
  altaEstado: true,
  esPrueba: true,
  hubspotOwnerEmail: true,
  hubspotOwnerName: true,
  hubspotCreatedAt: true,
} as const;

/** Las cuentas de la cartera con un proyecto de Customer Success abierto, con su encargado. */
async function cuentasDeLaCartera(): Promise<{ clientId: string; empresa: string; llevaEmail: string | null; proyectos: string[] }[]> {
  const [clientes, equipo] = await Promise.all([
    prisma.client.findMany({
      where: { ...CS_CLIENT_WHERE, ...CLIENTE_NO_EXCLIENTE_WHERE, projects: { some: { status: "active" } } },
      select: { id: true, name: true, projects: { select: SELECT_PROYECTO } },
    }),
    nombresDelEquipo(),
  ]);
  return clientes.flatMap((c) => {
    const deCs = proyectosAbiertos(c.projects).filter(esProyectoDePipelineCS);
    if (!deCs.length) return [];
    // Quien lleva la cuenta, con la regla única (lib/cuentas/encargado.ts): antes, el primer proyecto con dueño.
    const lleva = encargadoDeLaCuenta(deCs.map(proyectoQueLleva), equipo.deBaja).email;
    return [{ clientId: c.id, empresa: c.name, llevaEmail: lleva, proyectos: deCs.map((p) => p.name) }];
  });
}

/** Los clientes con un proyecto de desarrollo abierto. */
async function cuentasDeDesarrollo(): Promise<{ clientId: string; empresa: string; llevaEmail: string | null; proyectos: string[] }[]> {
  const desarrollo = pipelineByKey("development").hubspotPipelineId;
  const clientes = await prisma.client.findMany({
    where: { kind: { in: ["CLIENTE", "PROSPECTO"] }, ...CLIENTE_NO_EXCLIENTE_WHERE, projects: { some: { status: "active", hubspotPipelineId: desarrollo } } },

    select: { id: true, name: true, projects: { select: SELECT_PROYECTO } },
  });
  return clientes.flatMap((c) => {
    const dev = proyectosAbiertos(c.projects).filter((p) => p.hubspotPipelineId === desarrollo);
    if (!dev.length) return [];
    return [{ clientId: c.id, empresa: c.name, llevaEmail: dev.find((p) => p.hubspotOwnerEmail)?.hubspotOwnerEmail?.toLowerCase() ?? null, proyectos: dev.map((p) => p.name) }];
  });
}

export interface CuentaBase {
  clientId: string;
  empresa: string;
  llevaEmail: string | null;
  proyectos: string[];
}

/**
 * Las cuentas de esa persona, sin más datos. CSE: las de sus proyectos; CSL: toda la cartera (con quién la lleva);
 * Desarrollo: los clientes con proyecto de desarrollo activo. Los demás, ninguna. Lo usan el inicio y «Planifica tu
 * semana».
 */
export async function cuentasBase(variante: VarianteDelInicio, a: Alcance): Promise<CuentaBase[]> {
  let base: CuentaBase[] = [];
  if (variante === "cse") {
    const por = new Map<string, { clientId: string; empresa: string; llevaEmail: string | null; proyectos: string[] }>();
    for (const p of a.proyectos) {
      const c = por.get(p.clientId) ?? { clientId: p.clientId, empresa: p.empresa, llevaEmail: a.email, proyectos: [] };
      c.proyectos.push(p.name);
      por.set(p.clientId, c);
    }
    base = [...por.values()];
  } else if (variante === "csl") {
    base = await cuentasDeLaCartera();
  } else if (variante === "dev") {
    base = await cuentasDeDesarrollo();
  }
  return base;
}

/**
 * Las cuentas del inicio de esa persona. CSE: las de sus proyectos (las que lleva, con el color); CSL: toda la cartera
 * (con quién la lleva); Desarrollo: los clientes con proyecto de desarrollo activo. Los demás, ninguna.
 */
export async function cuentasDelInicio(variante: VarianteDelInicio, a: Alcance, o: { ahora: Date; hoyISO: string }): Promise<CuentaDelInicio[]> {
  const base = await cuentasBase(variante, a);
  if (base.length === 0) return [];

  // El color: la CSL ve toda la cartera; el CSE, solo las cuentas que lleva (sin lo que habla de plata).
  const conColor =
    variante === "csl" && esLiderDeCs(a.rol)
      ? base.map((c) => c.clientId)
      : variante === "cse"
        ? [...new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId))]
        : [];
  const correos = [...new Set(base.flatMap((c) => (c.llevaEmail ? [c.llevaEmail] : [])))];
  const [servicio, lecturas, personas] = await Promise.all([
    servicioDeLasCuentas(base, { ...o, quienMira: { email: a.email, esSuperAdmin: a.rol === "SUPER_ADMIN" } }).catch(() => new Map<string, ServicioDeLaCuenta>()),
    conColor.length ? lecturasDelPedido(conColor, { sinPlata: !esLiderDeCs(a.rol), ahora: o.ahora }).catch(() => null) : Promise.resolve(null),
    correos.length ? prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } }) : Promise.resolve([]),
  ]);
  const nombreDe = new Map(personas.map((p) => [p.email.toLowerCase(), p.name]));
  return base.map((c) => {
    const l = lecturas?.get(c.clientId) ?? null;
    return {
      clientId: c.clientId,
      empresa: c.empresa,
      lleva: c.llevaEmail ? (nombreDe.get(c.llevaEmail) ?? c.llevaEmail) : null,
      proyectos: c.proyectos,
      salud: l ? (SALUD[l.salud] ?? "sin-datos") : null,
      porque: l?.porque ?? null,
      servicio: servicio.get(c.clientId) ?? null,
    };
  });
}

// ── Tus tareas ───────────────────────────────────────────────────────────────────────────────

export interface TareaDelInicio {
  id: string;
  numero: number;
  version: number;
  titulo: string;
  /** La empresa de la tarea, si tiene. */
  empresa: string | null;
  /** `AAAA-MM-DD`. */
  venceEl: string | null;
  origen: string;
  estado: string;
  /** El ámbito, para las tareas internas de Marketing: «Interno · Smarteam», «Colby»… */
  ambito: string;
  interna: boolean;
}

const comoDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const SELECT_TAREA = {
  id: true,
  numero: true,
  version: true,
  titulo: true,
  venceEl: true,
  origen: true,
  estado: true,
  clientId: true,
  projectId: true,
  client: { select: { name: true } },
} as const;

/** Tus tareas de hoy: las abiertas que vencen hoy o ya vencieron, y tus reuniones planeadas de hoy. */
export async function tareasDeHoy(email: string, hoyISO: string): Promise<{ tareas: TareaDelInicio[]; total: number }> {
  if (!(await tareasDisponible())) return { tareas: [], total: 0 };
  const desde = new Date(`${hoyISO}T00:00:00-06:00`);
  const hasta = new Date(desde.getTime() + 86_400_000);
  const where = {
    ...ABIERTAS_WHERE,
    responsableEmail: email.toLowerCase(),
    OR: [{ venceEl: { lte: new Date(`${hoyISO}T00:00:00Z`) } }, { clase: "reunion", reunionInicio: { gte: desde, lt: hasta } }],
  };
  const [filas, total] = await Promise.all([
    prisma.tarea.findMany({ where, orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }], take: 6, select: SELECT_TAREA }),
    prisma.tarea.count({ where }),
  ]);
  return { tareas: filas.map((t) => aVista(t, null)), total };
}

/**
 * Las tareas que pueden ir a un hueco libre de hoy («Con qué avanzar», fase 2, 2026-10-17): las tuyas abiertas, que no
 * son una reunión planeada ni «Por asignar», de esta semana o de antes, o que vencen hasta el viernes. Como mucho 40;
 * cuál va a cada hueco lo decide lib/mi-dia/inicio.ts › conQueAvanzar.
 */
export async function tareasParaLosHuecos(email: string, hoyISO: string): Promise<TareaParaUnHueco[]> {
  if (!(await tareasDisponible())) return [];
  const dia = (new Date(`${hoyISO}T00:00:00Z`).getUTCDay() + 6) % 7;
  const lunes = new Date(Date.parse(`${hoyISO}T00:00:00Z`) - dia * 86_400_000);
  const viernes = new Date(lunes.getTime() + 4 * 86_400_000);
  const filas = await prisma.tarea.findMany({
    where: { ...ABIERTAS_WHERE, responsableEmail: email.toLowerCase(), clase: "accion", OR: [{ semana: { lte: lunes } }, { venceEl: { lte: viernes } }] },
    orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: 40,
    select: {
      id: true,
      numero: true,
      titulo: true,
      tituloCorto: true,
      tituloCortoDe: true,
      prioridad: true,
      venceEl: true,
      semana: true,
      minutosEstimados: true,
      clientId: true,
      client: { select: { name: true } },
      proyecto: { select: { nombre: true } },
    },
  });
  return filas.map((t) => ({
    id: t.id,
    numero: t.numero,
    titulo: t.titulo,
    tituloCorto: t.tituloCortoDe === t.titulo ? t.tituloCorto : null,
    ambito: t.proyecto?.nombre ?? null,
    prioridad: t.prioridad,
    venceEl: comoDia(t.venceEl),
    semana: comoDia(t.semana),
    minutosEstimados: t.minutosEstimados,
    clientId: t.clientId,
    empresa: t.client?.name ?? null,
  }));
}

/**
 * Tus tareas internas (Marketing): las abiertas tuyas y las de tu sprint sin dueño, con su ámbito. Primero las internas
 * (Smarteam, SmartAgro…), después las de clientes y las sin clasificar.
 */
export async function tareasInternas(email: string, equipo: string | null): Promise<{ tareas: TareaDelInicio[]; porDecidir: number }> {
  if (!(await tareasDisponible())) return { tareas: [], porDecidir: 0 };
  const yo = email.toLowerCase();
  const [filas, porDecidir] = await Promise.all([
    prisma.tarea.findMany({
      where: { ...ABIERTAS_WHERE, OR: [{ responsableEmail: yo }, ...(equipo ? [{ equipo, responsableEmail: null, proyectoId: null }] : [])] },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
      take: 80,
      select: SELECT_TAREA,
    }),
    prisma.tarea.count({ where: { ...PROPUESTAS_WHERE, responsableEmail: yo } }),
  ]);
  const d = await datosDeAmbito(
    filas.map((t) => t.clientId),
    filas.map((t) => t.projectId),
  );
  const tareas = filas.map((t) => aVista(t, ambitoConDatos(d, t.clientId, t.projectId)));
  const orden = (t: TareaDelInicio) => (t.interna ? 0 : t.ambito === "Sin clasificar" ? 2 : 1);
  return { tareas: tareas.sort((a, b) => orden(a) - orden(b) || a.ambito.localeCompare(b.ambito, "es")), porDecidir };
}

function aVista(
  t: { id: string; numero: number; version: number; titulo: string; venceEl: Date | null; origen: string; estado: string; client: { name: string } | null },
  ambito: { ambito: string; etiqueta: string } | null,
): TareaDelInicio {
  return {
    id: t.id,
    numero: t.numero,
    version: t.version,
    titulo: t.titulo,
    empresa: t.client?.name ?? null,
    venceEl: comoDia(t.venceEl),
    origen: t.origen,
    estado: t.estado,
    ambito: ambito?.etiqueta ?? "Sin clasificar",
    interna: ambito?.ambito === "interno",
  };
}
