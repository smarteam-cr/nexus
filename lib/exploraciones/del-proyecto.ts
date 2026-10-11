import "server-only";

/**
 * lib/exploraciones/del-proyecto.ts — la exploración de un PROYECTO (Customer Success, 2026-10-07). SERVIDOR.
 *
 * Es una fila de `ExploracionDeVenta` con `projectId` y `marco = "cs"` (lib/exploraciones/marco.ts): el
 * mismo lienzo, las mismas sesiones y el mismo agente que la preventa. Acá vive lo único propio:
 *   · `asegurarExploracionDelProyecto` — la crea la primera vez que se abre, con lo que ya se sabe: la
 *     edición, el perfil y las áreas de la preventa (o las áreas de los hubs que se vendieron).
 *   · `textoDeLaExploracionDelProyecto` — lo confirmado, en texto, para los agentes del proyecto que la
 *     leen (Diagnóstico, Planificación: `loadCanvasContext(…, "exploration")`). Esos documentos los ve
 *     el cliente: va lo que dijo el cliente (la estrategia, la escala con evidencia, lo propio de la
 *     cuenta, lo que salió de cada sesión), nunca la libreta del CSE.
 */
import type { Prisma } from "@prisma/client";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { areasContratadas } from "@/lib/escala/areas-por-hub";
import type { Meta, Reto } from "./casillas";
import { contenidoVacio, propuestaVacia, type ContenidoDeExploracion } from "./contenido";
import { leerContenido, leerPropuesta } from "./esquemas";
import { lecturasDeLaExploracion, type SesionPlaneada } from "./guia";
import { definicionEnElMarco, MARCO_DE_CS } from "./marco";
import { ubicacionPreviaDelProyecto } from "./para-el-cuestionario";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";

export const SQL_DE_LA_EXPLORACION_DEL_PROYECTO = "scripts/sql/2026-10-07-exploracion-del-proyecto.sql";

export type ResultadoDeAsegurar = { ok: true; id: string; creada: boolean } | { ok: false; status: number; error: string };

const esUnicoViolado = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
const sinSql = (): ResultadoDeAsegurar => ({ ok: false, status: 503, error: `Falta aplicar ${SQL_DE_LA_EXPLORACION_DEL_PROYECTO} y reiniciar.` });

async function laViva(projectId: string): Promise<string | null> {
  const f = await prisma.exploracionDeVenta.findFirst({ where: { projectId, archivadaEn: null }, select: { id: true } });
  return f?.id ?? null;
}

/**
 * La exploración viva del proyecto; si no hay, la crea. Arranca con la edición, el perfil y las áreas
 * que dejó la preventa (`ubicacionPreviaDelProyecto`); sin preventa, con las áreas de los hubs vendidos.
 */
