/**
 * lib/escala/preparacion.ts — la lectura «Preparación para engagement avanzado» de una empresa (N6). PURO.
 *
 * Es una lectura APARTE del nivel: no lo cambia. Dice si la empresa está lista para personalizar a cada persona
 * en todos sus canales y medir cuánto agrega eso contra un grupo de control:
 *   · «Lista»: cumple el perfil, el tráfico, la base, el nivel de Marketing y los cimientos.
 *   · «Casi lista»: cumple lo demás y le faltan cimientos (es lo que Smarteam vende antes de la plataforma).
 *   · «Todavía no»: no cumple el perfil, el tráfico, la base o el nivel de Marketing (su camino es HubSpot y
 *     SmartLoop).
 *   · «Falta saber»: le falta un dato para decidir. No adivina: dice cuál.
 * Lo que pide cada estado, los dos umbrales y los cimientos salen del TEXTO de la escala
 * (`Escala.preparacion`, que lee `parsear.ts`): se editan en el borrador, no aquí. Una versión que no trae la
 * lectura (la 8.9.1) no da ninguna (`null`). No nombra herramientas: lo de Insider vive en el mapa.
 *
 * El tráfico y la base llegan por RANGOS (los datos de la empresa, `lib/clients/datos-de-la-empresa.ts`, los
 * mismos de HubSpot). Un rango cumple si empieza en el umbral o más arriba, no cumple si termina en el umbral o
 * más abajo, y si el umbral cae adentro queda por confirmar (hoy, la base de «de mil a 10 mil» contra 5.000).
 * Plan: docs/escala-engagement-avanzado-plan.md · Decisión: DECISIONS › «La escala 9.0 con lo de Insider».
 */
import { aplica, type Perfil } from "./documento/perfil";
import { LETRAS, type Criterio, type Despues, type Escala, type Letra } from "./documento/tipos";

export type EstadoDePreparacion = "lista" | "casi-lista" | "todavia-no" | "falta-saber";

export const ETIQUETA_DE_PREPARACION: Record<EstadoDePreparacion, string> = {
  lista: "Lista",
  "casi-lista": "Casi lista",
  "todavia-no": "Todavía no",
  "falta-saber": "Falta saber",
};

/** Un rango de los datos de la empresa: desde (incluido) hasta (sin incluir); `null` = sin techo. */
type Rango = { desde: number; hasta: number | null; etiqueta: string };

/** Los rangos del tráfico al mes (las opciones de `trafico` en los datos de la empresa y en HubSpot). */
export const RANGOS_DE_TRAFICO: Readonly<Record<string, Rango>> = {
  menos_10k: { desde: 0, hasta: 10_000, etiqueta: "menos de 10 mil visitas al mes" },
  "10k_50k": { desde: 10_000, hasta: 50_000, etiqueta: "de 10 mil a 50 mil visitas al mes" },
  "50k_200k": { desde: 50_000, hasta: 200_000, etiqueta: "de 50 mil a 200 mil visitas al mes" },
  "200k_1m": { desde: 200_000, hasta: 1_000_000, etiqueta: "de 200 mil a 1 millón de visitas al mes" },
  mas_1m: { desde: 1_000_000, hasta: null, etiqueta: "más de 1 millón de visitas al mes" },
};

/** Los rangos de la base con consentimiento (las opciones de `baseConsentimiento`). */
export const RANGOS_DE_BASE: Readonly<Record<string, Rango>> = {
  menos_1k: { desde: 0, hasta: 1_000, etiqueta: "menos de mil contactos" },
  "1k_10k": { desde: 1_000, hasta: 10_000, etiqueta: "de mil a 10 mil contactos" },
  "10k_50k": { desde: 10_000, hasta: 50_000, etiqueta: "de 10 mil a 50 mil contactos" },
  "50k_200k": { desde: 50_000, hasta: 200_000, etiqueta: "de 50 mil a 200 mil contactos" },
  mas_200k: { desde: 200_000, hasta: null, etiqueta: "más de 200 mil contactos" },
};

/** ¿El rango pasa el umbral? `null` si el umbral cae adentro del rango. */
export function rangoCumple(r: Rango, umbral: number): boolean | null {
  if (r.desde >= umbral) return true;
  if (r.hasta !== null && r.hasta <= umbral) return false;
  return null;
}

