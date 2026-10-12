/**
 * lib/clients/que-sigue-del-proyecto.ts — el «Qué sigue» del panel de la ficha (rediseño del
 * 2026-10-04, sistema «Nexus · interfaz interna»). PURO y CLIENT-SAFE.
 *
 * Una frase con la cosa más importante que hay que hacer en el proyecto, y la acción que la
 * resuelve. El orden lo decidió Elías el 2026-10-04 (alta a medio hacer → propuesta de cronograma
 * → reuniones sin revisar → documento de la etapa sin generar o desactualizado → lo que falta para
 * cerrar la etapa → resumen vencido → agendar la próxima reunión). Desde el 2026-10-07, después de
 * las reuniones sin revisar va la etapa que una reunión sugiere mover en HubSpot: es una decisión
 * que espera al CSE, y el documento «de la etapa» depende de que la etapa sea la verdadera. Los dos primeros los pinta la
 * ficha con sus propios carteles —tienen botones con reglas propias— y este cálculo ni se pide.
 *
 * «Lo que falta para cerrar la etapa» NO sale acá: ya lo dice la tarjeta de la etapa, en el centro,
 * y la misma frase dos veces en la misma pantalla enseña a no leer ninguna.
 *
 * Etapa 6 de la memoria de la cuenta (2026-10-10): justo después del documento de la etapa desactualizado van sus
 * NOVEDADES (lo que las reuniones recientes le cambian; lib/seguimiento/novedades.ts). El número viaja en la pieza, el
 * mismo que muestra el riel: así los dos lugares no pueden decir cosas distintas.
 *
 * Desde el 2026-10-11, «Manda los cuestionarios al cliente» (RECOMENDADO, nunca bloquea): solo en el
 * Handoff y en la Exploración —van después del kickoff y antes de la exploración—, con el kickoff generado
 * y al día (sin novedades: el prellenado lo lee) y ningún cuestionario publicado. Ahí va después de
 * «desactualizado» y de las novedades del documento de la etapa, y antes de «genera «Exploración»». En
 * las demás etapas (y sin etapa reconocida) no sale: un proyecto avanzado no tiene por qué mandarlos.
 * Se va solo al publicar uno o con «Ahora no».
 */
import type { ProjectLifecycleStage } from "@prisma/client";
import type { EtapaParaLaUI } from "@/lib/lifecycle/etapa-ui";
import { FULL_CYCLE_ORDER, STAGE_EXIT_STEPS, STAGE_LABEL_ES } from "@/lib/lifecycle/stage-engine";
import { flowForStage } from "@/lib/flow/stage-pieces";

/** Lo mínimo de una pieza que el cálculo necesita (sale de las filas del riel). */
export interface PiezaParaQueSigue {
  slug: string;
  etiqueta: string;
  estado: "generada" | "vacia" | "por_activar";
  stale: boolean;
  /** Las novedades de reuniones para esta pieza (etapa 6; el mismo número del riel). */
  novedades?: number;
}

export type AccionDeQueSigue =
  | { tipo: "pieza"; slug: string; etiqueta: string }
  | { tipo: "sesiones" }
  | { tipo: "resumen" }
  | { tipo: "agendar" }
  | { tipo: "etapa" }
  | { tipo: "novedades"; slug: string; etiqueta: string; n: number }
  /** Mandar los cuestionarios (recomendado): «Abrir «Cuestionarios»» y «Ahora no». */
  | { tipo: "cuestionarios"; slug: string; etiqueta: string };

