/**
 * lib/manual/armar.ts — la parte DERIVADA de la Documentación.
 *
 * Ninguna de estas funciones inventa contenido: leen los registros que ya son fuente de verdad
 * y los traducen a lo que la pantalla necesita. Por eso la doc no envejece — cuando alguien
 * agrega un canvas o cambia una etapa, esto lo refleja sin que nadie escriba nada.
 *
 * Registros que consume (todos módulos PUROS, sin Prisma — por eso esto se puede testear):
 *   · `lib/pieces/registry.ts`        → qué documentos existen y cómo se comportan
 *   · `lib/canvas/canvas-defs.ts`     → las secciones de cada uno, en orden
 *   · `lib/agents/canvas-agents.ts`   → qué agente lo genera
 *   · `lib/flow/stage-pieces.ts`      → en qué etapa del recorrido se trabaja
 *   · `lib/projects/kind.ts`          → los pipelines de HubSpot con sus etapas reales
 *   · `lib/hubspot/project-properties.ts` → qué le pedimos al objeto Proyectos
 *
 * Los AGENTES son la excepción: viven en la base, así que `armarAgentes` recibe las filas ya
 * leídas en vez de ir a buscarlas. Mantiene este módulo puro y deja la consulta en la página.
 */
import { PIECES, pieceLabel, type PieceDefinition } from "@/lib/pieces/registry";
import { CANVAS_DEF_BY_SLUG, HANDOFF_CANVAS, AGENT_GROUP_TO_CANVAS } from "@/lib/canvas/canvas-defs";
import { CANVAS_PRIMARY_AGENT } from "@/lib/agents/canvas-agents";
import { piecesInFlowOrder, stageForPiece } from "@/lib/flow/stage-pieces";
import { STAGE_LABEL_ES } from "@/lib/lifecycle/stage-engine";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { PROJECT_PROPERTIES, GRUPOS_DE_PROPIEDAD } from "@/lib/hubspot/project-properties";
import { AGENT_CATEGORIES, categorizeAgent, agentTriggerHint, type AgentCategoryKey } from "@/lib/agents/catalog";
import { DOC_PIEZAS } from "./contenido";

// ── Documentos ─────────────────────────────────────────────────────────────────

export interface DocumentoDoc {
  slug: string;
  nombre: string;
  paraQue: string;
  cuando: string;
  /** "de un proyecto" | "del cliente" | "de una propuesta" — de qué cuelga. */
  deQuien: string;
  /** Etapa del recorrido en la que se trabaja. null = no es parte del recorrido. */
  etapa: string | null;
  /** Rótulos cortos de comportamiento ("Nace con el proyecto", "Lo ve el cliente"…). */
  etiquetas: string[];
  /** Texto del botón que lo genera, si tiene agente propio en su encabezado. */
  generadoPor: string | null;
  /** Sus secciones, en el orden real en que se crean. */
  secciones: string[];
}

const ALCANCE: Record<string, string> = {
  project: "de un proyecto",
  client: "del cliente",
  "business-case": "de una propuesta",
};

/**
 * Las secciones de una pieza. `CANVAS_DEF_BY_SLUG` excluye el HANDOFF a propósito —no se activa
 * desde el desplegable, lo monta el flujo de handoffs—, pero para DOCUMENTAR sus 10 secciones
 * son tan reales como las de cualquier otro. Sin este caso la doc diría que el documento más
 * importante del arranque no tiene contenido.
 *
 * Las que devuelven vacío y está BIEN que lo hagan: Cronograma (su contenido son fases y tareas,
 * no secciones) e Información del cliente y Business Case (su composición vive en otro registro).
 */
function seccionesDe(slug: string): string[] {
  const def = slug === "handoff" ? HANDOFF_CANVAS : CANVAS_DEF_BY_SLUG[slug];
  return (def?.sections ?? []).map((s) => s.label);
}

function etiquetasDe(p: PieceDefinition): string[] {
  const out: string[] = [];
  if (p.createdWithProject) out.push("Nace con el proyecto");
  else if (p.optional) out.push("Aparece solo si el proyecto lo necesita");
  if (p.clientFacing) out.push("Lo ve el cliente");
  else out.push("Uso interno");
  return out;
}

/**
 * Los documentos en orden de RECORRIDO (no el del registro): primero los del flujo tal como
 * se trabajan, y al final los que no pertenecen a una etapa (el contexto del cliente y la
 * propuesta comercial, que vive antes de que exista el proyecto).
 */
