/**
 * lib/exploraciones/descripcion-de-la-escala-server.ts — el agente que escribe la descripción de cada equipo bajo
 * «Resultado general» de la escala que ve el cliente (Elías, 8 nov). SERVIDOR.
 *
 * Una llamada con todas las áreas que se van a escribir (`pedidoDeLaDescripcion`, ./descripcion-de-la-escala.ts). Lee:
 *   - lo que deja pasar la escala al cliente (`resultadosDeLaEscala`): los niveles, las capas y lo que más frena;
 *   - lo que se vio de cada parte (el porqué y la frase del chequeo) para escribir con lo concreto de la empresa;
 *   - el contexto que el CSE escribió para cada equipo en el artefacto interno (`contextoDelEquipo`: pesa más, no sale);
 *   - las minutas de sus reuniones más recientes, de las de la exploración (`minutasRecientes`, que las toma del chokepoint
 *     de sesiones de SU empresa: invariante 1).
 * Lo interno entra para entender, no para salir: la respuesta pasa por `descripcionValida` (sin cifras que no leyó, sin
 * relleno, sin niveles, sin voseo, sin gente de Smarteam). Un área que no pasa se pide una vez más con el motivo; si
 * tampoco, no se guarda y sigue la de respaldo.
 *
 * Se guarda en `contenido.descripcionesDeLaEscala[área]` con la firma de los niveles con que se escribió: si cambian, deja
 * de salir (`descripcionDelArea`). No sube la versión. Trazabilidad: `AgentRun` + el medidor de gasto (`conContextoDeIA`).
 *
 * Quién lo llama: la ruta `POST /api/sales/exploraciones/[id]/escala/descripcion` (regenerar, a pedido) y, al crear el
 * «Acceso» de La escala, la misma ruta de acceso en segundo plano con `soloFaltantes` (no pisa lo vigente ni lo escrito a
 * mano).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { parseObject } from "@/lib/ai/section-schema";
import { prisma } from "@/lib/db/prisma";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import type { Escala } from "@/lib/escala/documento/tipos";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { AGENTE_DE_LA_EXPLORACION, nombresDelEquipo } from "./agente";
import {
  areaParaLaDescripcion,
  contextoDelEquipo,
  cualesSeGuardan,
  escribirConUnReintento,
  firmaDelArea,
  reglasDeLaDescripcion,
  type ContextoDeLaDescripcion,
  type EntornoDeLaFirma,
  type DescripcionDelArea,
  type DescripcionGuardada,
} from "./descripcion-de-la-escala";
import { resultadosDeLaEscala, type ResultadoDeUnArea } from "./escala-para-el-cliente";
import { leerContenido } from "./esquemas";
import { bloqueDeInstrucciones } from "./notas-de-sesion";
import { minutasRecientes } from "./minutas-de-la-preventa";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Lo que ve la pantalla interna de cada área de la página: su nombre, si tiene nivel y la descripción que sale. */
export interface DescripcionDeUnArea {
  areaId: string;
  nombre: string;
  /** Sin nada ubicado no hay qué describir: sale el respaldo y no se le pide al agente. */
  conAlgo: boolean;
  descripcion: DescripcionDelArea;
}

export type ResultadoDeLaDescripcion =
  | {
      ok: true;
      areas: DescripcionDeUnArea[];
      /** Las que el agente escribió y no pasaron las reglas (siguen con la de antes o la de respaldo), con el motivo. */
      descartadas: { areaId: string; motivos: string[] }[];
      segundos: number;
    }
  | { ok: false; status: number; error: string };

type Lectura = { ok: true; fila: FilaDeExploracion; deLasAreas: ResultadoDeUnArea[]; escala: Escala } | { ok: false; status: number; error: string };

