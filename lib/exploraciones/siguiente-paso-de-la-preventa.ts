/**
 * lib/exploraciones/siguiente-paso-de-la-preventa.ts — el siguiente paso de la exploración: agendar la próxima sesión
 * o, si ya está agendada, planificarla. PURO.
 *
 * Ficha B (2026-10-17, roadmap «Ventas», paso 3). Sale de lo mismo que la guía (`proximaReunion`): la próxima sesión
 * que no pasó o, si no hay, la agendada en HubSpot.
 *   · Sin próxima sesión con fecha → AGENDAR: Nexus arma el evento en Google Calendar por enlace (la persona lo guarda
 *     y Google manda la invitación: Nexus no escribe en el calendario ni invita a nadie solo) y después se une a la
 *     sesión con «+ Agregar sesión › Agendada».
 *   · Con fecha y sin guía armada o sin objetivo confirmado → PLANIFICAR: abrir su Preparación.
 *   · Con fecha, guía y objetivo → LISTA: no hay nada que hacer antes de la reunión.
 * Una reunión agendada en HubSpot que no es una sesión se planifica uniéndola a una sesión.
 */
import { proximaReunion, type GuiaDeLaSesion, type SesionPlaneada } from "./guia";

export type SiguientePasoDeLaPreventa =
  | { tipo: "agendar"; numero: number; sesionId: string | null; texto: string; enlace: string }
  | { tipo: "planificar"; numero: number; sesionId: string | null; fecha: string; texto: string; falta: ("guia" | "objetivo" | "sesion")[] }
  | { tipo: "lista"; numero: number; sesionId: string | null; fecha: string; texto: string };

/** El evento de Google Calendar armado por enlace, con todo lleno (la persona lo revisa y lo guarda). */
export function enlaceParaAgendar(o: { titulo: string; detalle: string; invitados?: readonly string[] }): string {
  const q = new URLSearchParams({ action: "TEMPLATE", text: o.titulo, details: o.detalle });
  const invitados = (o.invitados ?? []).filter((x) => /^[^@\s]+@[^@\s]+$/.test(x));
  if (invitados.length) q.set("add", invitados.join(","));
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function siguientePasoDeLaPreventa(o: {
  sesiones: readonly SesionPlaneada[];
  agenda: readonly { titulo: string; inicio: string }[];
  guias: Readonly<Record<string, GuiaDeLaSesion | undefined>>;
  hoy: string;
  empresa: string;
  /** Las sesiones automáticas que ya pasaron y no son `SesionPlaneada` (un prospecto). */
  pasadasSinSesion?: number;
  invitados?: readonly string[];
  /** «jue 8 oct». */
  dia?: (v: string) => string;
  /** En un proyecto la sesión es de exploración de Customer Success; en la preventa, de venta. */
  enProyecto?: boolean;
}): SiguientePasoDeLaPreventa {
  const p = proximaReunion(o.sesiones, o.agenda, o.hoy, { pasadasSinSesion: o.pasadasSinSesion ?? 0 });
  const dia = o.dia ?? ((v: string) => v.slice(0, 10));
  const deQue = o.enProyecto ? "exploración" : "exploración de la venta";
  const enlace = enlaceParaAgendar({
    titulo: `${o.empresa} · Sesión ${p.numero} de exploración`,
    detalle: `Sesión ${p.numero} de ${deQue} con ${o.empresa}. La guía de la sesión está en Nexus.`,
    invitados: o.invitados,
  });
  if (!p.desde || (p.desde === "sesion" && !p.fecha)) {
    const texto =
      p.desde === "sesion"
        ? `La sesión ${p.numero} todavía no tiene fecha: agéndala y únela a la reunión del calendario.`
        : `Agenda la sesión ${p.numero} de exploración: créala en tu calendario y únela con «+ Agregar sesión».`;
    return { tipo: "agendar", numero: p.numero, sesionId: p.sesionId, texto, enlace };
  }
  const fecha = p.fecha!;
  if (p.desde === "hubspot") {
    return {
      tipo: "planificar",
      numero: p.numero,
      sesionId: null,
      fecha,
      falta: ["sesion"],
      texto: `Hay una reunión agendada el ${dia(fecha)} («${p.titulo ?? "sin título"}»): únela a una sesión y planifícala.`,
    };
  }
  const sesion = o.sesiones.find((s) => s.id === p.sesionId);
  const falta: ("guia" | "objetivo")[] = [];
  if (!(p.sesionId && o.guias[p.sesionId])) falta.push("guia");
  if (!sesion?.objetivo?.trim()) falta.push("objetivo");
  if (!falta.length) {
    return { tipo: "lista", numero: p.numero, sesionId: p.sesionId, fecha, texto: `La sesión ${p.numero} del ${dia(fecha)} está planificada: objetivo y guía listos.` };
  }
  const que = falta.length === 2 ? "confirma el objetivo y arma la guía" : falta[0] === "guia" ? "arma la guía" : "confirma el objetivo";
  return { tipo: "planificar", numero: p.numero, sesionId: p.sesionId, fecha, falta, texto: `La sesión ${p.numero} es el ${dia(fecha)}: planifícala (${que}).` };
}
