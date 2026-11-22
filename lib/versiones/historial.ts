/**
 * lib/versiones/historial.ts — el HISTORIAL DE VERSIONES de un documento, igual para todos (Elías, 21 nov; DECISIONS
 * «Historial de versiones»). Client-safe: lo usan el popup y las rutas.
 *
 * Una versión es un estado del documento con quién, cuándo y cómo nació (`TipoDeVersion`). Las filas viven en
 * `VersionDeDocumento` (un canvas, el Resumen de La escala o el cronograma). Acá se decide cómo se ven:
 *   · cuál es la ACTUAL: el documento vivo. Si es igual a la última guardada, esa; si no, una fila arriba «con cambios
 *     sin guardar como versión» (lo escrito a mano no se guarda con cada tecla);
 *   · cuál es «LO QUE VE EL CLIENTE»: la última guardada al publicar, mientras el documento siga publicado;
 *   · el nombre de cómo nació, también para las filas de antes del 21 nov, que no tienen `tipo` y se deducen de `origen`.
 */

export const TIPOS_DE_VERSION = ["ia", "edicion", "publicado", "restaurado", "presentado", "congelado", "guardada"] as const;
export type TipoDeVersion = (typeof TIPOS_DE_VERSION)[number];

/** Cómo nació, en palabras de la pantalla. */
export const ETIQUETA_DEL_TIPO: Record<TipoDeVersion, string> = {
  ia: "Rehecho con IA",
  edicion: "Editado",
  publicado: "Publicado",
  restaurado: "Vuelta a una anterior",
  presentado: "Presentado al cliente",
  congelado: "Congelado",
  guardada: "Guardada",
};

export function esTipoDeVersion(v: unknown): v is TipoDeVersion {
  return typeof v === "string" && (TIPOS_DE_VERSION as readonly string[]).includes(v);
}

/**
 * El tipo de una fila. Las de antes del 21 nov no lo tienen: se deduce de `origen`, el texto con que se guardaron
 * («Antes de regenerar», «Presentado al cliente (v2)», «Handoff congelado con el botón…»). Una foto tomada ANTES de algo
 * es lo que había en ese momento, sin saber cómo nació: «Guardada».
 */
export function tipoDeLaFila(tipo: string | null | undefined, origen: string): TipoDeVersion {
  if (esTipoDeVersion(tipo)) return tipo;
  if (/^Presentado al cliente/i.test(origen)) return "presentado";
  if (/congelado/i.test(origen)) return "congelado";
  return "guardada";
}

/**
 * Lo que había antes de reemplazarlo: si ya hay versiones y la última no es igual, alguien lo cambió a mano después
 * («Editado»); si no hay ninguna, no se sabe cómo nació («Guardada»).
 */
export function tipoDeLoQueHabia(ultimaHuella: string | null | undefined, huella: string): TipoDeVersion {
  return ultimaHuella && ultimaHuella !== huella ? "edicion" : "guardada";
}

/** Una fila guardada, como llega de la base (ya serializada). */
export interface FilaDeVersion {
  id: string;
  tipo: string | null;
  /** El texto con que se guardó: lo que explica la versión («Por la nota de Paula», «Volvió la del 20 nov»). */
  origen: string;
  creadaPor: string | null;
  /** ISO */
  createdAt: string;
  huella: string;
  publicada: boolean;
}

/** Una versión del historial, como la pinta el popup. */
export interface VersionDelHistorial {
  /** null: la actual con cambios que todavía no se guardaron como versión (no se puede «usar»: ya es la actual). */
  id: string | null;
  tipo: TipoDeVersion;
  etiqueta: string;
  nota: string | null;
  /** Correo de quien la hizo; null: Nexus o no se sabe. */
  creadaPor: string | null;
  /** ISO; null en la actual sin guardar. */
  en: string | null;
  esActual: boolean;
  esLoQueVeElCliente: boolean;
  /** Solo para leer (las corridas viejas del handoff): sin «Usar esta versión». */
  soloLectura: boolean;
}

/** Las notas que son solo el nombre del tipo no se repiten debajo. */
const NOTAS_QUE_NO_DICEN_NADA = new Set(["Antes de regenerar", "Después de rehacerlo con IA", "Al publicar", "Respaldo inicial"]);

/**
 * Arma la lista, la más nueva primero. `huellaActual`: la del documento vivo (null: está vacío, no hay actual).
 * `publicado`: si el documento sigue publicado al cliente (sin eso, ninguna lleva «Lo que ve el cliente»).
 */
export function armarHistorial(
  filas: readonly FilaDeVersion[],
  o: {
    huellaActual: string | null;
    publicado: boolean;
    soloLectura?: ReadonlySet<string>;
    /**
     * Cuando el documento sabe cuál ve el cliente por otro lado: el diagnóstico comparte la última PRESENTADA (su id), y
     * el Requerimiento técnico se ve vivo («actual»: lo que ve el cliente es la actual). Sin esto, la última publicada.
     */
    delCliente?: string | "actual" | null;
  },
): VersionDelHistorial[] {
  // A la misma hora (dos guardadas en el mismo milisegundo), la de id mayor: los cuid crecen con el tiempo.
  const ordenadas = [...filas].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const idDelCliente = !o.publicado
    ? null
    : o.delCliente !== undefined && o.delCliente !== "actual"
      ? o.delCliente
      : o.delCliente === "actual"
        ? null
        : (ordenadas.find((f) => f.publicada)?.id ?? null);
  const ultimaEsLaActual = !!o.huellaActual && ordenadas[0]?.huella === o.huellaActual;
  const lista: VersionDelHistorial[] = ordenadas.map((f, i) => {
    const tipo = tipoDeLaFila(f.tipo, f.origen);
    const nota = f.origen.trim();
    return {
      id: f.id,
      tipo,
      etiqueta: ETIQUETA_DEL_TIPO[tipo],
      nota: nota && !NOTAS_QUE_NO_DICEN_NADA.has(nota) ? nota : null,
      creadaPor: f.creadaPor,
      en: f.createdAt,
      esActual: i === 0 && ultimaEsLaActual,
      esLoQueVeElCliente: f.id === idDelCliente,
      soloLectura: o.soloLectura?.has(f.id) ?? false,
    };
  });
  if (o.publicado && o.delCliente === "actual") for (const v of lista) v.esLoQueVeElCliente = v.esActual;
  if (o.huellaActual && !ultimaEsLaActual) {
    lista.unshift({
      id: null,
      tipo: "edicion",
      etiqueta: ETIQUETA_DEL_TIPO.edicion,
      nota: ordenadas.length ? "Con cambios que todavía no se guardaron como versión." : "Todavía no hay versiones guardadas de este documento.",
      creadaPor: null,
      en: null,
      esActual: true,
      esLoQueVeElCliente: !!o.publicado && o.delCliente === "actual",
      soloLectura: false,
    });
  }
  return lista;
}

/** JSON con las claves ordenadas y sin las `undefined`: lo mismo leído en el servidor y llegado a la pantalla. */
export function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** cyrb53 del texto, en base 36. No es seguridad: solo dice si algo cambió (igual en el servidor y en el navegador). */
export function huellaDeTexto(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** La huella de un contenido cualquiera: dos iguales dan la misma aunque sus claves vengan en otro orden. */
export function huellaDeContenido(v: unknown): string {
  return huellaDeTexto(jsonCanonico(v));
}
