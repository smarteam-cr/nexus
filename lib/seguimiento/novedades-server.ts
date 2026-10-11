/**
 * lib/seguimiento/novedades-server.ts — LEER las novedades de un proyecto y DECIDIRLAS (memoria de la cuenta, etapa 6).
 * SERVIDOR. Ver docs/DECISIONS.md «Hechos, enrutador y novedades».
 *
 *   · `novedadesDelProyecto` — los hechos pendientes del proyecto (y los de la cuenta con destino en una pieza del
 *     proyecto), con el cálculo puro de lib/seguimiento/novedades.ts. Lo leen la ruta GET de las novedades, el listado
 *     de canvases y la siembra de la ficha (el número del riel), que tienen que dar lo mismo.
 *   · `decidirNovedad` — «Listo», «No aplica» o el acuerdo del chat que la llevaba. ⛔ No escribe la tabla: decide por
 *     `decidirDestinoDeHecho` de lib/seguimiento/hechos-server.ts, el único escritor (hechos-internos.test.ts).
 *   · Los lectores de la tarjeta de la reunión y de Procesos.
 *
 * ⛔ Con `SEGUIMIENTO_HECHOS` apagada (vacía = apagada) o sin el SQL (scripts/sql/2026-10-10-hechos-de-reunion.sql),
 * nada de esto se ve y nada se rompe: todo devuelve vacío.
 * ⛔ No lee `FirefliesSession` ni `SessionProject` por su cuenta (lib/seguimiento/guardas.test.ts): la pertenencia de la
 * reunión la decide el chokepoint (`whereBelongsToClient`), y de la reunión solo se trae el título.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { canvasNotOf, onlyEnabled } from "@/lib/pieces/canvas-query";
import { loadCanvasesConContenido } from "@/lib/pieces/piece-content";
import { whereBelongsToClient, whereVinculadaAlProyecto } from "@/lib/sessions/project-sources";
import { DESTINOS, destinoPorClave } from "./destinos";
import { leerDestinos, type AccionSobreElDestino } from "./hechos/estado";
import { DIAS_PARA_VENCER } from "./hechos/tipos";
import { decidirDestinoDeHecho, hechosActivos, hechosDisponible } from "./hechos-server";
import { conteoDeNovedades, novedadesPorPieza, pideDecisionDeNovedad, type HechoParaNovedades, type NovedadesDeLaPieza } from "./novedades";

const DIA_MS = 86_400_000;

/** Los tipos de hecho que pueden dejar una novedad (los que tienen un destino de salida «novedad»). */
const TIPOS_CON_NOVEDAD = [...new Set(DESTINOS.filter((d) => d.salida === "novedad").flatMap((d) => d.tipos))];

/** Corre una lectura de la tabla; sin la tabla (o con el cliente viejo), el valor de respaldo. */
async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    if (!(await hechosDisponible())) return respaldo;
    return await fn();
  } catch (e) {
    if (esquemaDesactualizado(e)) return respaldo;
    throw e;
  }
}

const SELECT_HECHO = {
  id: true,
  tipo: true,
  tema: true,
  frase: true,
  cita: true,
  huella: true,
  estado: true,
  createdAt: true,
  fechaDeLaReunion: true,
  destinos: true,
  projectId: true,
  sessionId: true,
  citaFuente: true,
  // Solo el título de la reunión, para decir de dónde sale: nunca su contenido.
  session: { select: { title: true } },
} as const;

type FilaDeHecho = {
  id: string;
  tipo: string;
  tema: string | null;
  frase: string;
  cita: string;
  huella: string;
  estado: string;
  createdAt: Date;
  fechaDeLaReunion: Date;
  destinos: unknown;
  projectId: string | null;
  sessionId: string | null;
  citaFuente: string;
  session: { title: string | null } | null;
};

