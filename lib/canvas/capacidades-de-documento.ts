/**
 * lib/canvas/capacidades-de-documento.ts — QUÉ SE PUEDE Y QUÉ NO CON UN DOCUMENTO DEL MOTOR.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * ── POR QUÉ EXISTE, Y ES LITERALMENTE LO QUE PIDIÓ ELÍAS ─────────────────────────────────────
 * Dos veces. La primera, sobre el cronograma:
 *
 *   «puede que el modificador de canvas no sea capaz de generar ese tipo; pero el usuario no
 *    obtiene esa respuesta. La idea es hablar de los cambios, consensuarlo conforme las
 *    capacidades, y luego dar el ok.»
 *
 * Y la segunda, sobre los documentos: *«también se debe poder preguntar al chat de qué es capaz,
 * qué tipo de secciones puede crear y qué modificaciones puede hacer»*.
 *
 * Este archivo es el espejo de `lib/timeline/capacidades.ts`, que nació de la primera. El molde ya
 * probó que funciona; lo que faltaba era la mitad del documento.
 *
 * ── ⛔ COPIAR ESTO AL PROMPT SERÍA EL PEOR RESULTADO POSIBLE ─────────────────────────────────
 * Dos copias divergen calladas, y la divergencia se manifiesta como el chat prometiéndole al CSE
 * algo que el editor no puede hacer — o negándole algo que sí. Y no es hipotético: hasta hoy la
 * restricción vivía DUPLICADA en prosa, en el prompt del chat y en el contexto, y **una de las dos
 * ya estaba equivocada** (decía que no se pueden crear secciones nuevas, cuando la propuesta
 * comercial las creaba desde el 2026-08-12).
 *
 * Por eso el contexto INTERPOLA estas constantes y el prompt solo REMITE a ellas. Hay una guarda
 * que lo hace cumplir, y es la misma que ya existe del lado del cronograma.
 */
import { CATALOGO_DE_SECCIONES } from "@/lib/landing/catalogo-de-secciones";
import {
  OPERACIONES_DE_DOCUMENTO_VALIDAS,
  type CapacidadesDelDocumento,
} from "./operaciones-de-documento";

/**
 * Las reglas que el editor de documentos obedece. Van tal cual dentro del contexto del chat.
 *
 * ⚠ El texto está redactado PARA UN MODELO (segunda persona, imperativo). Si algún día una
 * pantalla necesita mostrárselo a una persona, la traducción va aparte — reescribir esto para que
 * «se lea mejor» le cambia las instrucciones al agente sin que nadie lo note.
 */
export const REGLAS_DURAS_DEL_DOCUMENTO = `- Cada operación toca UN campo, UN ítem o UNA sección: la que nombra. Lo que no nombras no cambia. No existe "reescribir la sección entera" — si hay que cambiar tres campos, son tres operaciones.
- Los campos se nombran por su RUTA dentro de la sección: \`intro\`, \`items.2.title\`, \`filas.0.celdas.1\`. Los índices arrancan en 0 y tienen que existir hoy.
- Solo se pueden escribir campos que el esquema de la sección declara, y solo si son de TEXTO. Lo que no está en el esquema es contenido que curó una persona: es inalcanzable a propósito, no por olvido.
- Una lista no se escribe como texto: se le agregan, quitan o mueven ÍTEMS.
- Las secciones se nombran por su KEY, la que va entre paréntesis en el contexto. Nunca por su título: dos documentos pueden tener secciones con el mismo nombre.
- Puedes crear una sección de los tipos del catálogo, ocultarla, mostrarla, moverla, renombrarla y vaciarla. BORRAR solo alcanza a las que creó una persona: las del documento se ocultan.
- ⛔ No inventes tipos de sección. Los que existen son los del catálogo: si te piden una forma que no está, dilo — no uses el tipo más parecido.
- Vaciar una sección BORRA todo su contenido, y borrar una sección la saca del documento. Las dos se dicen antes, no después.
- TODO el texto que escribas puede terminar frente al cliente: claro, profesional, sin jerga interna y sin nombres del equipo de Smarteam.
- ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"). PROHIBIDO el voseo: NUNCA "cambiá", "tenés", "podés" ni "vos".`;

