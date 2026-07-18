/**
 * lib/timeline/particularidad-to-task.ts
 *
 * Convertir un HECHO en TRABAJO — helpers puros, sin Prisma, client-safe.
 *
 * Una `Particularidad` está redactada como CRÓNICA ("Wherex se comprometió a enviar la base de
 * prueba"): mira al pasado y nombra a quién lo dijo. Una tarea se redacta como ENCARGO ("Enviar la
 * base de prueba"): mira al futuro y su dueño ya está en el chip de al lado. Este módulo hace esa
 * traducción para PRELLENAR el modal — el CSE edita lo que quiera antes de crear.
 *
 * Deliberadamente TONTO: tabla de prefijos y passthrough por default. Nada de LLM. El modal tiene
 * que abrir instantáneo con el CSE mirando el campo; una sugerencia mala cuesta una edición, una
 * llamada de red cuesta el gesto entero.
 */

/** Patrones de crónica → encargo. El orden importa: gana el primero que matchea. */
const PATRONES: Array<{ re: RegExp; a: (m: RegExpMatchArray) => string }> = [
  // "X se comprometió a enviar Y" / "se comprometieron a…" → "Enviar Y"
  { re: /^.{0,60}?\bse comprometi(?:ó|eron)\s+a\s+(.+)$/i, a: (m) => m[1] },
  // "Se necesita(n) X" / "Se requiere X" → "Conseguir X"  (insumo que hay que ir a buscar)
  { re: /^se\s+(?:necesitan?|requieren?)\s+(.+)$/i, a: (m) => `Conseguir ${m[1]}` },
  // "Falta(n) X" / "Está pendiente X" → "Conseguir X"
  { re: /^(?:faltan?|est(?:á|a)\s+pendiente)\s+(?:de\s+)?(.+)$/i, a: (m) => `Conseguir ${m[1]}` },
  // "X quedó pendiente de confirmar Y" → "Confirmar Y"
  { re: /^.{0,60}?\bqued(?:ó|aron)\s+pendiente\s+(?:de|el|la)\s+(.+)$/i, a: (m) => m[1] },
  // "Hay que X" / "Se debe X" → "X"
  { re: /^(?:hay que|se debe|habr(?:í|i)a que)\s+(.+)$/i, a: (m) => m[1] },
];

/** Primera letra en mayúscula, sin tocar el resto (los nombres propios ya vienen bien). */
function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Título sugerido para la tarea. Si ningún patrón matchea devuelve el título **tal cual**: es mejor
 * que el CSE reescriba una frase entendible a que lea una mutilación automática.
 */
export function taskTitleFromParticularidad(title: string): string {
  const limpio = (title ?? "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!limpio) return "";
  for (const { re, a } of PATRONES) {
    const m = limpio.match(re);
    if (m) {
      const out = a(m).trim();
      if (out.length >= 3) return capitalizar(out);
    }
  }
  return capitalizar(limpio);
}

/**
 * ¿Se le puede OFRECER el botón "Convertir en tarea"?
 *
 * Incluye los ATRASO sin cuantificar a propósito: muchas veces no son un atraso sino algo que
 * alguien tiene que averiguar ("la integración no tiene fecha de entrega definida"). Ponerle
 * semanas ahí sería inventar un número; la salida correcta es una tarea.
 *
 * OJO: esto es el criterio del BOTÓN, no el de ningún contador. Un atraso sin cuantificar ya se
 * cuenta en "atrasos sin semanas"; sumarlo también a "compromisos sin tarea" lo cuenta dos veces y
 * produce un número que no coincide con ningún grupo de la pantalla. Para contar, usá
 * `esCompromisoPendiente`.
 */
export function esConvertible(p: {
  kind: string;
  weeksImpact?: number | null;
  convertedTaskId?: string | null;
}): boolean {
  if (p.convertedTaskId) return false;
  if (p.kind === "COMPROMISO" || p.kind === "SOLICITUD") return true;
  return p.kind === "ATRASO" && !p.weeksImpact;
}

/**
 * ¿Es un COMPROMISO (o su antecesor deprecado SOLICITUD) que nadie está persiguiendo?
 *
 * Es el criterio del grupo "Compromisos sin dueño" y del contador del panel — los dos tienen que
 * dar el MISMO número, porque el botón del panel lleva justamente a ese grupo.
 */
export function esCompromisoPendiente(p: {
  kind: string;
  convertedTaskId?: string | null;
}): boolean {
  return !p.convertedTaskId && (p.kind === "COMPROMISO" || p.kind === "SOLICITUD");
}