const aHecho = (f: FilaDeHecho): HechoParaNovedades => ({
  id: f.id,
  tipo: f.tipo,
  tema: f.tema,
  frase: f.frase,
  cita: f.cita,
  huella: f.huella,
  estado: f.estado,
  createdAt: f.createdAt,
  fechaDeLaReunion: f.fechaDeLaReunion,
  destinos: f.destinos,
  projectId: f.projectId,
  sessionId: f.sessionId,
  reunionTitulo: f.session?.title ?? null,
  citaFuente: f.citaFuente,
});

/**
 * Las piezas del proyecto que ya tienen contenido (el mismo criterio que el riel: lib/pieces/piece-content.ts). Una
 * novedad existe solo ahí. Lo usan las novedades y la tarjeta de la reunión.
 */
export async function piezasConContenidoDelProyecto(projectId: string): Promise<string[]> {
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId, ...canvasNotOf("handoff"), ...onlyEnabled },
    select: { id: true, slug: true },
  });
  const con = await loadCanvasesConContenido(projectId, canvases);
  return canvases.filter((c) => c.slug && con.has(c.id)).map((c) => c.slug!);
}

export interface NovedadesDelProyecto {
  /** false = la bandera apagada o sin el SQL: la pantalla no muestra nada. */
  activas: boolean;
  porPieza: Record<string, NovedadesDeLaPieza>;
}

/**
 * Las novedades de un proyecto, por documento. `piezasConContenido` la pasan quienes ya la calcularon (el listado de
 * canvases y la siembra de la ficha); sin ella, se calcula acá. Solo de reuniones que siguen siendo del cliente.
 */
export async function novedadesDelProyecto(
  projectId: string,
  opts: { piezasConContenido?: Iterable<string>; ahora?: Date } = {},
): Promise<NovedadesDelProyecto> {
  const vacio: NovedadesDelProyecto = { activas: false, porPieza: {} };
  if (!(await hechosActivos())) return vacio;
  const ahora = opts.ahora ?? new Date();
  return seguro(async () => {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (!project) return vacio;
    const [filas, piezas] = await Promise.all([
      prisma.hechoDeReunion.findMany({
        where: {
          clientId: project.clientId,
          estado: "pendiente",
          tipo: { in: TIPOS_CON_NOVEDAD },
          createdAt: { gte: new Date(+ahora - (DIAS_PARA_VENCER + 1) * DIA_MS) },
          // De la cuenta, o del proyecto con la reunión todavía vinculada (una reunión que alguien desvinculó deja de
          // proponerle novedades a este proyecto).
          OR: [{ projectId: null }, { projectId, OR: [{ sessionId: null }, { session: whereVinculadaAlProyecto(projectId) }] }],
          AND: [{ OR: [{ sessionId: null }, { session: whereBelongsToClient(project.clientId) }] }],
        },
        orderBy: { fechaDeLaReunion: "desc" },
        take: 200,
        select: SELECT_HECHO,
      }),
      opts.piezasConContenido ? Promise.resolve([...opts.piezasConContenido]) : piezasConContenidoDelProyecto(projectId),
    ]);
    return { activas: true, porPieza: novedadesPorPieza(filas.map(aHecho), piezas, ahora) };
  }, vacio);
}

/** El número del riel, por pieza (vacío con la bandera apagada o sin el SQL). Nunca lanza. */
export async function conteoDeNovedadesDelProyecto(projectId: string, piezasConContenido: Iterable<string>): Promise<Record<string, number>> {
  try {
    const n = await novedadesDelProyecto(projectId, { piezasConContenido });
    return conteoDeNovedades(n.porPieza);
  } catch (e) {
    console.error("[novedades] el conteo falló (no bloqueante):", e instanceof Error ? e.message : e);
    return {};
  }
}

export type ResultadoDeDecidirNovedad =
  | { ok: true; decididos: string[] }
  | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Una persona decide una novedad de un documento: «usar» (el acuerdo del chat que la llevaba, o «Listo») o «desestimar»
 * («No aplica»). Decide TODAS las secciones pendientes de ese documento en el hecho. El hecho tiene que ser del proyecto
 * (o de la cuenta del mismo cliente). La guarda de acceso y de permiso la pone la ruta.
 */
