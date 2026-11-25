import "server-only";

/**
 * lib/exploraciones/posicionar-fuentes.ts — LO QUE LEE «Actualizar escala» (La cuenta › La escala). SERVIDOR.
 *
 * Todo lo que Nexus sabe de la cuenta, cada cosa con su id (2026-10-18, iniciativa 2 de «La siguiente serie»):
 *   · lo que dijo o hizo el cliente — respalda un nivel (`esFuenteDelCliente`):
 *       T (el test) y H (su actividad en HubSpot), V0 (el handoff), Q0 (los cuestionarios) y S (las reuniones que ya se
 *       leyeron, en resumen: su minuta y sus notas, por el chokepoint; primero las que alguien unió a una sesión);
 *   · lo que sabe el equipo — también respalda un nivel desde el 25 nov (Elías: «Puede fijar el nivel»): N1, N2… (las notas
 *       de «Lo que sabes del cliente», con quién las escribió; notas-del-equipo.ts › `notasParaUbicar`);
 *   · lo que sirve para entender — nunca respalda un nivel:
 *       G (las ventas ganadas), B (las propuestas, con servicios y licencias aparte), J0 (las tareas abiertas, por la
 *       puerta de Tareas), R0 (el cronograma), A0 y A1 (la memoria de la cuenta y del proyecto, por el cargador de
 *       lib/memoria), K0 (el kickoff), P0 (lo que estimó la preventa) y E0, C0, D0 (la ficha de HubSpot).
 * Nada se marca como leído y la guía de la exploración no se toca: ubicar la escala no es leer una reunión.
 * Lo que falla se omite: el agente lee lo demás.
 */
import { prisma } from "@/lib/db/prisma";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";
import { loadSelectedUseCases } from "@/lib/business-cases/use-cases";
import { inversionDelDocumento } from "@/lib/landing/forma-de-pago";
import { memoriaDeLaCuenta, memoriaDelProyecto } from "@/lib/memoria";
import { tareasDeLaCuentaParaAgentes } from "@/lib/tareas/para-agentes";
import { FUENTES_DE_POSICIONAR } from "./agente-pedido";
import { reunionesElegidasDeLaEmpresa } from "./escala-de-la-cuenta";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { fuentesDeHubspotSinMarcar, reunionesEnResumen } from "./fuentes";
import { fuentesDelProyecto } from "./fuentes-del-proyecto";
import type { Fuente } from "./fuentes-tipos";
import type { AutorDeLaNota } from "./contenido";
import { notasParaUbicar, notasQueLeeUbicar } from "./notas-del-equipo";
import { textoDeLaPropuesta, textoDeLasTareas, textoDeLasVentas, textoDelCronograma, type VentaParaElTexto } from "./posicionar";

const seguro = <T,>(p: Promise<T>, vacio: T, que: string): Promise<T> =>
  p.catch((e) => {
    console.error(`[exploraciones/posicionar] no se pudo leer ${que}`, e);
    return vacio;
  });

/** Las ventas ganadas de la empresa (vigentes, sin las de prueba), para el texto y para elegir sobre cuál se ubica. */
export async function ventasDeLaEmpresa(clientId: string): Promise<VentaParaElTexto[]> {
  const filas = await prisma.ventaGanada.findMany({
    where: { clientId, estado: "GANADA", excluida: false },
    orderBy: { fechaCierre: "desc" },
    take: 30,
    select: { id: true, nombre: true, fechaCierre: true, hubspotDealId: true, monto: true, moneda: true, pipelineLabel: true },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaCierre: f.fechaCierre.toISOString().slice(0, 10),
    hubspotDealId: f.hubspotDealId,
    monto: f.monto === null ? null : Number(f.monto),
    moneda: f.moneda,
    pipeline: f.pipelineLabel,
  }));
}

/** Las propuestas comerciales de la empresa (las 4 más recientes), con su inversión y sus casos de uso. */
async function propuestasDeLaEmpresa(clientId: string): Promise<string[]> {
  const casos = await prisma.businessCase.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, name: true, status: true, approvedAt: true },
  });
  return Promise.all(
    casos.map(async (c) => {
      const [seccion, elegidos] = await Promise.all([
        prisma.canvasSection
          .findFirst({
            where: { key: "inversion", canvas: { businessCaseId: c.id, isActive: true } },
            select: { key: true, blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } },
          })
          .catch(() => null),
        loadSelectedUseCases(c.id),
      ]);
      const inversion = seccion ? inversionDelDocumento([{ key: seccion.key, data: seccion.blocks[0]?.data ?? null }]) : null;
      return textoDeLaPropuesta({
        nombre: c.name,
        estado: c.status,
        aprobadaEl: c.approvedAt ? c.approvedAt.toISOString() : null,
        inversion,
        casosDeUso: elegidos.map((u) => u.title),
      });
    }),
  );
}

