/**
 * components/landing/types.ts
 *
 * Tipos del MOTOR de landing por secciones estructuradas. Cada tipo de sección
 * define el shape de `data` que el agente IA llena (y que se guarda en
 * CanvasBlock.data), su componente de render/edición, su JSON Schema (para el
 * tool use del agente) y un `empty` para el template vacío.
 *
 * El render de una landing se decide por la CONFIG (lista ordenada de SectionDef,
 * matcheada por `key` contra CanvasSection.key) — NO por el enum BlockType.
 */
import type { FC } from "react";
import type { KickoffTimelineData, KickoffProceso } from "@/lib/external/kickoff-view-types";

// ── Datos estructurados por sección (lo que llena el agente) ─────────────────

// 1) Hero — brand-row editable (cliente×Smarteam×HubSpot, +agregables) + titular +
//    subtítulo + tags (chips). `brands` vacío → la brand-row cae a los defaults.
//    `coverImageUrl` (fuera del schema del agente, como `brands`): imagen de portada
//    subida por el CSE — se renderiza como fondo con overlay azul (LandingView).
export interface HeroData { headline: string; subhead: string; tags: string[]; brands?: string[]; coverImageUrl?: string | null }

// 2) Diagnóstico — 3 a 6 dolores concretos.
export interface PainItem { title: string; detail: string }
export interface PainData { items: PainItem[] }

// 3) Antes vs. después — dos listas (Hoy / Con HubSpot + Smarteam).
export interface BeforeAfterData { before: string[]; after: string[] }

// 4) Solución — 4 campos rotulados (texto por campo).
export interface SolutionData { hubs: string; integraciones: string; casosDeUso: string; usuarios: string }

// 5) ROI — 4 métricas (valor + qué mejora).
export interface Metric { value: string; label: string }
export interface RoiData { metrics: Metric[] }

// 6) Timeline — fases con semanas.
export interface Phase { name: string; detail: string; duration: string }
export interface PlanData { phases: Phase[] }

// 7) Inversión — 2 líneas fijas (licencias HubSpot / implementación Smarteam).
export interface InvestmentLine { monto: string; detalle: string }
export interface InvestmentData { licenciasHubspot: InvestmentLine; implementacion: InvestmentLine; nota: string }

// 8) Partner — 4 campos (2 con default fijo).
export interface PartnerData { credencial: string; experiencia: string; referenciaSectorial: string; equipo: string }

// 9) CTA final. `buttonUrl`/`buttonTarget` (fuera del schema del agente — nunca
//    inventa URLs; el CSE los configura y sobreviven regeneraciones vía carry-forward):
//    en la landing pública el botón navega ahí. buttonTarget "_self" = misma pestaña;
//    ausente/"_blank" = pestaña nueva (default).
export interface CtaData { headline: string; subhead: string; buttonLabel: string; buttonUrl?: string; buttonTarget?: string }

// ── Secciones COMPARTIDAS entre templates (sectionType ≠ key) ────────────────

// Arquitectura tecnológica / de conexión — CADENA horizontal del flujo (cards con
// chip de actor + flechas, estilo presentación). Solo hojas string (coerceToSchema).
// `nodos`/`flujos` son el shape LEGACY (v1) — el componente los aplana como fallback.
export interface TechChainStep { actor: string; titulo: string; detalle: string }
export interface TechArchNode { nombre: string; rol: string; detalle: string }
export interface TechArchFlow { desde: string; hacia: string; descripcion: string }
export interface TechArchOptional { nombre: string; detalle: string }
export interface TechArchitectureData {
  intro: string;
  cadena: TechChainStep[];
  fueraDeAlcance: string[];
  opcionales: TechArchOptional[];
  /** Legacy v1 (por nodos + flujos separados): solo lectura de data vieja. */
  nodos?: TechArchNode[];
  flujos?: TechArchFlow[];
}

// Mapeo de procesos (opcional) — cómo cambia cada proceso del cliente.
export interface ProcessMapItem { nombre: string; comoEsHoy: string; comoSera: string; sistemas: string }
export interface ProcessMappingData { intro: string; procesos: ProcessMapItem[] }

// Casos de uso del catálogo — sección DETERMINÍSTICA (agentGenerated:false): el
// generate la escribe con los seleccionados del checklist (títulos/precios exactos);
// el agente jamás la llena. Editable inline como cualquier sección.
export interface UseCaseItem { title: string; detail: string; price: string }
export interface UseCasesData { items: UseCaseItem[] }