export async function decidirNovedad(o: {
  projectId: string;
  hechoId: string;
  pieza: string;
  accion: AccionSobreElDestino;
  quien: string;
  nota?: string | null;
  reemplazaAId?: string | null;
}): Promise<ResultadoDeDecidirNovedad> {
  if (!(await hechosActivos())) return { ok: false, status: 503, error: "Las novedades de las reuniones están apagadas." };
  const fila = await seguro(async () => {
    const [project, h] = await Promise.all([
      prisma.project.findUnique({ where: { id: o.projectId }, select: { clientId: true } }),
      prisma.hechoDeReunion.findUnique({ where: { id: o.hechoId }, select: { clientId: true, projectId: true, destinos: true } }),
    ]);
    return project && h && h.clientId === project.clientId && (h.projectId === o.projectId || h.projectId === null) ? h : null;
  }, null);
  if (!fila) return { ok: false, status: 404, error: "Esa novedad no es de este proyecto." };

  const claves = leerDestinos(fila.destinos)
    .filter((d) => d.estado === "pendiente")
    .map((d) => d.clave)
    .filter((c) => {
      const reg = destinoPorClave(c);
      return reg?.salida === "novedad" && reg.pieza === o.pieza;
    });
  if (!claves.length) return { ok: false, status: 409, error: "Esa novedad ya se decidió." };

  const decididos: string[] = [];
  for (const [i, clave] of claves.entries()) {
    const r = await decidirDestinoDeHecho({
      hechoId: o.hechoId,
      clave,
      accion: o.accion,
      quien: o.quien,
      nota: o.nota ?? null,
      // El reemplazo de un acuerdo viejo se escribe una sola vez (con la primera sección).
      reemplazaAId: i === 0 ? (o.reemplazaAId ?? null) : null,
    });
    if (r.ok) decididos.push(clave);
    else if (r.motivo === "reemplazo_invalido") return { ok: false, status: 409, error: "Ese acuerdo no se puede reemplazar con esta novedad." };
    else if (r.motivo === "sin_sql") return { ok: false, status: 503, error: "A la base le falta el SQL de los hechos." };
  }
  if (!decididos.length) return { ok: false, status: 409, error: "Otra persona la decidió mientras tanto. Recarga para ver cómo quedó." };
  return { ok: true, decididos };
}

/* ── Procesos: «Volver a mapear» ───────────────────────────────────────────────────── */

/** Los hechos de cómo trabaja hoy el cliente que siguen pendientes (vacío con la bandera apagada o sin el SQL). */
export async function hechosDeProcesoHoyPendientes(clientId: string, ahora = new Date()): Promise<HechoParaNovedades[]> {
  if (!(await hechosActivos())) return [];
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: {
        clientId,
        tipo: "proceso_hoy",
        estado: "pendiente",
        createdAt: { gte: new Date(+ahora - (DIAS_PARA_VENCER + 1) * DIA_MS) },
        AND: [{ OR: [{ sessionId: null }, { session: whereBelongsToClient(clientId) }] }],
      },
      take: 500,
      select: SELECT_HECHO,
    });
    return filas.map(aHecho);
  }, []);
}

/* ── «Para ti»: lo que dejaron tus reuniones ───────────────────────────────────────── */

/**
 * Por reunión, cuántos hechos tienen una novedad que quien mira puede decidir: la misma regla que la tarjeta
 * (`pideDecisionDeNovedad`), así el renglón «Lo que dejaron tus reuniones» de «Para ti» cuenta lo mismo que la tarjeta.
 * Solo de reuniones que siguen siendo de su cliente. Vacío con la bandera apagada, sin el SQL o sin piezas que decida.
 */