/** Una consecuencia que el CSE tiene que saber ANTES de pedir el cambio. */
export interface AdvertenciaDeDocumento {
  /** Palabra clave por la que se reconoce el pedido. Minúsculas, sin tildes. */
  gatillo: readonly string[];
  /** Qué le pasa a su documento si lo pide igual. Redactado para una persona, en tuteo neutro. */
  aviso: string;
}

/**
 * Lo que un pedido razonable produce y el CSE no espera.
 *
 * ⚠ Esto es lo único de este archivo redactado para una PERSONA. Es la materia prima de la
 * respuesta «eso se puede, pero mirá lo que te va a costar».
 */
export const ADVERTENCIAS_DEL_DOCUMENTO: readonly AdvertenciaDeDocumento[] = [
  {
    gatillo: ["borrar", "eliminar", "sacar", "quitar seccion"],
    aviso:
      "Borrar una sección solo se puede si la creó una persona. Las del documento se ocultan: dejan de verse pero no se pierden, y se pueden volver a prender.",
  },
  {
    gatillo: ["vaciar", "limpiar", "empezar de cero"],
    aviso:
      "Vaciar una sección borra TODO su contenido, incluido lo que se escribió a mano. No hay vuelta atrás desde el chat.",
  },
  {
    gatillo: ["precio", "monto", "inversion", "costo", "tarifa"],
    aviso:
      "Los montos de la sección de inversión los escribe Ventas y los totales los calcula la app. Un número cambiado acá va a un papel que el cliente archiva.",
  },
  {
    gatillo: ["cronograma", "fase", "semana", "fecha de entrega"],
    aviso:
      "El cronograma no es contenido de este documento: se dibuja desde el proyecto. Para cambiarlo, la conversación es la del cronograma.",
  },
  {
    gatillo: ["publicar", "subir al cliente", "compartir"],
    aviso:
      "Publicar no se hace desde el chat. Los cambios quedan en el documento y tú decides cuándo subirlos.",
  },
];

/**
 * El catálogo de tipos creables, en la forma COMPACTA que entra al contexto.
 *
 * ⚠ Una línea por tipo, con la frase que ya está escrita para una persona. No se le manda el
 * esquema de cada uno: el chat DECIDE qué crear, no ejecuta — el esquema lo necesita el ejecutor,
 * que lo saca del catálogo por su cuenta. Mandarlos multiplicaría el prefijo por diez para que el
 * modelo lea algo que no usa.
 */
export function catalogoParaElChat(): string {
  return CATALOGO_DE_SECCIONES.map((t) => `- ${t.nombre} (\`${t.tipo}\`): ${t.queEs}`).join("\n");
}

/** El vocabulario, en una línea. Sale de la constante, no de una lista escrita a mano. */
export function operacionesParaElChat(): string {
  return OPERACIONES_DE_DOCUMENTO_VALIDAS.join(" · ");
}

/**
 * Las advertencias que aplican a un pedido concreto.
 *
 * ⚠ Normaliza tildes y minúsculas para que «inversión» y «inversion» disparen igual. Determinista
 * a propósito: es un filtro por palabras, no una segunda llamada al modelo.
 */
export function advertenciasParaElPedido(pedido: string): readonly AdvertenciaDeDocumento[] {
  const limpio = pedido
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ADVERTENCIAS_DEL_DOCUMENTO.filter((a) => a.gatillo.some((g) => limpio.includes(g)));
}

/**
 * ⭐ QUÉ SE PUEDE HACER CON ESTA SECCIÓN — la única lectura de los flags, en un solo lugar.
 *
 * Hasta hoy la misma pregunta estaba deletreada en CINCO archivos (la píldora de la sección, las
 * dos rutas de assist, el regenerate y la generación completa), cada uno con su copia de
 * `agentGenerated === false || ctxDriven`. Que el chat, el editor y la píldora citen la misma
 * fuente ES la estandarización que se pidió: no que el botón se vea igual, sino que las tres
 * superficies contesten lo mismo.
 */
export type CapacidadDeSeccion = "editable" | "curada" | "derivada" | "creada";

