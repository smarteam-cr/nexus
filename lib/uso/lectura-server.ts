/**
 * lib/uso/lectura-server.ts — lo que lee la pantalla «Uso de Nexus» (etapa 4a de docs/mi-dia-plan.md). Solo lectura.
 *
 * Tres lecturas:
 *   · `usoPorPeriodo`: la pestaña «Equipo»: los días que entró cada persona y las llamadas a la IA que disparó, en el
 *     mes, trimestre, semestre o año en curso (la cuenta, en lib/uso/periodo.ts).
 *   · `usoDelEquipo`: los días con uso de cada persona en las últimas 4 semanas, para «Conclusiones».
 *   · `reunionesSinGrabar`: las reuniones con clientes y prospectos de los últimos 30 días que no dejaron
 *     transcripción, por quien las organizó, para arreglarlo en Google Workspace.
 *
 * ⚠ Por persona es dato sensible: lo ve solo dirección, en orden alfabético y sin ranking (DECISIONS, «Uso de
 * Nexus»). Sirve para entender el uso, no para evaluar a nadie.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { claveDeEquipo, EQUIPOS } from "@/lib/tareas/equipos";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { diaEnCostaRica } from "./secciones";
import { PROCESO_POR_CLAVE, procesoDeLaLlamada } from "./ia";
import { rangoDelPeriodo, usoDelPeriodo, type Periodo, type RangoDelPeriodo, type UsoDelPeriodo } from "./periodo";

const DIA_MS = 86_400_000;
export const SEMANAS_DEL_USO = 4;
export const DIAS_DE_REUNIONES_SIN_GRABAR = 30;

export interface UsoDeLaPersona {
  email: string;
  nombre: string;
  equipo: string;
  diasConUso: number;
  diasEstaSemana: number;
}

export interface UsoDelEquipo {
  faltaLaTabla: boolean;
  hoy: string;
  /** Los días de la ventana, de lunes a domingo, del más viejo al de hoy (incluye los días por venir de esta semana). */
  dias: string[];
  /** El primer día con algún registro en la tabla: desde cuándo se mide. */
  medidoDesde: string | null;
  personas: UsoDeLaPersona[];
}

/** El lunes de la semana de un día (AAAA-MM-DD). */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DIA_MS).toISOString().slice(0, 10);
}

export async function usoDelEquipo(ahora = new Date()): Promise<UsoDelEquipo> {
  const hoy = diaEnCostaRica(ahora);
  const lunes = lunesDe(hoy);
  const primerLunes = new Date(new Date(`${lunes}T12:00:00Z`).getTime() - (SEMANAS_DEL_USO - 1) * 7 * DIA_MS)
    .toISOString()
    .slice(0, 10);
  const dias = Array.from({ length: SEMANAS_DEL_USO * 7 }, (_, i) =>
    new Date(new Date(`${primerLunes}T12:00:00Z`).getTime() + i * DIA_MS).toISOString().slice(0, 10),
  );
  const vacio: UsoDelEquipo = { faltaLaTabla: true, hoy, dias, medidoDesde: null, personas: [] };
  if (!modeloDisponible(prisma.usoDeNexus)) return vacio;

  const [miembros, filas, primera] =
    (await Promise.all([
      personasDelEquipo(),
      prisma.usoDeNexus.groupBy({ by: ["personaEmail", "dia"], where: { dia: { gte: primerLunes, lte: hoy } } }),
      prisma.usoDeNexus.findFirst({ orderBy: { dia: "asc" }, select: { dia: true } }),
    ]).catch(sinLaTabla)) ?? [null, null, null];
  if (!miembros || !filas) return vacio;

  return {
    faltaLaTabla: false,
    hoy,
    dias,
    medidoDesde: primera?.dia ?? null,
    personas: miembros.map((m) => {
      const mios = filas.filter((f) => f.personaEmail === m.email).map((f) => f.dia);
      return { ...m, diasConUso: mios.length, diasEstaSemana: mios.filter((d) => d >= lunes).length };
    }),
  };
}

/** P2021/P2022: falta la tabla o una columna (el SQL no se aplicó todavía). Cualquier otro error sigue de largo. */
function sinLaTabla(e: unknown): null {
  if (e && typeof e === "object" && "code" in e && (e.code === "P2021" || e.code === "P2022")) return null;
  throw e;
}

/**
 * Las personas del equipo, sin las cuentas de prueba, por equipo y en orden alfabético dentro de cada uno. Solo las
 * activas, salvo `conLasQueYaNoEstan` (la pestaña «Equipo»: su uso del período también cuenta).
 */
