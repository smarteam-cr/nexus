/**
 * lib/tags/catalog.ts
 *
 * Catálogo ÚNICO de tags de clasificación de un proyecto / business case. Es la fuente
 * de verdad del vocabulario: agregar un producto futuro = una línea acá.
 *
 * CUATRO grupos viven en el array `tags String[]` (Project + BusinessCase):
 *   - `product`:          hubs de HubSpot + productos propios (Insider One).
 *   - `scope`:            características del alcance (integración/desarrollo, migración de CRM).
 *   - `modalidad`:        `recurrente` = el servicio es de continuidad (soporte, retainer, bolsa
 *                         de horas, sin fin definido). Su PRESENCIA en `tags` define el ciclo de
 *                         vida corto (lib/lifecycle). Lo infiere el HANDOFF (isRecurrent); el CSE
 *                         lo corrige quitándolo/agregándolo en la tira. Ausencia = implementación.
 *   - `tipo_implementacion`: `implementacion` vs `reimplementacion` — EXCLUYENTES entre sí.
 *
 * ── 2026-08-12: EL PUNTO DE PARTIDA ENTRÓ AL CATÁLOGO ────────────────────────
 * Hasta hoy la modalidad de implementación NO vivía en el array: era el enum `implementationType`,
 * en su propia columna, con su propio endpoint (`PATCH .../implementation-type`) y su propio chip
 * en la tira —un `<button>` con desplegable, sin ✕, al lado de tags que sí lo tenían—. Dos
 * sistemas para el mismo tipo de dato: cómo se clasifica un proyecto.
 *
 * Ahora es un tag más. Lo que ganó el catálogo para poder recibirlo es el concepto de GRUPO
 * EXCLUYENTE (ver `GRUPOS_EXCLUYENTES`): un proyecto es implementación O re-implementación, nunca
 * las dos, y eso lo hace cumplir `sanitizeTags` —que corre en TODA lectura y escritura— en vez de
 * confiar en que la pantalla se porte bien.
 *
 * ⚠ NO se metió en el grupo `modalidad` a propósito: ahí vive `recurrente`, que NO es excluyente
 * (es presencia/ausencia). Compartir grupo habría obligado a volver excluyente a `recurrente` y
 * roto su semántica.
 *
 * Compat: el storage histórico guardó LABELS ("Marketing Hub"). `normalizeTag` acepta
 * slug o label y normaliza a slug, así no hace falta backfill — se normaliza al leer/escribir.
 * Desde el 2026-08-11 esa misma puerta absorbe los RENOMBRES de HubSpot (`TAG_ALIASES`).
 */
export type TagGroup = "product" | "scope" | "modalidad" | "tipo_implementacion";

export interface TagDef {
  slug: string;
  label: string;
  group: TagGroup;
}

/** Slug del tag de recurrencia — su presencia en `Project.tags` = ciclo de vida corto. */
export const RECURRENTE_TAG = "recurrente";

/** Los dos slugs del punto de partida. Excluyentes: un proyecto es uno O el otro. */
export const IMPLEMENTACION_TAG = "implementacion";
export const REIMPLEMENTACION_TAG = "reimplementacion";

/**
 * Los EJES EXCLUYENTES: grupos donde solo UNO de sus tags puede estar presente.
 *
 * Todo lo que el resto del sistema necesita saber de un eje vive acá y en ningún otro lado — el
 * rótulo de su sección en el picker, si es obligatorio y qué decir cuando falta. Es lo que hace
 * que la tira de tags no tenga ni un caso especial: deriva todo del catálogo.
 *
 * Se declara como DATO y no como un `if` dentro de `sanitizeTags` para que el día que otro eje
 * sea excluyente entre a la regla solo.
 */
export const EJES_EXCLUYENTES: Record<string, { label: string; requerido: boolean; avisoFalta: string }> = {
  tipo_implementacion: {
    label: "Tipo de implementación",
    /* Obligatorio porque DECIDE CONTENIDO, no porque quede lindo completo: la regla #6 del prompt
       del cronograma y el título + responsable de una tarea fija de la Semana 0 ramifican por él.
       Sin definirlo el sistema asume "desde cero" —lo mismo que ya hacía con el enum en null—,
       pero ahora lo dice en pantalla en vez de resolverlo en silencio. */
    requerido: true,
    avisoFalta: "Falta: tipo de implementación",
  },
};

/** Los grupos con exclusión, derivados del registro — nunca una segunda lista que se desincronice. */
export const GRUPOS_EXCLUYENTES: readonly string[] = Object.keys(EJES_EXCLUYENTES);

