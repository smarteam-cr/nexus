/**
 * lib/canvas/operaciones-de-documento.ts — UN DOCUMENTO SE EDITA CON OPERACIONES, NO
 * REESCRIBIÉNDOLO.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── POR QUÉ EXISTE, Y ES LA MISMA RAZÓN QUE EN EL CRONOGRAMA ─────────────────────────────────
 * Hasta hoy el chat de documentos emitía una INSTRUCCIÓN en castellano que un SEGUNDO modelo
 * releía para reescribir las secciones. El campo por el que viajaba ya estaba tipado como legacy.
 * El equivalente en el cronograma se midió el 2026-08-20: devolver el documento entero tardaba
 * **217 segundos**; las operaciones se ejecutan en **1 ms**, porque no hay segunda llamada.
 *
 * ⛔ **Y LA RAZÓN DE FONDO NO ES LA VELOCIDAD: ES QUE EL CONTRATO ROMPE COSAS.** Si el modelo
 * tiene que re-emitir cada campo de una sección en cada edición, cada campo está en riesgo en cada
 * edición. En el cronograma eso soltó el arranque relativo de seis fases y corrió el cierre 70
 * días. En un documento el daño es peor de ver: lo que se pierde son campos que el agente nunca
 * escribe —la portada, los logos, el enlace del botón, las marcas «ya la pregunté»— y se pierden
 * en silencio, porque el merge que los repone solo alcanza el primer nivel.
 *
 * Una operación toca lo que nombra. Lo que no se nombra no se puede romper.
 *
 * ── ⭐ POR QUÉ LA OPERACIÓN NOMBRA UNA RUTA ─────────────────────────────────────────────────
 * El contenido de una sección son objetos con arrays de objetos (`items[]`, `filas[]`,
 * `procesos[]`). Nombrar solo el primer nivel no llegaría a una fila de una tabla, que es
 * exactamente lo que se pidió poder cambiar.
 *
 * La ruta se resuelve **contra el SCHEMA y contra la data a la vez**: un segmento que el schema no
 * declara se rechaza con motivo, y el final tiene que ser un campo de texto. ⭐ Eso hace que la
 * promesa «toca lo que nombra» la sostenga el TIPO, no la prolijidad de un merge. Y es lo que
 * vuelve imposible por construcción escribir sobre estado curado que vive fuera del schema.
 *
 * ── ⚠ EL ANCLA: EL RIESGO PROPIO DE ESTE VOCABULARIO ────────────────────────────────────────
 * Una fase del cronograma se nombra por id. Un ítem de una lista se nombra **por posición**. Entre
 * el turno que acuerda el cambio y el clic que lo aplica, el libro de pendientes lo arrastra y
 * alguien pudo reordenar a mano en el editor: la operación escribiría en la fila equivocada, de
 * forma **plausible y silenciosa** — el único modo de falla del diseño que produce datos creíbles
 * y equivocados en vez de un error.
 *
 * Por eso toda operación con índice lleva un `ancla`: los primeros caracteres del valor que tenía
 * ese ítem cuando se acordó. ⛔ **La calcula la app, nunca el modelo** — mismo movimiento que las
 * líneas en castellano, y por el mismo motivo: se deriva del objeto que se va a ejecutar, así que
 * no es otra oportunidad de que el modelo se equivoque.
 *
 * ── ⛔ ESTO NO ESCRIBE ──────────────────────────────────────────────────────────────────────
 * Produce un PLAN: la lista de llamadas a los verbos que el editor ya tiene (`upsertCardData`,
 * `setHidden`, `reorderSections`, `renameSection`, `addSection`, `removeSection`), con su
 * optimismo, su undo y su cola de escrituras. Abrir un segundo camino de escritura sería repetir
 * el error que este repo ya pagó: dos puertas, a las dos les faltaba el mismo guardia.
 */

/* ⚠ Puro: `section-schema` no importa nada. Es el MISMO merge que protege la portada de cada
   regeneración del agente — vaciar por chat tiene que respetar exactamente lo que él respeta, o
   el chat se convierte en la puerta de atrás por la que se pierde lo curado a mano. */
import { preserveNonSchemaKeys } from "@/lib/ai/section-schema";
/* El catálogo de tipos creables: puro, sin React. De ahí salen el esquema y el molde vacío de una
   sección que nace en este mismo lote. */
import { defDelTipo } from "@/lib/landing/catalogo-de-secciones";
/* ⭐ El mismo diccionario que traduce las claves en el PDF. Sin él la línea decía `label`, `title`,
   `detail` — nombres de programador en el renglón que una persona tiene que aprobar. Reusarlo (en
   vez de escribir un segundo) hace que el papel y la cajita del chat digan lo mismo. */
import { labelFor } from "@/lib/canvas/print-vocab";
/* ⛔ La resolución por contenido vive AFUERA y es pura: la importan el que prepara el acuerdo, el
   que ejecuta y el índice del navegador. Una segunda normalización sería una que puede divergir. */
import { hojasCitables, resolverCita } from "@/lib/canvas/citas-de-documento";
import type { FormatoDeSeccion } from "@/lib/landing/formato-de-seccion";

// ── El vocabulario ────────────────────────────────────────────────────────────────────────────

/** Los cinco valores de alineación no existen acá: el vocabulario no toca presentación. */
export type OperacionDeDocumento =
  // CONTENIDO
  | {
      op: "seccion.campo";
      key: string;
      /**
       * La RUTA del campo (`items.2.detail`). Opcional porque `cita` la reemplaza: la app la
       * resuelve al preparar el acuerdo y desde ahí viaja siempre presente.
       */
      campo?: string;
      /** ⭐ El texto que hoy está ahí, tal como el modelo lo lee. Ver `citas-de-documento.ts`. */
      cita?: string;
      valor: string;
      ancla?: string;
      /** ⭐ La persona pidió CAMBIAR DE FORMATO con esas palabras. Ver `SeccionActual.formato`. */
      convertir?: boolean;
    }
  | {
      op: "seccion.item.agregar";
      key: string;
      lista: string;
      /**
       * Los campos del ítem, cuando la lista es de OBJETOS (`items[{title, detail}]`).
       *
       * ⚠ Excluyente con `valor`: una lista es de textos o de objetos, nunca de las dos cosas.
       */
      valores?: Record<string, string>;
      /**
       * ⭐ El texto, cuando la lista es de TEXTOS SUELTOS (`tags`, `hoy`, `conSistema`, `canales`).
       *
       * ⛔ ESTE CAMPO FALTABA Y HACÍA IMPOSIBLE AGREGAR A ESAS LISTAS. Los campos permitidos salían
       * de `items.properties`, que en una lista de textos no existe: cualquier `valores` se
       * rechazaba con «X no es un campo de esa lista», y un `valores` vacío insertaba un OBJETO
       * VACÍO dentro del array de strings — que el normalizador del motor borra al pintar, así que
       * el chat decía «aplicado» sobre algo que desapareció. Visto en producción el 2026-08-22,
       * sobre la comparación del kickoff.
       */
      valor?: string;
      posicion?: number;
      /** ⭐ La persona pidió CAMBIAR DE FORMATO con esas palabras. Ver `SeccionActual.formato`. */
      convertir?: boolean;
    }
  /* ⚠ `lista` y `posicion` son opcionales SOLO porque `cita` las reemplaza. El ejecutor las
     exige: una operación que llegue sin coordenada se rechaza con su motivo, nunca se adivina. */
  | {
      op: "seccion.item.borrar";
      key: string;
      lista?: string;
      posicion?: number;
      cita?: string;
      ancla?: string;
      convertir?: boolean;
    }
  | {
      op: "seccion.item.mover";
      key: string;
      lista?: string;
      posicion?: number;
      cita?: string;
      a: number;
      ancla?: string;
      convertir?: boolean;
    }
  | { op: "seccion.vaciar"; key: string }
  // ESTRUCTURA
  | { op: "seccion.crear"; tipo: string; titulo: string; posicion?: number; ref?: string }
  | { op: "seccion.borrar"; key: string }
  | { op: "seccion.ocultar"; key: string }
  | { op: "seccion.mostrar"; key: string }
  | { op: "seccion.mover"; key: string; posicion: number }
  | { op: "seccion.renombrar"; key: string; titulo: string }
  /**
   * ⭐ El RÓTULO CHICO de arriba de la sección («LO QUE BUSCAMOS», «QUÉ CAMBIA»).
   *
   * Se ve en cada sección de cada documento y no tenía operación: el motor sabía escribirlo
   * (`setEyebrow`, con su deshacer) pero el chat no tenía cómo pedirlo. Cuando alguien decía
   * «que la línea de arriba diga otra cosa», el modelo apuntaba al texto introductorio —lo más
   * parecido que sí veía— y la persona aprobaba un cambio distinto del que pidió.
   *
   * ⚠ Un rótulo VACÍO es legítimo (saca la línea), así que no se valida «no vacío» como el título.
   */
  | { op: "seccion.rotular"; key: string; rotulo: string };

/**
 * ⛔ LISTA CERRADA a propósito: lo que no está acá no se puede pedir, y el chat tiene que DECIRLO
 * en vez de elegir la operación más parecida. Una operación que no coincide con la intención es
 * rápida, silenciosa y equivocada — el peor modo de falla posible.
 */
export const OPERACIONES_DE_DOCUMENTO_VALIDAS = [
  "seccion.campo",
  "seccion.item.agregar",
  "seccion.item.borrar",
  "seccion.item.mover",
  "seccion.vaciar",
  "seccion.crear",
  "seccion.borrar",
  "seccion.ocultar",
  "seccion.mostrar",
  "seccion.mover",
  "seccion.renombrar",
  "seccion.rotular",
] as const;

