/**
 * lib/entregables/registro.ts — LOS ENTREGABLES DEL PROYECTO Y SUS PLANTILLAS. PURO (lo importan la pantalla, el
 * servidor y el chat).
 *
 * Un entregable es una pieza del registro (`lib/pieces/registry.ts`) con `clase: "entregable"`: lo ve el cliente y se
 * genera con una PLANTILLA (decisión 11 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17). Acá vive, en UN solo
 * lugar, qué entregables hay, qué agente los escribe y qué plantillas tiene cada uno. Lo que dice cada plantilla (sus
 * secciones, su voz, su tope de tokens) son las defs del motor de landings (components/landing/configs/*.defs.ts): el
 * puente id → template vive en ./plantillas.ts, que importa esas defs y por eso no se carga en la pantalla.
 *
 * `generarEntregable` recibe el id, el chat lo puede pedir, /analyze lo acepta en el cuerpo (`plantilla`) y la plantilla
 * que se usó queda guardada en el documento (la entry `__plantilla` de `ProjectCanvas.sections`). Sumar una = una
 * entrada en `plantillas` acá y su template en ./plantillas.ts; la primera de la lista es la de siempre.
 *
 * El DIAGNÓSTICO tiene dos desde el 2026-10-23 (DECISIONS «El Diagnóstico: todo el contexto, dos plantillas y un
 * documento liviano»): «Diagnóstico completo» (la de siempre, id `diagnostico-estrategico`: así se llamaba) y
 * «Diagnóstico esencial», la liviana y la recomendada, con solo sus secciones (`secciones`). Al abrir un diagnóstico
 * sin generar se elige una (components/canvas/ElegirPlantilla.tsx). Los diagnósticos que ya existen se leen con la de
 * siempre: un documento sin `__plantilla` se lee con la primera de su entregable.
 */
import { pieceBySlug } from "@/lib/pieces/registry";
import { parseSectionEntries, patchSectionEntry, type CanvasSectionEntry } from "@/lib/business-cases/section-briefs";

export interface PlantillaDeEntregable {
  /** IDENTIDAD estable: es lo que queda guardado en el documento. Nunca cambia. */
  id: string;
  /** Nombre visible, en español. */
  nombre: string;
  /** Para qué sirve, en una frase (lo leen la pantalla y el chat). */
  paraQue: string;
  /**
   * Las secciones del documento que tiene esta plantilla (sus keys, en el orden del canon del canvas). Sin esto, todas
   * las del canvas. Con esto, el documento tiene SOLO esas: la reconciliación no le suma las demás.
   */
  secciones?: readonly string[];
  /** La que se ofrece marcada al elegir (una por entregable, como mucho). */
  recomendada?: boolean;
}

/**
 * Las secciones del «Diagnóstico esencial» (2026-10-23): por qué el cliente tiene los resultados que tiene y qué vamos a
 * hacer. Portada, objetivos, el problema, el desafío, el enfoque de la solución, las acciones y el siguiente paso.
 * Los objetivos van porque las acciones dicen qué objetivos mueven (el hilo, lib/canvas/revisar-hilo.ts).
 */
export const SECCIONES_DEL_DIAGNOSTICO_ESENCIAL = [
  "diagnostico",
  "objetivos",
  "problema",
  "desafio",
  "politica_rectora",
  "acciones",
  "cierre",
] as const;

/**
 * El KICKOFF DE UN SERVICIO RECURRENTE (M1 del roadmap, 2026-10-24, Liliana con RC Inmobiliaria): el de siempre le decía
 * «proyecto temporal» a un SmartLoop. Cuenta cómo se trabaja cada ciclo, la cadencia, quién es quién, cómo se piden cosas
 * y qué pasa en el primer ciclo; deja afuera lo que es de una implementación (del hoy al nuevo sistema, el alcance
 * cerrado, las métricas de un proyecto, el cronograma y los próximos pasos). Un proyecto recurrente la usa sola al
 * generar el kickoff (`plantillaPorDefectoDelProyecto`, lib/entregables/generar-server.ts).
 */
