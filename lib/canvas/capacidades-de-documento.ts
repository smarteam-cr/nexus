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
import { OPERACIONES_DE_DOCUMENTO_VALIDAS } from "./operaciones-de-documento";

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
      "Publicar no se hace desde el chat. Los cambios quedan en el documento y vos decidís cuándo subirlos.",
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

/** Cómo se le dice a una persona —y al chat— qué puede hacer con cada sección. */
export const ROTULO_DE_CAPACIDAD: Record<CapacidadDeSeccion, string> = {
  editable: "se puede cambiar",
  curada: "la escribe una persona a mano",
  derivada: "la calcula la app desde el proyecto",
  creada: "la creó una persona en este documento",
};