export type OpDeDocumento = (typeof OPERACIONES_DE_DOCUMENTO_VALIDAS)[number];

/**
 * ⛔ LA LISTA Y LA UNIÓN SON DOS DECLARACIONES DE LO MISMO, y las dos se mantienen a mano. Esta
 * comprobación hace que divergir sea un error de COMPILACIÓN y no un descubrimiento en
 * producción: una operación en la unión que falte en la lista se rechaza al llegar aunque el
 * ejecutor sepa hacerla; una en la lista que no esté en la unión pasa el vocabulario y revienta el
 * switch. Copiado del molde del cronograma, que ya pagó ese error.
 */
type OpDeLaUnion = OperacionDeDocumento["op"];
const _COBERTURA: Record<OpDeLaUnion, true> = Object.fromEntries(
  OPERACIONES_DE_DOCUMENTO_VALIDAS.map((o) => [o, true]),
) as Record<OpDeDocumento, true>;
void _COBERTURA;

export function esOperacionDeDocumento(v: unknown): v is OperacionDeDocumento {
  const op = (v as { op?: unknown })?.op;
  return typeof op === "string" && (OPERACIONES_DE_DOCUMENTO_VALIDAS as readonly string[]).includes(op);
}

/**
 * ⭐ ¿ESTA OPERACIÓN ESTÁ COMPLETA? — el chequeo que `esOperacionDeDocumento` no hace.
 *
 * Aquella función solo mira el NOMBRE (`op`), y así tiene que quedarse: es reconocimiento, y su
 * test lo congela. Pero la herramienta del modelo declara `required: ["op"]`, así que un
 * `{op:"seccion.item.borrar"}` pelado —sin sección, sin lista, sin posición— es una entrada
 * válida para Anthropic. Con solo el reconocimiento, ese objeto entraba al acuerdo, SE PERSISTÍA
 * en el hilo y se pintaba en la cajita como un cambio que la persona podía aprobar.
 *
 * ⛔ **NO exige `ancla`.** El ancla la calcula la app justo antes de acordar (ver
 * `prepararOperacionesDeDocumento`); exigirla acá rechazaría todo lo que el modelo emite bien.
 */
export function validarOperacionDeDocumento(
  v: unknown,
): { ok: true; operacion: OperacionDeDocumento } | { ok: false; motivo: string } {
  const o = v as Record<string, unknown> | null;
  const op = o?.op;
  if (typeof op !== "string") return { ok: false, motivo: "llegó un cambio sin nombre de operación" };
  if (!(OPERACIONES_DE_DOCUMENTO_VALIDAS as readonly string[]).includes(op)) {
    return { ok: false, motivo: `«${op}» no es una operación de documento` };
  }

  const texto = (k: string) => (typeof o?.[k] === "string" && (o[k] as string).trim() ? null : k);
  /** ⚠ El texto de un campo SÍ puede ir vacío a propósito (borrar una bajada); solo tiene que estar. */
  const presente = (k: string) => (typeof o?.[k] === "string" ? null : k);
  const entero = (k: string) => (Number.isInteger(o?.[k]) ? null : k);

  /**
   * ⭐ La coordenada o la cita, nunca ninguna de las dos.
   *
   * Una operación puede decir DÓNDE por índice (`campo`, `lista`+`posicion`) o por CONTENIDO
   * (`cita`). Exigir la coordenada rechazaría todo lo que el modelo emite bien desde que existe
   * la cita; no exigir nada dejaría entrar un `{op:"seccion.campo", valor:"…"}` pelado, que se
   * persistiría en el hilo y se pintaría en la cajita como algo aprobable.
   */
  const coordenada = (etiqueta: string, hayCoordenada: boolean) =>
    hayCoordenada || (typeof o?.cita === "string" && (o.cita as string).trim()) ? null : etiqueta;

  const falta: (string | null)[] =
    op === "seccion.campo"
      ? [texto("key"), coordenada("campo/cita", texto("campo") === null), presente("valor")]
    : op === "seccion.item.agregar"
      ? [
          texto("key"),
          texto("lista"),
          /* Una de las dos formas, nunca ninguna: el ítem sería un objeto vacío. */
          typeof o?.valor === "string" || (o?.valores && typeof o.valores === "object")
            ? null
            : "valor/valores",
        ]
    : op === "seccion.item.borrar"
      ? [texto("key"), coordenada("lista/posicion/cita", texto("lista") === null && entero("posicion") === null)]
    : op === "seccion.item.mover"
      ? [
          texto("key"),
          coordenada("lista/posicion/cita", texto("lista") === null && entero("posicion") === null),
          entero("a"),
        ]
    : op === "seccion.crear" ? [texto("tipo"), texto("titulo")]
    : op === "seccion.mover" ? [texto("key"), entero("posicion")]
    : op === "seccion.renombrar" ? [texto("key"), texto("titulo")]
    /* `rotulo` se pide PRESENTE, no con contenido: vaciarlo es la forma de sacar la línea. */
    : op === "seccion.rotular" ? [texto("key"), presente("rotulo")]
    : /* vaciar · borrar · ocultar · mostrar */ [texto("key")];

  const faltantes = falta.filter((f): f is string => f !== null);
  if (faltantes.length) {
    return { ok: false, motivo: `a «${op}» le falta ${faltantes.join(", ")}` };
  }
  return { ok: true, operacion: v as OperacionDeDocumento };
}

// ── Lo que el ejecutor necesita saber ─────────────────────────────────────────────────────────

/** Una sección del documento, como la ve el ejecutor. */
export interface SeccionActual {
  /** `CanvasSection.id` — lo que consumen los verbos del editor. */
  id: string;
  key: string;
  /** Lo que se lee en pantalla (`titleOverride` si lo hay, si no el rótulo de la def). */
  label: string;
  /** El `data` del bloque CARD. */
  data: unknown;
  /** El schema DEL CHAT (`schemaParaElChat`). Es contra esto que se resuelven las rutas. */
  schema: unknown;
  /**
   * ⭐ El schema DEL AGENTE — lo que él escribiría desde cero. Solo lo usa `seccion.vaciar`.
   *
   * ⛔ Y la distinción no es teórica: estuvo ROTA en producción. Vaciar usaba el schema del chat,
   * que desde el 2026-08-22 es MÁS grande en las secciones curadas (equipo, horarios, canales del
   * kickoff declaran `schemaDelChat` sobre un `schema: {}`). Con eso, la guarda que protegía a las
   * secciones sin campos dejó de disparar y **vaciar «El equipo del proyecto» borraba al equipo
   * que armó el CSE a mano**.
   *
   * Vaciar significa «devolvé la sección a lo que el agente escribiría desde cero». Todo lo que el
   * chat alcanza POR ENCIMA de eso es curaduría, y la curaduría se preserva. Con esta separación,
   * abrir `schemaDelChat` en cualquier sección deja de arrastrar un riesgo de borrado — que es lo
   * que lo vuelve seguro de crecer.
   */
  schemaDelAgente?: unknown;
  oculta: boolean;
  /** `true` si la creó una persona (`custom:*`): son las únicas que se pueden borrar. */
  esCreada: boolean;
  /** `false` en las secciones estructurales (portada, cierre): no se mueven ni se ocultan. */
  movible: boolean;
  /**
   * ⭐ El `ref` con el que esta sección se está creando EN ESTE MISMO LOTE — o sea, todavía no
   * tiene id en la base. Las escrituras que la nombren viajan con el `ref` y el navegador las
   * resuelve al id real después de crearla.
   */
  nacePorRef?: string;
  /**
   * Cómo se llama cada lista EN PANTALLA, por su key. Solo para las líneas que lee la persona.
   *
   * ⚠ Sin esto, las dos columnas del cuadro «Del hoy al nuevo sistema» se anuncian como `hoy` y
   * `conSistema` — nombres de programador para el cuadro que dice «HOY» y «CON EL SISTEMA».
   */
  rotulosDeListas?: Record<string, string>;
  /** Ídem para los CAMPOS: «el detalle» en vez de «detail». */
  rotulosDeCampos?: Record<string, string>;
  /**
   * `true` si el RÓTULO CHICO de arriba lo pinta el encabezado del motor — o sea, si escribir la
   * columna `eyebrowOverride` se va a ver.
   *
   * ⛔ Las secciones que traen su propio encabezado (portadas, cierres) lo ignoran: ahí la
   * operación se rechaza en vez de escribir donde nadie lee.
   */
  rotulable?: boolean;
  /** `false` donde el título de la sección NO se persiste (Roles: su lista es fija). */
  renombrable?: boolean;
  /**
   * ⭐ Listas que se pueden CORREGIR pero no AGRANDAR desde el chat.
   *
   * El caso que la trae son los indicadores CONFIRMADOS de la Entrega: son números que el cliente
   * dijo, y lo que los hace confiables es que alguien miró la cita antes de aceptarlos. Corregir un
   * nombre mal transcripto es transcripción; fabricar una atribución que nadie dijo es exactamente
   * lo que la doctrina «el agente propone, el CSE confirma» impide. Borrar y mover quedan abiertos:
   * no inventan nada.
   */
  listasSoloEdicion?: readonly string[];
  /**
   * ⭐ En qué FORMATO está escrita la sección hoy: `"estructurado"` (campos y listas) o `"prosa"`
   * (el texto corrido de los documentos anteriores al motor). Lo calcula `formatoDeSeccion`, la
   * MISMA función con la que el motor decide qué pintar.
   *
   * ⛔ Escribir un campo sobre una sección en prosa **crea el bloque CARD y el texto desaparece de
   * la pantalla para siempre**: el motor deja de armar el markdown viejo en cuanto hay CARD. Elías
   * lo vio el 2026-08-23 — pidió «títulos más grandes y resumí el texto» y el chat convirtió la
   * sección en tarjetas. Su regla: *el formato en el que está la sección MANDA, salvo que la
   * persona pida otro con esas palabras* — y esa excepción viaja en `convertir`.
   *
   * Ausente = `"estructurado"`: es el caso de las secciones sintéticas de los tests y el de Roles,
   * cuyo contenido no vive en bloques.
   */
  formato?: FormatoDeSeccion;
  /** El rótulo efectivo de hoy, para el ancla y para la línea que lee la persona. */
  rotulo?: string;
}

