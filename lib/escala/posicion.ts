/**
 * lib/escala/posicion.ts — la posición de un cliente en la Escala, tal como la guardan los documentos.
 * PURO: lo usan el renderer de la sección (navegador), los generadores y las pruebas.
 *
 * ── UNA SOLA FORMA EN LOS CUATRO DOCUMENTOS ─────────────────────────────────
 * La Propuesta la ESTIMA, el Kickoff dice DESDE DÓNDE se arranca, el Diagnóstico la UBICA con
 * evidencia y la Entrega la DEVUELVE como punto de partida. Es el mismo dato en cuatro momentos, así
 * que tiene una sola forma y un solo renderer: si cada documento la guardara a su manera, la Entrega
 * no podría leer lo que midió el Diagnóstico.
 *
 * Todas las hojas son texto (regla del motor: `coerceToSchema` vacía lo que no es string). El nivel
 * se guarda por su NOMBRE —«Funcional»—, que es la grafía que el reglamento manda emitir y comparar;
 * la cifra se deriva al pintar.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ──────────────────────────────────────────────
 * No traduce los diagnósticos viejos. Los tres que existían antes de la 5.2 guardan tarjetas «N/5»
 * medidas con la v4, otra vara: presentarlos como punto de partida en 5.2 sería afirmar algo que
 * nadie midió. Se siguen viendo como estaban (`esPosicionLegada`) y la Entrega no los usa.
 */
import { NIVELES_ESCALA, type NombreDeNivelEscala } from "./fuente";

export interface AreaEnLaEscala {
  /** «Ventas», «Marketing», «Servicio». */
  area: string;
  /** Nivel de la base operativa (x.1–x.4), por su nombre. Vacío = sin evidencia para ubicarla. */
  base: string;
  /** La dimensión que marca ese piso y su evidencia, en una línea. */
  basePiso: string;
  /** Nivel de la producción (x.5–x.8), por su nombre. */
  produccion: string;
  produccionPiso: string;
  /** La lectura de la brecha entre capas, en una frase. */
  brecha: string;
  /** Solo si una capa está cerca de cruzar al siguiente nivel. */
  cercania: string;
  /** El nivel al que apunta el proyecto. */
  meta: string;
}

export interface PosicionEnLaEscala {
  intro: string;
  areas: AreaEnLaEscala[];
  /** Cuándo se vuelve a medir. */
  remedicion: string;
}

export const POSICION_VACIA: PosicionEnLaEscala = { intro: "", areas: [], remedicion: "" };

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/* El agente escribe en el idioma del documento (`__lang`): una propuesta en inglés trae
   «Functional». Se reconocen las dos grafías y se pinta la del documento. */
const VALOR_POR_NOMBRE: Record<string, number> = {
  deficiente: 1,
  deficient: 1,
  inicial: 2,
  initial: 2,
  funcional: 3,
  functional: 3,
  eficiente: 4,
  efficient: 4,
  optimo: 5,
  optimal: 5,
};

/** «Funcional», «3 · Funcional», «functional», «3/5» → 3. `null` si no nombra un nivel. */
export function valorDeNivel(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  const t = plano(texto);
  for (const [nombre, valor] of Object.entries(VALOR_POR_NOMBRE)) {
    if (new RegExp(`\\b${nombre}\\b`).test(t)) return valor;
  }
  const cifra = t.match(/^\s*([1-5])\b/);
  return cifra ? Number(cifra[1]) : null;
}