async function cronogramaDelProyecto(projectId: string): Promise<string> {
  const t = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { anchorStartDate: true, phases: { orderBy: { order: "asc" }, select: { name: true, status: true, durationWeeks: true } } },
  });
  if (!t) return "";
  return textoDelCronograma(
    t.phases.map((p) => ({ nombre: p.name, estado: p.status, semanas: p.durationWeeks })),
    t.anchorStartDate ? t.anchorStartDate.toISOString() : null,
  );
}

/**
 * Los proyectos de la empresa que «Ubicar con lo que ya sabemos» puede leer como contexto (24 nov, la preventa de un
 * cliente): todos menos el contenedor «Información del cliente» y los de prueba, como el selector de la ficha, los activos
 * primero y entre ellos el más nuevo (el sugerido). Un proyecto terminado entra: el handoff de la implementación que ya
 * cerró es justo lo que sirve para el diagnóstico de la renovación (revisión del 24 nov). Solo de esta empresa: el agente
 * igual lo vuelve a comprobar (`proyectoDeContextoDeLaEmpresa`).
 */
export async function proyectosParaElContexto(clientId: string): Promise<{ id: string; nombre: string }[]> {
  const filas = await prisma.project.findMany({
    where: { AND: [{ clientId }, NO_ES_CONTENEDOR_WHERE, { esPrueba: false }] },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return filas
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))
    .map((p) => ({ id: p.id, nombre: `${p.name}${ESTADO_DEL_PROYECTO[p.status] ? ` (${ESTADO_DEL_PROYECTO[p.status]})` : p.status === "active" ? "" : ` (${p.status})`}` }));
}

/** Cómo se nombra el estado de un proyecto que no está activo en «Con el contexto de» (revisión del 24 nov: no todo es «cerrado»). */
const ESTADO_DEL_PROYECTO: Record<string, string> = { paused: "en pausa", completed: "terminado", inactive: "terminado" };

export interface LoQueLeePosicionar {
  fuentes: Fuente[];
  /** Las reuniones que leyó (en resumen): van a la corrida, no se marcan como leídas. */
  sesionesUsadas: string[];
  /** Las claves de las notas del equipo que leyó (25 nov): van a la corrida (`CorridaDelAgente.notas`). */
  notasLeidas: string[];
}

/**
 * Los nombres de quienes escribieron las notas, por su correo (el equipo de Smarteam). La usan «Ubicar» y el Resumen
 * (resumen-de-la-escala-server.ts): una sola búsqueda, el mismo nombre en los dos. Sin el nombre, «Alguien del equipo».
 */
export async function nombresDeLosAutores(autores: Readonly<Record<string, AutorDeLaNota>> | undefined): Promise<(correo: string) => string | null> {
  const correos = [...new Set(Object.values(autores ?? {}).flatMap((a) => (a.por ? [a.por.toLowerCase()] : [])))];
  if (!correos.length) return () => null;
  const filas = await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } });
  const nombres = new Map(filas.map((m) => [m.email.toLowerCase(), m.name.trim()]));
  return (correo) => nombres.get(correo.toLowerCase()) || null;
}

/**
 * Todo lo que lee «Actualizar escala» sobre un objetivo. `projectId` es el proyecto de la exploración; `esContenedor`
 * dice si es «Información del cliente» (la cuenta entera): ahí no hay handoff, cronograma ni memoria del proyecto.
 */