export function capacidadDeSeccion(
  def: { agentGenerated?: boolean; ctxDriven?: boolean } | undefined,
  esCreada = false,
): CapacidadDeSeccion {
  /* `ctxDriven` primero: su contenido no sale del bloque sino del proyecto, así que ni siquiera
     hay dónde escribir. Es una categoría, no un permiso. */
  if (def?.ctxDriven) return "derivada";
  if (esCreada) return "creada";
  if (def?.agentGenerated === false) return "curada";
  return "editable";
}

/**
 * ⭐ LA FORMA DE UNA SECCIÓN, EN UNA LÍNEA — la pieza que faltaba y explica casi todos los fallos.
 *
 * ── EL AGUJERO QUE ESTO CIERRA ──────────────────────────────────────────────────────────────
 * El contexto le mandaba al modelo el CONTENIDO de cada sección aplanado con `Object.values`, o
 * sea **tirando las claves**. El modelo veía un chorizo de bullets separados por `·` y tenía que
 * ADIVINAR cómo se llamaba cada lista y cada campo para poder nombrarlos en una operación. El
 * ejecutor —que sí tiene el esquema— rechazaba. La persona se enteraba después de aprobar.
 *
 * Medido en producción el 2026-08-22: el modelo probó `items` sobre una sección cuya lista se
 * llama `metrics`, y `sistema` sobre una que se llama `conSistema`. No eran alucinaciones
 * caprichosas: `items` se lo sugería la propia descripción de la herramienta, y `sistema` es lo
 * que dice el título del cuadro en pantalla.
 *
 * ⚠ Sale del MISMO esquema que ejecuta, así que no puede divergir. Y no emite tipos crudos ni
 * `required`: solo los nombres, que es lo único que el modelo necesita para nombrar.
 */
export function firmaDeSeccion(schema: unknown): string {
  const s = schema as NodoDeSchema | undefined;
  const props = s?.type === "object" ? (s.properties ?? {}) : {};
  const campos: string[] = [];
  const listas: string[] = [];

  for (const [k, sub] of Object.entries(props)) {
    const n = sub as NodoDeSchema;
    if (n?.type === "array") listas.push(`${k}${formaDeItems(n.items)}`);
    else campos.push(k);
  }
  const partes = [
    campos.length ? `campos: ${campos.join(", ")}` : "",
    listas.length ? `listas: ${listas.join(", ")}` : "",
  ].filter(Boolean);
  return partes.length ? `[${partes.join(" · ")}]` : "[sin campos editables]";
}

/**
 * Cómo es un ítem de una lista: `(texto)` si es un texto suelto, `[campo, campo]` si es un objeto.
 *
 * ⚠ La distinción no es cosmética: decide si el ítem nuevo va en `valor` o en `valores`, que es
 * exactamente lo que el modelo no podía saber.
 */
function formaDeItems(items: unknown, nivel = 0): string {
  const n = items as NodoDeSchema | undefined;
  if (n?.type === "object") {
    const claves = Object.entries(n.properties ?? {}).map(([k, sub]) => {
      const c = sub as NodoDeSchema;
      /* Un nivel de anidamiento alcanza para que se entienda; más abajo la ruta se nombra con
         índices y el detalle solo engorda el prefijo. */
      if (c?.type === "array") return nivel === 0 ? `${k}${formaDeItems(c.items, 1)}` : `${k}[…]`;
      return k;
    });
    return `[${claves.join(", ")}]`;
  }
  return "(texto)";
}

type NodoDeSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  items?: unknown;
};

/**
 * Lo que hay que decirle al MODELO sobre una sección que no es simplemente editable.
 *
 * ⚠ Es otro texto que `ROTULO_DE_CAPACIDAD`, que se le muestra a una persona en una píldora. Acá
 * hace falta la CONSECUENCIA, no la etiqueta: el chat tiene que poder avisar antes de proponer.
 *
 * ⛔ Ninguno de estos avisos BLOQUEA. Decisión de Elías (2026-08-21) sobre las secciones curadas:
 * «las puede editar como cualquier otra». Lo que cambia es que ahora lo dice.
 */
