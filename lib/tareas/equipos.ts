/**
 * lib/tareas/equipos.ts — los equipos (sprints) de Tareas internas. CLIENT-SAFE y puro.
 *
 * Un equipo sale del ÁREA de la persona (`TeamMember.area`, lib/sessions/areas.ts): no hay tabla de equipos ni nada
 * que configurar. La CLAVE es la del área aunque el equipo tenga una sola persona (docs/tareas-plan.md, decisión 3):
 * si Marketing pierde a alguien, sus tareas no quedan huérfanas en otra clave. Un equipo de una sola persona se
 * MUESTRA como «Tus tareas» (es el «equipo personal» de RevOps), pero guarda `revops`. La clave `persona:<correo>`
 * queda solo para quien no tiene área o tiene una sin mapear.
 *
 * El LÍDER de un sprint sale de `TeamMember.lideraEquipos` (2026-10-16, fase 0.1 de docs/nexus-sistema-de-trabajo-plan.md):
 * una persona puede liderar más de un sprint, y uno que no es el de su área (Alex Vanegas lidera CS y Desarrollo). Se
 * elige en Equipo. Reemplaza al override `tareas.manage`, que solo valía en su área. Es la única fuente del líder; el
 * frente `LIDERAR_CS` de «Para ti» es otra cosa (las alertas de cartera).
 */
export const EQUIPOS = [
  { clave: "marketing", nombre: "Marketing", areas: ["marketing"] },
  { clave: "cs", nombre: "Customer Success", areas: ["cse", "csl", "customer success"] },
  { clave: "ventas", nombre: "Ventas", areas: ["ventas", "sales"] },
  { clave: "desarrollo", nombre: "Desarrollo", areas: ["development", "dev", "desarrollo", "developer", "software"] },
  { clave: "admin", nombre: "Admin", areas: ["admin"] },
  { clave: "revops", nombre: "RevOps", areas: ["revops"] },
  { clave: "pm", nombre: "PM", areas: ["pm"] },
] as const;

export type ClaveDeEquipoFijo = (typeof EQUIPOS)[number]["clave"];

const PREFIJO_PERSONAL = "persona:";

/** La clave del sprint de casa de una persona: la de su área, o `persona:<correo>` si no tiene una que se conozca. */
export function claveDeEquipo(area: string | null | undefined, email: string): string {
  const a = (area ?? "").trim().toLowerCase();
  const equipo = EQUIPOS.find((e) => (e.areas as readonly string[]).includes(a));
  return equipo ? equipo.clave : `${PREFIJO_PERSONAL}${email.toLowerCase()}`;
}

export function esEquipoPersonal(clave: string): boolean {
  return clave.startsWith(PREFIJO_PERSONAL);
}

export function duenoDelEquipoPersonal(clave: string): string | null {
  return esEquipoPersonal(clave) ? clave.slice(PREFIJO_PERSONAL.length) : null;
}

/** El nombre del equipo. Con una sola persona (o un equipo personal), «Tus tareas» para esa persona. */
export function nombreDelEquipo(clave: string, opciones: { miembros?: number; paraMi?: boolean } = {}): string {
  if (esEquipoPersonal(clave)) return opciones.paraMi ? "Tus tareas" : "Tareas personales";
  if (opciones.miembros === 1 && opciones.paraMi) return "Tus tareas";
  return EQUIPOS.find((e) => e.clave === clave)?.nombre ?? clave;
}

export function esClaveDeEquipoValida(clave: string): boolean {
  return esEquipoPersonal(clave) ? clave.length > PREFIJO_PERSONAL.length + 3 : EQUIPOS.some((e) => e.clave === clave);
}

/* ── Miembros y líderes ───────────────────────────────────────────────────────────── */

export interface MiembroDelEquipo {
  email: string;
  nombre: string;
  area: string | null;
  roleEnum: string;
  /** Los sprints que lidera (`TeamMember.lideraEquipos`). */
  lideraEquipos?: readonly string[] | null;
}

/** Las claves de sprint que se pueden liderar: las fijas (un equipo personal no tiene líder). */
export const SPRINTS_CON_LIDER: readonly ClaveDeEquipoFijo[] = EQUIPOS.map((e) => e.clave);

/** Los sprints que lidera una persona: los de `lideraEquipos` que existen, sin repetir. */
export function equiposQueLidera(m: Pick<MiembroDelEquipo, "lideraEquipos">): string[] {
  const validas = new Set<string>(SPRINTS_CON_LIDER);
  return [...new Set((m.lideraEquipos ?? []).map((c) => c.trim().toLowerCase()))].filter((c) => validas.has(c));
}

/** Los miembros activos de cada equipo, agrupados por clave. Quien arma la lista ya sacó las bajas y la cuenta de prueba. */
export function miembrosPorEquipo(miembros: readonly MiembroDelEquipo[]): Map<string, MiembroDelEquipo[]> {
  const por = new Map<string, MiembroDelEquipo[]>();
  for (const m of miembros) {
    const clave = claveDeEquipo(m.area, m.email);
    por.set(clave, [...(por.get(clave) ?? []), m]);
  }
  return por;
}

/** El equipo de la mayoría de los participantes internos de una reunión (con empate, null: pregunta). */
export function equipoDeLaMayoria(participantes: readonly string[], miembros: readonly MiembroDelEquipo[]): string | null {
  const porEmail = new Map(miembros.map((m) => [m.email.toLowerCase(), m]));
  const cuenta = new Map<string, number>();
  for (const p of participantes) {
    const m = porEmail.get(p.toLowerCase());
    if (!m) continue;
    const clave = claveDeEquipo(m.area, m.email);
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  if (orden.length === 0) return null;
  if (orden.length > 1 && orden[0][1] === orden[1][1]) return null;
  return orden[0][0];
}
