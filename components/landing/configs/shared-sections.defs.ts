/**
 * components/landing/configs/shared-sections.defs.ts
 *
 * Defs (server-safe) de las secciones COMPARTIDAS entre templates: arquitectura
 * tecnológica/de conexión y mapeo de procesos. Se exportan como BUILDERS porque
 * cada template las instancia con su propia key/label/brief (el renderer se
 * comparte vía `sectionType`). Schemas SOLO con hojas string (coerceToSchema
 * aplana booleans/números a "").
 */
import type { BCSectionDef } from "./business-case.defs";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

export const TECH_ARCHITECTURE_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    cadena: arrayOf({ actor: str, titulo: str, detalle: str }, ["actor", "titulo"]),
    fueraDeAlcance: strArray,
    opcionales: arrayOf({ nombre: str, detalle: str }, ["nombre"]),
  },
  required: ["cadena"],
} as const;

export const TECH_ARCHITECTURE_EMPTY = {
  intro: "",
  cadena: [],
  fueraDeAlcance: [],
  opcionales: [],
};

export function makeTechArchitectureDef(
  overrides: Pick<BCSectionDef, "key" | "label"> & Partial<BCSectionDef>,
): BCSectionDef {
  return {
    eyebrow: "Arquitectura",
    theme: "light",
    sectionType: "tech_architecture",
    schema: TECH_ARCHITECTURE_SCHEMA as unknown as Record<string, unknown>,
    empty: TECH_ARCHITECTURE_EMPTY,
    agentHint: "Cadena del flujo de datos (3-5 pasos con actor + qué pasa) + fuera de alcance + opcionales. Escueto.",
    brief:
      "Arquitectura de conexión como CADENA de 3 a 5 pasos (se presenta como cards con flechas): cada paso con `actor` (quién/qué sistema: 'Visitante', 'Sitio', 'HubSpot CRM', 'Equipo comercial', 'ERP'…), `titulo` de 3 a 6 palabras (qué pasa: 'Lead registrado al instante') y `detalle` de UNA línea corta. `intro`: máximo 2 frases con la idea central. `fueraDeAlcance`: qué NO incluye esta fase (frases cortas). `opcionales`: integraciones a futuro. Fuente: SOLO sistemas mencionados en el contexto — no inventes integraciones.",
    ...overrides,
  };
}

// ── Arquitectura como DIAGRAMA (motor de diagramas interactivo) ──────────────
// Spec string-only (sistemas + conexiones con metadatos) que el conversor
// `lib/flowchart/spec-to-diagram` vuelve grafo. La misma def sirve a BC hubspot
// (`arquitectura_tecnologica`), website (`arquitectura_conexion`) y a cualquier
// template futuro; Desarrollo tiene la suya propia (brief más técnico, para devs).
export const DIAGRAM_ARCHITECTURE_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    sistemas: arrayOf({ nombre: str, rol: str, color: str, detalle: str }, ["nombre"]),
    conexiones: arrayOf(
      { desde: str, hacia: str, titulo: str, dataFields: str, dedupeKey: str, cuando: str, direction: str, syncType: str, pending: str },
      ["desde", "hacia", "titulo"],
    ),
    fueraDeAlcance: strArray,
    opcionales: arrayOf({ nombre: str, detalle: str }, ["nombre"]),
  },
  required: ["sistemas", "conexiones"],
} as const;

export const DIAGRAM_ARCHITECTURE_EMPTY = {
  intro: "",
  sistemas: [],
  conexiones: [],
  fueraDeAlcance: [],
  opcionales: [],
};