async function personasDelEquipo(conLasQueYaNoEstan = false): Promise<{ email: string; nombre: string; equipo: string; activo: boolean }[]> {
  const miembros = await prisma.teamMember.findMany({
    where: conLasQueYaNoEstan ? {} : { deactivatedAt: null },
    select: { email: true, name: true, area: true, deactivatedAt: true },
  });
  const ordenDelEquipo = new Map<string, number>(EQUIPOS.map((e, i) => [e.clave, i]));
  return miembros
    .filter((m) => !esCuentaDePrueba(m.name))
    .map((m) => {
      const email = m.email.toLowerCase();
      const clave = claveDeEquipo(m.area, email);
      return {
        email,
        nombre: m.name,
        equipo: EQUIPOS.find((e) => e.clave === clave)?.nombre ?? "Sin equipo",
        activo: !m.deactivatedAt,
        orden: ordenDelEquipo.get(clave) ?? EQUIPOS.length,
      };
    })
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map(({ email, nombre, equipo, activo }) => ({ email, nombre, equipo, activo }));
}

export interface UsoPorPeriodo extends UsoDelPeriodo {
  /** Falta la tabla de pantallas: los días no se pueden contar (la IA se muestra igual). */
  faltaLaTabla: boolean;
  rango: RangoDelPeriodo;
  /** El primer día con algún registro de pantallas: desde cuándo se mide. */
  medidoDesde: string | null;
}

/**
 * «Uso de Nexus» › Equipo: los días que entró cada persona (`UsoDeNexus`) y las llamadas a la IA que disparó
 * (`LlmCall.triggeredByEmail`, por `at`) en el período en curso. La cuenta, en lib/uso/periodo.ts.
 */
export async function usoPorPeriodo(periodo: Periodo, ahora = new Date()): Promise<UsoPorPeriodo> {
  const rango = rangoDelPeriodo(periodo, diaEnCostaRica(ahora));
  const conPantallas = modeloDisponible(prisma.usoDeNexus);
  const [personas, dias, primera, llamadas, agentes] = await Promise.all([
    personasDelEquipo(true),
    conPantallas
      ? prisma.usoDeNexus.groupBy({ by: ["personaEmail", "dia"], where: { dia: { gte: rango.desde, lte: rango.hasta } } }).catch(sinLaTabla)
      : null,
    conPantallas ? prisma.usoDeNexus.findFirst({ orderBy: { dia: "asc" }, select: { dia: true } }).catch(sinLaTabla) : null,
    prisma.llmCall.groupBy({
      by: ["triggeredByEmail", "agentSlug", "origen"],
      where: { at: { gte: rango.desdeInstante }, triggeredByEmail: { not: null } },
      // `_count.costUsd` cuenta las que tienen costo: la resta son las de un modelo sin tarifa.
      _count: { _all: true, costUsd: true },
      _sum: { costUsd: true },
    }),
    prisma.agent.findMany({ select: { id: true, name: true } }),
  ]);
  // El nombre de un agente: el del catálogo (`Agent`, cuando el slug es su id); si no, el de su proceso; si no, el slug.
  const delCatalogo = new Map(agentes.map((a) => [a.id, a.name]));
  const nombreDelAgente = (slug: string | null): string => {
    if (!slug) return "Sin agente identificado";
    const proceso = procesoDeLaLlamada({ agentSlug: slug, origen: null });
    return delCatalogo.get(slug) ?? (proceso === "otros" ? slug : (PROCESO_POR_CLAVE.get(proceso)?.nombre ?? slug));
  };
  const uso = usoDelPeriodo(
    personas,
    dias ?? [],
    llamadas.map((l) => ({
      triggeredByEmail: l.triggeredByEmail,
      agentSlug: l.agentSlug,
      origen: l.origen,
      llamadas: l._count._all,
      costo: l._sum.costUsd ?? 0,
      sinTarifa: l._count._all - l._count.costUsd,
    })),
    nombreDelAgente,
  );
  return { ...uso, faltaLaTabla: dias === null, rango, medidoDesde: primera?.dia ?? null };
}

export interface OrganizadorSinGrabar {
  email: string;
  /** El nombre si es del equipo; si no, null (la organizó alguien de afuera). */
  nombre: string | null;
  conClientes: number;
  sinTranscripcion: number;
  /** De las que no tienen transcripción, cuántas tampoco dejaron notas de Gemini. */
  sinNada: number;
  /** Las más recientes sin transcripción, para revisar. */
  ejemplos: { id: string; titulo: string; dia: string; cliente: string }[];
}

export interface ReunionesSinGrabar {
  desde: string;
  conClientes: number;
  sinTranscripcion: number;
  organizadores: OrganizadorSinGrabar[];
}

