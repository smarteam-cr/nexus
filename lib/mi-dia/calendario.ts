/**
 * lib/mi-dia/calendario.ts — los enlaces a Google Calendar del inicio (ficha D, 2026-10-17). PURO y client-safe.
 *
 * Nexus no escribe en el calendario de nadie desde el inicio: «Crear evento», «Agendar» y «Bloquear en Calendar» abren
 * el formulario de Google Calendar ya lleno, en la cuenta de la persona; ella lo guarda y Google manda la invitación
 * (decisión 5 de docs/nexus-sistema-de-trabajo-plan.md).
 */

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** `20261017T150000Z`, como lo pide el parámetro `dates` de Google Calendar. */
export function enFormatoDeGoogle(instante: Date | string): string {
  return new Date(instante).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** El formulario de un evento nuevo, vacío (el «+ Crear evento» de la agenda). */
export function enlaceParaCrearEvento(correo?: string | null): string {
  const q = new URLSearchParams({ action: "TEMPLATE" });
  if (correo) q.set("authuser", correo);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** El formulario de un evento nuevo ya lleno: título, detalle, hora si se sabe, e invitados. */
export function enlaceParaAgendarEnCalendar(o: {
  titulo: string;
  detalle?: string;
  inicio?: Date | string | null;
  fin?: Date | string | null;
  invitados?: readonly string[];
  correo?: string | null;
}): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: o.titulo.slice(0, 200) });
  if (o.detalle) q.set("details", o.detalle);
  if (o.inicio && o.fin) q.set("dates", `${enFormatoDeGoogle(o.inicio)}/${enFormatoDeGoogle(o.fin)}`);
  const invitados = [...new Set((o.invitados ?? []).map((x) => x.trim().toLowerCase()).filter((x) => CORREO.test(x)))].slice(0, 10);
  if (invitados.length) q.set("add", invitados.join(","));
  q.set("ctz", "America/Costa_Rica");
  if (o.correo) q.set("authuser", o.correo);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** El día en Google Calendar (para «Abrir en Calendar» cuando el evento no trae su enlace). */
export function enlaceAlDia(diaISO: string, correo?: string | null): string {
  const [a, m, d] = diaISO.split("-");
  const base = `https://calendar.google.com/calendar/r/day/${a}/${Number(m)}/${Number(d)}`;
  return correo ? `${base}?authuser=${encodeURIComponent(correo)}` : base;
}