export function makeDiagramArchitectureDef(
  overrides: Pick<BCSectionDef, "key" | "label"> & Partial<BCSectionDef>,
): BCSectionDef {
  return {
    eyebrow: "Arquitectura",
    theme: "light",
    sectionType: "diagram",
    schema: DIAGRAM_ARCHITECTURE_SCHEMA as unknown as Record<string, unknown>,
    empty: DIAGRAM_ARCHITECTURE_EMPTY,
    agentHint:
      "MAPA DE SISTEMAS: `sistemas` (cajas) + `conexiones` (flechas de datos con qué viaja / cuándo / dedupe). El diagrama se dibuja solo desde la spec.",
    brief:
      "Arquitectura de conexión como MAPA DE SISTEMAS (se dibuja como diagrama: cajas = sistemas, flechas = datos que fluyen). `intro`: 1-2 frases con la idea central. " +
      "`sistemas` (2-6): SOLO herramientas con login/API/BD propia mencionadas en el contexto (CRM, ERP, sitio, ecommerce, telefonía; un conector/middleware también cuenta) — pasos, tareas o personas NO son sistemas. Por sistema: `nombre` EXACTO ('HubSpot', 'SAP'…) · `rol` corto ('CRM', 'ERP') · `detalle` de 1 línea (qué identifica sus registros, si se conversó) · `color` vacío salvo hex conocido de la marca. " +
      "`conexiones`: `desde`/`hacia` con el `nombre` EXACTO de un ítem de `sistemas` · `titulo` = el dato que fluye en 3-6 palabras · `dataFields` = campos concretos si se hablaron ('Contactos/Negocios') · `dedupeKey` = cómo se evita duplicar (Contactos → email; Empresas → dominio; si no se definió, '⚠️ Por definir') · `cuando` = qué dispara el sync · `direction` = 'to' o 'bidir' · `syncType` = 'realtime' | 'batch' | 'manual'. Cuando algo esté por confirmar: texto con '⚠️ Por definir' Y `pending: 'si'` — no inventes integraciones ni valores. " +
      "`fueraDeAlcance`: qué NO incluye esta fase. `opcionales`: integraciones a futuro.",
    ...overrides,
  };
}

/**
 * FORMA DE PAGO (2026-10-07, pedido de Elías): «la propuesta muestra el cuadro de inversión, pero no
 * explica cómo se paga, y es algo que los clientes preguntan mucho». Va DEBAJO de «Inversión» en las
 * dos propuestas comerciales (HubSpot y sitio web).
 *
 * ⭐ El agente escribe la FORMA —cuántas cuotas y cuándo cae cada una, según lo conversado— y NUNCA
 * un monto: los números salen de la Inversión del mismo documento, en tiempo real
 * (lib/landing/forma-de-pago.ts). Ventas la ajusta a mano en el documento.
 */
export const FORMA_DE_PAGO_DEF: BCSectionDef = {
  key: "forma_de_pago",
  canvasLabel: "Forma de pago",
  label: "Forma de pago",
  eyebrow: "Cómo se paga",
  theme: "light",
  sectionType: "forma_de_pago",
  empty: { cuotas: "", pagos: [], resumen: "", recurrenteDesde: "", nota: "" },
  agentHint: "Cuántos pagos y cuándo cae cada uno, según lo conversado. Sin montos.",
  brief:
    "Forma de pago: CÓMO se paga la implementación. Los MONTOS NO los escribes nunca: el sistema reparte el total de la sección «Inversión» entre los pagos, con sus descuentos, y muestra las mensualidades aparte. Tú escribes solo la forma.\n\n`cuotas`: cuántos pagos, como texto, entre «1» y «5». Si en las fuentes se conversó cómo quiere pagar el cliente (un anticipo, pagos por hito, en tres meses), respétalo; si no se habló, «4». `pagos`: uno por cuota, en orden. `momento` es cuándo se paga, como lo lee el cliente ('Antes de iniciar el proyecto', '1 mes después del inicio', 'Al salir a producción'); `cuando` es su rótulo corto para el calendario ('Inicio', 'Mes 1', 'Go live'). `porcentaje` SOLO si se conversó un porcentaje para ese pago ('50' para un anticipo del 50 %); vacío = parte igual del resto. Sin nada conversado: el primero 'Antes de iniciar el proyecto' / 'Inicio' y después uno por mes ('1 mes después del inicio' / 'Mes 1', …).\n\n`resumen`: UNA línea de qué cubre la inversión, nombrando lo que se implementa ('Implementación de Marketing, Sales, Service e integración bidireccional.'). `recurrenteDesde`: desde cuándo corre una mensualidad (el mantenimiento de un conector), si se conversó ('mes 5'); vacío = el mes siguiente al último pago. `nota`: condiciones que se hayan dicho (impuestos, facturación, moneda de pago); vacío si no hay. NUNCA inventes plazos, porcentajes ni condiciones que nadie dijo.",
  schema: {
    type: "object",
    properties: {
      cuotas: str,
      pagos: arrayOf({ momento: str, cuando: str, porcentaje: str }, ["momento"]),
      resumen: str,
      recurrenteDesde: str,
      nota: str,
    },
    required: ["cuotas", "pagos"],
  },
};

