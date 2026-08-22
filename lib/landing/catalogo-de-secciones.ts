/**
 * lib/landing/catalogo-de-secciones.ts — QUÉ SECCIONES SE PUEDEN CREAR, Y CÓMO SE LLAMAN.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
 * Hasta el 2026-08-21 una persona podía crear UNA sola clase de sección: un HTML pegado a mano, y
 * solo en la propuesta comercial. Elías pidió que el chat pueda crear «tablas, cards, textos,
 * etcétera» — y que funcione igual en todas las áreas.
 *
 * Este archivo es la lista de lo que se puede crear. Es corta a propósito:
 *
 *   ⛔ EL MOTOR SABE PINTAR ~50 COMPONENTES. NO SON UN MENÚ.
 *
 * Qué secciones tiene cada documento está congelado por plantilla en `registry.test.ts`, y ahí
 * dice, textual, que «agregar/quitar/reordenar una sección es una decisión de producto». Un
 * catálogo que ofreciera los 50 haría que el chat proponga meter una «Inversión» en un kickoff, o
 * una segunda portada. Lo que se puede CREAR es otra cosa que lo que el motor sabe DIBUJAR.
 *
 * ── EL CRITERIO DE CORTE ──────────────────────────────────────────────────────────────────────
 * Un tipo entra solo si cumple las cuatro:
 *   1. **Autocontenido** — se dibuja con su propio contenido. Deja afuera todo lo `ctxDriven`
 *      (cronograma, procesos del kickoff, estimación): esos leen el proyecto, así que una segunda
 *      copia pinta lo mismo dos veces.
 *   2. **No estructural** — no es la portada ni el cierre ni la identidad del documento. Un
 *      documento con dos portadas no es más libre: está roto.
 *   3. **Sin plata y sin catálogo** — deja afuera la inversión (los totales se calculan y los
 *      precios los escribe Ventas) y los casos de uso (salen del checklist, con precios exactos).
 *   4. **Genérico** — su schema no está soldado a una plantilla. Es lo que
 *      `shared-sections.defs.ts` ya venía haciendo con sus builders.
 *
 * ── ⚠ TODA HOJA DEL SCHEMA ES UN TEXTO ────────────────────────────────────────────────────────
 * `coerceToSchema` aplana a vacío cualquier hoja que no sea string: no hay números ni booleanos.
 * Por eso el motor escribe "si"/"no" y guarda los altos en px como texto. Un schema con un
 * `{type:"number"}` no falla — devuelve vacío, que es peor.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import {
  PROCESS_MAPPING_SCHEMA,
  PROCESS_MAPPING_EMPTY,
  ROI_SCHEMA,
  ROI_EMPTY,
  DIAGRAM_ARCHITECTURE_SCHEMA,
  DIAGRAM_ARCHITECTURE_EMPTY,
} from "@/components/landing/configs/shared-sections.defs";
import {
  CUSTOM_SECTION_EMPTY,
  CUSTOM_SECTION_LABEL,
  HTML_EMBED_TYPE,
  tipoDeCustomKey,
} from "./custom-sections";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

/**
 * ⭐ EL SCHEMA DE «TEXTO CON TARJETAS», QUE ESTABA COPIADO EN CINCO ARCHIVOS.
 *
 * `{intro, items[{title, detail}]}` es el tipo más reusado del motor —lo declaran kickoff,
 * diagnóstico, planificación, implementación y entrega, cada uno con su propia copia inline— y es
 * exactamente lo que una persona quiere decir cuando pide «un texto» o «unas tarjetas»: el
 * renderer pinta la intro en prosa y debajo una grilla de tarjetas título/detalle.
 *
 * Darle un dueño no agrega una capa: se la saca a cinco.
 */
export const PROSA_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    items: arrayOf({ title: str, detail: str }, ["title"]),
  },
  required: ["items"],
} as const;
export const PROSA_EMPTY = { intro: "", items: [] };

/**
 * ⭐ LA TABLA — el único tipo que hubo que CONSTRUIR, y Elías la pidió por nombre.
 *
 * Las dos tablas que el motor ya tenía son de propósito único: la de inversión son líneas de
 * factura con totales calculados, y la de propiedades tiene columnas cerradas con desplegables.
 * Ofrecer una de esas cuando alguien pide «una tabla comparativa» sería elegir la opción más
 * parecida — el modo de falla que un vocabulario cerrado existe para impedir.
 *
 * ⚠ `celdas` es un array de textos DENTRO de un ítem de array, y sí sobrevive a la coerción —
 * verificado corriendo la función. `docs/DECISIONS.md` afirma lo contrario en la entrada de las
 * secciones personalizadas: quedó desactualizada cuando la coerción pasó a recursar uniforme.
 *
 * ⚠ `alineacion` viaja como TEXTO ("izquierda" | "derecha" | "centro") y se sanea al pintar, con
 * un default. Es el mismo patrón que el alto del embebido y que los "si"/"no": en este schema no
 * hay enums ni booleanos que sobrevivan.
 */
