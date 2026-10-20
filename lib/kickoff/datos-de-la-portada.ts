/**
 * lib/kickoff/datos-de-la-portada.ts
 *
 * La FILA DE DATOS CLAVE de la portada del kickoff («8 semanas · 26 oct 2026 · 5 fases»), como una
 * lista que el consultor edita igual que las etiquetas: agrega un dato («3 integraciones»,
 * «Go-live: diciembre»), borra el que no aplica, cambia el texto y la etiqueta, y los reordena
 * (Valentina y Elías, 2026-10-20). Puro y client-safe: lo usan el componente del hero (editor, vista
 * del cliente y PDF, las tres por el mismo camino) y sus pruebas.
 *
 * ── DÓNDE VIVE ───────────────────────────────────────────────────────────────────────────────────
 * En `data.datos` del bloque del hero, FUERA del esquema del agente: `preserveNonSchemaKeys` la
 * conserva en cada regeneración (como `brands` y `coverImageUrl`). Ausente = nadie tocó la fila, y
 * se pintan los tres de siempre.
 *
 * ── LOS DERIVADOS ───────────────────────────────────────────────────────────────────────────────
 * Un dato con `fuente` (duración, arranque, fases) toma su número del CRONOGRAMA mientras su `valor`
 * esté vacío: escribirle un texto lo pisa, vaciarlo devuelve el número vivo. Es la misma regla
 * híbrida de las tres `metrica*` que ya escribía el chat (DECISIONS, 2026-08-22), ahora por dato.
 * El de arranque no se escribe: es el calendario que mueve el ancla del cronograma.
 *
 * ── LAS `metrica*` DEL CHAT ─────────────────────────────────────────────────────────────────────
 * El chat sigue escribiendo `metricaDuracion/Arranque/Fases` (su esquema no cambió). Para que lo que
 * acuerda no quede escondido detrás de un `valor`, una métrica escrita GANA sobre el valor del dato;
 * y cada edición de la fila las PLIEGA dentro de los datos (`plegarMetricas`) y las borra. Así gana
 * siempre la última escritura, venga del chat o de la mano.
 */
import { timelineSpan } from "@/lib/timeline/weeks";
import { esInstanteDeProyecto } from "@/lib/timeline/fecha-de-arranque";

export type FuenteDelDato = "duracion" | "arranque" | "fases";

export interface DatoDeLaPortada {
  /** Estable: la clave del ítem al arrastrarlo y al borrarlo. */
  id: string;
  /** El número o el texto grande. Vacío en un derivado = sale del cronograma. */
  valor?: string;
  /** El rótulo chico de abajo. Vacío en un derivado = el rótulo de siempre. */
  etiqueta?: string;
  /** Presente = el dato sale del cronograma mientras nadie escriba su `valor`. */
  fuente?: FuenteDelDato;
}

const FUENTES: readonly FuenteDelDato[] = ["duracion", "arranque", "fases"];

/** Los tres de siempre, en su orden. Es lo que se pinta mientras nadie toque la fila. */
export const DATOS_POR_DEFECTO: readonly DatoDeLaPortada[] = FUENTES.map((f) => ({ id: f, fuente: f }));

/** Lo que el hero guarda (los campos de la portada que esta fila lee y escribe). */
export interface CamposDeLaFila {
  datos?: DatoDeLaPortada[];
  metricaDuracion?: string;
  metricaArranque?: string;
  metricaFases?: string;
}

const METRICA_DE: Record<FuenteDelDato, keyof Omit<CamposDeLaFila, "datos">> = {
  duracion: "metricaDuracion",
  arranque: "metricaArranque",
  fases: "metricaFases",
};

/** Lee `data.datos` tolerante a basura. `undefined` = la fila nunca se tocó (≠ lista vacía). */
export function normalizarDatos(raw: unknown): DatoDeLaPortada[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const vistos = new Set<string>();
  const out: DatoDeLaPortada[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || vistos.has(o.id)) continue;
    vistos.add(o.id);
    const fuente = FUENTES.find((f) => f === o.fuente);
    out.push({
      id: o.id,
      ...(typeof o.valor === "string" ? { valor: o.valor } : {}),
      ...(typeof o.etiqueta === "string" ? { etiqueta: o.etiqueta } : {}),
      ...(fuente ? { fuente } : {}),
    });
  }
  return out;
}

/**
 * La lista que se PINTA: la guardada o los tres de siempre, con las métricas del chat encima del
 * valor de su dato derivado (ver el encabezado).
 */
export function datosEfectivos(c: CamposDeLaFila): DatoDeLaPortada[] {
  const base = c.datos ?? DATOS_POR_DEFECTO.map((d) => ({ ...d }));
  return base.map((d) => {
    if (!d.fuente) return d;
    const metrica = c[METRICA_DE[d.fuente]]?.trim();
    return metrica ? { ...d, valor: metrica } : d;
  });
}

/**
 * Lo que se GUARDA después de una edición de la fila: la lista nueva y las tres métricas borradas
 * (ya quedaron plegadas en los datos por `datosEfectivos`, que es de donde parte la edición).
 */
export function plegarMetricas(datos: DatoDeLaPortada[]): Required<Pick<CamposDeLaFila, "datos">> & {
  metricaDuracion: undefined;
  metricaArranque: undefined;
  metricaFases: undefined;
} {
  return {
    datos: datos.map((d) => {
      const valor = d.valor?.trim();
      const etiqueta = d.etiqueta?.trim();
      return {
        id: d.id,
        ...(valor ? { valor: d.valor } : {}),
        ...(etiqueta ? { etiqueta: d.etiqueta } : {}),
        ...(d.fuente ? { fuente: d.fuente } : {}),
      };
    }),
    metricaDuracion: undefined,
    metricaArranque: undefined,
    metricaFases: undefined,
  };
}