// ── Casos de uso del catálogo (sección DETERMINÍSTICA) ──────────────────────
// `agentGenerated:false`: el agente la SALTEA — la escribe el generate con los
// seleccionados del checklist (títulos/precios EXACTOS del catálogo; cero
// alucinación). Vacía → blank → invisible interna (read) y externamente.
export const USE_CASES_DEF: BCSectionDef = {
  key: "casos_de_uso",
  canvasLabel: "Casos de uso",
  label: "Casos de uso incluidos",
  eyebrow: "Casos de uso",
  theme: "light",
  sectionType: "use_cases",
  agentGenerated: false,
  /* ⭐ Y ADEMÁS LA REESCRIBE NEXUS, en cada «Generar» y cada vez que se toca el checklist de casos
     de uso. Sin este flag cae en la clase `manual` —«la escribió una persona y NADA la reescribe»—
     que es exactamente lo contrario de lo que pasa: el CSE tocaría el texto por chat y el próximo
     clic en el checklist se lo lleva puesto, sin aviso. */
  reescritaPorNexus: true,
  empty: { items: [] },
  schema: {
    type: "object",
    properties: { items: arrayOf({ title: str, detail: str, price: str }, ["title"]) },
    required: ["items"],
  },
  agentHint: "(No la genera el agente: se llena con el checklist del catálogo.)",
  brief:
    "Casos de uso del catálogo seleccionados por el vendedor. Esta sección NO la escribe el agente: se llena automáticamente con los casos marcados en el checklist (con sus precios exactos) y se puede retocar a mano.",
};

/**
 * ⭐ LOS TITULARES DE MEDIA LÍNEA EXISTEN EN TODOS LOS DOCUMENTOS — decisión de Elías, 2026-08-23.
 *
 * ── POR QUÉ CAMBIÓ, Y EL RAZONAMIENTO VIEJO, QUE ERA BUENO ───────────────────────────────────
 * Hasta hoy `resumenHoy`/`resumenSera` vivían SOLO en el schema de la Entrega, con este argumento
 * escrito: el schema viaja al modelo como la forma que tiene que devolver, así que sumarlos acá
 * haría que cuatro agentes empiecen a escribir dos titulares que ningún brief de ellos explica —
 * y en `implementacion.pipelines`, donde el «antes» es una lista de etapas, un titular de media
 * línea no tiene contenido posible.
 *
 * ⛔ El razonamiento era correcto y le faltaba la otra mitad: **el componente los PINTA igual**.
 * `ProcessMappingSection` los dibuja con `(p.resumenHoy || editable)`, sin consultar el esquema, en
 * los CINCO documentos. O sea que en cuatro había dos cajas grises «En una línea…» que:
 *   · el CSE veía y podía escribir, y `coerceToSchema` le borraba en la próxima regeneración;
 *   · el chat no veía —no están en la firma— y rechazaba si las adivinaba.
 * Elías lo vio en el diagnóstico: pidió «agregale los títulos a cada card» y el chat contestó,
 * correctamente, que esa sección solo tiene `nombre`, `comoEsHoy`, `comoSera` y `sistemas`.
 *
 * El costo de la decisión es UNA LÍNEA DE BRIEF POR DOCUMENTO, y en Implementación esa línea dice
 * «déjalos vacíos» — que es la respuesta al caso que el argumento viejo había identificado bien.
 *
 * ⚠ Y siguen DENTRO del schema, no como claves sueltas: `preserveNonSchemaKeys` solo acarrea
 * claves de PRIMER nivel, así que un campo dentro de `procesos[]` que no esté declarado lo borra
 * `coerceToSchema` en cada regeneración y nada lo rescata. Es la mitad del defecto que esto cierra.
 */