/**
 * ⭐ Termina un ítem que el chat no puede escribir entero, o explica por qué no se puede.
 *
 * Algunas listas llevan identificadores que el modelo no puede saber: el `teamMemberId` de una
 * persona del directorio, el `id` que el motor le exige a una franja. El esquema del chat no los
 * declara —declararlos sería invitar al modelo a inventarlos— así que los pone la app, acá, con la
 * operación ya validada. Un nombre que no resuelve se RECHAZA con la lista de opciones: elegir «el
 * más parecido» produce un documento con la persona equivocada.
 */
export type CompletadorDeItem = (
  lista: string,
  item: Record<string, unknown>,
  dataActual: unknown,
) => { ok: Record<string, unknown> } | { error: string };

/** Qué sabe hacer ESTE documento. Ver el porqué en `puedeOcultar`. */
export interface CapacidadesDelDocumento {
  /**
   * ⚠ Ocultar tiene TRES puertas en el motor y una de ellas —la del kickoff— vive en otra columna,
   * indexada por id de sección y en estado provisional hasta «Subir al cliente». Un ejecutor que
   * asumiera una sola puerta escribiría, en el kickoff, en la que nadie lee: el CSE oculta por
   * chat, el hilo dice «aplicado», y el cliente la sigue viendo.
   */
  puedeOcultar: boolean;
  /** Si el documento acepta secciones creadas por una persona. */
  puedeCrear: boolean;
}

/** Una escritura del plan. Cada una mapea 1:1 a un verbo que el editor YA tiene. */
export type EscrituraDeDocumento =
  /**
   * ⚠ `sectionId` O `ref`, exactamente uno. Una sección que nace en este mismo lote todavía no
   * tiene id: viaja por su `ref` y el navegador lo resuelve al id real después de crearla.
   */
  | { tipo: "data"; sectionId?: string; ref?: string; data: unknown }
  | { tipo: "oculta"; sectionId: string; oculta: boolean }
  | { tipo: "titulo"; sectionId: string; titulo: string }
  | { tipo: "rotulo"; sectionId: string; rotulo: string }
  | { tipo: "orden"; entradas: ({ sectionId: string } | { ref: string })[] }
  | { tipo: "crear"; tipoDeSeccion: string; titulo: string; ref?: string }
  | { tipo: "borrar"; sectionId: string };

export interface OperacionRechazada {
  operacion: OperacionDeDocumento;
  motivo: string;
}

export interface ResultadoDeDocumento {
  /** Las llamadas a hacer, en orden. */
  plan: EscrituraDeDocumento[];
  /** Lo que el sistema hizo además de lo pedido. */
  avisos: string[];
  /** ⛔ Lo que NO se pudo hacer, y por qué. Nunca se ignora en silencio. */
  rechazadas: OperacionRechazada[];
}

// ── La ruta ───────────────────────────────────────────────────────────────────────────────────

const MAX_SEGMENTOS = 6;

/** Largo del ancla. Suficiente para identificar un ítem, corto para que quepa en el acuerdo. */
export const LARGO_DEL_ANCLA = 24;

export const recortarAncla = (v: string): string => v.trim().slice(0, LARGO_DEL_ANCLA);

type NodoDeSchema = { type?: string; properties?: Record<string, unknown>; items?: unknown };

interface RutaResuelta {
  /** El objeto o array que CONTIENE el valor final. */
  contenedor: Record<string, unknown> | unknown[];
  /** La clave o el índice dentro del contenedor. */
  clave: string | number;
  /** El ítem indexado más profundo que atravesó la ruta, para el ancla. */
  itemMasProfundo: unknown;
  /** El schema de ESE ítem — sin él, la identidad sale del primer string crudo (un UUID). */
  schemaDelItemMasProfundo?: unknown;
}

/**
 * Camina la ruta contra el SCHEMA y la DATA a la vez, sobre una COPIA.
 *
 * ⚠ Sobre una copia y no sobre el original: el llamador acumula operaciones y necesita que cada
 * una vea el resultado de la anterior sin haber mutado nada que después se descarte.
 */
function resolverRuta(
  schema: unknown,
  raiz: Record<string, unknown>,
  ruta: string,
): { ok: true; r: RutaResuelta } | { ok: false; motivo: string } {
  const segmentos = ruta.split(".").map((s) => s.trim()).filter(Boolean);
  if (segmentos.length === 0) return { ok: false, motivo: "la ruta está vacía" };
  if (segmentos.length > MAX_SEGMENTOS) {
    return { ok: false, motivo: `«${ruta}» es demasiado profunda` };
  }

  let nodoSchema = schema as NodoDeSchema;
  let contenedor: Record<string, unknown> | unknown[] = raiz;
  let itemMasProfundo: unknown = undefined;
  let schemaDelItemMasProfundo: unknown = undefined;

  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i];
    const ultimo = i === segmentos.length - 1;

    if (nodoSchema?.type === "object") {
      const sub = (nodoSchema.properties ?? {})[seg] as NodoDeSchema | undefined;
      if (!sub) return { ok: false, motivo: `«${seg}» no es un campo de esa sección` };
      if (ultimo) {
        if (sub.type !== "string") {
          return {
            ok: false,
            motivo:
              sub.type === "array"
                ? `«${seg}» es una lista: se toca con las operaciones de ítem, no como texto`
                : `«${seg}» no es un texto`,
          };
        }
        return { ok: true, r: { contenedor, clave: seg, itemMasProfundo, schemaDelItemMasProfundo } };
      }
      const actual = (contenedor as Record<string, unknown>)[seg];
      if (actual === undefined || actual === null) {
        return { ok: false, motivo: `«${seg}» todavía no tiene contenido` };
      }
      contenedor = actual as Record<string, unknown> | unknown[];
      nodoSchema = sub;
      continue;
    }

    if (nodoSchema?.type === "array") {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0) {
        return { ok: false, motivo: `«${seg}» no es una posición de la lista` };
      }
      const arr = contenedor as unknown[];
      if (!Array.isArray(arr) || idx >= arr.length) {
        return {
          ok: false,
          motivo: `esa lista tiene ${Array.isArray(arr) ? arr.length : 0} ítems y se pidió el ${idx + 1}`,
        };
      }
      const sub = nodoSchema.items as NodoDeSchema | undefined;
      if (!sub) return { ok: false, motivo: "esa lista no declara qué contiene" };
      itemMasProfundo = arr[idx];
      schemaDelItemMasProfundo = sub;
      if (ultimo) {
        if (sub.type !== "string") return { ok: false, motivo: `el ítem ${idx + 1} no es un texto` };
        return { ok: true, r: { contenedor: arr, clave: idx, itemMasProfundo, schemaDelItemMasProfundo } };
      }
      contenedor = arr[idx] as Record<string, unknown> | unknown[];
      nodoSchema = sub;
      continue;
    }

    return { ok: false, motivo: `«${seg}» no existe en esa sección` };
  }

  return { ok: false, motivo: `«${ruta}» no llega a ningún campo` };
}

/**
 * El ancla de una ruta: cómo se llamaba el ítem que nombra, cuando se acordó.
 *
 * Devuelve `null` si la ruta no atraviesa ninguna lista — ahí no hace falta, porque nombrar un
 * campo de primer nivel no depende de que nadie haya reordenado nada.
 */
export function anclaDeRuta(schema: unknown, data: unknown, ruta: string): string | null {
  const raiz = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const res = resolverRuta(schema, raiz, ruta);
  if (!res.ok) return null;
  return identidadDeItem(res.r.itemMasProfundo, false, res.r.schemaDelItemMasProfundo);
}

/**
 * Cómo se llama un ítem: el primer campo de texto CON CONTENIDO.
 *
 * ⚠ No «el primero del schema»: un ítem cuyo primer campo esté vacío daría un ancla vacía, o sea
 * ninguna protección justo donde parece haberla.
 */