export interface QueSigueDelProyecto {
  texto: string;
  accion: AccionDeQueSigue | null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El rótulo de una etapa de HubSpot → la etapa de Nexus con el mismo nombre (CS las espeja). */
const POR_NOMBRE = new Map<string, ProjectLifecycleStage>([
  ...FULL_CYCLE_ORDER.map((s) => [sinTildes(STAGE_LABEL_ES[s]), s] as const),
  ["handoff", "HAND_OFF"],
  ["continuidad", "OPERACION_CONTINUA"],
]);

/**
 * La etapa de Nexus de lo que muestra la ficha. Del ciclo de 8 etapas viene directa (el `id` es la
 * clave); del pipeline de HubSpot, por el nombre: las etapas de implementación se llaman igual.
 * `null` si no se reconoce (Desarrollo, Sitios web, Bloqueado): ahí no hay pieza que proponer.
 */
export function etapaDeNexus(etapa: EtapaParaLaUI | null): ProjectLifecycleStage | null {
  if (!etapa) return null;
  if ((STAGE_LABEL_ES as Record<string, string>)[etapa.id]) return etapa.id as ProjectLifecycleStage;
  return etapaDeNexusPorNombre(etapa.label);
}

/** El rótulo de una etapa del pipeline de HubSpot → la etapa de Nexus (también «Continuidad»), o null. */
export function etapaDeNexusPorNombre(rotulo: string | null | undefined): ProjectLifecycleStage | null {
  return rotulo ? (POR_NOMBRE.get(sinTildes(rotulo)) ?? null) : null;
}

/**
 * Lo que falta para pasar a la etapa siguiente, como lo dice la tarjeta de la etapa: las razones
 * del ciclo de 8 etapas si las hay; si no (la etapa la manda HubSpot), el paso de salida de esa
 * etapa. Devuelve líneas con su marca: hecho o pendiente.
 */
export function porQueEstaAca(etapa: EtapaParaLaUI | null): Array<{ hecho: boolean; texto: string }> {
  if (!etapa) return [];
  if (etapa.razones.length > 0) {
    return etapa.razones.map((r) => {
      const pendiente = /^pendiente:/i.test(r.trim());
      return { hecho: !pendiente, texto: pendiente ? r.trim().replace(/^pendiente:\s*/i, "Falta ") : r.trim() };
    });
  }
  const stage = etapaDeNexus(etapa);
  const paso = stage ? STAGE_EXIT_STEPS.find((s) => s.stage === stage) : undefined;
  if (!paso) return [];
  const siguiente = FULL_CYCLE_ORDER[FULL_CYCLE_ORDER.indexOf(paso.stage) + 1];
  const falta = paso.pending.replace(/^pendiente:\s*/i, "").replace(/\.$/, "");
  return [
    {
      hecho: false,
      texto: siguiente ? `Para pasar a ${STAGE_LABEL_ES[siguiente]} falta ${falta.charAt(0).toLowerCase()}${falta.slice(1)}.` : `Falta ${falta}.`,
    },
  ];
}

export function queSigueDelProyecto(i: {
  etapa: EtapaParaLaUI | null;
  piezas: readonly PiezaParaQueSigue[];
  /** Reuniones que la IA asignó a este proyecto y nadie revisó (solo en empresas con 2+ proyectos). */
  sesionesSinRevisar: number;
  /** El resumen del proyecto no existe o quedó viejo (y no se pudo regenerar solo). */
  resumenPendiente: { motivo: string | null } | null;
  /** La próxima reunión con el cliente (cualquier frente), en ISO. null = no hay ninguna. */
  proximaReunion: string | null;
  /** Una reunión muestra que el proyecto ya pasó a otra etapa y nadie respondió (lib/projects/etapa-sugerida.ts). */
  etapaSugerida?: { hasta: string } | null;
  /**
   * Los Cuestionarios del proyecto (lib/pieces/estado-de-cuestionarios.ts). null = el proyecto no tiene la
   * pieza a la vista en el riel (sin Exploración) o todavía no llegó su estado: no se sugiere nada.
   */
  cuestionarios?: { publicados: number; descartada: boolean } | null;
  /**
   * El Ciclo de un servicio recurrente (2026-10-11, docs/smartloop-plan.md). null = el proyecto no es
   * recurrente. Sin ciclo abierto, lo primero es abrirlo; con uno abierto, lo primero que falta en su etapa
   * (si Nexus lo puede comprobar).
   */
  ciclo?: { corto: string; abierto: boolean; falta: string | null; numero: number; piezaDeLaEtapa?: string | null } | null;
}): QueSigueDelProyecto {
  if (i.sesionesSinRevisar > 0) {
    const n = i.sesionesSinRevisar;
    return {
      texto: `La IA asignó ${n === 1 ? "una reunión" : `${n} reuniones`} a este proyecto y nadie ${n === 1 ? "la" : "las"} confirmó: ${n === 1 ? "podría" : "podrían"} ser de otro proyecto de la empresa.`,
      accion: { tipo: "sesiones" },
    };
  }

  if (i.etapaSugerida) {
    return {
      texto: `Una reunión muestra que el proyecto ya pasó a ${i.etapaSugerida.hasta}. Confirma la etapa: se escribe en HubSpot.`,
      accion: { tipo: "etapa" },
    };
  }

  /* Un servicio recurrente no recorre el flujo de una implementación: lo que sigue sale de su ciclo. */
  if (i.ciclo) {
    // Lleva al artefacto de la etapa en curso (sin ciclo abierto, al Diagnóstico: abrirlo empieza el ciclo).
    const slug = i.ciclo.abierto ? (i.ciclo.piezaDeLaEtapa ?? "cycle-diagnosis") : "cycle-diagnosis";
    const pieza = i.piezas.find((p) => p.slug === slug);
    const accion = pieza ? ({ tipo: "pieza", slug: pieza.slug, etiqueta: pieza.etiqueta } as const) : null;
    if (!i.ciclo.abierto) {
      return {
        texto: `El ciclo ${i.ciclo.numero} todavía no empezó: abre el Diagnóstico, que es su primera etapa.`,
        accion,
      };
    }
    if (i.ciclo.falta) {
      const falta = i.ciclo.falta.replace(/\.$/, "");
      return { texto: `${i.ciclo.corto}: ${falta.charAt(0).toLowerCase()}${falta.slice(1)}.`, accion };
    }
  }

  const stage = etapaDeNexus(i.etapa);
  const flujo = stage ? flowForStage(stage) : null;

  /* Los cuestionarios (recomendados): SOLO en el Handoff y en la Exploración (se mandan después del
     kickoff y llegan a las sesiones), con el kickoff generado y al día —el prellenado lo lee: no se invita
     a mandar respuestas sacadas de un kickoff viejo— y ninguno en manos del cliente, hasta que se publica
     uno o alguien dice «Ahora no». En las demás etapas no salen. */
  const kickoff = i.piezas.find((p) => p.slug === "kickoff");
  const piezaCuestionarios = i.piezas.find((p) => p.slug === "questionnaires");
  const sugerirCuestionarios: QueSigueDelProyecto | null =
    (stage === "HAND_OFF" || stage === "EXPLORACION") &&
    kickoff?.estado === "generada" &&
    !kickoff.stale &&
    !(kickoff.novedades ?? 0) &&
    piezaCuestionarios &&
    i.cuestionarios &&
    i.cuestionarios.publicados === 0 &&
    !i.cuestionarios.descartada
      ? {
          texto:
            "Manda los cuestionarios al cliente: lo que responda llega a la exploración y al diagnóstico. Es recomendado, no frena nada.",
          accion: { tipo: "cuestionarios", slug: piezaCuestionarios.slug, etiqueta: piezaCuestionarios.etiqueta },
        }
      : null;

  if (stage && flujo?.primary) {
    const pieza = i.piezas.find((p) => p.slug === flujo.primary);
    const generada = pieza?.estado === "generada";
    const generarla = (p: PiezaParaQueSigue): QueSigueDelProyecto => ({
      texto: `El proyecto está en ${STAGE_LABEL_ES[stage]}: ${p.estado === "por_activar" ? "activa" : "genera"} «${p.etiqueta}» para trabajar la etapa con el cliente.`,
      accion: { tipo: "pieza", slug: p.slug, etiqueta: p.etiqueta },
    });
    /* Sin la sugerencia de los cuestionarios, «genera» va primero, como siempre. Con ella (solo en el Handoff y en
       la Exploración), primero lo que avisa del documento de la etapa ya escrito, después los cuestionarios y
       después «genera «Exploración»»: van antes de la exploración. */
    if (pieza && !generada && !sugerirCuestionarios) return generarla(pieza);
    if (pieza && generada && pieza.stale) {
      return {
        texto: `«${pieza.etiqueta}» quedó desactualizado: el handoff cambió después de escribirlo. Regenéralo antes de mostrarlo.`,
        accion: { tipo: "pieza", slug: pieza.slug, etiqueta: pieza.etiqueta },
      };
    }
    const n = pieza?.novedades ?? 0;
    if (pieza && generada && n > 0) {
      return {
        texto: `«${pieza.etiqueta}» tiene ${n === 1 ? "1 novedad de una reunión reciente" : `${n} novedades de reuniones recientes`}: revísalas antes de mostrar el documento.`,
        accion: { tipo: "novedades", slug: pieza.slug, etiqueta: pieza.etiqueta, n },
      };
    }
    if (sugerirCuestionarios) return sugerirCuestionarios;
    if (pieza && !generada) return generarla(pieza);
  }

  if (i.resumenPendiente) {
    return {
      texto: i.resumenPendiente.motivo
        ? `Actualiza el resumen del proyecto: ${i.resumenPendiente.motivo.charAt(0).toLowerCase()}${i.resumenPendiente.motivo.slice(1)}`
        : "Genera el resumen del proyecto: es lo primero que lee quien abre esta ficha.",
      accion: { tipo: "resumen" },
    };
  }

  if (!i.proximaReunion) {
    return { texto: "Agenda la próxima reunión con el cliente: no hay ninguna en el calendario.", accion: { tipo: "agendar" } };
  }

  return { texto: "El proyecto está al día: no hay nada esperando tu decisión.", accion: null };
}

/**
 * Lo que el bloque «Pendientes recientes» del panel NO muestra. El panel trae hasta 5 de las
 * últimas 4 semanas; el resto se cuenta en dos partes: los de estas 4 semanas que no entraron y los
 * anteriores. Antes era «abiertos − mostrados = más antiguos», y contaba como antiguos a los
 * recientes que no entraban en los 5.
 *
 * `recientes` null = respuesta cacheada vieja sin ese número: se dice «y N más», sin adjetivo.
 */
export function restoDeLosPendientes(i: { mostrados: number; recientes: number | null; abiertos: number }): {
  recientes: number;
  antiguos: number;
  texto: string | null;
} {
  if (i.recientes === null) {
    const resto = Math.max(0, i.abiertos - i.mostrados);
    return { recientes: 0, antiguos: 0, texto: resto > 0 ? `y ${resto} más` : null };
  }
  const recientes = Math.max(0, i.recientes - i.mostrados);
  const antiguos = Math.max(0, i.abiertos - Math.max(i.recientes, i.mostrados));
  const deEstas = `${recientes} de las últimas 4 semanas`;
  const anteriores = (n: number) => `${n} ${n === 1 ? "más antiguo" : "más antiguos"}`;
  const texto =
    recientes > 0 && antiguos > 0
      ? `y ${recientes + antiguos} más: ${deEstas} y ${anteriores(antiguos)}`
      : recientes > 0
        ? `y ${recientes} más de las últimas 4 semanas`
        : antiguos > 0
          ? `y ${anteriores(antiguos)}`
          : null;
  return { recientes, antiguos, texto };
}