export const TABLA_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    columnas: arrayOf({ titulo: str, alineacion: str }, ["titulo"]),
    filas: arrayOf({ celdas: strArray }, ["celdas"]),
    nota: str,
  },
  required: ["columnas", "filas"],
} as const;
export const TABLA_EMPTY = { intro: "", columnas: [], filas: [], nota: "" };

/** El `sectionType` del renderer de la tabla. Ninguna plantilla lo declara: nace en runtime. */
export const TABLA_TYPE = "tabla";

/** Una sección que se puede crear. `tipo` es lo que viaja en la key (`custom:<tipo>:<uuid>`). */
export interface TipoCreable {
  /** Identidad en la key. ⚠ Solo minúsculas y guión bajo: el `:` es el separador. */
  tipo: string;
  /** Cómo se le dice a una persona. */
  nombre: string;
  /** Qué pinta, en una línea. Es lo que lee el CSE y lo que lee el chat para no inventar. */
  queEs: string;
  sectionType: string;
  schema: Record<string, unknown>;
  empty: unknown;
  /** La guía para el modelo cuando escribe su contenido. */
  brief: string;
}

/**
 * ⛔ LISTA CERRADA. Lo que no está acá no se puede crear, y el chat tiene que DECIRLO en vez de
 * elegir el tipo más parecido: una sección que no coincide con la intención es rápida, silenciosa
 * y equivocada.
 */
export const CATALOGO_DE_SECCIONES: readonly TipoCreable[] = [
  {
    tipo: "prosa",
    nombre: "Texto con tarjetas",
    queEs:
      "Un párrafo de entrada y debajo una grilla de tarjetas con título y una línea de detalle.",
    sectionType: "kickoff_prose",
    schema: PROSA_SCHEMA as unknown as Record<string, unknown>,
    empty: PROSA_EMPTY,
    brief:
      "Sección de texto. `intro`: una o dos frases que enmarcan. `items`: de 2 a 6 tarjetas; `title` es la idea en pocas palabras y `detail` UNA línea que la explica. Concreto, sin relleno.",
  },
  {
    tipo: "tabla",
    nombre: "Tabla",
    queEs:
      "Una tabla con sus encabezados y sus filas. Sirve para comparar, o para listar con columnas.",
    sectionType: TABLA_TYPE,
    schema: TABLA_SCHEMA as unknown as Record<string, unknown>,
    empty: TABLA_EMPTY,
    brief:
      "Tabla. `columnas`: el encabezado de cada una (2 a 5; más no entra en pantalla ni en el PDF). `filas`: una por renglón, con `celdas` en el MISMO orden que las columnas. `intro` y `nota` son opcionales. Textos cortos: una celda no es un párrafo.",
  },
  {
    tipo: "metricas",
    nombre: "Métricas",
    queEs: "Una fila de números grandes, cada uno con su etiqueta debajo.",
    sectionType: "roi",
    schema: ROI_SCHEMA as unknown as Record<string, unknown>,
    empty: ROI_EMPTY,
    brief:
      "De 2 a 4 métricas. `value` es el número tal como se lee (40%, 3x, 12 h); `label` dice qué mejora, en pocas palabras. ⛔ Solo cifras que estén en el contexto: no se inventa una métrica.",
  },
  {
    tipo: "comparacion",
    nombre: "Comparación a dos columnas",
    queEs: "Dos listas enfrentadas — cómo es hoy y cómo va a ser.",
    sectionType: "kickoff_compara",
    schema: {
      type: "object",
      properties: { subhead: str, hoy: strArray, conSistema: strArray },
      required: [],
    } as unknown as Record<string, unknown>,
    empty: { subhead: "", hoy: [], conSistema: [] },
    brief:
      "Contraste directo. `subhead`: una frase de dónde se parte y a dónde se llega. `hoy`: 2 a 4 renglones de cómo opera hoy, con el problema real. `conSistema`: 2 a 4, y cada uno RESPONDE al de `hoy` en el mismo orden.",
  },
  {
    tipo: "procesos",
    nombre: "Mapeo de procesos",
    queEs:
      "Una fila por proceso, con sus dos columnas comparadas y los sistemas que participan.",
    sectionType: "process_mapping",
    schema: PROCESS_MAPPING_SCHEMA as unknown as Record<string, unknown>,
    empty: PROCESS_MAPPING_EMPTY,
    brief:
      "Los procesos operativos que cambian. Por proceso: `comoEsHoy` con la fricción real, `comoSera` con lo que queda resuelto, y los `sistemas` involucrados. Solo procesos descritos con sustancia en el contexto.",
  },
  {
    tipo: "diagrama",
    nombre: "Diagrama",
    queEs:
      "Un mapa de sistemas conectados por flechas, con zoom y pantalla completa. En el PDF sale estático.",
    sectionType: "diagram",
    schema: DIAGRAM_ARCHITECTURE_SCHEMA as unknown as Record<string, unknown>,
    empty: DIAGRAM_ARCHITECTURE_EMPTY,
    brief:
      "Mapa de sistemas: `sistemas` son las cajas (solo herramientas con login o API propia) y `conexiones` las flechas, cada una con el dato que viaja y qué la dispara. El diagrama se dibuja solo desde eso.",
  },
  {
    tipo: "html",
    nombre: "HTML pegado",
    queEs:
      "Un bloque interactivo que una persona pega aparte. La IA no lo escribe: solo crea la sección vacía.",
    sectionType: HTML_EMBED_TYPE,
    schema: { type: "object", properties: {} } as unknown as Record<string, unknown>,
    empty: { ...CUSTOM_SECTION_EMPTY },
    brief: "(No la escribe el agente: el HTML lo pega una persona.)",
  },
];