export const TAG_CATALOG: readonly TagDef[] = [
  // ── Productos ──────────────────────────────────────────────────────────────
  // Los HUBS siguen el nombre VIGENTE de HubSpot; los anteriores viven en `TAG_ALIASES`.
  { slug: "marketing_hub", label: "Marketing Hub", group: "product" },
  { slug: "sales_hub", label: "Sales Hub", group: "product" },
  { slug: "service_hub", label: "Service Hub", group: "product" },
  { slug: "content_hub", label: "Content Hub", group: "product" }, // ex "CMS Hub"
  { slug: "data_hub", label: "Data Hub", group: "product" }, // ex "Operations Hub"
  { slug: "revenue_hub", label: "Revenue Hub", group: "product" }, // ex "Commerce Hub" (jun-2026)
  { slug: "insider_one", label: "Insider One", group: "product" }, // app propia de Smarteam
  // ── Alcance / características ────────────────────────────────────────────────
  { slug: "custom_dev", label: "Integración / Desarrollo a medida", group: "scope" },
  { slug: "crm_migration", label: "Migración desde otro CRM", group: "scope" },
  // Se vendió un sitio web (nuevo o rediseño), landings o web pública. Es `scope` y no
  // `product` porque describe QUÉ SE VENDIÓ, no un producto de HubSpot: `content_hub`
  // (ex CMS Hub) sigue siendo el producto y un proyecto web normalmente lleva los dos.
  { slug: "sitio_web", label: "Sitio web", group: "scope" },
  // ── Modalidad del servicio ──────────────────────────────────────────────────
  { slug: RECURRENTE_TAG, label: "Servicio recurrente", group: "modalidad" },
  // ── Tipo de implementación (EXCLUYENTES entre sí — ver GRUPOS_EXCLUYENTES) ────────
  // Deciden contenido real del cronograma: la regla #6 del prompt (¿cargar la base de datos o
  // revisar la existente?) y el título + responsable de una tarea fija de la Semana 0.
  { slug: IMPLEMENTACION_TAG, label: "Implementación", group: "tipo_implementacion" },
  { slug: REIMPLEMENTACION_TAG, label: "Re-implementación", group: "tipo_implementacion" },
] as const;

/**
 * Nombres MUERTOS → el slug vigente. HubSpot renombra sus productos y la base guarda lo que
 * se escribió el día que se escribió: `operations_hub` (10 filas) y `commerce_hub` (1) siguen
 * ahí, y el sync de HubSpot todavía alimenta labels históricos.
 *
 * Se resuelven al LEER, que es la misma doctrina con la que el catálogo ya venía absorbiendo
 * los labels antiguos: no hace falta backfill y la data converge sola al slug nuevo en el
 * primer guardado (`sanitizeTags` corre en toda escritura y además deduplica, así que una fila
 * con `["operations_hub","data_hub"]` colapsa a `["data_hub"]`).
 *
 * ⚠ NO se borran después de un backfill: el sync de HubSpot los sigue produciendo y los
 * snapshots publicados llevan lo que llevaban el día que se publicaron.
 */
const TAG_ALIASES: Record<string, string> = {
  // Renombres de producto de HubSpot
  operations_hub: "data_hub",
  "operations hub": "data_hub",
  commerce_hub: "revenue_hub",
  "commerce hub": "revenue_hub",
  // El label viejo de Content Hub, que hasta ahora devolvía null
  "cms hub": "content_hub",
  /* Los valores del enum `ImplementationType`, que hasta el 2026-08-12 vivían en su propia
     columna. Entran por la misma puerta que los renombres de HubSpot y por la misma razón: el
     storage viejo los produjo y algo puede seguir emitiéndolos. Con esto el script de migración
     es un `sanitizeTags([...tags, valorDeLaColumna])` y un cliente viejo converge solo.
     (El lookup prueba también en minúscula, así que absorbe "IMPLEMENTATION" tal cual.) */
  implementation: "implementacion",
  reimplementation: "reimplementacion",
};

/**
 * Los hubs de HUBSPOT, sin los productos propios.
 *
 * ⚠ NO es lo mismo que `productTags()`: ahí vive `insider_one`, que es una app de Smarteam.
 * Todo lo que hable de "los Hubs del cliente" —la sección de la propuesta, el conocimiento por
 * hub— filtra por acá; filtrar por `group === "product"` mete Insider entre los Hubs.
 */
export const HUBSPOT_HUB_SLUGS = [
  "marketing_hub",
  "sales_hub",
  "service_hub",
  "content_hub",
  "data_hub",
  "revenue_hub",
] as const;

