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
import type { LandingStringKey } from "./i18n";

// ── Datos estructurados por sección (lo que llena el agente) ─────────────────

// 1) Hero — brand-row editable (cliente×Smarteam×HubSpot, +agregables) + titular +
//    subtítulo + tags (chips). `brands` vacío → la brand-row cae a los defaults.
//    `coverImageUrl` (fuera del schema del agente, como `brands`): imagen de portada
//    subida por el CSE — se renderiza como fondo con overlay azul (LandingView).
//    `titulo`: el NOMBRE del documento en pocas palabras — el título de la página. Es
//    distinto de `headline`, que es el titular con el mensaje del caso; sin él, una
//    portada sin generar no tenía ningún título (ver lib/landing/hero-title.ts).
export interface HeroData {
  titulo?: string;
  headline: string;
  subhead: string;
  tags: string[];
  brands?: string[];
  coverImageUrl?: string | null;
  /** Ajuste de tamaño del logo del cliente PARA ESTE DOCUMENTO, en % (50-200). Pisa a
   *  `Client.logoScale`; ausente = se usa la base. FUERA del schema del agente, como
   *  `brands` y `coverImageUrl`. Ver lib/ui/logo-scale.ts. */
  logoScale?: number | null;
}

// 2) Diagnóstico — 3 a 6 dolores concretos.
export interface PainItem { title: string; detail: string }
export interface PainData { items: PainItem[] }

// 3) Antes vs. después — dos listas (Hoy / Con HubSpot + Smarteam).
export interface BeforeAfterData { before: string[]; after: string[] }

// 4) Solución — 4 campos rotulados (texto por campo). LEGACY: la sección `solucion` se
//    pinta hoy con `HubsClienteData`; esto sobrevive para lo ya generado. Ver abajo.
export interface SolutionData { hubs: string; integraciones: string; casosDeUso: string; usuarios: string }

// 4') Qué se implementa — una columna por Hub de HubSpot, explorable con píldoras.
/** Una tarjeta de lo que se implementa dentro de un Hub. */
export interface HubCard {
  titulo: string;
  detalle: string;
  /** Dónde aterriza, separado por comas ("LinkedIn, Meta, correo"). Vacío = no aplica:
   *  un pipeline de ventas no tiene canal y forzarle uno sería inventarlo. */
  canales: string;
}
/** Una columna de la sección: un Hub y lo que se implementa adentro. */
export interface HubColumna {
  /** Slug del catálogo (`marketing_hub`…) o texto libre para algo que no es un Hub
   *  (Breeze, un agente a la medida): esas se pintan con el color neutro. */
  hub: string;
  titulo: string;
  items: HubCard[];
}
export interface HubsClienteData {
  intro: string;
  columnas: HubColumna[];
  /** Curaduría del CSE: qué columnas quedan encendidas. Va FUERA del schema a propósito
   *  —el agente no decide qué le vendieron al cliente, y `coerceToSchema` lo descarta si
   *  lo intenta— y en el PRIMER nivel, que es hasta donde llega `preserveNonSchemaKeys`:
   *  así sobrevive a regenerar. Ausente = todas encendidas. */
  activos?: string[];
  /** Los 4 campos de la versión v1 de `solucion`. SOLO LECTURA: los pinta la rama legacy
   *  del componente para lo ya generado y nunca se vuelven a escribir. Mismo patrón que
   *  `WebScopeData.bloques` / `TechArchitectureData.nodos`. */
  hubs?: string;
  integraciones?: string;
  casosDeUso?: string;
  usuarios?: string;
}

// 5) ROI — 4 métricas (valor + qué mejora).
export interface Metric { value: string; label: string }
export interface RoiData { metrics: Metric[] }

// 6) Timeline — fases con semanas. Se lee como lista o como Gantt (toggle en la fila del
//    título); el Gantt saca las barras de `duration` con `lib/landing/plan-weeks.ts`.
export interface Phase {
  name: string;
  detail: string;
  /** Texto libre que ve el cliente: "Semanas 6-10", "Semana 8". Es lo que se PARSEA. */
  duration: string;
  /**
   * Corrección del vendedor cuando `duration` no se puede leer ("Mes 4"): formato estricto
   * "6-10". Va DENTRO del schema del agente y no como key suelta porque
   * `preserveNonSchemaKeys` es shallow y esto vive dentro de un ítem de array — fuera del
   * schema no sobreviviría a regenerar la sección.
   */
  semanas?: string;
}
export interface PlanData {
  phases: Phase[];
  /**
   * `"no"` apaga el aviso de la primera fase. Fuera del schema (el agente no lo decide) y en
   * el PRIMER nivel, que es hasta donde llega `preserveNonSchemaKeys`: por eso sobrevive a
   * regenerar. Es presentación ⇒ está en `NO_CONTENIDO` (lib/landing/is-blank.ts).
   */
  avisoFase1?: string;
}

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

