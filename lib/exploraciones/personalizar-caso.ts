/**
 * lib/exploraciones/personalizar-caso.ts — personalizar un caso de uso aceptado en la preventa. SERVIDOR.
 *
 * Pedido de Elías (2026-11-08, lib/casos-de-uso/personalizar.ts): al aceptar un caso sugerido, un agente revisa el
 * contexto de la empresa, la biblioteca de actividades y la ficha del caso, y deja sus actividades personalizadas con un
 * resumen de qué cambió frente al catálogo. Una llamada por caso (`pedidoDePersonalizar`), que la pantalla espera.
 *
 * ⛔ Invariante 1: las reuniones son las DE LA PREVENTA (`reunionesDeLaExploracion`, que las toma del chokepoint de
 * sesiones de su empresa), sin las que el vendedor sacó. Nada de otro cliente.
 *
 * Lo personalizado se guarda como PROPUESTA (la versión nueva del caso, en `propuesta.items`), no sobre lo elegido: el
 * agente nunca escribe lo confirmado. La pantalla que lo pidió la usa sola si nadie tocó el caso mientras tanto
 * (`laPersonalizacionSeUsaSola`); si no, o si se cerró la pestaña, queda en la fila del caso para que el vendedor decida.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { actividadesDelCaso, bibliotecaDeActividades } from "@/lib/casos-de-uso/actividades-server";
import { actividadesPorDefecto, bibliotecaLigera } from "@/lib/casos-de-uso/armado";
import { casoDeLaPreventa, catalogoParaElAgente } from "@/lib/casos-de-uso/en-la-preventa";
import { AGENTE_DE_LA_EXPLORACION, pendientesVigentes } from "./agente";
import { exploracionParaLosCasos, loQueSeSabeParaElValor } from "./casos-de-uso";
import type { CasoDeUsoElegido, EstadoDeExploracion, ItemPropuesto } from "./contenido";
import { reunionesDeLaExploracion } from "./fuentes";
import { claveDeReunion } from "./guia";
import { leerLoLeido } from "./lo-leido";
import { leerContenido, leerPropuesta } from "./esquemas";
import { diaConAnio } from "./fechas";
import { bloqueDeInstrucciones } from "./notas-de-sesion";
import { casoPersonalizado, conLaVersionPersonalizada, leerLaPersonalizacion, pedidoDePersonalizar, type ContextoDePersonalizar } from "./personalizar-pedido";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Cuántas reuniones recientes lee y cuánto de cada minuta: alcanza para el contexto sin inflar el pedido. */
const REUNIONES_QUE_LEE = 6;
const LARGO_DE_UNA_MINUTA = 1500;

export type ResultadoDePersonalizar =
  | { ok: true; item: ItemPropuesto; seUsaSola: boolean; segundos: number }
  | { ok: false; status: number; error: string };

/** Lo de la fila que hace falta para saber cuáles son las reuniones de la preventa. */
export type FilaParaLasReuniones = Pick<FilaDeExploracion, "id" | "clientId" | "projectId" | "createdAt" | "test">;

/**
 * Las minutas de las reuniones más recientes DE LA PREVENTA, con la misma regla con que la preventa decide cuáles son
 * suyas (`reunionesDeLaExploracion`, que las toma del chokepoint de sesiones: invariante 1): las de sus sesiones y, en un
 * prospecto, las que entraron solas. Sin las de puertas adentro, sin las que se sacaron ni las de antes que ya no son de
 * ninguna sesión (revisión del 2026-11-08: antes se tomaban las 6 últimas de la empresa, y en un cliente con Customer
 * Success activo entraban sus seguimientos semanales).
 */