export function armarDocumentos(): DocumentoDoc[] {
  const enFlujo = piecesInFlowOrder("full");
  const orden = (slug: string) => {
    const i = enFlujo.indexOf(slug);
    return i === -1 ? enFlujo.length + PIECES.findIndex((p) => p.slug === slug) : i;
  };

  return [...PIECES]
    .sort((a, b) => orden(a.slug) - orden(b.slug))
    .map((p) => {
      const doc = DOC_PIEZAS[p.slug];
      const etapa = stageForPiece(p.slug);
      return {
        slug: p.slug,
        nombre: p.label,
        // El `?? ""` no es un default silencioso: `manual.test.ts` falla si falta la entrada.
        // Está para que un olvido no rompa la pantalla mientras el test lo grita.
        paraQue: doc?.paraQue ?? "",
        cuando: doc?.cuando ?? "",
        deQuien: ALCANCE[p.scope] ?? p.scope,
        etapa: etapa ? STAGE_LABEL_ES[etapa] : null,
        etiquetas: etiquetasDe(p),
        generadoPor: CANVAS_PRIMARY_AGENT[p.slug]?.label ?? null,
        secciones: seccionesDe(p.slug),
      };
    });
}

// ── Agentes ────────────────────────────────────────────────────────────────────

/** La forma MÍNIMA que necesita el armado. Deliberadamente sin `systemPrompt`. */
export interface FilaDeAgente {
  id: string;
  name: string;
  description: string | null;
  status: string;
  agentType: string;
  agentGroup: string | null;
}

export interface AgenteDoc {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** Dónde se dispara, en lenguaje de pantalla ("Canvas Kickoff", "Automático (Google Meet)"). */
  disparo: string;
  /** En qué documento escribe. null = no escribe en un documento del proyecto. */
  escribeEn: string | null;
  activo: boolean;
}

export interface CategoriaDeAgentes {
  key: AgentCategoryKey;
  label: string;
  description: string;
  agentes: AgenteDoc[];
}

/**
 * Agrupa por categoría con la MISMA función que usa el catálogo de `/agents`, para que las dos
 * pantallas no puedan contar historias distintas del mismo agente. Las categorías vacías se
 * omiten: una sección con cero filas no explica nada.
 */
export function armarAgentes(filas: FilaDeAgente[]): CategoriaDeAgentes[] {
  return AGENT_CATEGORIES.map((cat) => ({
    key: cat.key,
    label: cat.label,
    description: cat.description,
    agentes: filas
      .filter((f) => categorizeAgent(f) === cat.key)
      .map((f) => {
        const slug = f.agentGroup ? AGENT_GROUP_TO_CANVAS[f.agentGroup] : undefined;
        return {
          id: f.id,
          nombre: f.name,
          descripcion: f.description,
          disparo: agentTriggerHint(f),
          escribeEn: slug ? pieceLabel(slug) : null,
          activo: f.status === "ACTIVE",
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  })).filter((c) => c.agentes.length > 0);
}

// ── HubSpot ────────────────────────────────────────────────────────────────────

export interface PipelineDoc {
  label: string;
  help: string;
  etapas: { label: string; cierra: boolean }[];
}

export interface GrupoDePropiedades {
  titulo: string;
  props: string[];
}

/** Los pipelines de proyectos del portal, con sus etapas reales y cuál cierra el proyecto. */
export function armarPipelines(): PipelineDoc[] {
  return PROJECT_PIPELINES.map((p) => ({
    label: p.label,
    help: p.help,
    etapas: p.stages.map((s) => ({ label: s.label, cierra: p.closedStageIds.includes(s.id) })),
  }));
}

/**
 * Las propiedades que Nexus le pide al objeto Proyectos, agrupadas para que se lean.
 * Una propiedad que no esté en ningún grupo cae en "Otras" — agregar una nunca la esconde.
 */
export function armarPropiedades(): GrupoDePropiedades[] {
  const agrupadas = new Set(GRUPOS_DE_PROPIEDAD.flatMap((g) => g.props));
  const sueltas = PROJECT_PROPERTIES.filter((p) => !agrupadas.has(p));
  const grupos: GrupoDePropiedades[] = GRUPOS_DE_PROPIEDAD.map((g) => ({
    titulo: g.titulo,
    props: g.props.filter((p) => (PROJECT_PROPERTIES as readonly string[]).includes(p)),
  })).filter((g) => g.props.length > 0);
  if (sueltas.length) grupos.push({ titulo: "Otras", props: [...sueltas] });
  return grupos;
}

/** Cuántas propiedades lee en total — el número que se muestra arriba de los grupos. */
export function totalPropiedades(): number {
  return PROJECT_PROPERTIES.length;
}