export async function novedadesPorDecidirPorReunion(
  reuniones: readonly { sessionId: string; clientId: string }[],
  piezasQueDecide: ReadonlySet<string>,
  ahora = new Date(),
): Promise<Map<string, number>> {
  const vacio = new Map<string, number>();
  if (!reuniones.length || !piezasQueDecide.size || !(await hechosActivos())) return vacio;
  const porCliente = new Map<string, Set<string>>();
  for (const r of reuniones) porCliente.set(r.clientId, (porCliente.get(r.clientId) ?? new Set()).add(r.sessionId));
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: {
        estado: "pendiente",
        tipo: { in: TIPOS_CON_NOVEDAD },
        projectId: { not: null },
        createdAt: { gte: new Date(+ahora - (DIAS_PARA_VENCER + 1) * DIA_MS) },
        OR: [...porCliente].map(([clientId, ids]) => ({ clientId, sessionId: { in: [...ids] }, session: whereBelongsToClient(clientId) })),
      },
      take: 1_000,
      select: { sessionId: true, projectId: true, estado: true, createdAt: true, destinos: true },
    });
    // Los documentos con contenido, solo de los proyectos con alguna novedad pendiente que quien mira decide.
    const conNovedad = filas.filter((f) => pideDecisionDeNovedad(f, piezasQueDecide, () => piezasQueDecide, ahora));
    const proyectos = [...new Set(conNovedad.map((f) => f.projectId!))];
    const contenido = new Map(
      await Promise.all(proyectos.map(async (id) => [id, new Set(await piezasConContenidoDelProyecto(id).catch(() => [] as string[]))] as const)),
    );
    const out = new Map<string, number>();
    for (const f of conNovedad) {
      if (!f.sessionId || !pideDecisionDeNovedad(f, piezasQueDecide, (id) => contenido.get(id) ?? new Set(), ahora)) continue;
      out.set(f.sessionId, (out.get(f.sessionId) ?? 0) + 1);
    }
    return out;
  }, vacio);
}

/* ── La tarjeta de la reunión ──────────────────────────────────────────────────────── */

export interface HechoDeLaTarjetaLeido extends HechoParaNovedades {
  quien: string | null;
}

/**
 * Los hechos de UNA reunión, para la tarjeta «Lo que dejó esta reunión». Solo los del dueño de hoy (un hecho del dueño
 * anterior quedó desestimado al cambiar de dueño) y sin desestimar. Vacío con la bandera apagada o sin el SQL.
 */
export async function hechosDeLaReunion(sessionId: string, clientId: string): Promise<HechoDeLaTarjetaLeido[]> {
  if (!(await hechosActivos())) return [];
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: { sessionId, clientId, estado: { not: "desestimado" }, tipo: { notIn: ["senal_cronograma", "senal_etapa"] } },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { ...SELECT_HECHO, quien: true },
    });
    return filas.map((f) => ({ ...aHecho(f), quien: f.quien }));
  }, []);
}

/**
 * «Usar todo» de la tarjeta: da por usadas las novedades que se vieron (cada una por `decidirDestinoDeHecho`). Devuelve
 * las que entraron y las que no, con su motivo. Nunca toca la ficha, la etapa, las alertas ni el avance: esas claves no
 * llegan acá (las filtra la forma del plan, lib/seguimiento/tarjeta.ts).
 */
export async function usarNovedadesDeLaReunion(
  lista: readonly { hechoId: string; clave: string }[],
  quien: string,
): Promise<{ usadas: { hechoId: string; clave: string }[]; rechazadas: { hechoId: string; clave: string; motivo: string }[] }> {
  const usadas: { hechoId: string; clave: string }[] = [];
  const rechazadas: { hechoId: string; clave: string; motivo: string }[] = [];
  for (const x of lista) {
    if (destinoPorClave(x.clave)?.salida !== "novedad") {
      rechazadas.push({ ...x, motivo: "No es una novedad de un documento." });
      continue;
    }
    const r = await decidirDestinoDeHecho({ hechoId: x.hechoId, clave: x.clave, accion: "usar", quien, nota: "Usada desde «Lo que dejó esta reunión»." });
    if (r.ok) usadas.push(x);
    else rechazadas.push({ ...x, motivo: r.motivo === "ya_decidido" ? "Otra persona ya la decidió." : "No se pudo." });
  }
  return { usadas, rechazadas };
}
