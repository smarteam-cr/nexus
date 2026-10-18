/**
 * lib/tareas/fuentes-server.ts — el sprint de cada equipo: la serie de su reunión, quiénes están y la lectura sola de
 * cada reunión nueva de esa serie (ficha A del roadmap, 2026-10-17). SERVIDOR.
 *
 * Valida y arma; las filas de `FuenteDeTareas` las escribe lib/tareas/mutaciones.ts (el único escritor). Las lecturas las pide `pedirLectura` y las tareas las escribe
 * lib/tareas/mutaciones.ts, como cualquier «Leer una reunión»: la lectura sola es la misma lectura, pedida a nombre de
 * quien configuró la serie (tiene que haber estado en la reunión: `getReunionesParaTareas` solo devuelve las suyas).
 *
 * La lectura sola corre al abrir Tareas (`mirarLasSeriesDelSprint`, como mucho cada 10 minutos por proceso) y desde
 * el job, cuando se sume a lib/jobs/defs.ts. Nunca corre la sincronización de Meet: lee lo que ya llegó.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getReunionesParaTareas, reunionesDeTuCalendarioParaTareas, salasDeReuniones } from "@/lib/sessions/reuniones-para-tareas";
import { EQUIPOS, esClaveDeEquipoValida, nombreDelEquipo } from "./equipos";
import {
  MAX_SERIES_POR_SPRINT,
  MINUTOS_ENTRE_MIRADAS,
  HORAS_PARA_LEERLA_SOLA,
  cuandoEsLaSerie,
  diaYFinDeLaReunion,
  personasPorDefecto,
  personasValidas,
  puedeConfigurarElSprint,
  seLeeSola,
} from "./fuentes";
import { rolPorDefecto, type RolDeReunion } from "./semana";
import { ErrorDeTareas, contextoDeTareas, miembrosActivos, type ContextoDeTareas } from "./servidor";
import { clientesQueVesParaTareas, type ClientesQueVes } from "./clientes";
import { pedirLectura, procesarLectura, type ResumenDeLectura } from "./lectura";
import { borrarFuente, cambiarFilaDeFuente, escribirFuente } from "./mutaciones";
import type { FuenteVista, PersonaVista, SerieCandidata, SprintDelEquipoDatos } from "./tipos";

const SELECT_FUENTE = {
  id: true,
  equipo: true,
  duenoEmail: true,
  serie: true,
  titulo: true,
  rol: true,
  diaSemana: true,
  finHora: true,
  activa: true,
  pausadaMotivo: true,
  personas: true,
  createdAt: true,
} as const;

function leerRol(r: string): RolDeReunion {
  return r === "cierre" || r === "ambos" ? r : "planning";
}

function persona(email: string, miembros: readonly { email: string; nombre: string }[]): PersonaVista {
  const m = miembros.find((x) => x.email === email.toLowerCase());
  return { email: email.toLowerCase(), nombre: m?.nombre ?? email, equipo: null };
}

/* ── Leer la configuración ───────────────────────────────────────────────────────── */

/**
 * El sprint de un equipo para la pantalla. Lo ve todo el equipo (y quien lo lidera); las series de tu calendario para
 * elegir llegan solo a quien puede configurarlo. Sin el equipo pedido: el primero que lideras, o el tuyo.
 */
