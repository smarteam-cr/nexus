/**
 * lib/uso/lectura-server.ts — lo que lee la pantalla «Uso de Nexus» (etapa 4a de docs/mi-dia-plan.md). Solo lectura.
 *
 * Dos lecturas:
 *   · `usoDelEquipo`: las aperturas del latido (`UsoDeNexus`) por persona, día y sección, de las últimas 4 semanas.
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
import { diaEnCostaRica, nombreDeLaSeccion } from "./secciones";

const DIA_MS = 86_400_000;
export const SEMANAS_DEL_USO = 4;
export const DIAS_DE_REUNIONES_SIN_GRABAR = 30;

export interface SeccionDeLaPersona {
  clave: string;
  nombre: string;
  aperturas: number;
  dias: number;
}

export interface UsoDeLaPersona {
  email: string;
  nombre: string;
  equipo: string;
  /** Aperturas por día (AAAA-MM-DD); un día sin aperturas no viene. */
  porDia: Record<string, number>;
  diasConUso: number;
  diasEstaSemana: number;
  aperturas: number;
  secciones: SeccionDeLaPersona[];
  /** La hora en que suele abrir Nexus y la última del día (mediana, HH:MM en Costa Rica). */
  horaPrimera: string | null;
  horaUltima: string | null;
  /** El último día con uso, aunque sea antes de las 4 semanas. */
  ultimoDia: string | null;
}

export interface UsoDelEquipo {
  faltaLaTabla: boolean;
  hoy: string;
  /** Los días de la ventana, de lunes a domingo, del más viejo al de hoy (incluye los días por venir de esta semana). */
  dias: string[];
  /** El primer día con algún registro en la tabla: desde cuándo se mide. */
  medidoDesde: string | null;
  personas: UsoDeLaPersona[];
  /** Por sección, en la ventana: cuántas personas la abrieron y cuántas veces. */
  porSeccion: { clave: string; nombre: string; personas: number; aperturas: number }[];
}

const hhmm = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(11, 16);

function mediana(xs: string[]): string | null {
  if (!xs.length) return null;
  const o = [...xs].sort();
  return o[Math.floor((o.length - 1) / 2)];
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
  const vacio: UsoDelEquipo = { faltaLaTabla: true, hoy, dias, medidoDesde: null, personas: [], porSeccion: [] };
  if (!modeloDisponible(prisma.usoDeNexus)) return vacio;

  const [miembros, filas, primera, ultimos] = await Promise.all([
    prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true, area: true }, orderBy: { name: "asc" } }),
    prisma.usoDeNexus.findMany({ where: { dia: { gte: primerLunes, lte: hoy } } }),
    prisma.usoDeNexus.findFirst({ orderBy: { dia: "asc" }, select: { dia: true } }),
    prisma.usoDeNexus.groupBy({ by: ["personaEmail"], _max: { dia: true } }),
  ]).catch((e: unknown) => {
    if (e && typeof e === "object" && "code" in e && (e.code === "P2021" || e.code === "P2022")) return null;
    throw e;
  }) ?? [null, null, null, null];
  if (!miembros || !filas || !ultimos) return vacio;

  const ultimoPorPersona = new Map(ultimos.map((u) => [u.personaEmail, u._max.dia]));
  const ordenDelEquipo = new Map<string, number>(EQUIPOS.map((e, i) => [e.clave, i]));
  const personas: (UsoDeLaPersona & { orden: number })[] = miembros
    .filter((m) => !esCuentaDePrueba(m.name))
    .map((m) => {
      const email = m.email.toLowerCase();
      const clave = claveDeEquipo(m.area, email);
      const mias = filas.filter((f) => f.personaEmail === email);
      const porDia: Record<string, number> = {};
      const porSeccion = new Map<string, { aperturas: number; dias: Set<string> }>();
      const primeras = new Map<string, Date>();
      const ultimas = new Map<string, Date>();
      for (const f of mias) {
        porDia[f.dia] = (porDia[f.dia] ?? 0) + f.aperturas;
        const s = porSeccion.get(f.seccion) ?? { aperturas: 0, dias: new Set<string>() };
        s.aperturas += f.aperturas;
        s.dias.add(f.dia);
        porSeccion.set(f.seccion, s);
        if (!primeras.has(f.dia) || f.primeraAt < primeras.get(f.dia)!) primeras.set(f.dia, f.primeraAt);
        if (!ultimas.has(f.dia) || f.ultimaAt > ultimas.get(f.dia)!) ultimas.set(f.dia, f.ultimaAt);
      }
      const diasConUso = Object.keys(porDia).length;
      return {
        email,
        nombre: m.name,
        equipo: EQUIPOS.find((e) => e.clave === clave)?.nombre ?? "Sin equipo",
        orden: ordenDelEquipo.get(clave) ?? EQUIPOS.length,
        porDia,
        diasConUso,
        diasEstaSemana: Object.keys(porDia).filter((d) => d >= lunes).length,
        aperturas: Object.values(porDia).reduce((a, b) => a + b, 0),
        secciones: [...porSeccion.entries()]
          .map(([c, s]) => ({ clave: c, nombre: nombreDeLaSeccion(c), aperturas: s.aperturas, dias: s.dias.size }))
          .sort((a, b) => b.dias - a.dias || b.aperturas - a.aperturas || a.nombre.localeCompare(b.nombre)),
        horaPrimera: mediana([...primeras.values()].map(hhmm)),
        horaUltima: mediana([...ultimas.values()].map(hhmm)),
        ultimoDia: ultimoPorPersona.get(email) ?? null,
      };
    });
  personas.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

  const porSeccion = new Map<string, { personas: Set<string>; aperturas: number }>();
  for (const f of filas) {
    const s = porSeccion.get(f.seccion) ?? { personas: new Set<string>(), aperturas: 0 };
    s.personas.add(f.personaEmail);
    s.aperturas += f.aperturas;
    porSeccion.set(f.seccion, s);
  }

  return {
    faltaLaTabla: false,
    hoy,
    dias,
    medidoDesde: primera?.dia ?? null,
    personas: personas.map(({ orden: _o, ...p }) => (void _o, p)),
    porSeccion: [...porSeccion.entries()]
      .map(([clave, s]) => ({ clave, nombre: nombreDeLaSeccion(clave), personas: s.personas.size, aperturas: s.aperturas }))
      .sort((a, b) => b.personas - a.personas || b.aperturas - a.aperturas),
  };
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
