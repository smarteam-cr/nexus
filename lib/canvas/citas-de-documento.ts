/**
 * lib/canvas/citas-de-documento.ts — QUÉ TOCAR, DICHO POR LO QUE DICE.
 *
 * ── EL PROBLEMA QUE ESTO RESUELVE ─────────────────────────────────────────────────────────────
 * Hasta hoy el chat identificaba qué cambiar por COORDENADAS: `campo: "items.2.detail"`,
 * `posicion: 1`. El modelo tenía que CALCULAR esos índices sobre un render que lee de corrido, y
 * los calcula mal — es la debilidad documentada de JSON Patch (RFC 6902), no un defecto de acá.
 * Elías lo vio en pantalla: pidió cambiar la caja que dice «LO QUE CUESTA HOY» y el chat nunca la
 * encontró.
 *
 * Aider, Notion y Lovable identifican por CONTENIDO: el modelo cita el texto tal como lo ve y el
 * sistema lo busca. Eso es lo que hace este módulo. La operación gana un campo `cita` y la app
 * resuelve la coordenada leyendo el documento de AHORA.
 *
 * ── ⛔ POR QUÉ `cita` Y `ancla` SON DOS CAMPOS, Y NO UNO ──────────────────────────────────────
 * Se parecen —los dos son un pedazo de texto del documento— y fusionarlos es la simplificación
 * que parece obvia. **Hacen trabajos distintos y COMPONEN:**
 *
 *   · la `cita` resuelve CUÁL, y se consume al preparar el acuerdo;
 *   · el `ancla` protege QUE SIGA SIENDO ÉSE entre acordar y aplicar — el CSE puede reordenar la
 *     lista a mano en el editor mientras el acuerdo espera abajo, y la coordenada resuelta
 *     apuntaría a otro ítem, en silencio.
 *
 * Y el `ancla` la SOBRESCRIBE la app (`prepararOperacionesDeDocumento`): una cita guardada ahí se
 * destruiría antes de que nadie la lea.
 *
 * ── ⛔ AMBIGÜEDAD ES RECHAZO, NUNCA «EL MÁS PARECIDO» ─────────────────────────────────────────
 * Si dos lugares dicen lo mismo, este módulo NO elige: devuelve el rechazo con las opciones. Y ese
 * rechazo viaja por el canal que ya existe —el `tool_result` del reintento—, así que el modelo lo
 * lee y corrige EN LA MISMA LLAMADA, sin gastarle un turno a la persona.
 *
 * ⚠ NO se quitan tildes al comparar: «más» y «mas» son palabras distintas, y una propuesta que
 * confunda las dos es exactamente la clase de cambio plausible-y-equivocado que este vocabulario
 * existe para impedir.
 */

/** El nodo de schema, con la forma mínima que este módulo mira. */
type NodoDeSchema = { type?: string; properties?: Record<string, unknown>; items?: unknown };

/**
 * Espejo de `MAX_SEGMENTOS` del resolver de rutas: enumerar más hondo produciría coordenadas que
 * el ejecutor después rechaza por profundidad.
 */
const MAX_PROFUNDIDAD = 6;

/** Tope de hojas por sección. Una sección real tiene decenas; esto frena una data patológica. */
const MAX_HOJAS = 400;

/** Cuánto de la hoja se muestra al listar las opciones de una cita ambigua. */
const LARGO_DE_OPCION = 48;

/** Una hoja de texto del documento, con la coordenada que el ejecutor entiende. */
export interface HojaCitable {
  /** La ruta que va en `campo`: `intro`, `items.2.title`. */
  ruta: string;
  /** El texto que HOY tiene esa hoja. */
  texto: string;
  /**
   * La lista de PRIMER NIVEL que la contiene, si alguna.
   *
   * ⛔ `null` cuando la lista está anidada (`filas.0.celdas`): el ejecutor indexa `data[lista]`
   * con una clave plana, así que una coordenada anidada sería una que no puede aplicar. La hoja
   * sigue sirviendo para `seccion.campo` —su RUTA sí resuelve—, solo no para operaciones de ítem.
   */
  lista: string | null;
  /** La posición dentro de esa lista de primer nivel. */
  posicion: number | null;
}

