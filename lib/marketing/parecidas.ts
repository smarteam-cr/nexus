/**
 * lib/marketing/parecidas.ts — junta las publicaciones (o ideas de SEM) que dicen casi lo mismo.
 *
 * Por qué existe (rediseño de Marketing, 2026-10-04): medido ese día, de las 75 publicaciones sugeridas sin revisar,
 * 15 eran el mismo ángulo con otro título («El 33 % del tiempo de ventas se pierde en admin — y nadie lo ve», «El 67 %
 * del tiempo de ventas no se vende»…): el tema en campaña hace que el agente lo repita cada viernes. Revisarlas una
 * por una es revisar 15 veces lo mismo. La pantalla muestra una fila por grupo y deja quedarse con una.
 *
 * Cómo se decide, a propósito simple y sin IA: cada título se reduce a sus palabras con contenido (sin conectores ni
 * números, sin tildes, las primeras 4 letras de cada una: «ventas», «vende» y «vendedores» quedan como «vent» /
 * «vend»). Dos títulos son parecidos si comparten 2 o más de esas palabras y eso es al menos el 60 % del más corto y
 * el 30 % del más largo; un título entra al grupo si se parece a un tercio de sus miembros. Calibrado sobre los 75
 * títulos reales: 12 de las 15 versiones del «33 % / 67 %» quedan juntas, y frases que solo comparten «datos» y
 * «contexto» no se juntan.
 *
 * Es una AYUDA para revisar, no una decisión: nada se descarta solo. Puro y client-safe.
 */

const CONECTORES = new Set(
  (
    "el la los las lo un una unos unas de del al a en y o u que se no es son por para con sin su sus tu tus mi mis te le " +
    "les ya ni mas pero como cuando donde quien cual este esta estos estas ese esa eso esto hay muy tan todo todos toda " +
    "todas nadie algo cada ser fue hace hacer tiene tener sabe saben antes despues vs"
  ).split(" "),
);

const SIN_IGNORAR: ReadonlySet<string> = new Set();

/** Las marcas que deja `normalize("NFD")` (tildes, diéresis): del U+0300 al U+036F. */
const TILDES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/**
 * En las ideas de SEM el título lleva el canal y el público («— Google Search», «Paid Social para CEOs y
 * directores»): sin ignorarlos, medido sobre las 56 ideas, 24 caían en un solo grupo por compartir «Google Search».
 */
export const IGNORAR_EN_SEM: ReadonlySet<string> = new Set(
  (
    "google search paid social linkedin ads display campana busqueda retargeting awareness directores director " +
    "ceos ceo gerentes gerente equipos equipo comercial comerciales latam empresas visitantes"
  ).split(" "),
);

const UMBRAL_DEL_CORTO = 0.6;
const UMBRAL_DEL_LARGO = 0.3;
const MINIMO_EN_COMUN = 2;

/** Las palabras con contenido de un título, recortadas a su raíz de 4 letras y sin repetir. */
export function huellaDeTitulo(titulo: string, ignorar: ReadonlySet<string> = SIN_IGNORAR): string[] {
  const palabras = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(TILDES, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !CONECTORES.has(w) && !ignorar.has(w))
    .map((w) => w.slice(0, 4));
  return [...new Set(palabras)];
}

export function sonParecidos(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const deA = new Set(a);
  let comunes = 0;
  for (const x of b) if (deA.has(x)) comunes++;
  return (
    comunes >= MINIMO_EN_COMUN &&
    comunes / Math.min(a.length, b.length) >= UMBRAL_DEL_CORTO &&
    comunes / Math.max(a.length, b.length) >= UMBRAL_DEL_LARGO
  );
}

/** Para entrar a un grupo hay que parecerse a un tercio de sus miembros (y al menos a uno). */
const VOTOS_PARA_ENTRAR = 1 / 3;

/**
 * Agrupa respetando el orden de entrada: cada grupo sale en el lugar de su primer elemento, y adentro los elementos
 * conservan su orden (si la lista viene de la más nueva a la más vieja, el primero del grupo es el más nuevo).
 *
 * Cada elemento entra al grupo donde más miembros se le parecen, si llega a un tercio del grupo. Se probó primero
 * la cadena simple (A se parece a B y B a C ⇒ A, B y C juntos) y encadenaba de más: en SEM juntaba «Caos operativo»
 * con «Retargeting» y «Adopción de CRM» porque había un título puente entre cada par.
 */
export function agruparParecidas<T>(
  items: readonly T[],
  tituloDe: (item: T) => string,
  ignorar: ReadonlySet<string> = SIN_IGNORAR,
): T[][] {
  const grupos: Array<{ huellas: string[][]; items: T[] }> = [];
  for (const item of items) {
    const huella = huellaDeTitulo(tituloDe(item), ignorar);
    let mejor: { grupo: (typeof grupos)[number]; parte: number } | null = null;
    for (const grupo of grupos) {
      const votos = grupo.huellas.filter((h) => sonParecidos(h, huella)).length;
      const parte = votos / grupo.huellas.length;
      if (votos > 0 && parte >= VOTOS_PARA_ENTRAR && (!mejor || parte > mejor.parte)) mejor = { grupo, parte };
    }
    if (mejor) {
      mejor.grupo.huellas.push(huella);
      mejor.grupo.items.push(item);
    } else {
      grupos.push({ huellas: [huella], items: [item] });
    }
  }
  return grupos.map((g) => g.items);
}
