/**
 * lib/feedback/parecidos.ts — ¿a qué tema de la hoja de ruta se parece un reporte? Puro y client-safe.
 *
 * En la bandeja, cada reporte sin decidir trae arriba una sugerencia: el tema que pide lo mismo. A
 * propósito SIN IA (v1, 2026-10-04): cada texto se reduce a sus palabras con contenido (sin conectores,
 * sin tildes, la raíz de 5 letras: «clientes» y «cliente» quedan como «clien») y se cuenta cuántas
 * comparte con el título, el detalle y los reportes de cada tema. Gana el tema con más palabras en común,
 * si son al menos 2 y pesan un tercio del más corto. Es una ayuda para decidir: nada se suma solo.
 *
 * Por no ser IA, la pantalla lo muestra SIN la chispa (la chispa marca solo lo que sugiere un agente)
 * y dice qué palabras comparten, para que se vea por qué.
 */

const CONECTORES = new Set(
  (
    "el la los las lo un una unos unas de del al a en y o u que se no es son por para con sin su sus tu tus mi mis te " +
    "le les ya ni mas pero como cuando donde quien cual este esta estos estas ese esa eso esto hay muy tan todo todos " +
    "toda todas nadie algo cada ser fue hace hacer tiene tener sabe saben antes despues hoy me nos yo pero tambien " +
    "solo puede poder quiero queria podria seria debe deberia estaba estar esta dice dicen sale salen veo ver vez"
  ).split(" "),
);

/** Las marcas que deja `normalize("NFD")` (tildes, diéresis): del U+0300 al U+036F. */
const TILDES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

const RAIZ = 5;

/** Las palabras con contenido de un texto, recortadas a su raíz y sin repetir. */
export function huella(texto: string): string[] {
  const palabras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(TILDES, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !CONECTORES.has(w))
    .map((w) => w.slice(0, RAIZ));
  return [...new Set(palabras)];
}

export interface TemaComparable {
  id: string;
  titulo: string;
  detalle?: string | null;
  /** Los textos de los reportes que ya están en el tema. */
  textos?: readonly string[];
}

export interface Parecido {
  temaId: string;
  /** Las palabras (como aparecen en el reporte) que comparte con el tema. */
  enComun: string[];
}

/** El tema que más se parece al texto, o null si ninguno se parece lo suficiente. */
export function temaMasParecido(texto: string, temas: readonly TemaComparable[]): Parecido | null {
  const delReporte = huella(texto);
  if (delReporte.length === 0) return null;
  let mejor: { temaId: string; comunes: string[] } | null = null;
  for (const t of temas) {
    const delTema = new Set(huella([t.titulo, t.detalle ?? "", ...(t.textos ?? [])].join(" ")));
    const comunes = delReporte.filter((w) => delTema.has(w));
    if (comunes.length < 2) continue;
    const corto = Math.min(delReporte.length, delTema.size);
    if (comunes.length / corto < 1 / 3) continue;
    if (!mejor || comunes.length > mejor.comunes.length) mejor = { temaId: t.id, comunes };
  }
  if (!mejor) return null;
  return { temaId: mejor.temaId, enComun: palabrasOriginales(texto, mejor.comunes) };
}

/** Las palabras del texto cuya raíz está entre las comunes (las primeras 4), para mostrarlas. */
function palabrasOriginales(texto: string, raices: readonly string[]): string[] {
  const buscadas = new Set(raices);
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const w of texto.split(/[^\p{L}]+/u)) {
    const r = w.toLowerCase().normalize("NFD").replace(TILDES, "").slice(0, RAIZ);
    if (w.length >= 4 && buscadas.has(r) && !vistas.has(r)) {
      vistas.add(r);
      salida.push(w.toLowerCase());
    }
    if (salida.length === 4) break;
  }
  return salida;
}