// Sección de DIAGRAMA (motor de diagramas interactivo — FlowchartViewer como sección
// del landing). Patrón de DOS capas: la SPEC string-only (dentro del schema del agente,
// coerceToSchema-safe) + `diagram` (el grafo FlowchartData con posiciones del usuario)
// FUERA del schema — preserveNonSchemaKeys lo acarrea entre regeneraciones por sección.
// Los campos legacy de tech_architecture quedan solo-lectura para la conversión lazy.
export interface DiagramSystemSpec { nombre: string; rol: string; color: string; detalle: string }
export interface DiagramConnSpec {
  desde: string; hacia: string; titulo: string;
  dataFields: string; dedupeKey: string; cuando: string;
  direction: string; syncType: string; pending: string;
}
export interface DiagramObjectSpec { nombre: string; equivale: string; detalle: string }
export interface DiagramAssocSpec { desde: string; hacia: string; cardinalidad: string; detalle: string; pending: string }
export interface DiagramSectionData {
  intro: string;
  /** Spec de arquitectura (sistemas + conexiones) — la emite el agente. */
  sistemas?: DiagramSystemSpec[];
  conexiones?: DiagramConnSpec[];
  /** Spec de relación de objetos (objetos + asociaciones) — la emite el agente. */
  objetos?: DiagramObjectSpec[];
  asociaciones?: DiagramAssocSpec[];
  /** El grafo vivo (posiciones del CSE). FUERA del schema: carry-forward. Shape = FlowchartData. */
  diagram?: unknown;
  fueraDeAlcance: string[];
  opcionales: TechArchOptional[];
  /** Legacy tech_architecture (conversión lazy, solo lectura). */
  cadena?: TechChainStep[];
  nodos?: TechArchNode[];
  flujos?: TechArchFlow[];
}

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
/** Una línea de la sección de Inversión. `hub` (opcional) es el slug del Hub de HubSpot que
 *  esa línea factura — de ahí sale su ícono. Ver `LineaInversion` en lib/landing/inversion.ts. */
/**
 * Una línea de la tabla de inversión. Espejo de `LineaInversion` (lib/landing/inversion.ts),
 * que es donde vive la aritmética y el porqué de cada campo. Todo string: `coerceToSchema`
 * aplana cualquier hoja que no lo sea. Los campos de cotización son OPCIONALES y ausentes en
 * todo lo publicado — sin `precioUnitario`, el importe sale de `monto` como siempre.
 */
export interface WebInvestLine {
  concepto: string;
  monto: string;
  detalle: string;
  hub?: string;
  /** Unidades (vacío = 1). */
  cantidad?: string;
  /** Precio de lista por unidad, antes del descuento. */
  precioUnitario?: string;
  /** Precio de lista por unidad con contrato ANUAL (vacío = el mensual × 12). */
  precioAnual?: string;
  /** Descuento de ESTA línea: "15%" o "$200". Por línea porque los de HubSpot varían mucho
   *  entre Hubs y uno global no describe ninguna negociación real. */
  descuento?: string;
  /** "mensual" = se cobra todos los meses · ausente = cobro único. */
  recurrencia?: string;
  /** "no" = apagada. En el editor persiste; en la propuesta publicada el check es efímero. */
  activa?: string;
}
/**
 * La sección de INVERSIÓN, una sola para los dos templates (antes convivían dos shapes
 * distintos bajo la misma key). Las reglas de forma —qué es legacy, cuántos totales se
 * pintan— viven en `lib/landing/inversion.ts`; la aritmética en `lib/landing/money.ts`.
 */