export const AVISO_DE_CAPACIDAD_PARA_EL_CHAT: Record<CapacidadDeSeccion, string> = {
  editable: "",
  curada:
    "⚠ la escribe Nexus desde los datos del proyecto: se puede tocar como cualquier otra, pero la próxima corrida la pisa — dilo antes de proponer",
  derivada: "⚠ se dibuja desde el proyecto: solo se pueden tocar los campos que declara arriba",
  creada: "la creó una persona en este documento: es la única clase que se puede borrar",
};

/**
 * ⭐ QUÉ SABE HACER CADA DOCUMENTO — la misma tabla para el servidor y para los workspaces.
 *
 * Vivía repartida en nueve literales, uno por workspace. Servía mientras solo el navegador
 * ejecutaba; desde que el servidor corre el ejecutor EN SECO antes de acordar
 * (`prepararOperacionesDeDocumento`), las dos mitades tienen que contestar lo mismo — si no, el
 * chat acuerda ocultar una sección del kickoff y el editor la rechaza al aplicar.
 *
 * ⚠ El fallback de una pieza sin declarar es CONSERVADOR (no oculta, no crea): que un documento
 * nuevo llegue sin poder hacer algo se ve enseguida; que pueda hacer algo que su editor no
 * soporta, no.
 */
export const CAPACIDADES_POR_PIEZA: Record<string, CapacidadesDelDocumento> = {
  /* ⛔ El ojo del kickoff NO escribe en el Json del canvas: escribe en `Project.hiddenKickoffKeys`,
     por id de sección, y queda provisional hasta «Subir al cliente». Un `seccion.ocultar` que
     llamara al Json sería mudo: el hilo diría «aplicado» y el cliente la seguiría viendo. */
  kickoff: { puedeOcultar: false, puedeCrear: true },
  /* ⛔ El plan de sesiones es el corazón de Exploración: una sección creada al lado compite con él. */
  exploration: { puedeOcultar: true, puedeCrear: false },
  /* ⛔ La lista de secciones de un rol es FIJA: el motor la arma siempre completa desde la
     plantilla del tipo. Crear u ocultar acá escribiría donde nadie lee. */
  role: { puedeOcultar: false, puedeCrear: false },
  "business-case": { puedeOcultar: true, puedeCrear: true },
  diagnosis: { puedeOcultar: true, puedeCrear: true },
  planning: { puedeOcultar: true, puedeCrear: true },
  implementation: { puedeOcultar: true, puedeCrear: true },
  delivery: { puedeOcultar: true, puedeCrear: true },
  "tech-requirements": { puedeOcultar: true, puedeCrear: true },
};

export function capacidadesDeLaPieza(pieza: string): CapacidadesDelDocumento {
  return CAPACIDADES_POR_PIEZA[pieza] ?? { puedeOcultar: false, puedeCrear: false };
}

/**
 * ⭐ EL ESQUEMA CONTRA EL QUE SE RESUELVEN LAS OPERACIONES DEL CHAT.
 *
 * Casi siempre es el mismo que el del agente. Las secciones CURADAS son la excepción: su `schema`
 * está vacío a propósito —significa «el agente no escribe acá»— y eso las volvía inalcanzables
 * también para el chat, que resuelve las rutas contra ese mismo objeto.
 *
 * ⛔ Los dos resolutores (el contexto en el servidor y el ejecutor en el navegador) tienen que
 * llamar a ESTA función. Si uno leyera `def.schema` y el otro `schemaDelChat`, el chat acordaría
 * un cambio que el editor rechaza — con una guarda al lado que lo hace cumplir.
 */
export function schemaParaElChat(
  def: { schema?: unknown; schemaDelChat?: unknown } | undefined,
): unknown {
  return def?.schemaDelChat ?? def?.schema ?? { type: "object", properties: {} };
}

/** Cuánto de UNA sección se le manda al modelo cuando la pide entera. */
export const TOPE_DE_SECCION_COMPLETA_CHARS = 6_000;