/** Lo que se sabe de la empresa. Cada dato puede faltar (`null`). */
export interface EntradaDeLaPreparacion {
  /** `empresas` · `personas` · `ambos` (el dato «A quién le vende»). */
  aQuienVende: string | null;
  /** Qué pasa después de la venta (el perfil de la exploración, o el de la empresa). */
  despues: Despues | null;
  /** La clave del rango del tráfico (`50k_200k`). */
  trafico: string | null;
  /** La clave del rango de la base (`10k_50k`). */
  base: string | null;
  /** El nivel del área de Marketing, el que da lo confirmado con evidencia. */
  nivelDeMarketing: Letra | null;
  /** Si se cumple cada cimiento, por su identificador. Lo que no está, no se sabe. */
  cimientos: Readonly<Record<string, boolean | null | undefined>>;
}

export interface CimientoDeLaLectura {
  id: string;
  /** El texto del criterio en la vista de la escala (con las palabras de la edición, si hay). */
  texto: string;
  cumple: boolean | null;
}

export interface LecturaDePreparacion {
  estado: EstadoDePreparacion;
  /** Lo que no cumple (perfil, tráfico, base, Marketing), en palabras. Con algo aquí, «Todavía no». */
  noCumple: string[];
  /** Lo que falta saber para decidir, en palabras. */
  faltaSaber: string[];
  /** Los cimientos que valen para esta empresa (los de su edición incluidos), con si se cumplen. */
  cimientos: CimientoDeLaLectura[];
  /** Lo que dice la escala del estado, para mostrarlo tal cual. */
  queDiceLaEscala: string | null;
  umbrales: { trafico: number | null; base: number | null };
}

const LETRAS_DE_FUNCIONAL_O_MAS: readonly Letra[] = ["F", "E", "O"];
/** 50000 → «50.000», como escribe los números la escala. */
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Lo que dice la escala de la lectura, para UNA vista (su edición y su perfil): los umbrales, lo que dice
 * cada estado y los cimientos que existen en esa vista y le aplican, con su texto. Serializable: lo arma el
 * servidor (la escala del lienzo) y la pantalla la evalúa con `leerPreparacion`.
 */
export interface PreparacionDeLaVista {
  umbrales: { trafico: number | null; base: number | null };
  estados: { lista: string | null; casiLista: string | null; todaviaNo: string | null };
  cimientos: { id: string; texto: string; dimension: string; letra: Letra; riesgo: boolean }[];
  /** «Funcional», «Inicial»…: los nombres de los niveles, para decir lo que no cumple. */
  niveles: { letra: Letra; nombre: string }[];
}

/**
 * La lectura de la escala VISTA con la edición de la empresa (`aplicarEdicion`): un cimiento que no existe en
 * esa vista —el catálogo de otra edición— o que no aplica a su perfil, no cuenta. null si la versión no la trae.
 */
export function preparacionDeLaVista(escala: Pick<Escala, "preparacion" | "areas" | "niveles">, perfil: Perfil): PreparacionDeLaVista | null {
  const p = escala.preparacion;
  if (!p) return null;
  const donde = new Map<string, { c: Criterio; dimension: string; letra: Letra }>();
  for (const a of escala.areas) for (const d of a.dimensiones) for (const n of d.niveles) for (const c of n.criterios) donde.set(c.id, { c, dimension: d.id, letra: n.letra });
  return {
    umbrales: { trafico: p.umbralDeTrafico, base: p.umbralDeBase },
    estados: p.estados,
    cimientos: p.cimientos.flatMap((id) => {
      const x = donde.get(id);
      return x && aplica(x.c, perfil) ? [{ id, texto: x.c.texto, dimension: x.dimension, letra: x.letra, riesgo: x.c.riesgo }] : [];
    }),
    niveles: escala.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
  };
}

/**
 * ¿Se cumple un cimiento? Lo marcado manda. Sin marca, uno de Funcional o de Eficiente se da por cumplido si su
 * dimensión está confirmada en ese nivel o más arriba (la regla estricta: estar en un nivel es cumplir todo lo que lo
 * decide). Uno de RIESGO no decide el nivel, así que el nivel no dice nada de él: cuenta solo si se marca.
 */