export interface WebInvestmentData {
  moneda: string; // "USD", "CRC"… (editable; el total y el intro la muestran)
  /** Servicios de Smarteam → subtotal 1. Conserva el nombre histórico a propósito. */
  lineas: WebInvestLine[];
  /** Licencias de TERCEROS (HubSpot, Insider…) → subtotal 2. Única key nueva del shape
   *  unificado: cae a `[]` en lo ya publicado, que por eso no necesita rama legacy. */
  licencias?: WebInvestLine[];
  extras: WebInvestLine[];
  recurrentes: WebInvestLine[];
  nota: string; // exclusiones ("impuestos no contemplados") — badge arriba
  /** "anual" = las líneas recurrentes se cotizan por año (switch de la tabla). */
  contrato?: string;
  /** Ancho de la card de recurrente mensual — "ancho" ocupa 2 columnas del grid. */
  anchoRecurrente?: "normal" | "ancho";
  // ── Shape v1 de HubSpot: se LEE para la rama legacy y nunca se escribe (patrón
  //    `HubsClienteData.hubs`). Ver `esInversionLegacy`.
  licenciasHubspot?: InvestmentLine;
  implementacion?: InvestmentLine;
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
  /** Render para PDF (Puppeteer): las secciones con piezas ASÍNCRONAS (React Flow)
   *  deben renderizar su variante ESTÁTICA — el export dispara al `data-pdf-ready`
   *  y un canvas interactivo saldría vacío. Lo setea app/print/doc. */
  pdfMode?: boolean;
  clientLogoUrl?: string | null;
  /** Segundo archivo de logo del cliente, para FONDO OSCURO. El hero del motor SIEMPRE
   *  es navy (los 7 defs con `backdrop:true` son `theme:"dark"`, congelado por
   *  lib/ui/landing-hero-theme.test.ts), así que la brand-row usa este si existe. Sin él
   *  cae al logo claro + el filtro histórico que lo pinta como silueta blanca. */
  clientLogoDarkUrl?: string | null;
  /** Tamaño BASE del logo del cliente, en % (50-200). Lo configura el CSE una vez en la
   *  ficha del cliente y aplica a todos sus documentos; un canvas puede pisarlo con
   *  `hero.logoScale`. Ver lib/ui/logo-scale.ts. */
  clientLogoScale?: number | null;
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
  /**
   * Solo DESARROLLO: la estimación de esfuerzo, que vive en la tabla `DevEstimate` y NO en
   * `CanvasBlock` (las horas tienen que ser consultables — ver el comentario del modelo).
   * La sección `estimacion` es `ctxDriven` y la lee de acá.
   *
   * AUSENTE EN LA SUPERFICIE EXTERNA a propósito: la vista del cliente no arma este ctx, así
   * que la sección se apaga sola por `ctxEmpty`. El esfuerzo estimado es información interna
   * (aproxima el costo) — que no llegue al cliente es fail-closed POR CONSTRUCCIÓN, no por
   * un flag que alguien pueda prender por error.
   */
  desarrollo?: {
    estimate?: DevEstimateCtx | null;
    history?: DevEstimateCtx[];
    /** `true` si el usuario tiene la celda `desarrollo.estimate` (gate COSMÉTICO del form). */
    canEstimate?: boolean;
    /** Solo edición: registra una estimación nueva. Rechaza (throw) si el servidor la rechaza. */
    onEstimate?: (input: { hours: number | null; estimatedDate: string | null; note: string }) => Promise<void>;
  };
  /**
   * Solo el documento CRONOGRAMA: el `ProjectTimeline` vivo. Sus dos secciones —la portada,
   * que deriva los números, y el Gantt— lo leen de acá.
   *
   * ── POR QUÉ NO REUSA `ctx.kickoff.timeline` ─────────────────────────────────
   * Es el mismo dato, pero un canal por DOCUMENTO y no por tipo de dato es lo que hace que
   * cada sección se apague sola donde no corresponde: las del kickoff (procesos, horarios,
   * su hero con stats) no pueden encenderse en el documento del cronograma, y el Gantt del
   * cronograma —que sí muestra estado de avance y desvíos— no puede encenderse dentro del
   * kickoff, que es la hoja de ruta del día uno. Fail-closed por construcción, el mismo
   * argumento que el de `desarrollo` acá arriba.
   */
  cronograma?: {
    timeline?: KickoffTimelineData | null;
  };
  /**
   * Solo la PROPUESTA COMERCIAL: los Hubs que la sección `solucion` del MISMO documento
   * declara vendidos (`activos`, ya resueltos a slug). Hermano de `ctx.desarrollo` y
   * `ctx.cronograma`: un canal por DOCUMENTO, porque el motor no propaga data entre secciones
   * (`LandingView` le pasa a cada componente solo su propia fila).
   *
   * SOLO lo arma el editor. La página externa y el PDF no lo pasan, y está bien: sus dos
   * consumidores —el asistente que siembra las licencias y el aviso de desajuste— son
   * `editable`-only, así que en lectura el camino NO EXISTE (no es un flag apagado). El ÍCONO
   * no lo usa: sale de `linea.hub`, que viaja adentro del `data` y por eso llega solo a las
   * cuatro superficies.
   */
  propuesta?: {
    hubsVendidos?: string[];
  };
}

/** Una estimación como la ve el motor (espejo del DTO de `lib/desarrollo`, sin importarlo:
 *  `types.ts` es client-safe y no debe arrastrar el módulo de datos). */
export interface DevEstimateCtx {
  id: string;
  hours: number | null;
  estimatedDate: string | null;
  note: string | null;
  createdByEmail: string;
  createdAt: string;
}

