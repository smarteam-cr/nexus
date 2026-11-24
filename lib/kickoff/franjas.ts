/**
 * lib/kickoff/franjas.ts — qué se ve de una franja de «Sesiones y horarios» del kickoff, y cuándo se
 * puede arrastrar. Puras y client-safe: las usa `HorariosSection` en sus tres modos (CSE, cliente y
 * lectura).
 *
 * ── EL FALLO QUE LO TRAE ─────────────────────────────────────────────────────────────────────
 * Juan Carlos Armijos (CSE), 24 nov. «+ Agregar franja» creaba una franja VACÍA cuyo texto de ayuda,
 * «Martes 11:00», se veía como un valor: creyó que se agregaba siempre «la primera fecha». Arrastró
 * una de esas franjas vacías a «Service Hub» y la sesión quedó mostrando «—»; el cliente la habría
 * visto igual.
 *
 * Las reglas:
 *   · una franja sin texto NO se arrastra (`asignacionAlSoltar` la rechaza aunque el arrastre llegue);
 *   · una sesión que ya apunta a una franja sin texto (datos de antes de este arreglo) no muestra
 *     «—»: el CSE ve «Franja sin texto» con su × para soltarla, y el cliente la ve sin franja.
 */

interface Franja {
  id: string;
  label: string;
}
interface Sesion {
  id: string;
  label: string;
  optionId: string | null;
}
interface Horarios {
  options: Franja[];
  sessions: Sesion[];
}

/** Texto de ayuda de una franja vacía: una instrucción, no un horario que se pueda leer como valor. */
export const PISTA_DE_FRANJA = "Escribe el día y la hora";

export function tieneTexto(label: string | null | undefined): boolean {
  return (label ?? "").trim().length > 0;
}

/**
 * Lo que muestra una sesión en el lugar de su franja.
 *   · `franja`: la asignada, con texto.
 *   · `sin-texto`: apunta a una franja que existe pero está vacía. Solo el CSE lo recibe, para
 *     soltarla con su ×.
 *   · `null`: sin franja, o la franja ya no existe. Para el CLIENTE (`paraElCliente`), también la
 *     franja vacía: ve «Arrastra una franja aquí» o «Por coordinar» y puede arrastrarle una de verdad;
 *     nunca un «Franja sin texto» con una × que le quite la franja a su sesión.
 */
export type FranjaDeLaSesion = { tipo: "franja"; franja: Franja } | { tipo: "sin-texto" } | null;

export function franjaDeLaSesion(
  horarios: Horarios,
  sesion: Sesion,
  { paraElCliente }: { paraElCliente: boolean },
): FranjaDeLaSesion {
  if (!sesion.optionId) return null;
  const franja = horarios.options.find((o) => o.id === sesion.optionId);
  if (!franja) return null;
  if (tieneTexto(franja.label)) return { tipo: "franja", franja };
  return paraElCliente ? null : { tipo: "sin-texto" };
}

/**
 * Franjas todavía sin asignar: las que se ofrecen. Una franja asignada se consume y sale de la lista,
 * también si está vacía (el CSE la ve dentro de su sesión, con la × para soltarla).
 * `soloConTexto`: la vista del cliente no muestra las que el CSE dejó sin escribir.
 */
export function franjasLibres(horarios: Horarios, { soloConTexto }: { soloConTexto: boolean }): Franja[] {
  const tomadas = new Set(horarios.sessions.map((s) => s.optionId).filter(Boolean));
  return horarios.options.filter((o) => !tomadas.has(o.id) && (!soloConTexto || tieneTexto(o.label)));
}

/** Prefijos de los ids de dnd-kit: `opt:<id de franja>` se arrastra y `sess:<id de sesión>` recibe. */
export const ID_DE_FRANJA = "opt:";
export const ID_DE_SESION = "sess:";

/**
 * Un soltar de dnd-kit traducido a una asignación, o `null` si no corresponde: no cayó en una
 * sesión, no era una franja, la franja ya no existe o está vacía.
 */
export function asignacionAlSoltar(
  horarios: Horarios,
  arrastrado: string,
  destino: string | null,
): { sessionId: string; optionId: string } | null {
  if (!destino || !arrastrado.startsWith(ID_DE_FRANJA) || !destino.startsWith(ID_DE_SESION)) return null;
  const optionId = arrastrado.slice(ID_DE_FRANJA.length);
  const sessionId = destino.slice(ID_DE_SESION.length);
  const franja = horarios.options.find((o) => o.id === optionId);
  if (!franja || !tieneTexto(franja.label)) return null;
  if (!horarios.sessions.some((s) => s.id === sessionId)) return null;
  return { sessionId, optionId };
}