export async function asegurarExploracionDelProyecto(projectId: string, email: string): Promise<ResultadoDeAsegurar> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return sinSql();
  try {
    const viva = await laViva(projectId);
    if (viva) return { ok: true, id: viva, creada: false };
  } catch (e) {
    if (esquemaDesactualizado(e)) return sinSql();
    throw e;
  }

  const proyecto = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true, tags: true } });
  if (!proyecto) return { ok: false, status: 404, error: "Proyecto no existe" };
  const previo = await ubicacionPreviaDelProyecto(projectId).catch(() => null);
  let edicion = previo?.edicion ?? null;
  let cierre = previo?.perfil?.cierre ?? null;
  let despues = previo?.perfil?.despues ?? null;
  const escala = await escalaParaExplorar();
  if (escala.estado === "ok") {
    const ed = edicion ? escala.general.ediciones.find((e) => e.slug === edicion) : null;
    if (edicion && !ed) edicion = null;
    if (ed && (!cierre || !despues)) {
      cierre = cierre ?? ed.perfilHabitual?.cierre ?? null;
      despues = despues ?? ed.perfilHabitual?.despues ?? null;
    }
  }
  const areas = previo?.areas.length ? previo.areas : areasContratadas(proyecto.tags ?? []);
  const contenido: ContenidoDeExploracion = contenidoVacio();

  try {
    const creada = await prisma.exploracionDeVenta.create({
      data: {
        clientId: proyecto.clientId,
        projectId,
        marco: "cs",
        creadaPor: email,
        responsableEmail: email,
        edicion,
        perfilCierre: cierre,
        perfilDespues: despues,
        areas,
        contenido: contenido as unknown as Prisma.InputJsonValue,
        propuesta: propuestaVacia() as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { ok: true, id: creada.id, creada: true };
  } catch (e) {
    // Dos aperturas a la vez: el índice único parcial deja pasar una sola.
    if (esUnicoViolado(e)) {
      const otra = await laViva(projectId);
      if (otra) return { ok: true, id: otra, creada: false };
    }
    if (esquemaDesactualizado(e)) return sinSql();
    throw e;
  }
}

const NIVEL: Record<string, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };

function lineasDeLaTarjeta(c: ContenidoDeExploracion, clave: "retos" | "metas" | "obstaculos"): string[] {
  const v = c.casillas[clave] as unknown;
  if (!Array.isArray(v)) return [];
  if (clave === "metas") {
    return (v as Meta[]).map((m) => [m.que, m.actual && `hoy: ${m.actual}`, m.objetivo && `meta: ${m.objetivo}`, m.para && `para: ${m.para}`].filter(Boolean).join(" · "));
  }
  return (v as Reto[]).map((r) => r.texto).filter(Boolean);
}

/**
 * Lo confirmado de la exploración del proyecto, en texto: la estrategia (retos, resultados, obstáculos),
 * dónde está cada dimensión con evidencia, lo propio de la cuenta y lo que salió de cada sesión. "" si
 * todavía no hay nada (los agentes leen entonces la guía vieja, si el proyecto la tenía).
 */
export async function textoDeLaExploracionDelProyecto(projectId: string): Promise<string> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return "";
  const fila = await prisma.exploracionDeVenta
    .findFirst({
      where: { projectId, archivadaEn: null },
      select: { contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true },
    })
    .catch(() => null);
  if (!fila) return "";
  const c = leerContenido(fila.contenido);
  const propuesta = leerPropuesta(fila.propuesta);
  const partes: string[] = [];

  const estrategia = MARCO_DE_CS.tarjetas.flatMap((k) => {
    const lineas = lineasDeLaTarjeta(c, k as "retos" | "metas" | "obstaculos");
    return lineas.length ? [`### ${definicionEnElMarco(k, MARCO_DE_CS).etiqueta}\n${lineas.map((l) => `- ${l}`).join("\n")}`] : [];
  });
  if (estrategia.length) partes.push(`## La estrategia del cliente (confirmada en la exploración)\n${estrategia.join("\n\n")}`);

  const conEvidencia = Object.entries(c.chequeo).filter(([, e]) => e.fuente !== "test" && e.fuente !== "hipotesis");
  if (conEvidencia.length) {
    const vigente = await escalaParaExplorar();
    const escala = vigente.estado === "ok" ? escalaDeLaExploracion(vigente.general, estadoDesdeFila(fila)) : null;
    const nombre = (id: string) => escala?.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre ?? id;
    partes.push(
      `## Dónde está en la escala (con evidencia)\n${conEvidencia
        .map(([id, e]) => `- ${nombre(id)}: ${NIVEL[e.nivel] ?? e.nivel}${e.evidencia ? ` — «${e.evidencia}»` : ""}${e.porQue ? ` (${e.porQue})` : ""}`)
        .join("\n")}`,
    );
  }

  const particularidades = c.casillas.particularidades ?? [];
  if (particularidades.length) partes.push(`## Lo propio de la cuenta\n${particularidades.map((p) => `- ${p}`).join("\n")}`);
  // «Lo que nadie siguió» no va: es la libreta del CSE para la próxima sesión, no algo que sepa del cliente.

  // Solo lo leído de sus sesiones (etapa A): lo de una reunión que no es sesión no llega al Diagnóstico ni a la Planificación.
  const lecturas = Object.values(lecturasDeLaExploracion(propuesta.lecturas, c.sesiones, { automaticas: false, fuera: c.fuera })).sort((a, b) =>
    a.en.localeCompare(b.en),
  );
  if (lecturas.length) partes.push(`## Lo que salió de cada sesión\n${lecturas.map((l) => `- ${l.etiqueta}: ${l.resumen}`).join("\n")}`);

  return partes.length ? `# Exploración del proyecto\n\n${partes.join("\n\n")}` : "";
}

/**
 * Las sesiones de la exploración viva del proyecto, para las SUGERENCIAS del panel de los documentos
 * (lib/contexto/sugerencias-del-documento-server.ts, etapa 7 de la memoria de la cuenta): el diagnóstico sugiere la
 * reunión de cada sesión. Solo las sesiones (qué reunión es de cuál y su fecha): ni lo confirmado, ni la libreta del
 * CSE, ni lo que leyó el agente. [] sin exploración o sin el SQL.
 */
export async function sesionesDeLaExploracionDelProyecto(projectId: string): Promise<SesionPlaneada[]> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return [];
  const fila = await prisma.exploracionDeVenta
    .findFirst({ where: { projectId, archivadaEn: null }, select: { contenido: true } })
    .catch(() => null);
  return fila ? leerContenido(fila.contenido).sesiones : [];
}