/** Id nuevo para un dato agregado a mano (no choca con las fuentes ni con los que ya hay). */
export function idDeDatoNuevo(datos: DatoDeLaPortada[], semilla: () => string): string {
  const usados = new Set(datos.map((d) => d.id));
  let id = `dato-${semilla()}`;
  while (usados.has(id)) id = `dato-${semilla()}`;
  return id;
}

/** Lo que el cronograma aporta a los derivados. `null` = no hay de dónde sacarlo. */
export interface CronogramaParaLaFila {
  semanas: number | null;
  fases: number | null;
  /** ISO del ancla (`anchorStartDate`), o null. */
  arranqueISO: string | null;
}

export interface RotulosDeLaFila {
  duracion: string;
  arranque: string;
  fases: string;
  semanas: string;
  fase: string;
  fasesPlural: string;
  porDefinir: string;
}

export interface DatoResuelto {
  id: string;
  fuente?: FuenteDelDato;
  /** El texto grande que se pinta («8», «26 oct 2026», «3 integraciones»). "" = no hay valor. */
  valor: string;
  /** Solo para un número derivado: «semanas», «fases». */
  unidad?: string;
  etiqueta: string;
  /** `true` si el valor salió del cronograma (nadie lo escribió). */
  derivado: boolean;
  /** `true` si el valor es «Por definir» (arranque sin fecha). */
  porDefinir: boolean;
}

/**
 * Cada dato con su valor final, para las TRES superficies. `fmtFecha` formatea el ancla (lo pasa quien
 * llama para no atar este archivo a un formato).
 */
export function resolverDatos(
  datos: DatoDeLaPortada[],
  crono: CronogramaParaLaFila,
  rotulos: RotulosDeLaFila,
  fmtFecha: (iso: string) => string,
): DatoResuelto[] {
  return datos.map((d) => {
    const escrito = d.valor?.trim() ?? "";
    const etiquetaEscrita = d.etiqueta?.trim() ?? "";
    if (!d.fuente) {
      return { id: d.id, valor: escrito, etiqueta: etiquetaEscrita, derivado: false, porDefinir: false };
    }
    const etiqueta = etiquetaEscrita || rotulos[d.fuente];
    if (escrito) return { id: d.id, fuente: d.fuente, valor: escrito, etiqueta, derivado: false, porDefinir: false };
    if (d.fuente === "arranque") {
      return crono.arranqueISO
        ? { id: d.id, fuente: d.fuente, valor: fmtFecha(crono.arranqueISO), etiqueta, derivado: true, porDefinir: false }
        : { id: d.id, fuente: d.fuente, valor: rotulos.porDefinir, etiqueta, derivado: true, porDefinir: true };
    }
    const n = d.fuente === "duracion" ? crono.semanas : crono.fases;
    if (n == null || n <= 0) {
      return { id: d.id, fuente: d.fuente, valor: "", etiqueta, derivado: true, porDefinir: false };
    }
    const unidad = d.fuente === "duracion" ? rotulos.semanas : n === 1 ? rotulos.fase : rotulos.fasesPlural;
    return { id: d.id, fuente: d.fuente, valor: String(n), unidad, etiqueta, derivado: true, porDefinir: false };
  });
}

/**
 * Lo que la vista del cliente y el PDF pintan: sin los datos vacíos, y nada si lo único que queda es
 * un «Por definir» (una fila que solo dice «Por definir» no informa nada — era la regla de antes:
 * la fila salía con cronograma o con una métrica escrita).
 */
export function datosParaLeer(resueltos: DatoResuelto[]): DatoResuelto[] {
  const conValor = resueltos.filter((r) => r.valor.trim() !== "");
  return conValor.some((r) => !r.porDefinir) ? conValor : [];
}

/**
 * Los números de la fila desde un cronograma (el vivo del editor y del PDF, o el publicado del
 * cliente). Sin fases no hay duración ni cantidad; sin ancla, el arranque queda «Por definir».
 */
export function cronogramaParaLaFila(
  t: { anchorStartDate: string | null; phases: Array<{ durationWeeks: number; startWeek?: number | null }> } | null | undefined,
): CronogramaParaLaFila {
  const phases = t?.phases ?? [];
  return {
    semanas: phases.length > 0 ? timelineSpan(phases) : null,
    fases: phases.length > 0 ? phases.length : null,
    arranqueISO: t?.anchorStartDate ?? null,
  };
}

/** `true` si el cronograma no aporta NADA a la fila (ni fases ni fecha). */
export function cronogramaVacio(c: CronogramaParaLaFila): boolean {
  return c.semanas == null && c.fases == null && !c.arranqueISO;
}

/**
 * La portada CONGELADA en el snapshot del kickoff al «Subir» (`publishedSnapshot.portada`). La vista del
 * cliente la usa cuando el cronograma que puede ver no aporta nada —nunca se publicó, o el CSE lo
 * ocultó del kickoff—: así ve los mismos números que el CSE vio al subir (2026-10-20, Cayalá: el
 * cronograma nunca se había subido y el cliente no veía la fecha de arranque que la portada sí
 * mostraba por dentro). `null` = snapshot viejo, sin portada.
 */
export function normalizarPortadaCongelada(raw: unknown): CronogramaParaLaFila | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  return {
    semanas: num(o.semanas),
    fases: num(o.fases),
    arranqueISO: typeof o.arranqueISO === "string" && esInstanteDeProyecto(o.arranqueISO) ? o.arranqueISO : null,
  };
}