// ── Template SITIO WEB (estructura RIGORA de 8 secciones) ────────────────────

// 2) Diagnóstico y contexto — retos (cards de una línea) a la izquierda + panel
//    oscuro "Por qué [plataforma]" con bullets + objetivo como footer (estilo
//    presentación). `porQuePlataforma` es el shape LEGACY (párrafo) — fallback.
export interface WebDiagnosisData {
  intro: string;
  retos: { title: string; detail: string }[];
  plataforma: string; // rótulo del panel: "Por qué {plataforma}" (ej. "HubSpot Content Hub")
  porQueBullets: { title: string; detail: string }[];
  objetivo: string;
  /** Legacy (párrafo único): solo lectura de data vieja. */
  porQuePlataforma?: string;
}

// 3) Arquitectura del sitio — DIAGRAMA: pill "Home" + fases con cards top-level
//    (nombre + detalle corto); fases con `badge` se pintan punteadas. Las páginas
//    legacy eran strings — el componente las normaliza.
export interface SitePage { nombre: string; detalle: string }
export interface SiteMapPhase { nombre: string; badge: string; paginas: (SitePage | string)[] }
export interface SiteArchitectureData { recorrido: string; home: string; fases: SiteMapPhase[] }

// 5) Alcance — lista PLANA de entregables (cosas que el cliente RECIBE, estilo
//    checklist) + resultado. Deliberadamente distinta del cronograma (fases):
//    entregables ≠ etapas. `bloques` es el shape LEGACY (por áreas) — solo se lee
//    como fallback de data generada antes del cambio.
export interface ScopeDeliverable { title: string; detail: string }
export interface ScopeBlock { area: string; items: string[] }
export interface WebScopeData {
  entregables: ScopeDeliverable[];
  resultado: string;
  /** Legacy: shape anterior por áreas; el componente lo aplana si no hay entregables. */
  bloques?: ScopeBlock[];
}

// 6) Cronograma — fases con semanas + qué se cotiza aparte.
export interface WebMethodologyData { fases: Phase[]; cotizaAparte: string }

// 7) Inversión (web) — tabla fase 1 con TOTAL autocalculado + extras opcionales +
//    recurrentes separados (card oscura) + nota de exclusiones + moneda configurable.
export interface WebInvestLine { concepto: string; monto: string; detalle: string }
export interface WebInvestmentData {
  moneda: string; // "USD", "CRC"… (editable; el total y el intro la muestran)
  lineas: WebInvestLine[];
  extras: WebInvestLine[];
  recurrentes: WebInvestLine[];
  nota: string; // exclusiones ("impuestos no contemplados") — badge arriba
  /** Ancho de la card de recurrente mensual — "ancho" ocupa 2 columnas del grid. */
  anchoRecurrente?: "normal" | "ancho";
}

// 8) Por qué Smarteam — cards + siguiente paso. `buttonUrl`/`buttonTarget`: ver CtaData.
export interface WhyUsData {
  cards: { title: string; detail: string }[];
  siguientePaso: string;
  buttonLabel: string;
  buttonUrl?: string;
  buttonTarget?: string;
}

// ── Contrato del motor ───────────────────────────────────────────────────────