export const PROCESS_MAPPING_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    procesos: arrayOf(
      { nombre: str, resumenHoy: str, comoEsHoy: str, resumenSera: str, comoSera: str, sistemas: str },
      ["nombre"],
    ),
  },
  required: ["procesos"],
} as const;

/**
 * @deprecated Alias del compartido desde el 2026-08-23 — los titulares ya viven en los cinco.
 *
 * No se borra: `entrega.defs.ts` lo importa por nombre, y el nombre sigue diciendo qué es. Borrarlo
 * sería un cambio de import sin ningún beneficio.
 */
export const PROCESS_MAPPING_SCHEMA_CON_TITULAR = PROCESS_MAPPING_SCHEMA;

export const PROCESS_MAPPING_EMPTY = { intro: "", procesos: [] };

/**
 * ⭐ EL ESQUEMA DE PROSA — el tipo más reusado del motor: 20 secciones en CINCO documentos.
 *
 * Estaba escrito a mano CINCO veces, una por archivo de defs, con la misma forma. No es un
 * refactor de gusto: el trinquete «un renderer, un contrato de datos» (lib/landing/registry.test.ts)
 * existe justamente porque una copia editada sola es cómo nació el fallo de los titulares del
 * diagnóstico. Cinco copias son cinco oportunidades de repetirlo; una constante es cero.
 * ⚠ Y se consolidó DESPUÉS del trinquete, no antes: el trinquete es lo que probó que las cinco
 * eran idénticas y que unificarlas no cambiaba nada.
 */
export const PROSA_SCHEMA = {
  type: "object",
  properties: { intro: str, items: arrayOf({ title: str, detail: str }, ["title"]) },
  required: ["items"],
} as const;

export const PROSA_EMPTY = { intro: "", items: [] };

/**
 * ⭐ LO QUE EL CHAT PUEDE TOCAR EN UNA SECCIÓN DE PROSA — y `subhead` es la diferencia.
 *
 * Elías listó «subtítulos» entre las piezas que el chat debería manejar. El campo entra acá y
 * **NO en el esquema del agente**, y esa asimetría es la decisión:
 *
 *  · en el esquema del AGENTE, el schema ES el prompt — sumarlo pondría a cinco agentes a escribir
 *    un subtítulo en veinte secciones que hoy no lo tienen, cambiando documentos ya entregados sin
 *    que nadie lo haya pedido;
 *  · en el del CHAT, la capacidad existe el día uno y no se genera solo. Y sobrevive: `subhead` es
 *    una clave de PRIMER NIVEL, así que `preserveNonSchemaKeys` la acarrea entre regeneraciones —
 *    lo que el CSE escriba no se pierde.
 *
 * Es el mismo patrón que ya usan `eyebrow` y las métricas de la portada del kickoff.
 */
export const PROSA_SCHEMA_DEL_CHAT = {
  type: "object",
  properties: {
    subhead: str,
    intro: str,
    items: arrayOf({ title: str, detail: str }, ["title"]),
  },
  required: ["items"],
} as const;

