/**
 * lib/tareas/contexto-de-tarea.ts — el CONTEXTO de una tarea que genera Nexus (Elías, 2026-10-09: «Cada tarea que se
 * genera debe tener una descripción con contexto»). PURO.
 *
 * Lo escribe Nexus al crearla —de las notas de la reunión, de la conversación o del chat— y no se edita: lo de la persona
 * va en «notas». Dice para qué es, para quién y qué se espera, en una a tres frases. Quién lo ve lo decide
 * lib/tareas/serializar.ts (`veElContexto`): el de una reunión, con la regla de su cita.
 *
 * Acá viven las dos piezas que comparten los generadores: limpiar lo que escribe un modelo (con su motivo, para el chat
 * que reclama) y armar uno sin modelo cuando la llamada no está o falla (con el detalle de la línea y el párrafo de la
 * reunión que más se le parece).
 */
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { huellaDeTexto } from "./texto";

/** Lo que mide un contexto como mucho. Tres frases cómodas; más se vuelve un acta. */
export const LARGO_DEL_CONTEXTO = 420;

/** Recorta en el último fin de frase (o de palabra) antes del tope. */
export function recortarContexto(texto: string, tope = LARGO_DEL_CONTEXTO): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= tope) return t;
  const corte = t.slice(0, tope);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
  if (fin > tope * 0.5) return corte.slice(0, fin + 1);
  const espacio = corte.lastIndexOf(" ");
  return `${corte.slice(0, espacio > 0 ? espacio : tope - 1).replace(/[,;:]$/, "")}…`;
}

/**
 * Lo que escribió un modelo, revisado: sin espacios de más, con su tope, en tuteo y que diga algo más que el título.
 * Devuelve el texto o el motivo por el que no sirve (el chat se lo reclama; la lectura usa el de respaldo).
 */
export function limpiarContexto(texto: unknown, titulo: string): { contexto: string } | { motivo: string } {
  if (typeof texto !== "string" || !texto.trim()) return { motivo: "falta el contexto: en una a tres frases, para qué es, para quién y qué se espera" };
  const t = recortarContexto(texto);
  const voseo = voseoEnProsa(t);
  // Si la palabra es correcta (un gentilicio que la regla no conoce), el modelo puede cambiarla por otra: el motivo lo dice.
  if (voseo.length) return { motivo: `el contexto parece voseo («${voseo[0]}»): escríbelo en tuteo, o cambia esa palabra si es correcta` };
  if (huellaDeTexto(t) === huellaDeTexto(titulo)) return { motivo: "el contexto repite el título: di para qué es, para quién y qué se espera" };
  return { contexto: t };
}

/** Raíces que no dicen de qué se trata (conectores y palabras de toda reunión): no cuentan para parecerse. */
const VACIAS = new Set([
  "para", "esta", "este", "esto", "estas", "estos", "sobre", "como", "entre", "desde", "hasta", "cada", "todo", "todos",
  "debe", "tiene", "hace", "hacer", "duran", "seman", "equip", "clien", "reuni", "donde", "cuand", "porqu",
  "tambi", "pero", "solo", "mismo", "otra", "otro", "otros", "otras", "estan", "quedo", "queda", "luego",
]);

const normalizarTexto = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Raíces de las palabras con contenido (4 letras o más, sin las vacías), sin tildes ni mayúsculas. */
function raices(texto: string): Set<string> {
  return new Set(
    normalizarTexto(texto)
      .split(/[^a-z0-9ñ]+/)
      .filter((p) => p.length >= 4)
      .map((p) => p.slice(0, 5))
      .filter((r) => !VACIAS.has(r)),
  );
}

/** El tema con que abre un párrafo de Gemini («**Banner de SAP:** …» o «Banner de SAP: …»), si lo tiene. */
function temaDelParrafo(p: string): string | null {
  const negrita = /^\*\*([^*]{2,120})\*\*/.exec(p);
  if (negrita) return negrita[1];
  const plano = /^([^:.]{2,120}):\s/.exec(p);
  return plano ? plano[1] : null;
}

/**
 * El párrafo de la reunión que más se parece a la línea, o null. Tiene que compartir al menos dos raíces con la línea y
 * una con el TÍTULO; si abre con un tema, el tema tiene que ser el de la línea; y no puede nombrar una empresa que la
 * línea no nombra (sería el contexto de otro cliente).
 */
export function parrafoMasParecido(titulo: string, detalle: string | null, parrafos: readonly string[], clientes: readonly string[] = []): string | null {
  const linea = `${titulo} ${detalle ?? ""}`;
  const de = raices(linea);
  const deTitulo = raices(titulo);
  const lineaNormal = normalizarTexto(linea);
  const nombres = clientes.map(normalizarTexto).filter((n) => n.length >= 4);
  let mejor: { p: string; n: number } | null = null;
  for (const p of parrafos) {
    const tema = temaDelParrafo(p);
    if (tema && ![...raices(tema)].some((r) => de.has(r))) continue;
    const pNormal = normalizarTexto(p);
    if (nombres.some((n) => pNormal.includes(n) && !lineaNormal.includes(n))) continue;
    const suyas = raices(p);
    let n = 0;
    for (const r of suyas) if (de.has(r)) n++;
    if (n >= 2 && [...suyas].some((r) => deTitulo.has(r)) && (!mejor || n > mejor.n)) mejor = { p, n };
  }
  return mejor?.p ?? null;
}

/** Un párrafo de Gemini sin su tema, sin las marcas y sin las horas («(00:00:18)»). */
function limpiarParrafo(p: string): string {
  return p
    .replace(/^\*\*[^*]+\*\*:?\s*/, "")
    .replace(/^[^:.]{2,120}:\s+/, "")
    .replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * El contexto sin modelo: el detalle de la línea (si dice algo más que el título) y el párrafo de la reunión que más se
 * le parece. Si no hay ninguno de los dos, null: mejor sin contexto que uno que solo repite el título.
 */
export function contextoDeRespaldo(
  l: { titulo: string; detalle?: string | null },
  parrafos: readonly string[] = [],
  o: { clientes?: readonly string[] } = {},
): string | null {
  const partes: string[] = [];
  const detalle = l.detalle?.replace(/\s+/g, " ").trim();
  if (detalle && huellaDeTexto(detalle) !== huellaDeTexto(l.titulo)) partes.push(/[.!?…]$/.test(detalle) ? detalle : `${detalle}.`);
  const parrafo = parrafoMasParecido(l.titulo, detalle ?? null, parrafos, o.clientes);
  if (parrafo) partes.push(limpiarParrafo(parrafo));
  return partes.length ? recortarContexto(partes.join(" ")) : null;
}