export async function fuentesParaPosicionar(o: {
  clientId: string;
  projectId: string | null;
  esContenedor: boolean;
  companyId: string | null;
  ventaId: string | null;
  escala: EscalaDelLienzo;
  /**
   * La preventa (2026-11-08): las transcripciones de SUS sesiones (fuentes.ts › `transcripcionesDeLaExploracion`) en vez
   * de las reuniones de la empresa en resumen. Ya vienen por el chokepoint.
   */
  reuniones?: { fuentes: Fuente[]; sesiones: string[] };
  /**
   * La preventa de un cliente (24 nov, «Ubicar con lo que ya sabemos»): ADEMÁS de `reuniones` (sus sesiones, si hay), la
   * base de la empresa: sus reuniones en resumen, después de las sesiones, sin repetir ninguna y con los ids que siguen
   * (S5, S6…). Sin `reuniones`, es lo mismo que la cuenta.
   */
  conLaBase?: boolean;
  /** Las claves (`meet:<id>`) que alguien sacó con «Fuera de la exploración»: la base en resumen no las vuelve a traer. */
  fuera?: readonly string[];
  /**
   * Las notas de la exploración (25 nov, Elías: «Puede fijar el nivel»): las de «Lo que sabes del cliente» van como
   * fuentes `N1`, `N2`… (notas-del-equipo.ts › `notasParaUbicar`), primero y aparte de las reuniones.
   */
  notas?: { notas: Readonly<Record<string, string>>; autores?: Readonly<Record<string, AutorDeLaNota>>; exploracionId: string };
}): Promise<LoQueLeePosicionar> {
  const real = o.projectId && !o.esContenedor ? o.projectId : null;
  const [notas, hubspot, delProyecto, cuenta, proyecto, ventas, propuestas, tareas, cronograma, reuniones] = await Promise.all([
    o.notas && notasQueLeeUbicar(o.notas.notas).length
      ? seguro(
          nombresDeLosAutores(o.notas.autores).then((nombreDe) => notasParaUbicar(o.notas!.notas, o.notas!.autores, nombreDe)),
          // Sin los nombres, igual se leen: «Alguien del equipo».
          notasParaUbicar(o.notas.notas, o.notas.autores, () => null),
          "quién escribió las notas",
        )
      : Promise.resolve({ fuentes: [] as Fuente[], claves: [] as string[] }),
    seguro(fuentesDeHubspotSinMarcar({ clientId: o.clientId, companyId: o.companyId, escala: o.escala }), [] as Fuente[], "HubSpot"),
    real ? seguro(fuentesDelProyecto(real, o.clientId, { conMemoria: false }), [] as Fuente[], "el proyecto") : Promise.resolve([] as Fuente[]),
    /* Con las notas de la exploración como fuentes N, la memoria no las repite (con su autor y con «no respaldan un nivel»):
       en «Lo que confirmó el equipo» quedan las de las otras preventas de la empresa (revisión del 25 nov). */
    seguro(
      memoriaDeLaCuenta(o.clientId, { lector: "escala", projectId: real, sinNotasDeLaPreventa: o.notas?.exploracionId ?? null }).then((m) => m.texto),
      "",
      "la memoria de la cuenta",
    ),
    real ? seguro(memoriaDelProyecto(real, { lector: "escala" }).then((m) => m.texto), "", "la memoria del proyecto") : Promise.resolve(""),
    seguro(ventasDeLaEmpresa(o.clientId), [] as VentaParaElTexto[], "las ventas"),
    seguro(propuestasDeLaEmpresa(o.clientId), [] as string[], "las propuestas"),
    seguro(tareasDeLaCuentaParaAgentes(o.clientId), [], "las tareas"),
    real ? seguro(cronogramaDelProyecto(real), "", "el cronograma") : Promise.resolve(""),
    // Primero las que alguien eligió en una sesión de cualquier exploración de la empresa (escala única, 2026-10-28).
    o.reuniones && !o.conLaBase
      ? Promise.resolve(o.reuniones)
      : seguro(
          reunionesElegidasDeLaEmpresa(o.clientId).then((elegidas) =>
            reunionesEnResumen(o.clientId, {
              elegidas,
              excepto: [...(o.reuniones?.sesiones ?? []), ...(o.fuera ?? []).filter((k) => k.startsWith("meet:")).map((k) => k.slice(5))],
              desde: (o.reuniones?.fuentes.length ?? 0) + 1,
            }),
          ),
          { fuentes: [] as Fuente[], sesiones: [] as string[] },
          "las reuniones",
        ).then((base) => (o.reuniones && o.conLaBase ? { fuentes: [...o.reuniones.fuentes, ...base.fuentes], sesiones: [...o.reuniones.sesiones, ...base.sesiones] } : base)),
  ]);

  const f = FUENTES_DE_POSICIONAR;
  // Lo que sabe el equipo va primero (pesa más que una reunión si chocan), y aparte: no es una reunión.
  const fuentes: Fuente[] = [...notas.fuentes, ...delProyecto, ...reuniones.fuentes, ...hubspot];
  const textoVentas = textoDeLasVentas(ventas, o.ventaId);
  if (textoVentas) fuentes.push({ id: `${f.ventas}1`, etiqueta: "Las ventas ganadas (lo que compró; no dice cómo lo usa)", texto: textoVentas });
  propuestas
    .filter(Boolean)
    .forEach((texto, i) => fuentes.push({ id: `${f.propuestas}${i + 1}`, etiqueta: "Una propuesta comercial (lo que se le ofreció; no lo dijo el cliente)", texto: texto.slice(0, 4_000) }));
  const textoTareas = textoDeLasTareas(tareas);
  if (textoTareas) fuentes.push({ id: f.tareas, etiqueta: "Las tareas abiertas de la cuenta (lo que se está haciendo)", texto: textoTareas.slice(0, 4_000) });
  if (cronograma) fuentes.push({ id: f.cronograma, etiqueta: "El cronograma del proyecto (implementarlo no es que ya funcione)", texto: cronograma.slice(0, 4_000) });
  if (cuenta.trim()) fuentes.push({ id: f.memoriaDeLaCuenta, etiqueta: "Lo que Nexus ya sabe de la cuenta (lo escribió Smarteam; no lo dijo el cliente)", texto: cuenta.slice(0, 8_000) });
  if (proyecto.trim()) fuentes.push({ id: f.memoriaDelProyecto, etiqueta: "Lo que Nexus ya sabe del proyecto (lo escribió Smarteam; no lo dijo el cliente)", texto: proyecto.slice(0, 8_000) });
  return { fuentes, sesionesUsadas: reuniones.sesiones, notasLeidas: notas.claves };
}