/**
 * Las reuniones de Meet con un cliente o un prospecto que ya pasaron (con 6 horas para que llegue la transcripción) y
 * que Nexus ya trató de leer, sin las de puertas adentro. El dueño es `resolvedClientId` (el manual, solo si no hay).
 */
export async function reunionesSinGrabar(ahora = new Date()): Promise<ReunionesSinGrabar> {
  const desde = new Date(ahora.getTime() - DIAS_DE_REUNIONES_SIN_GRABAR * DIA_MS);
  // El techo: lo que ya pasó, con 6 horas para que llegue la transcripción.
  const techo = new Date(ahora.getTime() - 6 * 3_600_000);
  const donde = {
    date: { gte: desde, lte: techo },
    source: "google_meet",
    enrichedAt: { not: null },
    OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
  };
  // La transcripción no se trae (pesa): una segunda consulta dice cuáles no la tienen.
  const [reuniones, sinTexto, dominios, equipo] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: donde,
      select: {
        id: true, title: true, date: true, participants: true, organizerEmail: true,
        resolvedClientId: true, manualClientId: true, summary: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.firefliesSession.findMany({
      where: { AND: [donde, { OR: [{ transcript: null }, { transcript: "" }] }] },
      select: { id: true },
    }),
    dominiosDeLaCasa(),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
  ]);
  const sinTranscripcionIds = new Set(sinTexto.map((r) => r.id));
  const duenos = [...new Set(reuniones.map(duenoDeLaSesion).filter((x): x is string => !!x))];
  const clientes = await prisma.client.findMany({
    where: { id: { in: duenos }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
    select: { id: true, name: true },
  });
  const nombreDelCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const nombreDelEquipo = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));

  const porOrganizador = new Map<string, OrganizadorSinGrabar>();
  let conClientes = 0;
  let sinTranscripcion = 0;
  for (const r of reuniones) {
    const dueno = duenoDeLaSesion(r);
    const cliente = dueno ? nombreDelCliente.get(dueno) : undefined;
    if (!cliente) continue;
    if (esReunionDePuertasAdentro({ participants: r.participants, organizerEmail: r.organizerEmail }, dominios)) continue;
    const email = (r.organizerEmail ?? "sin organizador").toLowerCase();
    const o = porOrganizador.get(email) ?? {
      email,
      nombre: nombreDelEquipo.get(email) ?? null,
      conClientes: 0,
      sinTranscripcion: 0,
      sinNada: 0,
      ejemplos: [],
    };
    o.conClientes++;
    conClientes++;
    if (sinTranscripcionIds.has(r.id)) {
      o.sinTranscripcion++;
      sinTranscripcion++;
      const s = r.summary as { overview?: unknown } | null;
      if (!(typeof s?.overview === "string" && s.overview.trim())) o.sinNada++;
      if (o.ejemplos.length < 3) o.ejemplos.push({ id: r.id, titulo: r.title, dia: diaEnCostaRica(r.date), cliente });
    }
    porOrganizador.set(email, o);
  }
  return {
    desde: diaEnCostaRica(desde),
    conClientes,
    sinTranscripcion,
    organizadores: [...porOrganizador.values()]
      .filter((o) => o.sinTranscripcion > 0)
      // Primero los del equipo (se arregla en Workspace); dentro, en orden alfabético.
      .sort((a, b) => Number(!a.nombre) - Number(!b.nombre) || (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email)),
  };
}

export interface QuienEsQuien {
  /** Por correo (en minúscula): el nombre y el nombre del equipo. Incluye a quien ya no está, para lo decidido antes. */
  porCorreo: Map<string, { nombre: string; equipo: string; activo: boolean }>;
  /** Los nombres de los equipos, en el orden de siempre. */
  orden: string[];
}

/** El equipo de cada persona de Smarteam, para agrupar por equipo sin ranking. Sin las cuentas de prueba. */
export async function quienEsQuien(): Promise<QuienEsQuien> {
  const miembros = await prisma.teamMember.findMany({ select: { email: true, name: true, area: true, deactivatedAt: true } });
  const porCorreo = new Map<string, { nombre: string; equipo: string; activo: boolean }>();
  for (const m of miembros) {
    if (esCuentaDePrueba(m.name)) continue;
    const email = m.email.toLowerCase();
    const clave = claveDeEquipo(m.area, email);
    porCorreo.set(email, { nombre: m.name, equipo: EQUIPOS.find((e) => e.clave === clave)?.nombre ?? "Sin equipo", activo: !m.deactivatedAt });
  }
  return { porCorreo, orden: [...EQUIPOS.map((e) => e.nombre), "Sin equipo"] };
}