export async function minutasRecientes(fila: FilaParaLasReuniones, estado: EstadoDeExploracion): Promise<string> {
  const fuera = new Set(estado.contenido.fuera);
  const todas = await reunionesDeLaExploracion({
    exploracionId: fila.id,
    clientId: fila.clientId,
    projectId: fila.projectId,
    creadaEn: fila.createdAt,
    propuesta: estado.propuesta,
    leido: leerLoLeido(fila.test),
    sesiones: estado.contenido.sesiones,
    fuera: estado.contenido.fuera,
    elegidas: estado.contenido.reunionesElegidas,
  }).catch(() => []);
  const reuniones = todas
    .filter((r) => r.origen === "meet" && !r.legado && !r.puertasAdentro && !fuera.has(claveDeReunion(r)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, REUNIONES_QUE_LEE)
    .map((r) => ({ id: r.id, title: r.titulo, date: r.fecha }));
  if (!reuniones.length) return "";
  const minutas = await prisma.sessionMinute
    .findMany({ where: { sessionId: { in: reuniones.map((r) => r.id) } }, select: { sessionId: true, summary: true } })
    .catch(() => []);
  return reuniones
    .map((r) => ({ r, m: minutas.find((x) => x.sessionId === r.id)?.summary?.trim() }))
    .filter((x) => x.m)
    .map((x) => `- ${x.r.title} (${diaConAnio(x.r.date)}): ${x.m!.slice(0, LARGO_DE_UNA_MINUTA)}`)
    .join("\n");
}

/** Lo que lee el agente para personalizar (exportado para el simulacro de scripts/simular-casos-de-uso.ts). */
export async function contextoDePersonalizar(o: {
  fila: FilaParaLasReuniones;
  empresa: string;
  estado: EstadoDeExploracion;
  exploracion: string;
  useCaseId: string;
  caso: CasoDeUsoElegido;
  nombreDelArea: string | null;
}): Promise<ContextoDePersonalizar> {
  const delCatalogo = casoDeLaPreventa(o.useCaseId);
  const actsDeLaFicha = delCatalogo ? actividadesDelCaso(delCatalogo.id) : null;
  return {
    empresa: o.empresa,
    caso: {
      useCaseId: o.useCaseId,
      titulo: o.caso.titulo,
      descripcion: o.caso.descripcion ?? delCatalogo?.promesa ?? "",
      porQue: o.caso.paraVentas?.porQue || o.caso.razon || "",
      area: o.nombreDelArea,
    },
    ficha: delCatalogo ? { texto: catalogoParaElAgente([delCatalogo]), actividades: actsDeLaFicha ? actividadesPorDefecto(actsDeLaFicha) : [] } : null,
    // Las suyas solo si las cambió alguien después de la ficha (a mano, o una personalización de antes).
    actuales: o.caso.actividades?.length ? o.caso.actividades : null,
    biblioteca: bibliotecaLigera(bibliotecaDeActividades()),
    exploracion: o.exploracion,
    interno: loQueSeSabeParaElValor(o.estado),
    reuniones: await minutasRecientes(o.fila, o.estado),
    instrucciones: bloqueDeInstrucciones(o.estado.contenido.notas, "casos"),
  };
}

export async function personalizarCaso(o: { exploracionId: string; useCaseId: string; email: string | null }): Promise<ResultadoDePersonalizar> {
  const t0 = Date.now();
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa preventa no existe." };
  const fila = lectura.fila;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La preventa está archivada: el agente ya no trabaja en ella." };
  if (fila.projectId) return { ok: false, status: 409, error: "La exploración de un proyecto no arma casos de uso." };
  const estado = estadoDesdeFila(fila);
  const caso = estado.contenido.casosDeUso[o.useCaseId];
  if (!caso) return { ok: false, status: 409, error: "Ese caso ya no está elegido: acéptalo de nuevo para personalizarlo." };
  const vig = await escalaParaExplorar();
  if (vig.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus." };
  const escala = escalaDeLaExploracion(vig.general, estado);
  const exploracion = exploracionParaLosCasos(estado, escala, pendientesVigentes(estado, vig.general, escala));
  const ctx = await contextoDePersonalizar({
    fila,
    empresa: fila.client.name,
    estado,
    exploracion,
    useCaseId: o.useCaseId,
    caso,
    nombreDelArea: escala.areas.find((a) => a.id === caso.areaId)?.nombre ?? null,
  });

  // Trazabilidad (ARCHITECTURE §6 regla 5). Sin `exploracionId` en los filtros a propósito: no es una corrida del lienzo
  // (esas van de a una y la pantalla las sigue); varias personalizaciones pueden ir a la vez.
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      status: "RUNNING",
      stepLabel: "Preventa: personalizar un caso de uso",
      currentPhase: "Personalizando las actividades…",
      triggeredByEmail: o.email,
      filters: { preventa: o.exploracionId, modo: "personalizar-caso", useCaseId: o.useCaseId } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  try {
    const respuesta = await conContextoDeIA(
      { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:personalizar-caso" },
      () => getAnthropic().messages.create(pedidoDePersonalizar(ctx)),
    );
    if (respuesta.stop_reason === "max_tokens") throw new Error("La respuesta del agente salió cortada. No se cambió nada: vuelve a intentarlo.");
    const p = leerLaPersonalizacion(respuesta, ctx);
    const r = await guardarLaVersion(o.exploracionId, o.useCaseId, (actual) => casoPersonalizado(actual, p), run.id);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ useCaseId: o.useCaseId, actividades: p.actividades.length, cambios: p.personalizado.cambios, guardado: !!r }) },
    });
    if (!r) return { ok: false, status: 409, error: "Ese caso se quitó mientras se personalizaba: no se guardó nada." };
    return { ok: true, item: r.item, seUsaSola: r.seUsaSola, segundos: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    const mensaje = e instanceof Error && e.message.startsWith("La respuesta") ? e.message : humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/personalizar-caso] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}

/**
 * Deja la versión personalizada como propuesta del caso, con la fila bloqueada y releída (la cuenta, en
 * `conLaVersionPersonalizada`). null si el caso ya no está elegido o la preventa se archivó mientras tanto.
 */
async function guardarLaVersion(
  exploracionId: string,
  useCaseId: string,
  armar: (actual: CasoDeUsoElegido) => CasoDeUsoElegido,
  corridaId: string,
): Promise<{ item: ItemPropuesto; seUsaSola: boolean } | null> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: { contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true },
    });
    if (!f) return null;
    const r = conLaVersionPersonalizada(estadoDesdeFila(f), useCaseId, armar, corridaId, new Date().toISOString());
    if (!r) return null;
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: {
        propuesta: { ...leerPropuesta(f.propuesta), items: r.items } as unknown as Prisma.InputJsonValue,
        // La lápida de ese mismo id se va (no sube la versión: las lápidas no cuentan en ella).
        ...(r.descartadas ? { contenido: { ...leerContenido(f.contenido), descartadas: r.descartadas } as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return { item: r.item, seUsaSola: r.seUsaSola };
  });
}