/**
 * ⭐ EL CONTENIDO DE UNA SECCIÓN, CON LOS NOMBRES PUESTOS Y LAS POSICIONES A LA VISTA.
 *
 * El contexto manda el contenido APLANADO y recortado a 1.000 caracteres — sirve para saber de qué
 * habla el documento, no para operar sobre él. Cuando el pedido es de una sección concreta («quita
 * el último card»), el modelo necesita otra cosa: los nombres de los campos y, sobre todo, EN QUÉ
 * POSICIÓN está cada ítem. Sin eso contestaba «me llega recortado, no puedo confirmar cuál es el
 * último» — y no tenía ninguna forma de averiguarlo.
 *
 * ⛔ Recorre SOLO lo que el esquema declara. Es la misma regla de privacidad del contexto: ids,
 * banderas y el contenido que curó una persona fuera del esquema no cruzan al prompt.
 *
 * ⚠ Los ítems se numeran desde 0, que es el número que va en `posicion`. Numerarlos desde 1 —lo
 * natural al leer— fabricaría un error de una posición en cada borrado.
 */
export function renderSeccionParaElChat(schema: unknown, data: unknown): string {
  const s = schema as NodoDeSchema | undefined;
  const props = s?.type === "object" ? (s.properties ?? {}) : {};
  const d = (data ?? {}) as Record<string, unknown>;
  const lineas: string[] = [];

  for (const [k, sub] of Object.entries(props)) {
    const n = sub as NodoDeSchema;
    const v = d[k];
    if (n?.type === "array") {
      const arr = Array.isArray(v) ? v : [];
      if (!arr.length) {
        lineas.push(`${k}: (lista vacía)`);
        continue;
      }
      lineas.push(`${k}:`);
      arr.forEach((item, i) => lineas.push(`  ${i}. ${unItem(item, n.items)}`));
    } else if (typeof v === "string" && v.trim()) {
      lineas.push(`${k}: «${v.trim()}»`);
    } else {
      lineas.push(`${k}: (vacío)`);
    }
  }

  const texto = lineas.join("\n");
  return texto.length > TOPE_DE_SECCION_COMPLETA_CHARS
    ? `${texto.slice(0, TOPE_DE_SECCION_COMPLETA_CHARS)}… (recortado: la sección es muy larga)`
    : texto || "(esta sección no tiene contenido editable)";
}

function unItem(item: unknown, itemsSchema: unknown): string {
  const n = itemsSchema as NodoDeSchema | undefined;
  if (n?.type === "object" && item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return (
      Object.keys(n.properties ?? {})
        .map((k) => `${k}: «${typeof o[k] === "string" ? (o[k] as string) : ""}»`)
        .join(" · ") || "(vacío)"
    );
  }
  return typeof item === "string" ? `«${item}»` : "(vacío)";
}

/**
 * Lo que se le devuelve al modelo cuando sus operaciones no pasaron el ejecutor en seco.
 *
 * ⚠ Dice que NINGUNA entró y le pide re-emitir TODAS. Es lo que hace imposible duplicar: si le
 * pidiéramos «mandá solo las corregidas» tendríamos que fusionar dos intentos, y estas operaciones
 * no son idempotentes — un `seccion.item.agregar` que entra dos veces agrega dos ítems.
 */
export function reclamoDeOperaciones(
  rechazadas: readonly { operacion: unknown; motivo: string }[],
): string {
  const detalle = rechazadas
    .map((r, i) => `${i + 1}. ${JSON.stringify(r.operacion)} → ${r.motivo}`)
    .join("\n");
  return [
    `OPERACIONES RECHAZADAS (${rechazadas.length}). Este intento NO quedó registrado: no entró ninguna.`,
    detalle,
    "",
    "Vuelve a llamar registrar_cambio_acordado UNA sola vez, con TODAS las operaciones del acuerdo:",
    "las que ya estaban bien Y las corregidas. Los nombres válidos de campos y de listas son los que",
    "el contexto declara entre corchetes para cada sección — no los inventes. Si algo no se puede",
    "expresar con el vocabulario, no lo emitas: dilo en tu texto.",
  ].join("\n");
}

/** Cómo se le dice a una persona —y al chat— qué puede hacer con cada sección. */
export const ROTULO_DE_CAPACIDAD: Record<CapacidadDeSeccion, string> = {
  editable: "se puede cambiar",
  curada: "la escribe una persona a mano",
  derivada: "la calcula la app desde el proyecto",
  creada: "la creó una persona en este documento",
};