export const PLANTILLA_DEL_KICKOFF_RECURRENTE = "kickoff-recurrente";
export const SECCIONES_DEL_KICKOFF_RECURRENTE = [
  "bienvenida",
  "objetivos",
  "como_trabajamos",
  "primer_ciclo",
  "cadencia_del_servicio",
  "equipo",
  "tu_rol",
  "solicitudes",
  "punto_de_partida",
  "canales",
  // 2026-10-27 (Q1): la ruta de HubSpot Academy, como en el kickoff de siempre.
  "ruta_academy",
  "cierre",
] as const;

/**
 * La «Planificación esencial» (I2 del roadmap, L4 etapa 7, 2026-10-27, docs/planificacion-brief-plan.md): lo que el equipo
 * necesita para configurar el portal, en el orden del canon. La portada y la aprobación van siempre. Ninguna recomendada:
 * el plan no la eligió, así que el selector propone la de siempre (la completa).
 */
export const PLANTILLA_DE_LA_PLANIFICACION_ESENCIAL = "planificacion-esencial";
export const SECCIONES_DE_LA_PLANIFICACION_ESENCIAL = [
  "planificacion",
  "ficha_proyecto",
  "usuarios_permisos",
  "ciclo_vida_crm",
  "propiedades",
  "formularios",
  "pipelines",
  "automatizaciones",
  "cierre",
] as const;

export interface Entregable {
  /** El slug de su pieza en el registro. */
  slug: string;
  /** El agente que lo escribe (la fila de `Agent`, con su celda de permiso en el artifact-gate). */
  agentId: string;
  /** Sus plantillas; la primera es la de siempre. */
  plantillas: readonly PlantillaDeEntregable[];
}

export const ENTREGABLES: readonly Entregable[] = [
  {
    slug: "kickoff",
    agentId: "agent-kickoff-canvas",
    plantillas: [
      { id: "kickoff", nombre: "Kickoff", paraQue: "La presentación de arranque: el alcance, el equipo, cómo se trabaja y lo que sigue." },
      {
        id: PLANTILLA_DEL_KICKOFF_RECURRENTE,
        nombre: "Kickoff de servicio recurrente",
        paraQue:
          "El arranque de un servicio que se hace todos los meses: cómo trabajamos cada ciclo, la cadencia, quién es quién, cómo nos pides cosas y qué pasa en el primer ciclo.",
        secciones: SECCIONES_DEL_KICKOFF_RECURRENTE,
      },
    ],
  },
  {
    slug: "diagnosis",
    agentId: "agent-diagnostico-canvas",
    plantillas: [
      {
        id: "diagnostico-estrategico",
        nombre: "Diagnóstico completo",
        paraQue:
          "Todo el hilo: además de lo esencial, cómo opera hoy y cómo va a operar, fortalezas, herramientas de HubSpot, equipos y licencias, preguntas de negocio, la brecha y el alcance acordado.",
      },
      {
        id: "diagnostico-esencial",
        nombre: "Diagnóstico esencial",
        paraQue:
          "Lo justo para que el cliente entienda por qué tiene los resultados que tiene y qué vamos a hacer: el problema y sus causas, el enfoque de la solución y las acciones.",
        secciones: SECCIONES_DEL_DIAGNOSTICO_ESENCIAL,
        recomendada: true,
      },
    ],
  },
  {
    slug: "planning",
    agentId: "agent-planificacion-canvas",
    plantillas: [
      // 2026-10-27 (I2 · L4 etapa 7): el id de siempre es la completa; un documento sin plantilla anotada la tiene.
      {
        id: "planificacion",
        nombre: "Planificación completa",
        paraQue:
          "Todo lo que va a quedar configurado en HubSpot: además de lo esencial, cómo van a funcionar los procesos, la arquitectura, por dónde entran los leads, las conversaciones, las cotizaciones, los informes, las rutinas y las olas.",
      },
      {
        id: PLANTILLA_DE_LA_PLANIFICACION_ESENCIAL,
        nombre: "Planificación esencial",
        paraQue:
          "Lo justo para configurar el portal: la ficha del proyecto, los usuarios y sus permisos, el ciclo de vida y el estado del lead, las propiedades, los pipelines, los formularios y las automatizaciones.",
        secciones: SECCIONES_DE_LA_PLANIFICACION_ESENCIAL,
      },
    ],
  },
  {
    slug: "tech-requirements",
    agentId: "agent-desarrollo-canvas",
    plantillas: [{ id: "integraciones", nombre: "Integraciones", paraQue: "El requerimiento técnico de las integraciones: arquitectura, objetos y cómo se comunican." }],
  },
  {
    slug: "delivery",
    agentId: "agent-entrega-canvas",
    plantillas: [{ id: "entrega", nombre: "Entrega", paraQue: "El cierre: el desafío que se resolvió, los objetivos alcanzados y lo que queda funcionando." }],
  },
];