function identidadDeItem(
  item: unknown,
  /**
   * `true` = devuelve el texto ENTERO, sin recortar al largo del ancla.
   *
   * ⚠ Existe para la LÍNEA que lee una persona. Recortar a 24 es lo correcto para el ancla —es
   * una llave de integridad— y es exactamente lo que no sirve para decidir: en pantalla se leyó
   * «Se quita «Aircall no sincroniza co»», cortado a mitad de palabra.
   */
  completo = false,
  /**
   * ⭐ El schema de los ÍTEMS de esa lista, cuando se lo puede resolver.
   *
   * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────────────────────
   * Sin él se recorre `Object.values` de la data CRUDA, y en las secciones curadas del kickoff la
   * primera key es el IDENTIFICADOR: una franja es `{id, label}` y una persona del equipo es
   * `{teamMemberId, name, role, photoUrl}`. Resultado en pantalla, el 2026-08-23:
   *   «En «Sesiones y horarios», en «58dc6158-dfee-4ce8-a442-», label pasa a: «Martes 11:00 pm»»
   * — 24 caracteres de un UUID, que es justo el largo del ancla.
   *
   * ⛔ Y la ironía es que el `schemaDelChat` de esas secciones ESCONDE el `id` a propósito (el
   * modelo no puede inventarlo). O sea que una mitad decía «esta lista es `{label}`» y la otra
   * leía el objeto entero. Consultar el schema hace que las dos digan lo mismo.
   *
   * ⚠ Sin schema —secciones `custom:*`, `ctxDriven`— cae al recorrido de siempre: ahí no hay forma
   * declarada, y adivinar sería peor que el comportamiento conocido.
   */
  schemaDeItems?: unknown,
): string | null {
  const dar = (v: string) => (completo ? v.trim() : recortarAncla(v));
  if (item === undefined || item === null) return null;
  if (typeof item === "string") return item.trim() ? dar(item) : null;
  if (typeof item !== "object") return null;

  const obj = item as Record<string, unknown>;
  const props = (schemaDeItems as NodoDeSchema | undefined)?.properties;
  /* Con schema: SUS keys, en SU orden — el orden del schema es el orden en que una persona lee la
     tarjeta, y es donde `label`/`name` van adelante. */
  const claves = props ? Object.keys(props) : Object.keys(obj);
  for (const k of claves) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return dar(v);
  }
  return null;
}

/**
 * El ancla de un ÍTEM de una lista, por su posición.
 *
 * ⚠ Va aparte de `anclaDeRuta` porque una ruta que termina en un ítem no termina en un texto, y
 * el resolver de rutas exige que el final sea un campo de texto — con razón: una ruta que
 * apuntara a un objeto entero permitiría escribirlo de una, que es el contrato que este módulo
 * vino a romper.
 */
export function anclaDeItem(
  data: unknown,
  lista: string,
  posicion: number,
  /** El schema de la SECCIÓN. De acá sale el de los ítems, que es lo que ordena la identidad. */
  schema?: unknown,
): string | null {
  const arr = (data as Record<string, unknown> | null)?.[lista];
  if (!Array.isArray(arr) || posicion < 0 || posicion >= arr.length) return null;
  return identidadDeItem(arr[posicion], false, schemaDeItemsDe(schema, lista));
}

/** El schema de los ítems de una lista de PRIMER nivel, si la sección lo declara. */
export function schemaDeItemsDe(schema: unknown, lista: string | undefined): unknown {
  if (!lista) return undefined;
  const nodo = (schema as NodoDeSchema | undefined)?.properties?.[lista] as NodoDeSchema | undefined;
  return nodo?.type === "array" ? nodo.items : undefined;
}

// ── El ejecutor ───────────────────────────────────────────────────────────────────────────────

const clonar = <T,>(v: T): T => structuredClone(v);

/** Lo que sale de preparar un lote de operaciones antes de acordarlo. */
export interface PreparacionDeOperaciones {
  /** Enriquecidas con su ancla y validadas contra el documento real. Son las que se acuerdan. */
  aceptadas: OperacionDeDocumento[];
  /** No pasaron. Van al reintento del modelo y, si insisten, se le dicen a la persona. */
  rechazadas: { operacion: unknown; motivo: string }[];
  /** Índices dentro de `aceptadas` que nombran una sección que este mismo lote va a crear. */
  diferidas: number[];
}

/**
 * Traduce la `cita` de una operación a la coordenada que el ejecutor entiende.
 *
 * Devuelve la operación con `campo` —o `lista`+`posicion`— puestos, la MISMA operación cuando no
 * trae cita, o `null` cuando la cita no resuelve; en ese caso ya dejó el motivo en `rechazadas`,
 * que es lo que vuelve al modelo como resultado de su herramienta para que corrija en la misma
 * llamada.
 *
 * ⚠ **La coordenada manda, la cita verifica.** Si el modelo mandó las dos y no coinciden, se
 * rechaza en vez de elegir una: que dos identificadores del mismo lugar se contradigan significa
 * que uno está mal, y no hay forma de saber cuál. Juntas son más fuertes que cualquiera sola.
 */
function resolverCitaDeOperacion(
  o: OperacionDeDocumento,
  s: SeccionActual,
  rechazadas: { operacion: unknown; motivo: string }[],
): OperacionDeDocumento | null {
  const cita = (o as { cita?: string }).cita?.trim();
  if (!cita) return o;
  if (o.op !== "seccion.campo" && o.op !== "seccion.item.borrar" && o.op !== "seccion.item.mover") {
    return o;
  }

  const r = resolverCita(hojasCitables(s.schema, s.data), cita);
  if (!r.ok) {
    rechazadas.push({ operacion: o, motivo: r.motivo });
    return null;
  }
  const h = r.hoja;

  if (o.op === "seccion.campo") {
    if (o.campo && o.campo !== h.ruta) {
      rechazadas.push({
        operacion: o,
        motivo: `«${cita}» no está en «${o.campo}»: está en «${h.ruta}»`,
      });
      return null;
    }
    return { ...o, campo: h.ruta };
  }

  /* Una hoja de una lista ANIDADA no tiene coordenada de ítem (ver `HojaCitable.lista`). Se dice
     dónde SÍ se toca, en vez de rechazar con «no existe» sobre un texto que sí está. */
  if (h.lista === null) {
    rechazadas.push({
      operacion: o,
      motivo: `«${cita}» no es un ítem de una lista de esa sección: se cambia con \`seccion.campo\``,
    });
    return null;
  }
  if (
    (o.lista && o.lista !== h.lista) ||
    (Number.isInteger(o.posicion) && o.posicion !== h.posicion)
  ) {
    rechazadas.push({
      operacion: o,
      motivo: `«${cita}» está en «${h.lista}», ítem ${(h.posicion ?? 0) + 1} — no donde dice la operación`,
    });
    return null;
  }
  return { ...o, lista: h.lista, posicion: h.posicion ?? 0 };
}

/**
 * ⭐⭐ LO QUE SE ACUERDA YA PASÓ POR EL EDITOR — la pieza que faltaba.
 *
 * ── LOS DOS AGUJEROS QUE ESTO CIERRA, los dos vistos en producción el 2026-08-22 ──────────────
 *
 * 1. ⛔ **EL ANCLA NO LA CALCULABA NADIE.** El encabezado de este archivo promete, desde que se
 *    escribió, que «la calcula la app, nunca el modelo». No era cierto: la herramienta del modelo
 *    ni siquiera declara el campo, y `anclaDeItem` solo se llamaba DENTRO del ejecutor, como
 *    validador. Resultado: `seccion.item.borrar` y `seccion.item.mover` se rechazaban SIEMPRE
 *    —«"undefined" ya no está en esa posición: alguien reordenó la lista», un mensaje que además
 *    mandaba a investigar un reordenamiento que nunca pasó— y la línea de la cajita decía
 *    literalmente «Se quita «undefined»». Borrar o mover un ítem por chat era imposible en los
 *    diez documentos. El test no lo cazaba porque pasaba las anclas a mano.
 *
 * 2. ⛔ **EL ACUERDO PROMETÍA COSAS QUE EL EDITOR IBA A RECHAZAR.** La persona leía cuatro
 *    renglones, marcaba las casillas, apretaba «Aplicar» y recién ahí aparecía «no se pudieron
 *    aplicar 4 de 4». El dry-run mueve ese descubrimiento ANTES del acuerdo: se corre el ejecutor
 *    —que es puro— sobre el documento real y se tira el plan. Lo que no pasa, no se ofrece.
 *
 * ⭐ Y eso es lo que habilita el reintento: los rechazos vuelven al modelo como resultado de su
 * propia herramienta, en la misma llamada, para que corrija los nombres que inventó. Es el loop
 * agéntico, sobre un vocabulario cerrado.
 */