const POR_TIPO = new Map(CATALOGO_DE_SECCIONES.map((t) => [t.tipo, t]));

/** El tipo del catálogo, o `null` si no existe. */
export function tipoCreable(tipo: string): TipoCreable | null {
  return POR_TIPO.get(tipo) ?? null;
}

/**
 * El tipo por DEFECTO de una sección creada.
 *
 * ⚠ Es `html` y no el primero del catálogo: las secciones creadas antes del 2026-08-21 tienen
 * keys de dos segmentos (`custom:<uuid>`, sin tipo) y son embebidos de HTML. Cambiar este valor
 * les cambia el renderer a TODAS, retroactivamente, en propuestas que ya se enviaron.
 */
export const TIPO_POR_DEFECTO = "html";

/**
 * Las partes creables de una def, para el tipo pedido.
 *
 * ⚠ Un tipo desconocido —una key de un canvas viejo, o un tipo que se retiró— cae al de por
 * defecto en vez de devolver `null`. Degradar al renderer tonto es recuperable; devolver `null`
 * hace que `toSectionDef` no resuelva y la sección DESAPAREZCA sin ningún error.
 */
export function defDelTipo(tipo: string | null | undefined): TipoCreable {
  return tipoCreable(tipo ?? "") ?? tipoCreable(TIPO_POR_DEFECTO)!;
}

/** Lo que hace falta para OFRECER los tipos: nombre y qué pinta. Sin schemas ni briefs. */
export function catalogoLegible(): Array<Pick<TipoCreable, "tipo" | "nombre" | "queEs">> {
  return CATALOGO_DE_SECCIONES.map((t) => ({ tipo: t.tipo, nombre: t.nombre, queEs: t.queEs }));
}

/** Las partes de una def que salen del catálogo, para tipar overrides sin repetir el shape. */
export type PartesDeDef = Pick<BCSectionDef, "sectionType" | "schema" | "empty" | "brief">;

/**
 * La def sintetizada de una sección CREADA por una persona. Mismo contrato que las de la
 * plantilla, pero fabricada desde la KEY en vez de leída del template.
 *
 * ── QUÉ CAMBIÓ EL 2026-08-21 ─────────────────────────────────────────────────
 * Antes devolvía siempre un embebido de HTML con `agentGenerated:false` y el schema vacío: era el
 * único tipo creable, y el flag apagaba a la IA sobre él. Ahora el tipo sale de la key, y con él
 * su schema y su guía — que es lo que permite que el chat cree una tabla o un texto y los llene.
 *
 * ⚠ El embebido de HTML SIGUE siendo `agentGenerated:false`, y no por costumbre: su contenido es
 * markup que pegó una persona. Un agente reescribiéndolo a través de un schema de cero
 * propiedades no lo mejora — no hace nada (la coerción devuelve vacío y el merge lo repone tal
 * cual), cobra el modelo, y el cartel dice que lo reescribió.
 */
export function customDef(key: string, label?: string | null): BCSectionDef {
  const nombre = (label ?? "").trim() || CUSTOM_SECTION_LABEL;
  const tipo = defDelTipo(tipoDeCustomKey(key));
  const esHtml = tipo.sectionType === HTML_EMBED_TYPE;
  return {
    key,
    label: nombre,
    canvasLabel: nombre,
    theme: "light",
    sectionType: tipo.sectionType,
    /* Solo el embebido queda fuera del alcance de la IA. Los demás tipos se crean justamente
       para que los llene: apagarlos los volvería secciones vacías que nadie puede completar
       salvo a mano, que es lo contrario de lo que se pidió. */
    agentGenerated: !esHtml,
    empty: structuredClone(tipo.empty),
    schema: tipo.schema,
    agentHint: esHtml ? "(No la genera el agente: la escribe una persona.)" : tipo.queEs,
    brief: tipo.brief,
  };
}