export function nombreDeNivel(valor: number | null): NombreDeNivelEscala | null {
  return valor && valor >= 1 && valor <= 5 ? NIVELES_ESCALA[valor - 1] : null;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * La posición guardada en una sección, o `null` si no ubica ninguna área. Un área sin nivel en
 * ninguna de sus dos capas no cuenta: sin evidencia no hay nivel, y una fila vacía no es un dato.
 */
export function leerPosicion(data: unknown): PosicionEnLaEscala | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const areas = (Array.isArray(d.areas) ? d.areas : [])
    .map((crudo): AreaEnLaEscala => {
      const a = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
      return {
        area: texto(a.area),
        base: texto(a.base),
        basePiso: texto(a.basePiso),
        produccion: texto(a.produccion),
        produccionPiso: texto(a.produccionPiso),
        brecha: texto(a.brecha),
        cercania: texto(a.cercania),
        meta: texto(a.meta),
      };
    })
    .filter((a) => a.area && (valorDeNivel(a.base) !== null || valorDeNivel(a.produccion) !== null));
  if (areas.length === 0) return null;
  return { intro: texto(d.intro), areas, remedicion: texto(d.remedicion) };
}

/** ¿Es una sección de escala de ANTES de la 5.2 (tarjetas «N/5», sin áreas)? */
export function esPosicionLegada(data: unknown): boolean {
  const d = (data && typeof data === "object" ? data : {}) as { areas?: unknown; metrics?: unknown };
  const sinAreas = !Array.isArray(d.areas) || d.areas.length === 0;
  return sinAreas && Array.isArray(d.metrics) && d.metrics.length > 0;
}

/**
 * La primera remedición: entre 60 y 90 días después de entregar. El plazo es del reglamento —
 * varios criterios de Funcional describen comportamiento sostenido, y eso no se ve el día de la
 * entrega—.
 */
export function ventanaDeRemedicion(entrega: Date): { desde: Date; hasta: Date } {
  const DIA = 86_400_000;
  return { desde: new Date(entrega.getTime() + 60 * DIA), hasta: new Date(entrega.getTime() + 90 * DIA) };
}

export function textoDeVentana(v: { desde: Date; hasta: Date }, lang: "es" | "en" = "es"): string {
  const f = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return lang === "en"
    ? `Between ${f.format(v.desde)} and ${f.format(v.hasta)}`
    : `Entre el ${f.format(v.desde)} y el ${f.format(v.hasta)}`;
}

/**
 * La sección de la ENTREGA, armada sin modelo: el punto de partida que midió el Diagnóstico, la
 * meta del proyecto y la ventana en que se vuelve a medir.
 *
 * ⛔ No declara un nivel nuevo, y no hay campo por donde pueda hacerlo: el reglamento dice que el
 * cambio se comprueba en la remedición. Es la misma doctrina de la Entrega —el agente no escribe
 * números— llevada a la Escala.
 */
export function posicionParaLaEntrega(
  diagnostico: PosicionEnLaEscala | null,
  fechaDeEntrega: Date,
): PosicionEnLaEscala {
  if (!diagnostico) return POSICION_VACIA;
  return {
    intro:
      "Así arrancaste según el diagnóstico, y a dónde apuntaba este proyecto. El nivel nuevo no se declara hoy: " +
      "varias señales son de comportamiento sostenido y solo se ven después de operar un tiempo.",
    areas: diagnostico.areas.map((a) => ({ ...a, cercania: "" })),
    remedicion: `${textoDeVentana(ventanaDeRemedicion(fechaDeEntrega))} volvemos a medir con las mismas dimensiones.`,
  };
}

/** La posición en texto plano, para dársela a otro agente como antecedente. */
export function posicionParaPrompt(p: PosicionEnLaEscala): string {
  const capa = (nombre: string, nivel: string, piso: string) =>
    nivel ? `${nombre} ${nivel}${piso ? ` (piso: ${piso})` : ""}` : `${nombre} sin nivel`;
  return p.areas
    .map((a) =>
      [
        `- ${a.area}: ${capa("base operativa", a.base, a.basePiso)}; ${capa("producción", a.produccion, a.produccionPiso)}.`,
        a.brecha ? `  Brecha: ${a.brecha}` : "",
        a.meta ? `  Meta con el proyecto: ${a.meta}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}