export function prepararOperacionesDeDocumento(
  actuales: readonly SeccionActual[],
  crudas: readonly unknown[],
  capacidades: CapacidadesDelDocumento,
  /** ⚠ Los MISMOS que va a usar el editor: si el dry-run corriera sin ellos, aceptaría un ítem
     que después se rechaza al aplicar — y al revés, rechazaría uno que sí se puede completar. */
  completadores?: Record<string, CompletadorDeItem>,
): PreparacionDeOperaciones {
  const rechazadas: { operacion: unknown; motivo: string }[] = [];
  const validas: OperacionDeDocumento[] = [];

  for (const cruda of crudas) {
    const v = validarOperacionDeDocumento(cruda);
    if (v.ok) validas.push(v.operacion);
    else rechazadas.push({ operacion: cruda, motivo: v.motivo });
  }

  /* Las secciones que este mismo lote crea todavía no existen: sus operaciones de contenido no se
     pueden validar contra data que no está. Se dejan pasar sin dry-run —el ejecutor las resuelve
     en orden— en vez de rechazarlas por un estado que aún no ocurrió. */
  const refsCreadas = new Set(
    validas.flatMap((o) => (o.op === "seccion.crear" && o.ref?.trim() ? [o.ref.trim()] : [])),
  );
  const nombraUnaCreada = (o: OperacionDeDocumento) =>
    "key" in o && typeof o.key === "string" && refsCreadas.has(o.key);

  const porKey = new Map(actuales.map((s) => [s.key, s]));
  const aceptadas: OperacionDeDocumento[] = [];
  const diferidas: number[] = [];

  for (const o of validas) {
    if (nombraUnaCreada(o)) {
      diferidas.push(aceptadas.length);
      aceptadas.push(o);
      continue;
    }
    /* El enriquecimiento: la app pone el ancla leyendo el documento de AHORA. Si no puede
       calcularla —la lista no existe, el ítem no tiene texto— la operación sigue sin ancla y el
       dry-run de abajo la rechaza con el motivo REAL, en vez de con uno inventado. */
    const s = porKey.get((o as { key?: string }).key ?? "");

    /* ⭐ PRIMERO LA CITA, DESPUÉS EL ANCLA — y el orden ES el diseño. La cita resuelve CUÁL; el
       ancla se calcula sobre la coordenada YA resuelta, para proteger que siga siendo ése entre
       acordar y aplicar. Al revés, el ancla se calcularía sobre el índice que el modelo adivinó,
       o sea que confirmaría su propia equivocación. */
    const conCoordenada = s ? resolverCitaDeOperacion(o, s, rechazadas) : o;
    if (conCoordenada === null) continue;
    const c = conCoordenada;

    /* ⛔ EL ANCLA QUE YA VIENE NO SE PISA, y era lo que mataba la protección entera.
       Un pendiente arrastrado de un turno anterior trae el ancla de lo que la persona APROBÓ.
       Recalcularla contra el documento de ahora la reemplaza por «lo que hoy está en ese índice»,
       y entonces el chequeo del ejecutor compara el ancla contra sí misma: siempre pasa. Peor con
       la búsqueda por ancla, que seguiría al ítem equivocado con total convicción.
       La app la calcula cuando FALTA —el modelo no la emite—, no cuando ya está. */
    const yaTieneAncla = typeof (c as { ancla?: string }).ancla === "string" && !!(c as { ancla?: string }).ancla?.trim();
    if (yaTieneAncla) {
      aceptadas.push(c);
    } else if (s && (c.op === "seccion.item.borrar" || c.op === "seccion.item.mover") && c.lista) {
      const ancla = anclaDeItem(s.data, c.lista, c.posicion ?? -1, s.schema);
      aceptadas.push(ancla === null ? c : { ...c, ancla });
    } else if (s && c.op === "seccion.campo" && c.campo) {
      const ancla = anclaDeRuta(s.schema, s.data, c.campo);
      aceptadas.push(ancla === null ? c : { ...c, ancla });
    } else {
      aceptadas.push(c);
    }
  }

  /* ⚠ El dry-run corre sobre TODO el lote y en orden, no operación por operación: una que depende
     de otra —crear y llenar, agregar y después mover— tiene que ver el resultado de la anterior,
     igual que al aplicar de verdad. El `plan` se descarta: acá no se escribe nada. */
  const seco = aplicarOperacionesDeDocumento(actuales, aceptadas, capacidades, completadores);
  if (seco.rechazadas.length === 0) return { aceptadas, rechazadas, diferidas };

  const caidas = new Set(seco.rechazadas.map((r) => r.operacion));
  const sobreviven: OperacionDeDocumento[] = [];
  const diferidasFinales: number[] = [];
  aceptadas.forEach((o, i) => {
    /* Una diferida no se juzga por el dry-run: su sección no existía cuando corrió. */
    if (diferidas.includes(i)) {
      diferidasFinales.push(sobreviven.length);
      sobreviven.push(o);
      return;
    }
    if (caidas.has(o)) rechazadas.push({ operacion: o, motivo: motivoDe(seco.rechazadas, o) });
    else sobreviven.push(o);
  });
  return { aceptadas: sobreviven, rechazadas, diferidas: diferidasFinales };
}

const motivoDe = (rs: readonly OperacionRechazada[], o: OperacionDeDocumento) =>
  rs.find((r) => r.operacion === o)?.motivo ?? "el editor la rechazó";

/**
 * Traduce las operaciones a un PLAN de escrituras. ⛔ No escribe: ver el encabezado.
 *
 * Las operaciones se aplican EN ORDEN sobre una copia de trabajo, así que una que dependa de otra
 * —crear una sección y después llenarla— ve el resultado de la anterior.
 */