export type HubspotHubSlug = (typeof HUBSPOT_HUB_SLUGS)[number];

const BY_SLUG = new Map(TAG_CATALOG.map((t) => [t.slug, t]));
const BY_LABEL = new Map(TAG_CATALOG.map((t) => [t.label.toLowerCase(), t]));

export function tagDef(slug: string): TagDef | undefined {
  return BY_SLUG.get(slug);
}
export function isKnownTag(slug: string): boolean {
  return BY_SLUG.has(slug);
}
export function labelForTag(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}
export function productTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "product");
}
export function scopeTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "scope");
}
export function modalidadTags(): TagDef[] {
  return TAG_CATALOG.filter((t) => t.group === "modalidad");
}

/**
 * Las secciones del selector de tags, DERIVADAS del catálogo — el orden de arriba es el orden que
 * se ve en pantalla, y un grupo nuevo aparece solo con agregarle su rótulo acá.
 *
 * Existe para que la tira de tags no tenga ni un `if` por grupo: antes la modalidad se pintaba con
 * un componente aparte (un `<button>` con desplegable propio) y por eso su chip no tenía ✕ —
 * el defecto que Elías vio y que originó toda esta unificación. Un dato de la misma naturaleza
 * dibujado por dos caminos distintos termina, tarde o temprano, comportándose distinto.
 */
export const GRUPO_LABEL: Record<TagGroup, string> = {
  product: "Productos",
  scope: "Alcance",
  tipo_implementacion: "Tipo de implementación",
  modalidad: "Modalidad",
};

/** Los grupos en el orden en que se muestran, con su rótulo y sus tags. */
export function seccionesDelCatalogo(): { group: TagGroup; label: string; tags: TagDef[] }[] {
  const orden: TagGroup[] = ["product", "scope", "tipo_implementacion", "modalidad"];
  return orden.map((group) => ({
    group,
    label: GRUPO_LABEL[group],
    tags: TAG_CATALOG.filter((t) => t.group === group),
  }));
}

/**
 * Posición de un slug en el catálogo, para ORDENAR los chips en pantalla.
 *
 * ⚠ Solo para mostrar: el orden REAL del array es semántico desde que `sanitizeTags` resuelve los
 * ejes excluyentes con primero-gana, así que reordenar la lista guardada cambiaría quién gana.
 * Esto ordena una copia para pintar, nunca lo que se persiste.
 */