// ── Schemas compartidos por sectionType (evitan que un nuevo template re-declare
// el mismo shape a mano) ─────────────────────────────────────────────────────
// NOTA: business-case.defs.ts y website.defs.ts todavía inlinean sus propias copias
// de `web_diagnosis`/`roi`/`pain` (no se tocan acá para no arriesgar código ya
// shippeado) — estos exports son para que templates NUEVOS (ej. Desarrollo) reusen
// en vez de agregar una tercera copia hand-rolled.
export const WEB_DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    retos: arrayOf({ title: str, detail: str }, ["title"]),
    plataforma: str,
    porQueBullets: arrayOf({ title: str, detail: str }, ["title"]),
    objetivo: str,
  },
  required: ["retos", "porQueBullets", "objetivo"],
} as const;
export const WEB_DIAGNOSIS_EMPTY = { intro: "", retos: [], plataforma: "", porQueBullets: [], objetivo: "" };

/**
 * ⭐ LO QUE EL CHAT PUEDE TOCAR EN UN DIAGNÓSTICO A DOS COLUMNAS — y son los DOS RÓTULOS.
 *
 * Elías pidió cambiar «QUÉ TE CUESTA HOY», el chat contestó «Aplicado» y en pantalla no pasó nada:
 * ese rótulo vivía SOLO en la definición del documento y ninguna operación lo alcanzaba. Su regla,
 * textual: *«debería poder cambiarse todo»*.
 *
 * ⛔ Y `plataforma` NO está acá, a propósito: en los tres documentos que declaran `chips` el
 * renderer no lo pinta —lo reemplazó el rótulo fijo—, así que anunciárselo al modelo es ofrecerle
 * un campo fantasma. Es exactamente lo que el chat escribió cuando dijo «Aplicado». `camposMudosDe`
 * lo saca del esquema del chat en esos tres; acá se deja para el cuarto (la propuesta de sitio
 * web), donde el campo es real y se pinta.
 *
 * ⚠ Los rótulos van en el esquema del CHAT y no en el del AGENTE: el schema ES el prompt, y
 * sumarlos allá pondría a cuatro agentes a reescribir el rótulo de una columna en cada
 * regeneración. Mismo patrón que `subhead`.
 */
export const WEB_DIAGNOSIS_SCHEMA_DEL_CHAT = {
  type: "object",
  properties: {
    intro: str,
    rotuloRetos: str,
    retos: arrayOf({ title: str, detail: str }, ["title"]),
    rotuloPanel: str,
    plataforma: str,
    porQueBullets: arrayOf({ title: str, detail: str }, ["title"]),
    objetivo: str,
  },
  required: ["retos", "porQueBullets", "objetivo"],
} as const;

export const ROI_SCHEMA = {
  type: "object",
  properties: { metrics: arrayOf({ value: str, label: str }, ["value", "label"]) },
  required: ["metrics"],
} as const;
export const ROI_EMPTY = { metrics: [] };

/**
 * ⭐ LA POSICIÓN EN LA ESCALA DE RENDIMIENTO — una sola forma para los cuatro documentos que la usan
 * (Propuesta, Kickoff, Diagnóstico, Entrega), porque es el mismo dato en cuatro momentos: la Entrega
 * lee lo que midió el Diagnóstico. La forma y su lectura viven en `lib/escala/posicion.ts`.
 *
 * El nivel va por NOMBRE («Funcional»), que es la grafía que el reglamento manda emitir y comparar.
 */
export const ESCALA_POSICION_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    areas: arrayOf(
      {
        area: str,
        base: str,
        basePiso: str,
        produccion: str,
        produccionPiso: str,
        brecha: str,
        cercania: str,
        meta: str,
      },
      ["area"],
    ),
    remedicion: str,
  },
  required: ["areas"],
} as const;
export const ESCALA_POSICION_EMPTY = { intro: "", areas: [], remedicion: "" };