const POR_SLUG = new Map(ENTREGABLES.map((e) => [e.slug, e]));
const POR_AGENTE = new Map(ENTREGABLES.map((e) => [e.agentId, e]));

export function entregableDe(slug: string): Entregable | null {
  return POR_SLUG.get(slug) ?? null;
}

/** El entregable que escribe un agente; null si el agente no escribe un entregable. */
export function entregablePorAgente(agentId: string): Entregable | null {
  return POR_AGENTE.get(agentId) ?? null;
}

/** El nombre visible del entregable (el de su pieza: «Diagnóstico», no el de la plantilla). */
export function nombreDelEntregable(slug: string): string {
  return pieceBySlug(slug)?.label ?? slug;
}

/**
 * La plantilla pedida de un entregable. Sin id, la de siempre (la primera). Un id que no es de ESE entregable es null:
 * quien llama lo rechaza con su motivo, nunca cae a otra en silencio.
 */
export function plantillaDe(slug: string, id?: string | null): PlantillaDeEntregable | null {
  const e = POR_SLUG.get(slug);
  if (!e) return null;
  if (!id) return e.plantillas[0] ?? null;
  return e.plantillas.find((p) => p.id === id) ?? null;
}

/**
 * Las secciones de una plantilla, con su nombre, en el orden del canon del canvas. Sin `secciones`, el canon entero.
 * El canon lo pasa quien llama (`canvasDefForSlug(slug).sections`): este archivo no conoce los canvases.
 */
export function seccionesDeLaPlantilla<S extends { key: string }>(p: Pick<PlantillaDeEntregable, "secciones">, canon: readonly S[]): S[] {
  if (!p.secciones) return [...canon];
  const de = new Set(p.secciones);
  return canon.filter((s) => de.has(s.key));
}

/**
 * LO QUE SE VE Y LO QUE NO SEGÚN LA PLANTILLA (2026-10-23), sobre las entradas del Json del canvas. Puro.
 *   · lo que tiene texto y la plantilla no tiene (`conTextoFuera`) se oculta con la marca `ocultaPorLaPlantilla`; una que
 *     ya estaba oculta (por una persona, o antes por la plantilla) queda como está;
 *   · lo que la plantilla tiene y ocultó una plantilla anterior se vuelve a mostrar (de la esencial a la completa). Lo que
 *     ocultó una persona no: su ojo borra la marca.
 */
