/**
 * lib/canvas/print-vocab.ts — el VOCABULARIO con el que el PDF traduce las claves de
 * schema a texto para el papel.
 *
 * ── POR QUÉ VIVE EN `lib/` Y NO JUNTO AL COMPONENTE ──────────────────────────
 * Salió de `app/print/canvas/[clientId]/[canvasId]/card-print.tsx` porque nada lo
 * protegía. El PDF NO usa el motor de landing: `PrintClient` aplana el `data` crudo del
 * bloque con su propio criterio, así que cuando el schema de una sección cambia de forma
 * —un `string[]` que pasa a ser un array de objetos, por ejemplo— la pantalla sigue
 * perfecta y el papel se degrada EN SILENCIO: aparecen etiquetas como "Q:" (una clave
 * corta que `humanize` no puede mejorar) o se filtra estado interno del CSE.
 *
 * Pasó de verdad al rediseñar el plan de sesiones de Exploración. Ni `tsc` ni los tests
 * lo veían, porque acá no hay tipos que se rompan: son diccionarios de strings. Viviendo
 * en `lib/`, `lib/canvas/print-vocab.test.ts` puede vigilar que toda clave nueva de un
 * schema esté gobernada por alguno de estos conjuntos.
 *
 * REGLA al agregar un schema nuevo: cada clave suya tiene que caer en uno de estos
 * baldes — se saltea (SKIP), titula (TITLE), va sin etiqueta (NO_LABEL), o tiene un
 * rótulo legible (KEY_LABELS). El fallback `humanize` alcanza para claves largas en
 * castellano; para siglas y claves de una letra, no.
 */

/** Claves técnicas: no son contenido del documento (mismo criterio que `flattenCardData`). */
export const SKIP_KEYS = new Set([
  "diagram", // lo dibuja DiagramStatic aparte
  "__lang",
  "buttonTarget",
  "buttonUrl", // un link largo en papel es ruido; el rótulo del botón sí queda
  "coverImageUrl",
  "brands",
  "color", // hex de marca
  // Estado VIVO del CSE, no contenido del documento: la casilla "ya la pregunté" del
  // plan de sesiones cambia durante la reunión y el PDF es una foto. Imprimir
  // "Hecha: si" debajo de una pregunta sería ruido con fecha de vencimiento.
  "hecha",
]);

/** Claves cuyo valor ya es markdown (prosa legacy de los canvas viejos). */
export const MD_KEYS = new Set(["__legacyMd", "md"]);

/** Claves que titulan a su objeto: encabezan la viñeta en negrita, sin etiqueta.
 *  `q` = la pregunta literal del plan de sesiones: sin esto el papel sale con
 *  "**Q:** ¿pregunta…?", porque `humanize` no tiene de dónde sacar algo mejor. */
export const TITLE_KEYS = [
  "title", "titulo", "nombre", "name", "label", "headline",
  "concepto", "actor", "campo", "evento", "objeto", "measure", "q",
];

/** Claves de prosa: se imprimen como párrafo pelado (etiquetarlas sería ruido). */
export const NO_LABEL_KEYS = new Set([
  "headline", "subhead", "intro", "summary", "detail", "detalle", "descripcion", "eyebrow", "texto",
]);

/** Traducciones de las claves de schema que humanizadas quedarían mal (acentos, jerga). */
export const KEY_LABELS: Record<string, string> = {
  comoEsHoy: "Cómo es hoy",
  comoSera: "Cómo va a ser",
  porQueBullets: "Qué implica",
  fueraDeAlcance: "Fuera de alcance",
  dataFields: "Datos que viajan",
  dedupeKey: "Clave anti-duplicados",
  syncType: "Tipo de sincronización",
  direction: "Dirección",
  cuando: "Cuándo",
  quienes: "Quiénes",
  siguientePaso: "Siguiente paso",
  repregunta: "Si la respuesta sale vaga",
  referenciaSectorial: "Referencia sectorial",
  casosDeUso: "Casos de uso",
  cotizaAparte: "Cotiza aparte",
  esLlave: "Es llave",
  metrics: "Métricas",
  duration: "Duración",
  price: "Precio",
  buttonLabel: "Botón",
  pending: "Por confirmar",
  // Claves en inglés de los schemas del motor: humanizarlas dejaría "Value", "Label"…
  value: "Valor",
  label: "Etiqueta",
  title: "Título",
  detail: "Detalle",
  name: "Nombre",
  kind: "Tipo",
  chart: "Gráfico",
  measure: "Medida",
  level: "Nivel",
  before: "Antes",
  after: "Después",
  sistemas: "Sistemas",
  procesos: "Procesos",
  conexiones: "Conexiones",
  retos: "Retos",
  cadena: "Flujo",
  opcionales: "Opcionales",
  plataforma: "Plataforma",
  objetivo: "Objetivo",
  hubs: "Hubs",
  tags: "Áreas",
};

/**
 * Valores que en pantalla son un ícono o una flecha y en papel serían jerga cruda
 * ("direction: to"). Solo los del mapa de sistemas, que es la sección más técnica.
 */
export const VALUE_LABELS: Record<string, Record<string, string>> = {
  direction: { to: "unidireccional", bidir: "bidireccional" },
  syncType: { realtime: "en tiempo real", batch: "por lotes", manual: "manual" },
  pending: { si: "sí", sí: "sí", no: "no" },
};

/** `comoEsHoy` → "Como es hoy". Fallback cuando la clave no está en el diccionario. */
export function humanize(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelFor(key: string): string {
  return KEY_LABELS[key] ?? humanize(key);
}