export function aplicarOperacionesDeDocumento(
  actuales: readonly SeccionActual[],
  operaciones: readonly OperacionDeDocumento[],
  capacidades: CapacidadesDelDocumento,
  /** Por KEY de sección: quién termina el ítem nuevo. Ver `CompletadorDeItem`. */
  completadores?: Record<string, CompletadorDeItem>,
): ResultadoDeDocumento {
  const avisos: string[] = [];
  const rechazadas: OperacionRechazada[] = [];
  const plan: EscrituraDeDocumento[] = [];

  /* Copia de trabajo: el `data` se muta acá y se emite una sola escritura por sección al final, en
     vez de una por operación. Tres cambios sobre la misma sección son un solo guardado. */
  const trabajo = new Map(
    actuales.map((s) => [s.key, { ...s, data: clonar(s.data) as Record<string, unknown> }]),
  );
  const tocadas = new Set<string>();
  let orden = actuales.map((s) => s.key);
  let ordenTocado = false;

  const buscar = (key: string) => trabajo.get(key);
  const rechazar = (operacion: OperacionDeDocumento, motivo: string) =>
    rechazadas.push({ operacion, motivo });

  /**
   * ⭐ EL FORMATO DE LA SECCIÓN MANDA — la regla que Elías pidió el 2026-08-23, textual: *«cada
   * sección debe ser editada en el mismo formato en el que está inicialmente, a no ser que se
   * indique algún otro formato»*.
   *
   * ⛔ Y acá no es una preferencia de estilo: es la ÚNICA operación del vocabulario cuya pérdida
   * es irreversible desde la interfaz. Escribir un campo sobre una sección en prosa crea el bloque
   * CARD, y desde ese momento el motor no vuelve a armar el markdown viejo NUNCA — el texto queda
   * en la base, invisible, sin ningún botón que lo traiga de vuelta. El caso real: «resumí el
   * texto y ponele títulos más grandes» y la sección salió convertida en tarjetas.
   *
   * La excepción viaja en `convertir`, y es del modelo declararla: convertir es un cambio que la
   * persona pide con esas palabras, nunca un efecto secundario de otro pedido.
   */
  const formatoLoImpide = (
    o: OperacionDeDocumento & { convertir?: boolean },
    s: SeccionActual,
  ): boolean => {
    if (s.formato !== "prosa" || o.convertir) return false;
    rechazar(
      o,
      `«${s.label}» está escrita en el formato anterior: un texto corrido, sin campos. Escribir ` +
        `campos la convierte en tarjetas y el texto que hoy se ve deja de verse — y no hay forma ` +
        `de recuperarlo desde el editor. Redacta el cambio como TEXTO; si la persona pidió ` +
        `cambiarle el formato con esas palabras, repite la operación con \`convertir\`: true`,
    );
    return true;
  };

  for (const o of operaciones) {
    switch (o.op) {
      case "seccion.campo": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (formatoLoImpide(o, s)) break;
        /* ⛔ Sin ruta no se escribe. La `cita` la resuelve `prepararOperacionesDeDocumento`; si
           una operación llega hasta acá sin `campo`, es que la cita no resolvió — y adivinar el
           campo «más parecido» es exactamente lo que este vocabulario existe para impedir. */
        if (!o.campo?.trim()) {
          rechazar(o, "no se pudo resolver qué campo cambiar: falta `campo` o una `cita` que exista");
          break;
        }
        const res = resolverRuta(s.schema, s.data, o.campo);
        if (!res.ok) { rechazar(o, res.motivo); break; }
        if (o.ancla) {
          const actual = anclaDeRuta(s.schema, s.data, o.campo);
          if (actual !== null && actual !== o.ancla) {
            rechazar(o, `«${o.ancla}» ya no está donde estaba: alguien lo movió o lo cambió`);
            break;
          }
        }
        (res.r.contenedor as Record<string | number, unknown>)[res.r.clave] = o.valor;
        tocadas.add(o.key);
        break;
      }

      case "seccion.item.agregar": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (formatoLoImpide(o, s)) break;
        const nodo = (s.schema as NodoDeSchema)?.properties?.[o.lista] as NodoDeSchema | undefined;
        if (!nodo || nodo.type !== "array") { rechazar(o, `«${o.lista}» no es una lista de esa sección`); break; }
        /* ⛔ Corregir sí, agrandar no — y el motivo dice DÓNDE sí se hace, que es la diferencia
           entre un rechazo útil y uno que deja a la persona sin salida. */
        if (s.listasSoloEdicion?.includes(o.lista)) {
          rechazar(
            o,
            `«${o.lista}» se corrige desde acá, pero no se le agregan ítems: los nuevos entran ` +
              `aceptando una propuesta en la sección, con su cita delante`,
          );
          break;
        }
        const items = nodo.items as NodoDeSchema | undefined;
        const arr = (s.data[o.lista] as unknown[] | undefined) ?? [];

        /* ⭐ DOS FORMAS DE LISTA, Y HAY QUE DISTINGUIRLAS.
           Una lista de TEXTOS sueltos (`tags`, `hoy`, `conSistema`, `canales`) no tiene campos con
           nombre: su ítem ES el texto. Mientras el ejecutor asumió que toda lista era de objetos,
           `items.properties` venía vacío y AGREGAR ERA IMPOSIBLE — con `valores` rechazaba
           siempre, y sin él insertaba un objeto vacío que el motor borra al pintar, en silencio.
           Es el fallo que Elías vio el 2026-08-22 sobre la comparación del kickoff. */
        let nuevo: unknown;
        if (items?.type === "string") {
          if (o.valores && Object.keys(o.valores).length) {
            rechazar(o, `«${o.lista}» es una lista de textos: el texto va en \`valor\``);
            break;
          }
          const texto = (o.valor ?? "").trim();
          if (!texto) { rechazar(o, `«${o.lista}» lleva un texto, y llegó vacío`); break; }
          nuevo = o.valor;
        } else {
          if (o.valor !== undefined && !o.valores) {
            rechazar(o, `los ítems de «${o.lista}» llevan campos con nombre: van en \`valores\``);
            break;
          }
          /* Solo entran las propiedades que el schema declara: una key de más se descartaría
             después en silencio, y el CSE habría aprobado una línea que prometía algo que no
             pasó. */
          const permitidas = new Set(Object.keys(items?.properties ?? {}));
          const dados = o.valores ?? {};
          const desconocidas = Object.keys(dados).filter((k) => !permitidas.has(k));
          if (desconocidas.length) {
            rechazar(o, `«${desconocidas[0]}» no es un campo de esa lista`);
            break;
          }
          const armado: Record<string, unknown> = {};
          /* ⛔ EL VACÍO DE CADA CAMPO SALE DE SU PROPIO TIPO, no de la string vacía.
             Un ítem puede tener adentro otra lista —una sesión de Exploración tiene `preguntas`—
             y con `?? ""` esa lista nacía como texto. El render la recorre con `.map` y el
             documento ENTERO deja de pintarse: «"".map is not a function», con la data ya guardada,
             así que recargar no salva y el PDF tampoco. Un ítem incompleto tiene que nacer con la
             FORMA que su renderer espera. */
          /* ⛔ Y UN TEXTO NO ENTRA EN UN CAMPO QUE ES LISTA. Sin este rechazo, «la fila dice A,
             B, C» se guardaba como la string «A · B · C» en un campo que el render recorre como
             lista: la fila salía VACÍA y el chat decía «aplicado». Se rechaza con el camino real,
             que es crear el ítem y después llenar cada casilla por su ruta. */
          for (const k of permitidas) {
            const tipo = (items?.properties ?? {})[k] as NodoDeSchema | undefined;
            if (tipo?.type === "array" && typeof dados[k] === "string") {
              rechazar(o, `«${k}» es una lista adentro del ítem: se llena después, casilla por casilla`);
              nuevo = null;
              break;
            }
            armado[k] = dados[k] ?? vacioDeSchema(tipo);
          }
          if (nuevo === null) break;
          nuevo = armado;
        }

        /* ⚠ El completador va DESPUÉS de validar contra el esquema y ANTES de insertar: recibe un
           ítem ya limpio y le agrega lo que el modelo no podía saber. Su rechazo es el que la
           persona lee («Ana puede ser Ana Pérez o Ana Gómez: dime cuál»), así que viaja por el
           mismo canal que los demás. */
        const completar = completadores?.[o.key];
        if (completar) {
          const r = completar(o.lista, nuevo as Record<string, unknown>, s.data);
          if ("error" in r) { rechazar(o, r.error); break; }
          nuevo = r.ok;
        }
        const pos = o.posicion === undefined ? arr.length : Math.max(0, Math.min(arr.length, o.posicion));
        const next = arr.slice();
        next.splice(pos, 0, nuevo);
        s.data[o.lista] = next;
        tocadas.add(o.key);
        break;
      }

      case "seccion.item.borrar":
      case "seccion.item.mover": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (formatoLoImpide(o, s)) break;
        /* ⛔ Ídem que en `seccion.campo`: sin lista no se toca nada. Sin esta línea, `data[undefined]`
           es `undefined`, el `Array.isArray` de abajo lo caza — pero el motivo diría «"undefined" no
           es una lista», que manda a buscar una lista que nadie nombró. */
        if (!o.lista?.trim()) {
          rechazar(o, "no se pudo resolver qué ítem tocar: falta `lista`+`posicion` o una `cita` que exista");
          break;
        }
        const arr = s.data[o.lista] as unknown[] | undefined;
        if (!Array.isArray(arr)) { rechazar(o, `«${o.lista}» no es una lista de esa sección`); break; }
        /* ⚠ `Number.isInteger` primero: sin él, un `posicion` ausente atravesaba las dos
           comparaciones (`undefined < 0` y `undefined >= n` son ambas `false`) y llegaba al
           `splice`, que borra el ítem 0. Hoy lo frenaba el ancla; el día que el ancla se calcule
           bien, esto sería un borrado silencioso del primer ítem. */
        /**
         * ⭐⭐ EL LOTE SE CORRÍA EL PISO A SÍ MISMO, y es el fallo que Elías vio en pantalla.
         *
         * «Borra las últimas 2 opciones a cada card» sobre dos listas de seis: el modelo emite
         * cuatro borrados con las posiciones 4 y 5 de cada lista, calculadas contra el documento
         * ENTERO. Pero el dry-run corre el lote en orden sobre una copia que se va encogiendo: el
         * borrado de la 4 deja la lista en cinco, y el de la 5 choca contra un rango que dejó de
         * existir. Resultado: «No registré 2 de los cambios: esa lista tiene 5 ítems y se pidió el
         * 6» — un mensaje que describe un documento que nunca existió, sobre uno que en pantalla
         * tiene seis.
         *
         * ⚠ Y era INTERMITENTE por construcción: emitidas al revés (5 y después 4) las cuatro
         * entran. Nada en la herramienta ni en el prompt obliga a un orden.
         *
         * ⛔ Y el camino que el prompt RECOMIENDA cae en el mismo pozo: `resolverCitaDeOperacion`
         * traduce la cita a una posición absoluta ANTES del dry-run. No es que el modelo cuente
         * mal — es que la coordenada se congela antes del lote y se juzga después.
         *
         * El arreglo: cuando la operación trae ancla, la posición se BUSCA en el array vigente.
         * ⛔ Solo si el ancla aparece UNA vez. Con dos ítems que empiezan igual, elegir el primero
         * sería escribir en el equivocado en silencio — el mismo criterio que la cita, donde la
         * ambigüedad es rechazo y nunca «el más parecido».
         */
        const itemsDeLaLista = schemaDeItemsDe(s.schema, o.lista);
        /* ⛔ MIGRACIÓN, con fecha: el ancla viaja PERSISTIDA dentro de cada acuerdo del hilo.
           Un pendiente acordado antes del 2026-08-23 lleva la identidad vieja —«58dc6158-…», el
           primer string crudo— y la nueva devuelve «Martes 11:00». Sin aceptar las dos, todos los
           hilos abiertos se caerían con «alguien reordenó la lista» sobre listas que nadie tocó.
           Se puede quitar cuando no queden acuerdos vivos de antes de esa fecha. */
        const esteItemEs = (it: unknown) =>
          identidadDeItem(it, false, itemsDeLaLista) === o.ancla || identidadDeItem(it) === o.ancla;
        const coincidencias = o.ancla
          ? arr.reduce<number[]>((acc, it, i) => (esteItemEs(it) ? [...acc, i] : acc), [])
          : [];
        const pos = coincidencias.length === 1 ? coincidencias[0] : o.posicion;
        if (typeof pos !== "number" || !Number.isInteger(pos) || pos < 0 || pos >= arr.length) {
          rechazar(o, `esa lista tiene ${arr.length} ítems y se pidió el ${(pos ?? 0) + 1}`);
          break;
        }
        /* ⛔ Acá el ancla es OBLIGATORIA y el chequeo NO es condicional: si no se puede
           determinar cómo se llama el ítem que está en esa posición, no se toca. Volverlo
           condicional —«si hay ancla y no coincide»— es la edición que parece natural y apaga la
           protección para toda operación que la app olvidó anclar. */
        const actual = anclaDeItem(s.data, o.lista, pos, s.schema);
        if (actual !== o.ancla && anclaDeItem(s.data, o.lista, pos) !== o.ancla) {
          rechazar(o, `«${o.ancla}» ya no está en esa posición: alguien reordenó la lista`);
          break;
        }
        const next = arr.slice();
        if (o.op === "seccion.item.borrar") {
          next.splice(pos, 1);
        } else {
          const destino = Math.max(0, Math.min(next.length - 1, o.a));
          const [item] = next.splice(pos, 1);
          next.splice(destino, 0, item);
        }
        s.data[o.lista] = next;
        tocadas.add(o.key);
        break;
      }

      case "seccion.vaciar": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        /* El `empty` sale del schema y no de una constante: vaciar tiene que dejar la sección con
           la forma que su renderer espera, no con un objeto vacío. */
        /* ⚠ El del AGENTE, no el del chat. Ver `schemaDelAgente`: con el del chat, vaciar una
           sección curada se lleva puesto lo que curó una persona. El respaldo a `s.schema` cubre
           a los productores viejos y a los tests que arman la sección a mano. */
        const schemaParaVaciar = s.schemaDelAgente ?? s.schema;
        const molde = vacioDeSchema(schemaParaVaciar);
        /* ⛔ Una sección sin schema declarado (el cronograma del kickoff, los procesos: se dibujan
           desde el proyecto) caía al `return ""` del final y ESCRIBÍA LA STRING VACÍA como data de
           la sección. Los normalizadores del motor lo absorben al pintar, así que no se veía —
           pero quedaba data corrupta guardada en la base. */
        if (typeof molde !== "object" || molde === null) {
          rechazar(o, "esa sección no tiene contenido editable desde acá: se dibuja desde el proyecto");
          break;
        }
        /* ⛔ Y UN ESQUEMA SIN CAMPOS TAMPOCO. La tabla de inversión y la estimación declaran
           `properties: {}` A PROPÓSITO —ahí hay plata, y el agente no la escribe—. Vaciarlas es un
           NO-OP: el merge repone todo lo que el esquema no declara, o sea todo. La línea del
           acuerdo, mientras tanto, dice «⚠ Se borra TODO el contenido». Prometer un borrado que no
           ocurre es peor que negarlo: la persona cree que limpió la sección y los montos siguen. */
        if (Object.keys((schemaParaVaciar as NodoDeSchema)?.properties ?? {}).length === 0) {
          rechazar(o, "esa sección no se vacía desde acá: su contenido se edita en la propia sección");
          break;
        }
        /* ⛔ Y VACIAR NO ARRASA CON LO QUE NO ES TEXTO. La foto de portada, los logos de marca y
           el rótulo chico viven FUERA del schema a propósito: son de la persona, y
           `preserveNonSchemaKeys` los conserva en cada regeneración del agente. Pisar la data de
           raíz con el molde se los llevaba puestos — sin decirlo, porque el aviso habla de
           «textos». Vaciar limpia lo que el schema declara; lo demás se queda. */
        s.data = preserveNonSchemaKeys(
          schemaParaVaciar,
          s.data,
          molde as Record<string, unknown>,
        ) as Record<string, unknown>;
        tocadas.add(o.key);
        break;
      }

      case "seccion.ocultar":
      case "seccion.mostrar": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (!capacidades.puedeOcultar) {
          rechazar(o, "en este documento las secciones todavía no se pueden ocultar desde acá");
          break;
        }
        if (!s.movible) { rechazar(o, `«${s.label}» es estructural: sin ella el documento queda roto`); break; }
        const oculta = o.op === "seccion.ocultar";
        if (s.oculta === oculta) { avisos.push(`«${s.label}» ya estaba ${oculta ? "oculta" : "visible"}.`); break; }
        s.oculta = oculta;
        plan.push({ tipo: "oculta", sectionId: s.id, oculta });
        break;
      }

      case "seccion.renombrar": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        const titulo = o.titulo.trim();
        if (!titulo) { rechazar(o, "un título vacío dejaría la sección sin nombre"); break; }
        /* ⛔ Y solo donde el rótulo se PERSISTE. En Roles la lista de secciones es fija y sus
           títulos salen de la plantilla del tipo: el ejecutor de ese documento solo escribe
           contenido, así que un renombrado se descartaba en silencio — el hilo decía «aplicado» y
           el título quedaba igual. Es el mismo criterio que `rotulable`: si no se va a ver, se
           rechaza con el motivo en vez de fingir. */
        if (s.renombrable === false) {
          rechazar(o, "en este documento los títulos de las secciones son fijos");
          break;
        }
        s.label = titulo;
        plan.push({ tipo: "titulo", sectionId: s.id, titulo });
        break;
      }

      case "seccion.rotular": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        /* ⛔ Solo donde el rótulo lo pinta el ENCABEZADO del motor. Las portadas y los cierres
           traen su propio encabezado (`selfTitled`) y algunas leen su rótulo de la data: escribir
           la columna ahí sería mudo — el hilo diría «aplicado» y en pantalla no cambiaría nada,
           que es exactamente el modo de falla que este vocabulario existe para no tener. */
        if (!s.rotulable) {
          rechazar(o, "esa sección trae su propio encabezado: su rótulo se cambia en la sección");
          break;
        }
        s.rotulo = o.rotulo.trim();
        plan.push({ tipo: "rotulo", sectionId: s.id, rotulo: o.rotulo.trim() });
        break;
      }

      case "seccion.mover": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (!s.movible) { rechazar(o, `«${s.label}» tiene un lugar fijo en el documento`); break; }
        const desde = orden.indexOf(o.key);
        if (desde < 0) { rechazar(o, "esa sección ya no está en el orden"); break; }
        const next = orden.slice();
        next.splice(desde, 1);
        next.splice(Math.max(0, Math.min(next.length, o.posicion)), 0, o.key);
        orden = next;
        ordenTocado = true;
        break;
      }

      case "seccion.crear": {
        if (!capacidades.puedeCrear) {
          rechazar(o, "en este documento todavía no se pueden agregar secciones");
          break;
        }
        const titulo = o.titulo.trim();
        if (!titulo) { rechazar(o, "una sección sin nombre no se puede encontrar después"); break; }
        plan.push({ tipo: "crear", tipoDeSeccion: o.tipo, titulo, ref: o.ref });
        /**
         * ⭐ Y LA SECCIÓN NUEVA ENTRA A `trabajo`, con su `ref` de clave.
         *
         * ⛔ Antes no entraba, y el comentario que lo explicaba prometía «otra pasada» que NUNCA
         * existió. El resultado, visto en pantalla el 2026-08-22: el prompt pide crear y llenar
         * en un solo acuerdo, la persona lo pide, y las operaciones de llenado se rechazaban una
         * por una con «esa sección ya no está en el documento» — sobre una sección que estaba a
         * punto de nacer. No fallaban al ejecutar: **ni siquiera llegaban al plan**.
         *
         * Es el molde del cronograma (`lib/timeline/operaciones.ts`): si el chat mandó un `ref`,
         * ESE es el identificador mientras dure el lote. Con la sección virtual en la mesa, toda
         * operación posterior la encuentra, el dry-run del servidor la valida DE VERDAD, y la
         * línea del acuerdo deja de decir «(una sección que ya no está)».
         *
         * ⚠ `id` queda vacío a propósito: lo genera el servidor al crear. El navegador lo resuelve
         * por el `ref` que ya viaja en el plan.
         */
        if (o.ref?.trim()) {
          const molde = defDelTipo(o.tipo);
          trabajo.set(o.ref.trim(), {
            id: "",
            key: o.ref.trim(),
            label: titulo,
            data: clonar(molde.empty) as Record<string, unknown>,
            schema: molde.schema,
            schemaDelAgente: molde.schema,
            oculta: false,
            esCreada: true,
            movible: true,
            nacePorRef: o.ref.trim(),
          });
          orden = [...orden, o.ref.trim()];
        }
        break;
      }

      case "seccion.borrar": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
        if (!s.esCreada) {
          rechazar(o, `«${s.label}» es del documento, no se creó a mano: se puede ocultar`);
          break;
        }
        trabajo.delete(o.key);
        orden = orden.filter((k) => k !== o.key);
        plan.push({ tipo: "borrar", sectionId: s.id });
        break;
      }
    }
  }

  // Una sola escritura de contenido por sección, con todo lo que le pasó.
  for (const key of tocadas) {
    const s = trabajo.get(key);
    if (!s) continue;
    /* Por `ref` si nace en este lote; por id si ya existía. Nunca los dos, nunca ninguno. */
    plan.push(
      s.nacePorRef
        ? { tipo: "data", ref: s.nacePorRef, data: s.data }
        : { tipo: "data", sectionId: s.id, data: s.data },
    );
  }
  if (ordenTocado) {
    /* ⚠ El `filter` de antes descartaba EN SILENCIO toda sección sin id — o sea, justo las que
       acaban de nacer: pedir «creá esta sección y ponela primera» la dejaba al final sin decir
       nada. Ahora cada entrada dice por qué la nombra. */
    plan.push({
      tipo: "orden",
      entradas: orden.flatMap((k) => {
        const s = trabajo.get(k);
        if (!s) return [];
        return [s.nacePorRef ? { ref: s.nacePorRef } : { sectionId: s.id }];
      }),
    });
  }

  return { plan, avisos, rechazadas };
}

