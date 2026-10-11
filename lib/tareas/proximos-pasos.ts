/**
 * lib/tareas/proximos-pasos.ts — las líneas de «Próximos pasos» de las notas de Gemini. CLIENT-SAFE y puro.
 *
 * Gemini escribe cada compromiso en una línea con el dueño entre corchetes:
 *   «[Lidia Flores] Gestión landing: Coordinar con Alexander la implementación de la página de destino…»
 * Esa línea, tal cual, es la CITA de la tarea. Su id es la huella de su texto normalizado: si Gemini (o una relectura
 * del Doc completo) mueve la línea de lugar, su id no cambia y volver a leer no duplica.
 *
 * El DUEÑO sale solo del corchete. Un nombre en el detalle («Coordinar con Alexander…») es una mención, no un dueño
 * (docs/tareas-plan.md §7.1, punto 3): eso lo resuelve `personas.ts`.
 */
import { partirNotas } from "@/lib/sessions/notas-de-gemini";
import { huellaDeTexto } from "./texto";

export interface LineaDeProximosPasos {
  /** Huella del texto normalizado de la línea: estable aunque la línea cambie de lugar. */
  id: string;
  /** Los nombres dichos en el corchete, en orden. El primero es el dueño; los demás se citan. */
  personas: string[];
  titulo: string;
  detalle: string | null;
  /** La línea literal (sin viñeta): es la cita. */
  texto: string;
}

export interface ParrafoDeDetalles {
  id: string;
  texto: string;
}

/** «[persona] título: detalle». Grupos: 1 persona · 2 título · 3 detalle (sin grupos con nombre: el target es ES2017). */
const LINEA = /^\[([^\]]+)\]\s*([^:]{2,120})(?::\s*(.+))?$/;
const VINETA = /^\s*(?:[-*•·◦▪]|\d+[.)])\s+/;

/** Gemini separa a veces con tabulador vertical (U+000B) en vez de salto de línea. */
export function normalizarSaltos(notas: string): string {
  return notas.replace(/\u000b/g, "\n").replace(/\r\n?/g, "\n");
}

/** «Ana, Luis» o «Ana y Luis» → ["Ana", "Luis"]. */
export function partirPersonas(dicho: string): string[] {
  return dicho
    .split(/\s*(?:,|;|\by\b|&|\/)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Una línea de compromiso, o null si no tiene la forma «[Persona] Título: detalle». */
export function leerLinea(cruda: string): LineaDeProximosPasos | null {
  const texto = cruda.replace(VINETA, "").trim();
  const m = LINEA.exec(texto);
  if (!m) return null;
  const personas = partirPersonas(m[1]);
  if (personas.length === 0) return null;
  return {
    id: huellaDeTexto(texto),
    personas,
    titulo: m[2].trim(),
    detalle: m[3]?.trim() || null,
    texto,
  };
}

/** Los bloques de las notas (resumen, decisiones, próximos pasos, detalles), con los saltos ya normalizados. */
export function bloquesDeLasNotas(notas: string) {
  return partirNotas(normalizarSaltos(notas));
}

/**
 * Las líneas de «Próximos pasos» con dueño entre corchetes. Sin el título de Gemini no hay nada: el nivel 0 no
 * adivina compromisos de un texto suelto (eso es el nivel 2, la conversación completa).
 */
export function itemsDeProximosPasos(notas: string): LineaDeProximosPasos[] {
  const bloques = bloquesDeLasNotas(notas);
  if (!bloques?.proximos) return [];
  const vistas = new Set<string>();
  const salida: LineaDeProximosPasos[] = [];
  for (const l of bloques.proximos.split("\n")) {
    const linea = leerLinea(l);
    if (!linea || vistas.has(linea.id)) continue;
    vistas.add(linea.id);
    salida.push(linea);
  }
  return salida;
}

/**
 * Las líneas de `summary.action_items` (las pocas sesiones que lo traen). Si tienen corchete se leen igual; si no,
 * quedan sin persona y la lectura las manda a «Por asignar» (o a la IA).
 */
export function itemsDeActionItems(items: readonly string[]): LineaDeProximosPasos[] {
  const vistas = new Set<string>();
  const salida: LineaDeProximosPasos[] = [];
  for (const crudo of items) {
    if (typeof crudo !== "string" || !crudo.trim()) continue;
    const conCorchete = leerLinea(crudo);
    const texto = crudo.replace(VINETA, "").trim();
    const linea: LineaDeProximosPasos = conCorchete ?? {
      id: huellaDeTexto(texto),
      personas: [],
      titulo: texto.slice(0, 120),
      detalle: texto.length > 120 ? texto : null,
      texto,
    };
    if (vistas.has(linea.id)) continue;
    vistas.add(linea.id);
    salida.push(linea);
  }
  return salida;
}

/** Los párrafos de «Detalles», numerados por su huella: de ahí sale lo que se terminó, que la retro no repite en los próximos pasos. */
export function parrafosDeDetalles(notas: string): ParrafoDeDetalles[] {
  const bloques = bloquesDeLasNotas(notas);
  if (!bloques?.detalles) return [];
  return bloques.detalles
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40)
    .map((texto) => ({ id: huellaDeTexto(texto), texto }));
}

/** El resumen de la reunión (para buscar grupos), hasta 2.000 caracteres. */
export function resumenDeLasNotas(notas: string): string {
  const bloques = bloquesDeLasNotas(notas);
  return (bloques?.resumen ?? "").slice(0, 2_000);
}