export function cumpleElCimiento(
  c: Pick<PreparacionDeLaVista["cimientos"][number], "letra" | "riesgo">,
  marca: "tiene" | "no_tiene" | "no_se" | null | undefined,
  nivelDeLaDimension: Letra | null,
): boolean | null {
  if (marca === "tiene") return true;
  if (marca === "no_tiene") return false;
  if (c.riesgo || !nivelDeLaDimension) return null;
  return LETRAS.indexOf(nivelDeLaDimension) >= LETRAS.indexOf(c.letra) ? true : null;
}

/** La lectura de una empresa. */
export function leerPreparacion(p: PreparacionDeLaVista, e: EntradaDeLaPreparacion): LecturaDePreparacion {
  const noCumple: string[] = [];
  const faltaSaber: string[] = [];

  // 1 · El perfil: le vende a personas y el cliente vuelve.
  if (e.aQuienVende === "empresas") noCumple.push("Le vende solo a empresas.");
  else if (e.aQuienVende !== "personas" && e.aQuienVende !== "ambos") faltaSaber.push("A quién le vende: a empresas, a personas o a las dos.");
  if (e.despues === "única") noCumple.push("Su cliente compra una vez: no vuelve.");
  else if (e.despues === null) faltaSaber.push("Qué pasa después de la venta: si el cliente vuelve a comprar o tiene una relación continua.");

  // 2 · El tráfico y la base, por rangos.
  const porRango = (clave: string | null, rangos: Readonly<Record<string, Rango>>, umbral: number | null, que: string, unidad: string, poco: string) => {
    if (umbral === null) return; // la escala no lo trae legible: lo avisa al publicar (`avisosDeLectura`)
    const r = clave ? rangos[clave] : undefined;
    if (!r) {
      faltaSaber.push(`${que} (la lectura pide ${miles(umbral)} ${unidad} o más).`);
      return;
    }
    const cumple = rangoCumple(r, umbral);
    if (cumple === false) noCumple.push(`${poco}: ${r.etiqueta}, y la lectura pide ${miles(umbral)} o más.`);
    if (cumple === null) faltaSaber.push(`Si ${que.toLowerCase()} llega a ${miles(umbral)} ${unidad}: hoy dice «${r.etiqueta}».`);
  };
  porRango(e.trafico, RANGOS_DE_TRAFICO, p.umbrales.trafico, "El tráfico del sitio o la app", "visitas al mes", "Tiene poco tráfico");
  porRango(e.base, RANGOS_DE_BASE, p.umbrales.base, "La base con permiso para recibir mensajes", "contactos", "Su base es chica");

  // 3 · Marketing en Funcional o más.
  const nombre = (l: Letra) => p.niveles.find((n) => n.letra === l)?.nombre ?? l;
  if (e.nivelDeMarketing === null) faltaSaber.push("El nivel de Marketing: súmala a la exploración y confirma sus dimensiones con evidencia.");
  else if (!LETRAS_DE_FUNCIONAL_O_MAS.includes(e.nivelDeMarketing)) noCumple.push(`Marketing está en ${nombre(e.nivelDeMarketing)}: la lectura pide ${nombre("F")} o más.`);

  // 4 · Los cimientos.
  const cimientos: CimientoDeLaLectura[] = p.cimientos.map((c) => ({ id: c.id, texto: c.texto, cumple: e.cimientos[c.id] ?? null }));

  let estado: EstadoDePreparacion;
  if (noCumple.length) estado = "todavia-no";
  else if (faltaSaber.length) estado = "falta-saber";
  else if (cimientos.some((c) => c.cumple === false)) estado = "casi-lista";
  else if (cimientos.some((c) => c.cumple === null)) {
    estado = "falta-saber";
    faltaSaber.push("Si cumple los cimientos que no están marcados.");
  } else estado = "lista";

  const queDiceLaEscala =
    estado === "lista" ? p.estados.lista : estado === "casi-lista" ? p.estados.casiLista : estado === "todavia-no" ? p.estados.todaviaNo : null;
  return { estado, noCumple, faltaSaber, cimientos, queDiceLaEscala, umbrales: p.umbrales };
}