/** El objeto vacío que corresponde a un schema: `""` en las hojas, `[]` en las listas. */
export function vacioDeSchema(schema: unknown): unknown {
  const s = schema as NodoDeSchema;
  if (s?.type === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(s.properties ?? {})) out[k] = vacioDeSchema(sub);
    return out;
  }
  if (s?.type === "array") return [];
  return "";
}

// ── La traducción a castellano ────────────────────────────────────────────────────────────────

/** Cuánto de un texto entra en una línea antes de que deje de poder leerse de un vistazo. */
const LARGO_DE_VALOR = 90;

const recortar = (v: string): string =>
  v.length > LARGO_DE_VALOR ? `${v.slice(0, LARGO_DE_VALOR - 1).trimEnd()}…` : v;

/**
 * ⭐ LO QUE SE LEE ES LO QUE SE EJECUTA.
 *
 * Las líneas salen del MISMO objeto que se va a ejecutar, no de un texto que el modelo escribió
 * aparte. Sin esto, la cajita y el efecto son dos textos que pueden divergir — y la persona
 * aprobaría una cosa mientras pasa otra.
 *
 * ⚠ Y acá exige más que en el cronograma: la línea de un cambio de contenido tiene que contener
 * **el texto que se va a escribir**. «Se reescribe la introducción» no alcanza para aprobar nada.
 */