export async function cargarSprint(ctx: ContextoDeTareas, clientes: ClientesQueVes, equipoPedido: string | null): Promise<SprintDelEquipoDatos> {
  const equipo = equipoPedido ?? ctx.lidera[0] ?? ctx.equipo;
  if (!EQUIPOS.some((e) => e.clave === equipo)) throw new ErrorDeTareas(400, "Ese equipo no tiene sprint.");
  const puedeConfigurar = puedeConfigurarElSprint(ctx, equipo);
  if (!puedeConfigurar && ctx.equipo !== equipo) throw new ErrorDeTareas(403, "Ese sprint es de otro equipo.");

  const filas = await prisma.fuenteDeTareas.findMany({ where: { equipo }, select: SELECT_FUENTE, orderBy: { createdAt: "asc" } });
  const ultimas = filas.length
    ? await prisma.lecturaDeReunion.findMany({
        where: { fuenteId: { in: filas.map((f) => f.id) } },
        select: { id: true, fuenteId: true, sessionId: true, estado: true, resumen: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
    : [];
  // El título y la fecha de cada reunión, por el chokepoint (lib/sessions/reuniones-para-tareas.ts).
  const salas = await salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, ultimas.flatMap((l) => (l.sessionId ? [l.sessionId] : [])));
  const porDefecto = personasPorDefecto(equipo, ctx.miembros);
  const fuentes: FuenteVista[] = filas.map((f) => {
    const elegidas = f.personas.length ? f.personas : porDefecto;
    return {
      id: f.id,
      titulo: f.titulo,
      rol: leerRol(f.rol),
      cuando: cuandoEsLaSerie(f),
      activa: f.activa,
      pausadaMotivo: f.pausadaMotivo,
      dueno: persona(f.duenoEmail, ctx.miembros),
      personas: elegidas.map((e) => persona(e, ctx.miembros)),
      personasPorDefecto: f.personas.length === 0,
      ultimas: ultimas
        .filter((l) => l.fuenteId === f.id)
        .slice(0, 3)
        .map((l) => {
          const r = (l.resumen ?? null) as ResumenDeLectura | null;
          const sala = l.sessionId ? salas.get(l.sessionId) : undefined;
          return {
            lecturaId: l.id,
            titulo: sala?.titulo ?? "Reunión",
            fecha: (sala?.inicio ?? l.createdAt).toISOString(),
            estado: l.estado,
            propuestas: r?.propuestas ?? 0,
            porAsignar: r?.porAsignar ?? 0,
            sinLugar: r?.sinLugar ?? 0,
          };
        }),
    };
  });

  let candidatas: SerieCandidata[] = [];
  if (puedeConfigurar) {
    const [reuniones, todas] = await Promise.all([
      reunionesDeTuCalendarioParaTareas({ email: ctx.email, esSuperAdmin: false, clientes }),
      prisma.fuenteDeTareas.findMany({ where: { activa: true, equipo: { not: null } }, select: { serie: true, equipo: true } }),
    ]);
    const queLaLee = new Map(todas.map((f) => [f.serie, f.equipo!]));
    const porSerie = new Map<string, SerieCandidata>();
    // Las más recientes primero: de cada serie queda la última instancia.
    for (const r of reuniones) {
      if (!r.serie || !r.puertasAdentro || porSerie.has(r.serie)) continue;
      // Una reunión suelta (sin «_» en el id del evento) no es una serie.
      if (r.serie === r.id) continue;
      const lee = queLaLee.get(r.serie);
      porSerie.set(r.serie, {
        sessionId: r.id,
        titulo: r.titulo,
        inicio: r.inicio.toISOString(),
        cuando: cuandoEsLaSerie(diaYFinDeLaReunion(r.inicio, r.fin)),
        rolSugerido: rolPorDefecto(r.inicio, r.titulo),
        participantes: r.participantes.length,
        yaLaLee: lee ? nombreDelEquipo(lee) : null,
      });
    }
    candidatas = [...porSerie.values()];
  }

  return {
    equipo,
    nombre: nombreDelEquipo(equipo),
    puedeConfigurar,
    configurables: EQUIPOS.filter((e) => puedeConfigurarElSprint(ctx, e.clave)).map((e) => ({ clave: e.clave, nombre: e.nombre })),
    fuentes,
    personas: ctx.miembros.map((m) => ({ email: m.email, nombre: m.nombre, equipo: null })),
    personasPorDefecto: porDefecto,
    candidatas,
    maxSeries: MAX_SERIES_POR_SPRINT,
  };
}

/* ── Configurar ──────────────────────────────────────────────────────────────────── */

export interface NuevaFuente {
  equipo: string;
  /** Una reunión de la serie, de tu calendario: de ahí salen la serie, el día, la hora y el título. */
  sessionId: string;
  rol?: RolDeReunion;
  personas?: string[];
}

function exigirLider(ctx: ContextoDeTareas, equipo: string) {
  if (!esClaveDeEquipoValida(equipo) || !EQUIPOS.some((e) => e.clave === equipo)) throw new ErrorDeTareas(400, "Ese equipo no tiene sprint.");
  if (!puedeConfigurarElSprint(ctx, equipo)) throw new ErrorDeTareas(403, "Solo quien lidera el sprint lo configura (Equipo › «Lidera los sprints de»).");
}

export async function crearFuente(ctx: ContextoDeTareas, clientes: ClientesQueVes, n: NuevaFuente): Promise<{ id: string }> {
  exigirLider(ctx, n.equipo);
  // Solo una reunión en la que estuviste: Nexus la va a leer a tu nombre.
  const [r] = await getReunionesParaTareas({ quien: { email: ctx.email, esSuperAdmin: false, clientes }, ids: [n.sessionId] });
  if (!r) throw new ErrorDeTareas(404, "No encuentro esa reunión entre las tuyas.");
  if (!r.serie || r.serie === r.id) throw new ErrorDeTareas(400, "Esa reunión no se repite: elige una reunión recurrente de tu calendario.");
  if (!r.puertasAdentro) throw new ErrorDeTareas(400, "Esa reunión es con un cliente: la del sprint es una reunión del equipo.");
  const activas = await prisma.fuenteDeTareas.count({ where: { equipo: n.equipo, activa: true } });
  if (activas >= MAX_SERIES_POR_SPRINT) throw new ErrorDeTareas(409, `Un sprint lee como mucho ${MAX_SERIES_POR_SPRINT} reuniones. Pausa o quita una antes.`);
  const { validas, desconocidas } = personasValidas(n.personas ?? [], ctx.miembros);
  if (desconocidas.length) throw new ErrorDeTareas(400, `No encuentro en el equipo a ${desconocidas.join(", ")}.`);
  const { diaSemana, finHora } = diaYFinDeLaReunion(r.inicio, r.fin);
  return escribirFuente({
    equipo: n.equipo,
    duenoEmail: ctx.email,
    serie: r.serie,
    titulo: r.titulo.slice(0, 200),
    rol: n.rol ?? rolPorDefecto(r.inicio, r.titulo),
    diaSemana,
    finHora,
    personas: validas,
  });
}

export interface CambiosDeFuente {
  activa?: boolean;
  rol?: RolDeReunion;
  /** Vacío = los del área y quienes lideran el sprint. */
  personas?: string[];
}

async function fuenteDelLider(ctx: ContextoDeTareas, id: string) {
  const f = await prisma.fuenteDeTareas.findUnique({ where: { id }, select: { id: true, equipo: true, duenoEmail: true } });
  if (!f || !f.equipo) throw new ErrorDeTareas(404, "Esa reunión del sprint no existe.");
  exigirLider(ctx, f.equipo);
  return f;
}

export async function cambiarFuente(ctx: ContextoDeTareas, id: string, c: CambiosDeFuente): Promise<void> {
  await fuenteDelLider(ctx, id);
  let personas: string[] | undefined;
  if (c.personas) {
    const { validas, desconocidas } = personasValidas(c.personas, ctx.miembros);
    if (desconocidas.length) throw new ErrorDeTareas(400, `No encuentro en el equipo a ${desconocidas.join(", ")}.`);
    personas = validas;
  }
  await cambiarFilaDeFuente(id, {
    ...(c.activa !== undefined ? { activa: c.activa, pausadaMotivo: c.activa ? null : `La pausó ${ctx.nombre}.` } : {}),
    ...(c.rol ? { rol: c.rol } : {}),
    ...(personas ? { personas } : {}),
  });
}

/** Quitar la serie: lo que ya se leyó queda (las lecturas pierden la referencia, no las tareas). */
export async function quitarFuente(ctx: ContextoDeTareas, id: string): Promise<void> {
  await fuenteDelLider(ctx, id);
  await borrarFuente(id);
}

/* ── La lectura sola ─────────────────────────────────────────────────────────────── */

let ultimaMirada = 0;
let mirando: Promise<ResultadoDeLaMirada> | null = null;

export interface ResultadoDeLaMirada {
  series: number;
  pedidas: number;
  pausadas: number;
  omitida?: "reciente" | "sin_tabla";
}

/**
 * Mira las series activas y pide la lectura de cada reunión nueva que terminó (lib/tareas/fuentes.ts › `seLeeSola`).
 * Como mucho una vez cada 10 minutos por proceso, nunca dos a la vez (instancia única, RUNBOOK invariante #1). NUNCA
 * lanza: lo que falla queda en la lectura o en el log.
 */
export function mirarLasSeriesDelSprint(ahora = new Date(), forzar = false): Promise<ResultadoDeLaMirada> {
  if (mirando) return mirando;
  if (!forzar && +ahora - ultimaMirada < MINUTOS_ENTRE_MIRADAS * 60_000) return Promise.resolve({ series: 0, pedidas: 0, pausadas: 0, omitida: "reciente" });
  ultimaMirada = +ahora;
  mirando = mirar(ahora)
    .catch((e) => {
      if (esquemaDesactualizado(e)) return { series: 0, pedidas: 0, pausadas: 0, omitida: "sin_tabla" as const };
      console.error("[tareas/sprint] no se pudieron mirar las series:", e instanceof Error ? e.message : e);
      return { series: 0, pedidas: 0, pausadas: 0 };
    })
    .finally(() => {
      mirando = null;
    });
  return mirando;
}

async function mirar(ahora: Date): Promise<ResultadoDeLaMirada> {
  const fuentes = await prisma.fuenteDeTareas.findMany({ where: { activa: true, equipo: { not: null } }, select: SELECT_FUENTE });
  let pedidas = 0;
  let pausadas = 0;
  const activos = await miembrosActivos();
  for (const f of fuentes) {
    const tm = activos.some((m) => m.email === f.duenoEmail.toLowerCase()) ? await prisma.teamMember.findFirst({ where: { email: { equals: f.duenoEmail, mode: "insensitive" } } }) : null;
    if (!tm) {
      // Quien la configuró ya no está: nadie puede leerla a su nombre.
      await cambiarFilaDeFuente(f.id, { activa: false, pausadaMotivo: "Quien la configuró ya no está en el equipo. La configura de nuevo quien lidera el sprint." });
      pausadas++;
      continue;
    }
    try {
      const [ctx, clientes] = await Promise.all([contextoDeTareas({ teamMember: tm }), clientesQueVesParaTareas(tm)]);
      const desde = new Date(Math.max(+f.createdAt - 86_400_000, +ahora - (HORAS_PARA_LEERLA_SOLA + 6) * 3_600_000));
      const reuniones = await getReunionesParaTareas({ quien: { email: ctx.email, esSuperAdmin: false, clientes }, desde, tope: 60 });
      const nuevas = reuniones.filter((r) => seLeeSola(r, f, ahora));
      if (!nuevas.length) continue;
      const yaLeidas = await prisma.lecturaDeReunion.findMany({ where: { sessionId: { in: nuevas.map((r) => r.id) } }, select: { sessionId: true, estado: true } });
      const estadoDe = new Map(yaLeidas.map((l) => [l.sessionId, l.estado]));
      for (const r of nuevas) {
        const estado = estadoDe.get(r.id);
        // Lo que ya se leyó no se vuelve a leer. Una que quedó sin texto se vuelve a mirar (pedirLectura la retoma solo
        // si llegaron las notas); una que falló, no: se reintenta a mano, para no pagar el mismo error cada 10 minutos.
        if (estado && estado !== "sin_texto") continue;
        try {
          const l = await pedirLectura(ctx, clientes, { sessionId: r.id, rol: leerRol(f.rol), equipo: f.equipo!, fuenteId: f.id }, ahora);
          if (!l.yaLeida && l.estado === "leyendo") {
            await procesarLectura(l.id, ahora);
            pedidas++;
          }
        } catch (e) {
          // El tope del día de quien configuró, o la reunión dejó de verse: se intenta en la mirada siguiente.
          console.error(`[tareas/sprint] no se pudo leer ${r.id} de la serie ${f.id}:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error(`[tareas/sprint] la serie ${f.id} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return { series: fuentes.length, pedidas, pausadas };
}
