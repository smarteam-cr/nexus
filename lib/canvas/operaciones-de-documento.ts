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

// ── El vocabulario ────────────────────────────────────────────────────────────────────────────

/** Los cinco valores de alineación no existen acá: el vocabulario no toca presentación. */
export type OperacionDeDocumento =
  // CONTENIDO
  | { op: "seccion.campo"; key: string; campo: string; valor: string; ancla?: string }
  | {
      op: "seccion.item.agregar";
      key: string;
      lista: string;
      valores: Record<string, string>;
      posicion?: number;
    }
  | { op: "seccion.item.borrar"; key: string; lista: string; posicion: number; ancla: string }
  | { op: "seccion.item.mover"; key: string; lista: string; posicion: number; a: number; ancla: string }
  | { op: "seccion.vaciar"; key: string }
  // ESTRUCTURA
  | { op: "seccion.crear"; tipo: string; titulo: string; posicion?: number; ref?: string }
  | { op: "seccion.borrar"; key: string }
  | { op: "seccion.ocultar"; key: string }
  | { op: "seccion.mostrar"; key: string }
  | { op: "seccion.mover"; key: string; posicion: number }
  | { op: "seccion.renombrar"; key: string; titulo: string };

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
  /** El schema de la def. Es contra esto que se resuelven las rutas. */
  schema: unknown;
  oculta: boolean;
  /** `true` si la creó una persona (`custom:*`): son las únicas que se pueden borrar. */
  esCreada: boolean;
  /** `false` en las secciones estructurales (portada, cierre): no se mueven ni se ocultan. */
  movible: boolean;
}

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
  | { tipo: "data"; sectionId: string; data: unknown }
  | { tipo: "oculta"; sectionId: string; oculta: boolean }
  | { tipo: "titulo"; sectionId: string; titulo: string }
  | { tipo: "orden"; sectionIds: string[] }
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
        return { ok: true, r: { contenedor, clave: seg, itemMasProfundo } };
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
      if (ultimo) {
        if (sub.type !== "string") return { ok: false, motivo: `el ítem ${idx + 1} no es un texto` };
        return { ok: true, r: { contenedor: arr, clave: idx, itemMasProfundo } };
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
  return identidadDeItem(res.r.itemMasProfundo);
}

/**
 * Cómo se llama un ítem: el primer campo de texto CON CONTENIDO.
 *
 * ⚠ No «el primero del schema»: un ítem cuyo primer campo esté vacío daría un ancla vacía, o sea
 * ninguna protección justo donde parece haberla.
 */
function identidadDeItem(item: unknown): string | null {
  if (item === undefined || item === null) return null;
  if (typeof item === "string") return item.trim() ? recortarAncla(item) : null;
  if (typeof item === "object") {
    for (const v of Object.values(item as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) return recortarAncla(v);
    }
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
export function anclaDeItem(data: unknown, lista: string, posicion: number): string | null {
  const arr = (data as Record<string, unknown> | null)?.[lista];
  if (!Array.isArray(arr) || posicion < 0 || posicion >= arr.length) return null;
  return identidadDeItem(arr[posicion]);
}

// ── El ejecutor ───────────────────────────────────────────────────────────────────────────────

const clonar = <T,>(v: T): T => structuredClone(v);

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

  for (const o of operaciones) {
    switch (o.op) {
      case "seccion.campo": {
        const s = buscar(o.key);
        if (!s) { rechazar(o, "esa sección ya no está en el documento"); break; }
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
        const nodo = (s.schema as NodoDeSchema)?.properties?.[o.lista] as NodoDeSchema | undefined;
        if (!nodo || nodo.type !== "array") { rechazar(o, `«${o.lista}» no es una lista de esa sección`); break; }
        const items = nodo.items as NodoDeSchema | undefined;
        const arr = (s.data[o.lista] as unknown[] | undefined) ?? [];
        /* Solo entran las propiedades que el schema declara: una key de más se descartaría después
           en silencio, y el CSE habría aprobado una línea que prometía algo que no pasó. */
        const permitidas = new Set(Object.keys(items?.properties ?? {}));
        const desconocidas = Object.keys(o.valores).filter((k) => !permitidas.has(k));
        if (desconocidas.length) {
          rechazar(o, `«${desconocidas[0]}» no es un campo de esa lista`);
          break;
        }
        const nuevo: Record<string, unknown> = {};
        for (const k of permitidas) nuevo[k] = o.valores[k] ?? "";
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
        const arr = s.data[o.lista] as unknown[] | undefined;
        if (!Array.isArray(arr)) { rechazar(o, `«${o.lista}» no es una lista de esa sección`); break; }
        if (o.posicion < 0 || o.posicion >= arr.length) {
          rechazar(o, `esa lista tiene ${arr.length} ítems y se pidió el ${o.posicion + 1}`);
          break;
        }
        /* ⛔ Acá el ancla es OBLIGATORIA y el chequeo NO es condicional: si no se puede
           determinar cómo se llama el ítem que está en esa posición, no se toca. Volverlo
           condicional —«si hay ancla y no coincide»— es la edición que parece natural y apaga la
           protección para toda operación que la app olvidó anclar. */
        const actual = anclaDeItem(s.data, o.lista, o.posicion);
        if (actual !== o.ancla) {
          rechazar(o, `«${o.ancla}» ya no está en esa posición: alguien reordenó la lista`);
          break;
        }
        const next = arr.slice();
        if (o.op === "seccion.item.borrar") {
          next.splice(o.posicion, 1);
        } else {
          const destino = Math.max(0, Math.min(next.length - 1, o.a));
          const [item] = next.splice(o.posicion, 1);
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
        s.data = vacioDeSchema(s.schema) as Record<string, unknown>;
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
        s.label = titulo;
        plan.push({ tipo: "titulo", sectionId: s.id, titulo });
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
        /* ⚠ La sección nueva NO entra a `trabajo`: su id lo genera el servidor, así que una
           operación posterior que la nombre por key no la va a encontrar. Llenarla es del mismo
           acuerdo pero de otra pasada — igual que el cronograma resuelve sus `ref`. */
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
    if (s) plan.push({ tipo: "data", sectionId: s.id, data: s.data });
  }
  if (ordenTocado) {
    plan.push({
      tipo: "orden",
      sectionIds: orden.map((k) => trabajo.get(k)?.id).filter((id): id is string => !!id),
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

  return operaciones.map((o) => {
    switch (o.op) {
      case "seccion.campo":
        return `En «${nombre(o.key)}», ${o.campo} pasa a: «${recortar(o.valor)}»`;
      case "seccion.item.agregar": {
        const primero = Object.values(o.valores).find((v) => v.trim()) ?? "";
        return `Se agrega «${recortar(primero)}» a ${o.lista} de «${nombre(o.key)}»`;
      }
      case "seccion.item.borrar":
        return `Se quita «${o.ancla}» de ${o.lista} de «${nombre(o.key)}»`;
      case "seccion.item.mover":
        return `«${o.ancla}» pasa al lugar ${o.a + 1} de ${o.lista} en «${nombre(o.key)}»`;
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
      case "seccion.renombrar":
        return `«${nombre(o.key)}» pasa a llamarse «${o.titulo}»`;
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
 * Devuelve, por cada operación, los índices de las que dependen de ella.
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

  const dependientes: number[][] = operaciones.map(() => []);
  operaciones.forEach((o, i) => {
    const key = "key" in o ? o.key.trim() : null;
    if (!key) return;
    const origen = creaPorRef.get(key);
    if (origen !== undefined && origen !== i) dependientes[origen].push(i);
  });
  return dependientes;
}