export function describirOperacionesDeDocumento(
  actuales: readonly SeccionActual[],
  operaciones: readonly OperacionDeDocumento[],
): string[] {
  const porKey = new Map(actuales.map((s) => [s.key, s]));
  const nombre = (key: string) => porKey.get(key)?.label ?? "(una sección que ya no está)";
  /* ⭐ El rótulo HUMANO de la lista, no su key. Pedido de Elías el 2026-08-22: sobre la
     comparación del kickoff, «se agrega X a hoy» y «se agrega X a conSistema» son la misma frase
     para quien lee — y son las dos columnas del cuadro. Sin el rótulo, aprobar no es decidir. */
  const lista = (key: string, l: string | undefined) =>
    `«${porKey.get(key)?.rotulosDeListas?.[l ?? ""] ?? l ?? "(sin nombre)"}»`;
  /* ⛔ El ancla puede faltar: el modelo NO la emite (no está en su herramienta) y la calcula la
     app. Si por lo que sea llega vacía, la línea nombra la posición en vez de interpolar
     `undefined` — que es lo que se leyó en pantalla el 2026-08-22: «Se quita «undefined»…». */
  /* El rótulo humano de un campo, si su def lo declara. Mismo criterio que el de las listas. */
  const campoDicho = (key: string, campo: string) =>
    porKey.get(key)?.rotulosDeCampos?.[campo] ?? labelFor(campo);
  /**
   * ⭐ CONVERTIR DE FORMATO SE DICE EN LA LÍNEA, o la persona aprueba un borrado sin saberlo.
   *
   * El ejecutor solo deja pasar esto con `convertir` puesto, así que la línea que la persona lee
   * es el ÚLTIMO lugar donde el cambio todavía se puede parar — y es irreversible desde el editor.
   */
  const avisoDeConversion = (o: OperacionDeDocumento & { convertir?: boolean }): string =>
    o.convertir && porKey.get((o as { key?: string }).key ?? "")?.formato === "prosa"
      ? " ⚠ el texto que hoy se ve en esa sección DEJA DE VERSE y no se puede recuperar"
      : "";
  /**
   * ⭐ EL TEXTO VIVO, NO EL ANCLA — y la diferencia se leyó en pantalla el 2026-08-23:
   * «Se quita «Aircall no sincroniza co» de la lista «Hoy»». Cortado a mitad de palabra y sin
   * puntos suspensivos, porque el ancla mide 24 caracteres.
   *
   * ⛔ El ancla es un mecanismo de PROTECCIÓN: 24 caracteres alcanzan de sobra para detectar que
   * alguien reordenó la lista. El renglón del acuerdo es para DECIDIR, y en un borrado múltiple
   * es lo ÚNICO que separa «quitá estos dos» de «quitá los otros dos». Son dos públicos con dos
   * necesidades distintas, y compartir el recorte le daba al segundo el tamaño del primero.
   *
   * Por eso la línea vuelve a leer el ítem del documento y lo recorta como todo lo demás —90 con
   * «…»—, y solo cae al ancla cuando la posición ya no resuelve.
   * ⚠ `LARGO_DEL_ANCLA` NO se toca: viaja persistido dentro de cada acuerdo del hilo, así que
   * cambiarlo invalidaría de golpe todo lo acordado y sin aplicar.
   */
  const itemDicho = (
    key: string,
    lista: string | undefined,
    ancla: string | undefined,
    posicion: number | undefined,
  ) => {
    const arr = (porKey.get(key)?.data as Record<string, unknown> | undefined)?.[lista ?? ""];
    const vivo =
      Array.isArray(arr) && typeof posicion === "number"
        ? identidadDeItem(arr[posicion], true, schemaDeItemsDe(porKey.get(key)?.schema, lista))
        : null;
    if (vivo) return `«${recortar(vivo)}»`;
    return ancla?.trim() ? `«${ancla}»` : `el ítem ${(posicion ?? 0) + 1}`;
  };

  return operaciones.map((o) => {
    switch (o.op) {
      case "seccion.campo": {
        /* ⚠ EL BOTÓN NO SE PINTA SIN ENLACE. El motor exige etiqueta Y url para mostrarlo, y la
           url vacía es el default de los siete cierres — así que «cambiá el texto del botón» es
           el camino NORMAL hacia un botón que no aparece. El editor lo avisa al lado del campo;
           el chat no decía nada y la persona aprobaba un cambio invisible. */
        const sinEnlace =
          o.campo === "buttonLabel" &&
          !operaciones.some((x) => x.op === "seccion.campo" && x.key === o.key && x.campo === "buttonUrl" && x.valor?.trim()) &&
          !String((porKey.get(o.key)?.data as Record<string, unknown> | undefined)?.buttonUrl ?? "").trim();
        /* ⭐ EL CAMPO SE NOMBRA COMO SE VE, NO COMO SE PROGRAMA. «items.2.detail pasa a…» no es
           una frase que alguien pueda aprobar: hay que contar desde cero en una lista para saber
           de qué tarjeta habla. El ancla —el texto que HOY tiene ese ítem— ya se calcula para
           proteger la operación de un reordenamiento; usarla acá no cuesta nada y convierte la
           línea en algo legible: «en la tarjeta «Migración desde Excel», el detalle pasa a…». */
        /* ⚠ La ruta ya viene resuelta: `prepararOperacionesDeDocumento` traduce la `cita` ANTES
           de describir, así que citar y nombrar la ruta producen la MISMA línea. Si igual llega
           sin ruta —un acuerdo viejo del hilo—, la línea nombra el texto citado en vez de dejar
           un hueco. */
        const ruta = o.campo?.trim() ?? "";
        if (!ruta) {
          const q = o.cita?.trim();
          return `En «${nombre(o.key)}», ${q ? `«${recortar(q)}»` : "un campo sin identificar"} pasa a: «${recortar(o.valor ?? "")}»`;
        }
        const donde = anclaDeRuta(porKey.get(o.key)?.schema, porKey.get(o.key)?.data, ruta);
        const hoja = ruta.split(".").pop() ?? ruta;
        const ubicacion = donde
          ? `En «${nombre(o.key)}», en «${donde}», ${campoDicho(o.key, hoja)}`
          : `En «${nombre(o.key)}», ${campoDicho(o.key, ruta)}`;
        return `${ubicacion} pasa a: «${recortar(o.valor ?? "")}»${
          sinEnlace ? " ⚠ sin enlace, el botón no se va a ver" : ""
        }${avisoDeConversion(o)}`;
      }
      case "seccion.item.agregar": {
        const texto = o.valor ?? Object.values(o.valores ?? {}).find((v) => v?.trim()) ?? "";
        return `Se agrega «${recortar(texto)}» a la lista ${lista(o.key, o.lista)} de «${nombre(o.key)}»${avisoDeConversion(o)}`;
      }
      case "seccion.item.borrar":
        return `Se quita ${itemDicho(o.key, o.lista, o.ancla, o.posicion)} de la lista ${lista(o.key, o.lista)} de «${nombre(o.key)}»`;
      case "seccion.item.mover":
        return `${itemDicho(o.key, o.lista, o.ancla, o.posicion)} pasa al lugar ${(o.a ?? 0) + 1} de la lista ${lista(o.key, o.lista)} en «${nombre(o.key)}»`;
      case "seccion.vaciar":
        return `⚠ Se borra TODO el contenido de «${nombre(o.key)}»`;
      case "seccion.crear":
        return `Se agrega la sección «${o.titulo}» (${o.tipo})`;
      case "seccion.borrar":
        return `⚠ Se elimina la sección «${nombre(o.key)}»`;
      case "seccion.ocultar":
        return `«${nombre(o.key)}» deja de verse en el documento`;
      case "seccion.mostrar":
        return `«${nombre(o.key)}» vuelve a verse en el documento`;
      case "seccion.mover":
        return `«${nombre(o.key)}» pasa al lugar ${o.posicion + 1}`;
      case "seccion.rotular":
        return o.rotulo.trim()
          ? `El rótulo de arriba de «${nombre(o.key)}» pasa a «${recortar(o.rotulo)}»`
          : `Se saca el rótulo de arriba de «${nombre(o.key)}»`;

      case "seccion.renombrar":
        return `«${nombre(o.key)}» pasa a llamarse «${o.titulo}»`;

      case "seccion.rotular":
        return o.rotulo.trim()
          ? `El rótulo de arriba de «${nombre(o.key)}» pasa a «${o.rotulo}»`
          : `Se saca el rótulo de arriba de «${nombre(o.key)}»`;
    }
  });
}

/**
 * Las dependencias entre operaciones del mismo acuerdo, por índice.
 *
 * ⛔ POR QUÉ HACE FALTA: un solo rechazo puede tumbar el lote entero. Si alguien desmarca la
 * sección que se crea y quedan vivas las operaciones que la llenan, esas nombran una sección que
 * no existe — y la persona desmarcó UNA cosa y no se aplicó ninguna. Es el mismo mecanismo que el
 * cronograma ya tiene para una fase y sus tareas.
 *
 * Devuelve, por cada operación, los índices de las que NECESITA para poder aplicarse.
 *
 * ⚠ Esa dirección —«qué requiere», no «quién depende de mí»— es la que ya consume el punto fijo
 * del panel. Invertirla haría que la cascada corra al revés y desmarcar una operación suelta
 * arrastre la creación de la que cuelga, que es exactamente lo contrario.
 */
export function dependenciasDeOperacionesDeDocumento(
  operaciones: readonly OperacionDeDocumento[],
): number[][] {
  const creaPorRef = new Map<string, number>();
  operaciones.forEach((o, i) => {
    if (o.op === "seccion.crear" && o.ref?.trim() && !creaPorRef.has(o.ref.trim())) {
      creaPorRef.set(o.ref.trim(), i);
    }
  });

  return operaciones.map((o, i) => {
    const key = "key" in o ? o.key.trim() : null;
    if (!key) return [];
    const origen = creaPorRef.get(key);
    return origen !== undefined && origen !== i ? [origen] : [];
  });
}