export function entradasSegunLaPlantilla(
  sections: unknown,
  o: { deLaPlantilla: ReadonlySet<string>; conTextoFuera: readonly string[] },
): { entradas: CanvasSectionEntry[]; cambio: boolean } {
  const antes = parseSectionEntries(sections);
  let entradas = antes;
  let cambio = false;
  for (const key of o.conTextoFuera) {
    if (antes.find((e) => e.key === key)?.hidden === true) continue;
    entradas = patchSectionEntry(entradas, key, { hidden: true, ocultaPorLaPlantilla: true });
    cambio = true;
  }
  for (const e of antes) {
    if (o.deLaPlantilla.has(e.key) && e.ocultaPorLaPlantilla === true) {
      entradas = patchSectionEntry(entradas, e.key, { hidden: false, ocultaPorLaPlantilla: false });
      cambio = true;
    }
  }
  return { entradas, cambio };
}

// ── La plantilla que se usó, guardada en el documento ─────────────────────────────────────────────────────────────

/**
 * La entry reservada del Json `ProjectCanvas.sections` con la plantilla que se usó en la última generación (el mismo
 * contrato que `__doc` y `__cuestionarios`: el doble guion bajo dice «no soy una sección»). Sin columna nueva.
 */
export const CLAVE_DE_LA_PLANTILLA = "__plantilla";

export interface PlantillaGuardada {
  plantilla: PlantillaDeEntregable;
  /** false = el documento no la guardó (se generó antes del 2026-10-17, o nunca): es la de siempre. */
  guardada: boolean;
  at: string | null;
  por: string | null;
}

/** La plantilla con que se generó un documento. Sin la entry, o con un id que ya no existe, la de siempre. */
export function plantillaDelDocumento(slug: string, sections: unknown): PlantillaGuardada | null {
  const porDefecto = plantillaDe(slug);
  if (!porDefecto) return null;
  const e = (Array.isArray(sections) ? sections : []).find(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_DE_LA_PLANTILLA,
  );
  const guardada = e && typeof e.plantilla === "string" ? plantillaDe(slug, e.plantilla) : null;
  if (!guardada) return { plantilla: porDefecto, guardada: false, at: null, por: null };
  return {
    plantilla: guardada,
    guardada: true,
    at: typeof e?.at === "string" ? e.at : null,
    por: typeof e?.por === "string" ? e.por : null,
  };
}

/** El Json de secciones con la plantilla anotada. Toca SOLO la entry `__plantilla`; el resto queda como estaba. */
export function conPlantillaAnotada(sections: unknown, plantilla: PlantillaDeEntregable, por: string | null, ahora: string): Array<Record<string, unknown>> {
  const resto = (Array.isArray(sections) ? sections : []).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key !== CLAVE_DE_LA_PLANTILLA,
  );
  // `label` como toda entry del Json (lo exige `parseSectionEntries`, que la descarta sin él… y la UI no la lista).
  return [...resto, { key: CLAVE_DE_LA_PLANTILLA, label: CLAVE_DE_LA_PLANTILLA, plantilla: plantilla.id, nombre: plantilla.nombre, at: ahora, por }];
}

// ── Las instrucciones de quien pide la generación ─────────────────────────────────────────────────────────────────

/** El tope de las instrucciones de UN pedido (las del documento tienen el suyo, en lib/business-cases/section-briefs). */
export const TOPE_INSTRUCCIONES_DEL_PEDIDO = 2_000;

/**
 * Las instrucciones de quien pide ESTA generación (el chat de Nexus, o el botón si algún día las pide), rotuladas. ""
 * sin instrucciones: así el mensaje del agente queda byte a byte como antes. Van ADEMÁS de las instrucciones adicionales
 * del documento (su «Contexto adicional»), que siguen donde estaban, y no se guardan: valen para esta corrida.
 */
export function bloqueDeInstruccionesDelPedido(texto: string | null | undefined): string {
  const t = (texto ?? "").trim().slice(0, TOPE_INSTRUCCIONES_DEL_PEDIDO);
  if (!t) return "";
  return `=== LO QUE PIDIÓ QUIEN GENERA ESTE DOCUMENTO (para esta generación — cúmplelo sin inventar nada que las fuentes no respalden) ===\n${t}\n\n`;
}
