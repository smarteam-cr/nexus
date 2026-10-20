/**
 * lib/tareas/tema.ts — el TEMA de una tarea propuesta, para que lo descartado no vuelva (2026-10-19, DECISIONS «Pocos
 * pendientes y esenciales de las reuniones con clientes»). CLIENT-SAFE y puro, sin red ni IA.
 *
 * La huella del título (`huellaDeTexto`) solo iguala títulos idénticos, y la misma cosa vuelve con otras palabras en la
 * reunión siguiente («Enviar el reporte a CEMACO» · «Enviar reporte de avance a Cemaco»). El tema es el título sin lo
 * que cambia de una vez a otra: el nombre de la cuenta, el día y los conectores. Un seguimiento agrupado («Seguimiento
 * con Honda: 3 cosas que prometió Randall (lun 12 oct)») tiene un tema por cada cosa de su lista.
 *
 * `mismoTema` es deliberadamente estricto (dos raíces en común, 2/3 del más corto Y la mitad del más largo, sin siglas
 * distintas): equivocarse para el lado de «no es el mismo» solo vuelve a proponer algo que se puede descartar otra vez;
 * equivocarse para el otro lado escondería para siempre un pendiente nuevo.
 */
import { raices } from "./texto";

export interface Tema {
  /** Las raíces del texto sin las de la cuenta. */
  raices: string[];
}

/** Las raíces del nombre de la cuenta (también como sigla): no dicen de qué se trata la tarea. */
function raicesDeLaCuenta(empresa: string | null | undefined): Set<string> {
  if (!empresa) return new Set();
  const r = raices(empresa);
  const siglas = (empresa.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g) ?? []).filter((w) => w.length >= 2 && w.length <= 5).map((w) => `#${w.toLowerCase()}`);
  return new Set([...r, ...siglas]);
}

/** Palabras que aparecen en casi todo título de la lectura y no dicen el tema. */
const RUIDO = new Set(["segui", "cosas", "prome", "clien", "smart", "smarteam"].map((w) => w.slice(0, 5)));
const DIAS = /\((?:lun|mar|mie|mié|jue|vie|sab|sáb|dom)\s+\d{1,2}\s+\w{3}\)/gi;

function temaDeTexto(texto: string, cuenta: Set<string>): Tema {
  const limpio = texto.replace(DIAS, " ");
  return { raices: raices(limpio).filter((r) => !cuenta.has(r) && !RUIDO.has(r)) };
}

/**
 * Los temas de una tarea. Un seguimiento agrupado tiene uno por cada línea «• …» de su contexto (lo escribe el código,
 * `seguimientoAgrupado`); lo demás, uno: el título.
 */
export function temasDeLaTarea(t: { titulo: string; contexto: string | null }, empresa?: string | null): Tema[] {
  const cuenta = raicesDeLaCuenta(empresa);
  const lineas = (t.contexto ?? "")
    .split("\n")
    .filter((l) => l.startsWith("• "))
    .map((l) => l.slice(2).replace(/\(para el [^)]*\)/g, " ").replace(/·\s*frena el plan/g, " "));
  const textos = lineas.length >= 2 ? lineas : [t.titulo];
  return textos.map((x) => temaDeTexto(x, cuenta)).filter((x) => x.raices.length > 0);
}

/** El tema del título (para una sola cosa). */
export function temaDeLaTarea(t: { titulo: string; contexto: string | null }, empresa?: string | null): Tema {
  return temaDeTexto(t.titulo, raicesDeLaCuenta(empresa));
}

/** ¿Hablan de lo mismo? Ver el encabezado: estricto a propósito. */
export function mismoTema(a: Tema, b: Tema): boolean {
  const rb = new Set(b.raices);
  const comunes = a.raices.filter((r) => rb.has(r));
  if (comunes.length < 2) return false;
  const corto = Math.min(a.raices.length, b.raices.length);
  const largo = Math.max(a.raices.length, b.raices.length);
  if (comunes.length / corto < 2 / 3 || comunes.length / largo < 1 / 2) return false;
  const siglasA = a.raices.filter((r) => r.startsWith("#"));
  const siglasB = b.raices.filter((r) => r.startsWith("#"));
  return !(siglasA.some((s) => !siglasB.includes(s)) || siglasB.some((s) => !siglasA.includes(s)));
}

/** ¿Algún tema de `a` es el mismo que alguno de `b`? */
export function compartenTema(a: readonly Tema[], b: readonly Tema[]): boolean {
  return a.some((x) => b.some((y) => mismoTema(x, y)));
}