/** La exploración y lo que sale hoy en su escala al cliente. Mismas puertas que `escalaParaElCliente`. */
async function leer(exploracionId: string): Promise<Lectura> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  const fila = lectura.fila;
  if (fila.projectId) {
    const p = await prisma.project.findUnique({ where: { id: fila.projectId }, select: { clientId: true, serviceType: true } });
    if (p?.clientId !== fila.clientId || p.serviceType !== SENTINEL_SERVICE_TYPE) return { ok: false, status: 409, error: "La exploración de un proyecto no se comparte con el cliente." };
  }
  const vig = await escalaParaExplorar();
  if (vig.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus." };
  const estado = estadoDesdeFila(fila);
  const escala = aplicarEdicion(vig.general, estado.edicion);
  const lienzo = escalaDeLaExploracion(vig.general, estado);
  return { ok: true, fila, escala, deLasAreas: resultadosDeLaEscala(escala, lienzo, estado) };
}

const comoArea = (x: ResultadoDeUnArea): DescripcionDeUnArea => ({
  areaId: x.resultado.areaId,
  nombre: x.resultado.areaNombre,
  conAlgo: x.resultado.preguntadas > 0,
  descripcion: x.descripcion,
});

/** El entorno de la firma de una fila: su edición, su perfil y la versión de la escala con que se calcula. */
const entornoDe = (f: Pick<FilaDeExploracion, "edicion" | "perfilCierre" | "perfilDespues">, escala: Pick<Escala, "version">): EntornoDeLaFirma => ({
  edicion: f.edicion,
  perfilCierre: f.perfilCierre,
  perfilDespues: f.perfilDespues,
  escalaVersion: escala.version,
});

/**
 * Lo que lee el agente para las áreas `aEscribir`, las reglas con que se valida lo que devuelve y la firma de cada área.
 * Exportado para el simulacro (scripts/simular-descripcion-de-la-escala.ts), que no guarda nada.
 */
export async function loQueLeeElAgente(fila: FilaDeExploracion, escala: Escala, aEscribir: readonly ResultadoDeUnArea[]) {
  const estado = estadoDesdeFila(fila);
  const ctx: ContextoDeLaDescripcion = {
    empresa: fila.client.name,
    areas: aEscribir.map((x) => areaParaLaDescripcion(escala, x.resultado, estado.contenido.chequeo, x.porExplorar, contextoDelEquipo(fila.contenido ?? {}, x.resultado.areaId))),
    reuniones: await minutasRecientes(fila, estado),
    instrucciones: bloqueDeInstrucciones(estado.contenido.notas, "exploracion"),
  };
  const reglas = { ...reglasDeLaDescripcion(ctx, escala.niveles.map((n) => n.nombre), await nombresDelEquipo()), parse: parseObject };
  const entorno = entornoDe(fila, escala);
  const firmas: Record<string, string> = Object.fromEntries(aEscribir.map((x) => [x.resultado.areaId, firmaDelArea(estado.contenido.chequeo, x.resultado.areaId, entorno)]));
  return { ctx, reglas, firmas };
}

/** La exploración y lo que sale hoy en su escala al cliente (para el simulacro). */
export async function leerParaLaDescripcion(exploracionId: string): Promise<Lectura> {
  return leer(exploracionId);
}

/** La descripción que sale hoy en cada área de la página del cliente, y de dónde salió. Solo lectura. */
export async function descripcionesDeLaEscala(exploracionId: string): Promise<ResultadoDeLaDescripcion> {
  const l = await leer(exploracionId);
  if (!l.ok) return l;
  return { ok: true, areas: l.deLasAreas.map(comoArea), descartadas: [], segundos: 0 };
}

/**
 * Le pide al agente la descripción de las áreas de la página (o solo `areaId`) y la guarda. `soloFaltantes`: solo las que
 * no tienen una vigente (la del acceso, en segundo plano: no pisa lo escrito a mano ni lo que sigue valiendo). Nunca pisa
 * una que alguien cambió mientras el agente escribía: vuelve en `descartadas` con el motivo.
 */