/**
 * Cómo se comparan dos textos: minúsculas, espacios colapsados, comillas del borde afuera.
 *
 * ⚠ Las comillas se sacan porque el modelo cita como se cita en castellano —«así»— y esa comilla
 * no está en el documento. Sin esto, toda cita bien formada falla.
 */
export function normalizarCita(v: string): string {
  return v
    .replace(/[«»""''"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Enumera todas las hojas de texto CON CONTENIDO de una sección, con su coordenada. */
export function hojasCitables(schema: unknown, data: unknown): HojaCitable[] {
  const salida: HojaCitable[] = [];
  recorrer(schema, data, "", null, null, salida, 0);
  return salida;
}

function recorrer(
  nodo: unknown,
  valor: unknown,
  ruta: string,
  lista: string | null,
  posicion: number | null,
  salida: HojaCitable[],
  profundidad: number,
): void {
  if (salida.length >= MAX_HOJAS || profundidad > MAX_PROFUNDIDAD) return;
  const n = nodo as NodoDeSchema | undefined;

  if (n?.type === "string") {
    /* Una hoja vacía no se puede citar: no hay texto que el modelo pueda haber leído. */
    if (typeof valor === "string" && valor.trim() && ruta) {
      salida.push({ ruta, texto: valor, lista, posicion });
    }
    return;
  }

  if (n?.type === "object") {
    const obj = valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
    for (const [k, sub] of Object.entries(n.properties ?? {})) {
      recorrer(sub, obj[k], ruta ? `${ruta}.${k}` : k, lista, posicion, salida, profundidad + 1);
    }
    return;
  }

  if (n?.type === "array") {
    const arr = Array.isArray(valor) ? valor : [];
    /* ⛔ Solo las listas de PRIMER NIVEL producen coordenada de ítem — ver `HojaCitable.lista`. */
    const listaDeAca = ruta.includes(".") ? null : ruta;
    arr.forEach((it, i) => {
      recorrer(
        n.items,
        it,
        `${ruta}.${i}`,
        listaDeAca,
        listaDeAca === null ? null : i,
        salida,
        profundidad + 1,
      );
    });
  }
}

/** Lo que sale de resolver una cita contra una sección. */
export type ResolucionDeCita =
  | { ok: true; hoja: HojaCitable }
  | { ok: false; motivo: string };

const recortar = (v: string): string =>
  v.length > LARGO_DE_OPCION ? `${v.slice(0, LARGO_DE_OPCION)}…` : v;

/**
 * Encuentra la ÚNICA hoja que dice lo que la cita dice.
 *
 * Dos vueltas, en este orden y con este motivo:
 *   1. **Igualdad exacta.** Una cita que reproduce la hoja entera es la intención más clara que
 *      existe, y tiene que ganarle a las hojas que apenas la contienen.
 *   2. **La hoja CONTIENE la cita.** El modelo cita un fragmento de un párrafo largo, que es lo
 *      que hace la gente al hablar.
 *
 * ⛔ Dentro de cada vuelta NO hay desempate: dos coincidencias son un rechazo con las opciones.
 * «El más parecido» es exactamente el mecanismo que escribe en la tarjeta equivocada sin que nadie
 * se entere.
 */
export function resolverCita(hojas: readonly HojaCitable[], cita: string): ResolucionDeCita {
  const q = normalizarCita(cita);
  if (!q) return { ok: false, motivo: "la cita llegó vacía" };

  const conNormal = hojas.map((h) => ({ h, n: normalizarCita(h.texto) }));

  for (const candidatas of [
    conNormal.filter((c) => c.n === q),
    conNormal.filter((c) => c.n.includes(q)),
  ]) {
    if (candidatas.length === 1) return { ok: true, hoja: candidatas[0].h };
    if (candidatas.length > 1) {
      const opciones = candidatas.slice(0, 4).map((c) => `«${recortar(c.h.texto)}»`).join(" · ");
      return {
        ok: false,
        motivo:
          `«${recortar(cita)}» aparece en ${candidatas.length} lugares de esa sección ` +
          `(${opciones}${candidatas.length > 4 ? " · …" : ""}): cita el texto completo del que quieres cambiar`,
      };
    }
  }

  return { ok: false, motivo: `«${recortar(cita)}» no aparece en esa sección` };
}