/** Datos del business case (no editables) que el motor pasa a cada sección. */
export interface LandingContext {
  clientName: string;
  /** Idioma de la propuesta (código ISO, del `__lang` que declara el agente en el
   *  data del hero). null/ausente = español. Traduce los rótulos FIJOS (i18n.ts). */
  lang?: string | null;
  clientLogoUrl?: string | null;
  /** Logo de marca Smarteam (config global de Nexus, getSmarteamLogoUrl). El hero lo
   *  pinta como imagen en la brand-row en lugar del badge de texto "Smarteam". */
  smarteamLogoUrl?: string | null;
  /** Logos de plataforma por nombre lowercase (brandLogoMap: "hubspot", "insider one"…):
   *  una brand de TEXTO de la brand-row cuyo nombre matchee se pinta como imagen. */
  brandLogos?: Record<string, string>;
  /** Endpoint de upload de imágenes de contenido (solo modo edición del workspace;
   *  ausente en read/externo). P.ej. `/api/business-cases/{id}/images`. */
  imageUploadUrl?: string | null;
  /** Endpoint para subir/quitar el logo del CLIENTE (solo edición): POST FormData →
   *  Client.logoUrl. P.ej. `/api/clients/{clientId}/logo`. */
  clientLogoUploadUrl?: string | null;
  /** Callback de edición: el hero avisa que cambió el logo del cliente (el workspace
   *  refresca su estado local — el logo vive en Client, no en el data de la sección). */
  onClientLogoChange?: (url: string | null) => void;
  /** Solo KICKOFF: datos derivados/curados que viven FUERA de CanvasBlock (cronograma
   *  de ProjectTimeline, procesos de flowcharts) + callbacks del editor. Las secciones
   *  `ctxDriven` (cronograma/procesos) y el hero (Stats) los leen de acá. Ausente en BC. */
  kickoff?: {
    timeline?: KickoffTimelineData | null;
    procesos?: KickoffProceso[];
    /** Logos de plataforma (HubSpot/Insider) para el chip del hero. */
    platformLogos?: string[];
    /** Solo edición: confirmar/desconfirmar un proceso (DRAFT↔CONFIRMED). */
    onProcesoStatusChange?: (id: string, confirmed: boolean) => void;
    /** Solo edición: ocultar/mostrar una clave sintética (cronograma/procesos/idProceso). */
    hiddenKeys?: Set<string>;
    onToggleHidden?: (key: string, hidden: boolean) => void;
    /**
     * Asignar (o desasignar, con `optionId = null`) una franja a una sesión de horarios.
     * Presente en las DOS superficies que pueden escribir — el editor del CSE y la página
     * del cliente (server action) — y ausente en las de solo lectura (PDF, preview). Es lo
     * que habilita el drag: la asignación se guarda al instante en `kickoffHorarioAssignments`,
     * sin pasar por "Subir al cliente". Rechaza (throw) si el servidor la rechaza.
     */
    onAssignSession?: (sessionId: string, optionId: string | null) => Promise<void>;
  };
}

/** Props que recibe TODA sección. `onChange` emite el nuevo `data` (estado local
 *  del workspace, que persiste con debounce vía saveBlock). En modo lectura no hay
 *  handlers. */
export interface SectionProps<T> {
  data: T;
  ctx: LandingContext;
  editable?: boolean;
  onChange?: (data: T) => void;
}

/** Definición de una sección dentro de un LandingConfig. No genérico (cada sección
 *  trae su propio data shape); `Component`/`empty` usan `any` para que asignar
 *  componentes concretos (FC<SectionProps<HeroData>>, …) no choque con la varianza. */
export interface SectionDef {
  key: string;                 // matchea CanvasSection.key
  label: string;               // rótulo interno + TÍTULO grande de la sección (no-selfTitled)
  eyebrow?: string;            // categoría/framing chico arriba del título (estilo kickoff)
  theme: "dark" | "light" | "soft";
  backdrop?: boolean;          // grid+glow del hero (dark)
  selfTitled?: boolean;        // el componente trae su propio encabezado (hero/partner/cta);
                               // si no, el motor renderiza un eyebrow con `label`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: FC<SectionProps<any>>;
  schema: Record<string, unknown>; // JSON Schema → tool use del agente
  agentHint: string;           // qué debe redactar el agente (instrucción base; el override la gana)
  brief?: string;              // guía del spec (descripción + regla "Fuente:") — ayuda editable
                               // en el editor; el agente la lee al generar (override por sección la gana)
  empty: unknown;              // data inicial (template vacío)
  /** La sección se alimenta de `ctx` (no de `data`): NO se omite en read por `isBlank`
   *  (el Component decide si devuelve null). Ej. kickoff: cronograma/procesos/cierre. */
  ctxDriven?: boolean;
  /** Solo `ctxDriven`: `true` si NO hay nada que renderizar (su Component devolvería null).
   *  El motor lo consulta ANTES de pintar el chrome de edición — sin esto, una sección sin
   *  cronograma dejaría el ojo y el handle de arrastre flotando sobre la nada. */
  ctxEmpty?: (ctx: LandingContext) => boolean;
  /** La sección NO participa del drag&drop de reordenar (posición fija en el config).
   *  Ej. kickoff: hero (primero) y cierre (último). BC no la usa. */
  pinned?: boolean;
  /** La sección NO se puede ocultar (sin toggle de ojo): estructural, ocultarla rompería
   *  la página. Ej. kickoff: hero (bienvenida) y cierre. BC no la usa. */
  noHide?: boolean;
}

export interface LandingConfig {
  type: string;                // "business-case" | "kickoff" | ...
  sections: SectionDef[];      // orden de render
}

/** Una sección con su `data` lista para render (desde el hook o el snapshot). */
export interface RenderSection {
  key: string;
  data: unknown;
}
