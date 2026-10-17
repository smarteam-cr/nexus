/**
 * lib/seguimiento/reunion/agenda.ts — la AGENDA de una reunión: lo que se iba a tratar. PURO. Ficha G (2026-10-17).
 *
 * Sale de tres lugares, en este orden:
 *   1. lo que escribió una persona en la página de la reunión (manda: corrige o completa lo demás);
 *   2. la descripción de la invitación del calendario (la guarda la sync de Meet, ya limpia);
 *   3. la próxima reunión que dejó agendada otra reunión con el mismo cliente, cerca de esta hora («Lo que dejó
 *      planeado la reunión del …»): el objetivo con que se agendó.
 * Lo que dice lo mismo que una parte de arriba no se repite. Sin ninguna, la agenda está vacía y la página lo dice.
 */

export type FuenteDeLaAgenda = "escrita" | "invitacion" | "planeada";

export interface ParteDeLaAgenda {
  fuente: FuenteDeLaAgenda;
  /** De dónde sale, en palabras: «La escribió Ana el 15 oct», «La invitación del calendario». */
  deDonde: string;
  texto: string;
  /** Solo «planeada»: la reunión que la dejó agendada, para ir a verla. */
  reunion?: { id: string; titulo: string };
}

export interface AgendaDeLaReunion {
  partes: ParteDeLaAgenda[];
  /** Lo que escribió una persona, tal cual, para editarlo. "" si nadie escribió. */
  escrita: string;
}

export interface EntradaDeLaAgenda {
  escrita: { texto: string; porNombre: string | null; en: string | null } | null;
  invitacion: string | null;
  planeada: { reunionId: string; reunionTitulo: string; reunionFecha: string; titulo: string | null; objetivo: string | null } | null;
}

/** Para comparar dos textos de la agenda: sin tildes, sin signos y sin espacios de más. */
export function normalizarAgenda(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «15 oct» en hora de Costa Rica (UTC-6, sin horario de verano), armado a mano: el servidor y el navegador dicen lo mismo. */
export function diaCortoCR(iso: string): string {
  const d = new Date(Date.parse(iso) - 6 * 3600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function armarAgenda(e: EntradaDeLaAgenda): AgendaDeLaReunion {
  const partes: ParteDeLaAgenda[] = [];
  const vistas = new Set<string>();
  const sumar = (p: ParteDeLaAgenda) => {
    const t = p.texto.trim();
    const k = normalizarAgenda(t);
    if (!k || vistas.has(k)) return;
    // Lo que ya está dentro de una parte de arriba (la invitación copiada en la agenda escrita) no se repite.
    for (const v of vistas) if (v.includes(k)) return;
    vistas.add(k);
    partes.push({ ...p, texto: t });
  };

  const escrita = e.escrita?.texto.trim() ?? "";
  if (escrita) {
    const quien = e.escrita?.porNombre?.trim();
    const cuando = e.escrita?.en ? diaCortoCR(e.escrita.en) : null;
    sumar({ fuente: "escrita", texto: escrita, deDonde: `La escribió ${quien || "alguien del equipo"}${cuando ? ` el ${cuando}` : ""}` });
  }
  if (e.invitacion?.trim()) sumar({ fuente: "invitacion", texto: e.invitacion, deDonde: "La invitación del calendario" });
  const p = e.planeada;
  if (p && (p.objetivo?.trim() || p.titulo?.trim())) {
    const texto = [p.titulo?.trim(), p.objetivo?.trim()].filter(Boolean).join(": ");
    sumar({
      fuente: "planeada",
      texto,
      deDonde: `La dejó planeada la reunión del ${diaCortoCR(p.reunionFecha)}`,
      reunion: { id: p.reunionId, titulo: p.reunionTitulo },
    });
  }
  return { partes, escrita };
}

/** Hasta cuánto se guarda la agenda escrita a mano. */
export const MAX_AGENDA_ESCRITA = 4000;