export async function generarDescripcionesDeLaEscala(o: {
  exploracionId: string;
  email: string | null;
  areaId?: string | null;
  soloFaltantes?: boolean;
}): Promise<ResultadoDeLaDescripcion> {
  const t0 = Date.now();
  const l = await leer(o.exploracionId);
  if (!l.ok) return l;
  const { fila, escala } = l;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: el agente ya no trabaja en ella." };
  if (o.areaId && !l.deLasAreas.some((x) => x.resultado.areaId === o.areaId)) {
    return { ok: false, status: 409, error: "Ese equipo no sale en la página del cliente." };
  }
  const aEscribir = l.deLasAreas.filter(
    (x) => x.resultado.preguntadas > 0 && (!o.areaId || x.resultado.areaId === o.areaId) && !(o.soloFaltantes && x.descripcion.vigente),
  );
  if (!aEscribir.length) {
    if (o.areaId) return { ok: false, status: 409, error: "Ese equipo todavía no tiene nada ubicado: no hay qué describir." };
    return { ok: true, areas: l.deLasAreas.map(comoArea), descartadas: [], segundos: Math.round((Date.now() - t0) / 1000) };
  }
  const alEmpezar = Object.fromEntries(aEscribir.map((x) => [x.resultado.areaId, x.descripcion.guardada?.at ?? null]));

  const { ctx, reglas, firmas } = await loQueLeeElAgente(fila, escala, aEscribir);

  // Trazabilidad (ARCHITECTURE §6 regla 5). Sin `exploracionId` en los filtros a propósito: no es una corrida del lienzo.
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      projectId: fila.projectId,
      status: "RUNNING",
      stepLabel: "La escala: la descripción de cada equipo",
      currentPhase: "Escribiendo la descripción…",
      triggeredByEmail: o.email,
      filters: { exploracion: o.exploracionId, modo: "descripcion-de-la-escala", areas: aEscribir.map((x) => x.resultado.areaId) } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:descripcion-de-la-escala" };
  try {
    const escrito = await escribirConUnReintento(ctx, reglas, (pedido) => conContextoDeIA(ia, () => getAnthropic().messages.create(pedido)));
    const ahora = new Date().toISOString();
    const nuevas: Record<string, DescripcionGuardada> = Object.fromEntries(
      Object.entries(escrito.validas).map(([a, texto]) => [a, { texto, origen: "agente" as const, firma: firmas[a], at: ahora, por: o.email }]),
    );
    const saltadas = Object.keys(nuevas).length ? await guardar(o.exploracionId, escala, { nuevas, alEmpezar, soloFaltantes: !!o.soloFaltantes }) : [];
    const descartadas = [...Object.entries(escrito.descartadas).map(([areaId, motivos]) => ({ areaId, motivos })), ...saltadas];
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ escritas: nuevas, descartadas }) },
    });
    const despues = await leer(o.exploracionId);
    if (!despues.ok) return despues;
    return { ok: true, areas: despues.deLasAreas.map(comoArea), descartadas, segundos: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    const mensaje = humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/descripcion-de-la-escala] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}

/**
 * Guarda lo escrito con la fila bloqueada y releída (`cualesSeGuardan` decide qué). Conserva las claves del Json que esta
 * versión no conoce (las de otra pieza, como el contexto de cada equipo): solo se agrega la descripción.
 */
async function guardar(
  exploracionId: string,
  escala: Pick<Escala, "version">,
  o: { nuevas: Record<string, DescripcionGuardada>; alEmpezar: Record<string, string | null>; soloFaltantes: boolean },
): Promise<{ areaId: string; motivos: string[] }[]> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: { contenido: true, archivadaEn: true, edicion: true, perfilCierre: true, perfilDespues: true },
    });
    if (!f || f.archivadaEn) return [];
    const c = leerContenido(f.contenido);
    const antes = c.descripcionesDeLaEscala ?? {};
    const entorno = entornoDe(f as Pick<FilaDeExploracion, "edicion" | "perfilCierre" | "perfilDespues">, escala);
    const { guardar: quedan, saltadas } = cualesSeGuardan({ ...o, ahora: antes, firmaDeHoy: (a) => firmaDelArea(c.chequeo, a, entorno) });
    if (!Object.keys(quedan).length) return saltadas;
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { contenido: { ...crudo, ...c, descripcionesDeLaEscala: { ...antes, ...quedan } } as unknown as Prisma.InputJsonValue },
    });
    return saltadas;
  });
}