export function ordenDeTag(slug: string): number {
  const i = TAG_CATALOG.findIndex((t) => t.slug === slug);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
/** ¿La lista marca el servicio como recurrente? → ciclo de vida corto (lib/lifecycle). */
export function isRecurrente(slugs: string[]): boolean {
  return sanitizeTags(slugs).includes(RECURRENTE_TAG);
}

/** Acepta slug, label conocido o nombre MUERTO (`TAG_ALIASES`) → slug canónico; null si no. */
export function normalizeTag(s: string): string | null {
  if (BY_SLUG.has(s)) return s;
  const lower = s.toLowerCase();
  const byLabel = BY_LABEL.get(lower);
  if (byLabel) return byLabel.slug;
  // Los renombres se resuelven al final: un slug o label VIVO siempre gana.
  return TAG_ALIASES[s] ?? TAG_ALIASES[lower] ?? null;
}

/**
 * Normaliza una lista a slugs canónicos, descartando lo desconocido, los duplicados y —desde el
 * 2026-08-12— el SEGUNDO tag de un eje excluyente.
 *
 * ⚠ PRIMERO GANA, igual que el dedupe que esta función ya hacía. No es un detalle de gusto: el
 * productor realista de "los dos a la vez" es el merge ADITIVO del handoff (`analyze/route.ts`),
 * que concatena lo que ya estaba con lo que devolvió el agente. Con primero-gana, **el valor que
 * el CSE ya curó le gana al que propone el agente** — la misma doctrina que el resto del repo
 * ("nunca pisar una decisión humana existente"). Con último-gana, cada regeneración del handoff
 * podría dar vuelta en silencio una clasificación corregida a mano.
 *
 * ⚠ Consecuencia: el ORDEN del array `tags` pasa a ser SEMÁNTICO. Antes era cosmético.
 *
 * ⚠ Nunca tira ni loguea ante un conflicto: esto corre en CADA lectura del sistema, y un throw
 * convertiría un olor de datos en un 500. Repara en silencio y de forma determinista.
 */
export function sanitizeTags(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const out: string[] = [];
  const ejesUsados = new Set<string>();
  for (const s of slugs) {
    if (typeof s !== "string") continue;
    const slug = normalizeTag(s);
    if (!slug || out.includes(slug)) continue;
    const eje = ejeExcluyenteDe(slug);
    if (eje) {
      if (ejesUsados.has(eje)) continue; // ya salió uno de este eje — primero gana
      ejesUsados.add(eje);
    }
    out.push(slug);
  }
  return out;
}

/** El eje excluyente al que pertenece un slug, o `null` si no es de ninguno. */
export function ejeExcluyenteDe(slug: string): string | null {
  const g = BY_SLUG.get(slug)?.group;
  return g && GRUPOS_EXCLUYENTES.includes(g) ? g : null;
}

/**
 * Agregar un tag DECLARANDO LA INTENCIÓN de quien lo eligió: si pertenece a un eje excluyente,
 * primero saca a sus hermanos y después lo agrega. ÚLTIMO GANA, al revés que `sanitizeTags`.
 *
 * Las dos semánticas son necesarias y no se contradicen: `sanitizeTags` REPARA un array que ya
 * llegó contradictorio (y ahí gana lo curado), `conTag` EXPRESA una elección nueva (y ahí gana lo
 * que la persona acaba de elegir). Sin esta función el bug es inmediato y desconcertante: el CSE
 * tiene "Implementación", hace clic en "Re-implementación", se manda
 * `["implementacion","reimplementacion"]`, `sanitizeTags` conserva el primero — y el clic no hace
 * nada, sin ningún error.
 */
export function conTag(slugs: string[], slug: string): string[] {
  const nuevo = normalizeTag(slug);
  if (!nuevo) return sanitizeTags(slugs);
  const eje = ejeExcluyenteDe(nuevo);
  const base = sanitizeTags(slugs).filter((s) => (eje ? ejeExcluyenteDe(s) !== eje : s !== nuevo));
  return [...base, nuevo];
}

/** El nombre del eje, para los pocos lugares que necesitan nombrarlo sin repetir el literal. */
export const EJE_TIPO_IMPLEMENTACION = "tipo_implementacion";

/** El tag de tipo de implementación de la lista, o `null` si todavía no se definió. */
export function tipoDeImplementacion(slugs: string[]): string | null {
  return sanitizeTags(slugs).find((s) => ejeExcluyenteDe(s) === EJE_TIPO_IMPLEMENTACION) ?? null;
}

/**
 * ¿Es una re-implementación? Decide la regla #6 del cronograma y la tarea de base de datos de la
 * Semana 0. `false` también cuando FALTA definirlo — que es exactamente lo que hacía el enum en
 * `null`, y por eso el hueco se avisa en la pantalla (`faltanEjesRequeridos`) y no acá.
 */
export function esReimplementacion(slugs: string[]): boolean {
  return tipoDeImplementacion(slugs) === REIMPLEMENTACION_TAG;
}

/** Los ejes OBLIGATORIOS que esta lista todavía no respondió. Alimenta el aviso de la tira. */
export function faltanEjesRequeridos(slugs: string[]): string[] {
  const s = sanitizeTags(slugs);
  return Object.entries(EJES_EXCLUYENTES)
    .filter(([eje, def]) => def.requerido && !s.some((t) => ejeExcluyenteDe(t) === eje))
    .map(([eje]) => eje);
}

/** Labels legibles (para mostrar / inyectar en prompts de agentes). */
export function tagLabels(slugs: string[]): string[] {
  return sanitizeTags(slugs).map(labelForTag);
}

/** ¿La lista tiene un tag de alcance técnico? → enruta a la fase "Desarrollo / Integración" (#7).
 *
 *  ⚠ `sitio_web` NO entra acá A PROPÓSITO: esta función rutea al canvas "Desarrollo" y a la fase
 *  técnica del cronograma, y un sitio web NO es necesariamente desarrollo a medida (un sitio en
 *  el CMS sin integraciones no lleva fase técnica). Si un proyecto web además tiene desarrollo,
 *  el handoff le pone `custom_dev` y ahí sí entra. No acoplarlos por arrastre. */
export function hasTechnicalScope(slugs: string[]): boolean {
  const s = sanitizeTags(slugs);
  return s.includes("custom_dev") || s.includes("insider_one");
}

/** serviceType → producto por defecto (slug). Reemplaza el viejo SERVICE_TO_HUB con labels. */
export const SERVICE_TO_PRODUCT: Record<string, string> = {
  loop_marketing: "marketing_hub",
  loop_sales: "sales_hub",
  loop_service: "service_hub",
};