/**
 * «Dónde está tu operación hoy» — la Escala en la PROPUESTA. La declaran las dos plantillas con la
 * misma def: es el mismo argumento en una propuesta de HubSpot y en una de sitio web.
 *
 * ⚠ En preventa el nivel es un ESTIMADO, y el brief lo obliga a decirlo: la ubicación oficial la da
 * el Diagnóstico, con evidencia. Con el trato marcado «Sin Escala» no se genera (`skipKeys`).
 */
export const ESCALA_PROPUESTA_DEF: BCSectionDef = {
  key: "posicion_escala",
  label: "Dónde está tu operación hoy",
  eyebrow: "Escala de rendimiento",
  theme: "soft",
  sectionType: "escala_posicion",
  agentGenerated: true,
  empty: ESCALA_POSICION_EMPTY,
  agentHint: "El nivel ESTIMADO de cada área por capa, y la brecha como el porqué de la propuesta.",
  brief:
    "La Escala de Rendimiento en PREVENTA: dónde está HOY la operación del prospecto, ESTIMADO con lo que dijo en las reuniones (y con la nota del test de rendimiento si las fuentes la traen). " +
    "Es el argumento de la propuesta: la brecha explica por qué hace falta lo que se propone. Usá el resumen de la Escala que viene en el contexto. " +
    "`areas[]`: una por área que la propuesta toca (Ventas, Marketing, Servicio). `base` y `produccion` = el nivel estimado de cada capa con su grafía exacta (Deficiente, Inicial, Funcional, Eficiente, Óptimo) — el de su dimensión más débil, nunca un promedio; " +
    "`basePiso` y `produccionPiso` = qué la frena, en UNA línea y con lo que dijo el prospecto ('Datos — cada vendedor lleva su propia planilla'); " +
    "`brecha` = UNA frase: qué capa frena y qué conversación abre; `cercania` = vacío; `meta` = el nivel al que llega esa área con esta propuesta — el SIGUIENTE, no dos arriba. " +
    "`intro` = UNA frase que diga que es un estimado ('Esto es lo que vemos desde las conversaciones; el diagnóstico lo confirma con evidencia'). " +
    "`remedicion` = 'Lo confirmamos en el diagnóstico y lo volvemos a medir entre 60 y 90 días después de la entrega.' " +
    "Si las fuentes no alcanzan para una capa, su nivel va vacío; si no alcanzan para ninguna área, `areas: []`. Un nivel inventado en una propuesta se cae en la primera reunión.",
  schema: ESCALA_POSICION_SCHEMA as unknown as Record<string, unknown>,
};

export const PAIN_SCHEMA = {
  type: "object",
  properties: { items: arrayOf({ title: str, detail: str }, ["title", "detail"]) },
  required: ["items"],
} as const;
export const PAIN_EMPTY = { items: [] };

export function makeProcessMappingDef(
  overrides: Pick<BCSectionDef, "key" | "label"> & Partial<BCSectionDef>,
): BCSectionDef {
  return {
    eyebrow: "Procesos",
    theme: "soft",
    sectionType: "process_mapping",
    schema: PROCESS_MAPPING_SCHEMA as unknown as Record<string, unknown>,
    empty: PROCESS_MAPPING_EMPTY,
    agentHint: "Procesos del cliente que cambian: cómo son hoy vs cómo quedarán, y con qué sistemas.",
    brief:
      "Mapeo de procesos (opcional): los procesos operativos del cliente que cambian con la implementación (ventas, seguimiento, cobranza, onboarding…). Por proceso: `comoEsHoy` (con la fricción real mencionada), `comoSera` (qué queda automatizado/conectado) y `sistemas` involucrados. " +
      "`resumenHoy` y `resumenSera` = TITULARES de media línea, uno por columna, que se leen solos y contrastan entre sí ('Cada vendedor con su propia planilla' / 'Un solo pipeline que todos ven') — NO son un resumen del párrafo de abajo. " +
      "Fuente: SOLO procesos descritos con sustancia en el contexto.",
    ...overrides,
  };
}
