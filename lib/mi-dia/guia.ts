/**
 * lib/mi-dia/guia.ts — la guía de una reunión en el panel del inicio (ficha D, 2026-10-17). PURO y client-safe.
 *
 * Sin IA: el objetivo que propone Nexus y los puntos de la guía salen de los datos de la cuenta que ya junta el resumen
 * antes de cada reunión (lib/mi-dia/resumen-server.ts), y cada uno dice de dónde salió. La persona cambia el objetivo
 * con «Editar» y lo suyo manda (lib/mi-dia/preparacion-server.ts).
 *
 * El objetivo, en este orden: el siguiente paso de tu equipo sobre la cuenta; el negocio abierto que cierra antes (a
 * quien vende); lo que debe el cliente; y, desde el 2026-10-20 (Fundauna: la reunión era el siguiente paso, sin
 * pendientes ni minuta), el tema que dice el título de la invitación. Si no hay nada, no se inventa: se pide que lo
 * escriba la persona.
 */
import type { ResumenDeLaReunion } from "./resumen-server";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";

export interface ObjetivoPropuesto {
  texto: string;
  /** De dónde salió, en palabras de la pantalla. */
  deDonde: string;
}

export interface GuiaDeLaReunion {
  objetivo: ObjetivoPropuesto | null;
  /** Como mucho cuatro puntos. */
  puntos: string[];
}

const MAX_PUNTOS = 4;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dia = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
const sinPunto = (t: string) => t.trim().replace(/[.\s]+$/, "");

export type DatosParaLaGuia = Pick<ResumenDeLaReunion, "cliente" | "invitados" | "pendientes" | "pasos" | "negocios" | "tickets" | "ultimaVez"> &
  Partial<Pick<ResumenDeLaReunion, "reunion">>;

/** Lo que el título no dice del tema: el nombre de un encuentro, sin más. */
const TITULO_GENERICO = /^(reuni[oó]n|sesi[oó]n|llamada|seguimiento|kickoff|kick off|meet|call|sync|check[- ]?in)$/i;
const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * El tema de la reunión que dice el título de la invitación, sin el nombre del cliente ni el de Smarteam:
 * «FUNDAUNA: Conexiones de HubSpot» → «Conexiones de HubSpot». null si no queda un tema (solo «Seguimiento»).
 */
export function temaDelTitulo(titulo: string | null | undefined, cliente: string): string | null {
  if (!titulo) return null;
  const quitar = new Set([...sinTildes(cliente).split(/[^\p{L}\p{N}]+/u), "smarteam"].filter((w) => w.length > 1));
  const palabras = titulo.split(/\s+/).filter((w) => {
    const limpia = sinTildes(w).replace(/[^\p{L}\p{N}]+/gu, "");
    return limpia.length > 0 && !quitar.has(limpia);
  });
  const tema = palabras
    .join(" ")
    .replace(/^[\s:|+\-–—·,]+|[\s:|+\-–—·,]+$/gu, "")
    .replace(/\s*[|+]\s*/g, " · ")
    .trim();
  if (tema.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length === 0 || TITULO_GENERICO.test(tema)) return null;
  return tema;
}

/**
 * El siguiente paso que muestra el panel de un evento propio (2026-10-19): el de tu equipo sobre la cuenta, el más
 * próximo; si tu equipo no tiene, el más próximo de cualquier equipo. Sin pasos, null.
 */
export function siguientePasoParaElPanel<P extends { equipo: string; fecha: string | null }>(
  pasos: readonly P[],
  equipo: EquipoDelSiguientePaso | null,
): P | null {
  const porFecha = (a: P, b: P) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999");
  const delEquipo = equipo ? pasos.filter((p) => p.equipo === equipo).sort(porFecha)[0] : undefined;
  return delEquipo ?? [...pasos].sort(porFecha)[0] ?? null;
}

export function guiaDeLaReunion(
  r: DatosParaLaGuia,
  o: { equipo: EquipoDelSiguientePaso | null; hoyISO: string; hayReunionDespues: boolean },
): GuiaDeLaReunion {
  const pasos = r.pasos?.pasos ?? [];
  const delEquipo = o.equipo ? pasos.filter((p) => p.equipo === o.equipo).sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"))[0] : null;
  const delCliente = r.pendientes.filter((p) => p.lado === "cliente");
  const vencidosDelCliente = delCliente.filter((p) => p.venceEl && p.venceEl <= o.hoyISO);
  const negocio = r.negocios[0] ?? null;

  let objetivo: ObjetivoPropuesto | null = null;
  if (delEquipo) {
    objetivo = { texto: `Avanzar el siguiente paso: ${sinPunto(delEquipo.que)}.`, deDonde: "El siguiente paso de tu equipo sobre la cuenta" };
  } else if (o.equipo === "ventas" && negocio) {
    objetivo = {
      texto: `Que ${r.cliente.nombre} avance «${negocio.nombre}»${negocio.etapa ? ` (${negocio.etapa})` : ""}${negocio.cierre ? `, que cierra el ${negocio.cierre}` : ""}.`,
      deDonde: "El negocio abierto en HubSpot",
    };
  } else if (delCliente[0]) {
    objetivo = { texto: `Destrabar lo que debe el cliente: ${sinPunto(delCliente[0].titulo)}.`, deDonde: "Lo pendiente del cliente en Tareas" };
  } else {
    const tema = temaDelTitulo(r.reunion?.titulo, r.cliente.nombre);
    if (tema) objetivo = { texto: `Cubrir el tema de la invitación: ${sinPunto(tema)}.`, deDonde: "El título de la invitación" };
  }

  const puntos: string[] = [];
  for (const p of vencidosDelCliente.slice(0, 2)) puntos.push(`Pregunta por «${sinPunto(p.titulo)}»: el cliente lo debía para el ${dia(p.venceEl!)}.`);
  const nuevos = r.invitados.filter((i) => i.lado === "cliente" && !i.ultimaReunion);
  if (nuevos.length) {
    const nombres = nuevos.slice(0, 2).map((i) => i.nombre ?? i.email);
    puntos.push(`${nombres.join(" y ")} ${nuevos.length === 1 ? "viene" : "vienen"} por primera vez: confirma su papel en el proyecto.`);
  }
  if (r.ultimaVez?.acuerdos[0]) puntos.push(`Retoma lo acordado la última vez: ${sinPunto(r.ultimaVez.acuerdos[0])}.`);
  if (o.equipo === "ventas" && negocio && !negocio.monto) puntos.push(`«${negocio.nombre}» no tiene monto en HubSpot: si sale el tema, pregúntalo.`);
  if (r.tickets.length) puntos.push(`Tiene ${r.tickets.length === 1 ? "1 ticket abierto" : `${r.tickets.length} tickets abiertos`} en HubSpot: pregunta si está resuelto.`);
  if (!o.hayReunionDespues) puntos.push("Antes de colgar, deja agendada la próxima reunión.");
  return { objetivo, puntos: puntos.slice(0, MAX_PUNTOS) };
}