/** Props que recibe TODA sección. `onChange` emite el nuevo `data` (estado local del
 *  workspace, que persiste DE INMEDIATO vía `saveBlock`: PUT optimista, sin debounce —
 *  quien commitea es `Editable`, al perder el foco). Decía "con debounce" y era falso;
 *  la diferencia importa, porque un control de clic (una casilla) manda un PUT por clic,
 *  sin ventana de coalescencia. En modo lectura no hay handlers. */
export interface SectionProps<T> {
  data: T;
  ctx: LandingContext;
  editable?: boolean;
  onChange?: (data: T) => void;
  /**
   * Rótulo y categoría del documento que se está pintando, ya resueltos por el motor
   * (lo que el CSE renombró y, si no, lo declarado en la definición).
   *
   * Existen para las PORTADAS, que al ser `selfTitled` no reciben el encabezado del
   * motor y antes resolvían el hueco con textos escritos a mano adentro del componente.
   * Como una misma portada la comparten varios documentos, ese respaldo hacía que
   * Planificación se presentara como un requerimiento técnico. Con el rótulo entrando
   * por props, el respaldo sale siempre del documento correcto.
   *
   * El resto de las secciones los ignora: su encabezado lo sigue pintando el motor.
   */
  sectionTitle?: string;
  sectionEyebrow?: string;
  /**
   * Rótulos de los CHIPS de columna, resueltos desde la definición del documento.
   *
   * Hoy los usa solo `WebDiagnosisSection`, y existe por el mismo motivo que
   * `sectionTitle`: ese componente lo comparten CUATRO documentos y sus rótulos estaban
   * escritos a mano adentro, pensados para uno solo. Nació para la propuesta de sitio web
   * —izquierda "Retos actuales", derecha "Por qué {plataforma}"— y en los otros tres las
   * columnas ya no son retos ni un "por qué" de una plataforma. Exploración terminó
   * mostrando "Retos actuales" sobre una lista de supuestos, y "Por qué" concatenado con
   * una frase entera que el propio brief le pedía escribir al agente.
   *
   * Ausente = los rótulos históricos del componente, que en la propuesta de sitio web son
   * los correctos. El resto de las secciones lo ignora.
   */
  sectionChips?: { retos?: string; panel?: string };
  /** Rótulos de los bloques de la sección de INVERSIÓN, por documento. Ver `SectionDef.invest`. */
  sectionInvest?: InvestLabels;
}

/**
 * Rótulos de la sección de inversión declarados POR DOCUMENTO — hermano de `chips`, con una
 * corrección al patrón: los valores son CLAVES DE i18n, no literales.
 *
 * `chips` usa literales y por eso es monolingüe. Este documento se publica al cliente y se
 * traduce por `__lang`, así que un literal en español saldría tal cual en una propuesta en
 * inglés. Tipar contra `LandingStringKey` obliga a que cada rótulo nuevo exista en `i18n.ts`
 * con `es` **y** `en` — el compilador lo hace cumplir, no la disciplina.
 */
export interface InvestLabels {
  /** Chip del bloque de servicios. Default: "Servicios Smarteam". */
  servicios?: LandingStringKey;
  /** Chip del bloque de licencias de terceros. Default: "Licencias y plataforma". */
  licencias?: LandingStringKey;
  totalServicios?: LandingStringKey;
  totalLicencias?: LandingStringKey;
  granTotal?: LandingStringKey;
}

/** Definición de una sección dentro de un LandingConfig. No genérico (cada sección
 *  trae su propio data shape); `Component`/`empty` usan `any` para que asignar
 *  componentes concretos (FC<SectionProps<HeroData>>, …) no choque con la varianza. */
export interface SectionDef {
  key: string;                 // matchea CanvasSection.key
  label: string;               // rótulo interno + TÍTULO grande de la sección (no-selfTitled)
  eyebrow?: string;            // categoría/framing chico arriba del título (estilo kickoff)
  tip?: string;                // ⓘ junto al título: hover con la explicación de la sección
                               // (tooltip CSS-only, ver landing-engine.css [data-tip]). Roles lo usa.
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
  /** Rótulos de los chips de columna de `web_diagnosis`, por documento. Ver `SectionProps.sectionChips`. */
  chips?: { retos?: string; panel?: string };
  /** Rótulos de los bloques de la sección de INVERSIÓN, por documento. Mismo principio que
   *  `chips` —el rótulo entra por la DEFINICIÓN, nunca por un campo de `data`— con los
   *  valores tipados contra i18n para que un template nuevo no pueda quedar monolingüe. */
  invest?: InvestLabels;
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
