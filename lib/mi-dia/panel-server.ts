/**
 * lib/mi-dia/panel-server.ts — lo que muestra el panel de una reunión en el inicio (ficha D, 2026-10-17; diseño «Para
 * ti · Ventas y CSE»). SERVER-ONLY, solo lectura.
 *
 * Arma sobre el resumen antes de cada reunión (lib/mi-dia/resumen-server.ts, sin IA): la guía con su objetivo
 * (lib/mi-dia/guia.ts), quién viene, la última vez, lo pendiente de los dos lados y el negocio; para una reunión que ya
 * pasó, lo que dejó (la tarjeta de la reunión); y lo que la persona preparó (su objetivo y sus notas).
 *
 * ⛔ Quien lo pide ya pasó por `requireAccessToClient` (lo exige la ruta antes de llamar acá).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { equipoDelRol } from "@/lib/siguiente-paso/reglas";
import { resumenParaLaReunion } from "./resumen-server";
import { guiaDeLaReunion, type GuiaDeLaReunion } from "./guia";
import { leerPreparacion, preparacionDisponible, type PreparacionGuardada } from "./preparacion-server";
import { loQueDejoElEvento, type DespuesDeLaReunion } from "./despues-server";
import { servicioDeLasCuentas } from "./servicio-server";
import { diaCorto } from "./servicio";

export interface PersonaQueViene {
  nombre: string;
  cargo: string | null;
  /** «primera vez» si es del cliente y nunca estuvo en una reunión con él. */
  nota: string | null;
}

export interface PendienteDelPanel {
  titulo: string;
  lado: "cliente" | "smarteam";
  cuando: string;
  vencido: boolean;
}

export interface PanelDeLaReunion {
  eventoId: string;
  cliente: { id: string; nombre: string; tipo: string | null } | null;
  guia: GuiaDeLaReunion;
  preparacion: PreparacionGuardada;
  /** false = falta aplicar el SQL de la preparación, o es «Ver como»: el objetivo y las notas no se pueden guardar. */
  sePuedeGuardar: boolean;
  /** Es «Ver como»: las notas son de la persona mirada y no se muestran (el panel lo dice en vez de esconderlas). */
  verComo: boolean;
  vienen: PersonaQueViene[];
  ultima: { sessionId: string; fecha: string; resumen: string | null; fuente: string } | null;
  pendientes: PendienteDelPanel[];
  negocio: string | null;
  loQueDejo: DespuesDeLaReunion | null;
}

const TIPO: Record<string, string> = { CLIENTE: "cliente", PROSPECTO: "prospecto", ALIADO: "aliado", INTERNO: "interna" };

export async function panelDeLaReunion(o: {
  eventoId: string;
  clientId: string | null;
  user: AppUserWithTeamMember;
  email: string;
  rol: string;
  veAlertas: boolean;
  veMontos: boolean;
  hoyISO: string;
  ahora: Date;
  /** ISO del inicio del evento (lo manda la agenda): para saber si ya pasó y si hay otra reunión después. */
  inicio: string | null;
}): Promise<PanelDeLaReunion | null> {
  // Con «Ver como», quien mira de verdad es dirección: el objetivo y las notas son de la persona (las ve solo ella), así
  // que no se leen ni se dejan escribir.
  const verComo = !!o.user.verComoDe;
  const preparacion = verComo ? { objetivo: null, notas: null, actualizadaAt: null } : await leerPreparacion(o.email, o.eventoId);
  const base: PanelDeLaReunion = {
    eventoId: o.eventoId,
    cliente: null,
    guia: { objetivo: null, puntos: [] },
    preparacion,
    sePuedeGuardar: !verComo && preparacionDisponible(),
    verComo,
    vienen: [],
    ultima: null,
    pendientes: [],
    negocio: null,
    loQueDejo: null,
  };
  if (!o.clientId) return base;

  // Todo en paralelo (2026-10-17): «lo que dejó» ya no espera al resumen. Medido: el panel bajó de ~1,9 s a ~1,1 s.
  const yaPaso = o.inicio ? Date.parse(o.inicio) < o.ahora.getTime() : false;
  const [cliente, resumen, servicio, loQueDejo] = await Promise.all([
    prisma.client.findUnique({ where: { id: o.clientId }, select: { id: true, name: true, kind: true } }),
    resumenParaLaReunion({ clientId: o.clientId, eventoId: o.eventoId, email: o.email, veAlertas: o.veAlertas, veMontos: o.veMontos, ahora: o.ahora }),
    servicioDeLasCuentas([{ clientId: o.clientId, empresa: "", llevaEmail: o.email }], {
      ahora: o.ahora,
      hoyISO: o.hoyISO,
      quienMira: { email: o.email, esSuperAdmin: o.rol === "SUPER_ADMIN" },
    }).catch(() => null),
    yaPaso ? loQueDejoElEvento(o.eventoId, o.clientId, o.user, o.rol, o.ahora).catch(() => null) : Promise.resolve(null),
  ]);
  if (!cliente || !resumen) return null;

  // Otra reunión con la cuenta DESPUÉS de esta (no la primera de la lista: esa suele ser esta misma).
  const proximas = servicio?.get(o.clientId)?.proximas ?? [];
  const hayReunionDespues = o.inicio
    ? proximas.some((r) => Date.parse(r.inicio) > Date.parse(o.inicio!) + 60_000)
    : proximas.length > 0;

  const n = resumen.negocios[0];
  return {
    ...base,
    cliente: { id: cliente.id, nombre: cliente.name, tipo: TIPO[cliente.kind] ?? null },
    guia: guiaDeLaReunion(resumen, { equipo: equipoDelRol(o.rol), hoyISO: o.hoyISO, hayReunionDespues }),
    vienen: resumen.invitados.map((i) => ({
      nombre: i.nombre ?? i.email,
      cargo: i.lado === "smarteam" ? "Smarteam" : i.cargo,
      nota: i.lado === "cliente" && !i.ultimaReunion ? "primera vez" : null,
    })),
    ultima: resumen.ultimaVez
      ? { sessionId: resumen.ultimaVez.sessionId, fecha: diaCorto(resumen.ultimaVez.fecha), resumen: resumen.ultimaVez.resumen, fuente: resumen.ultimaVez.fuente }
      : null,
    pendientes: resumen.pendientes.slice(0, 5).map((p) => ({
      titulo: p.titulo,
      lado: p.lado,
      cuando: p.venceEl ? (p.venceEl < o.hoyISO ? `venció el ${diaYMes(p.venceEl)}` : p.venceEl === o.hoyISO ? "vence hoy" : `para el ${diaYMes(p.venceEl)}`) : "sin fecha",
      vencido: !!p.venceEl && p.venceEl <= o.hoyISO,
    })),
    negocio: n ? [n.nombre, n.etapa, n.monto, n.cierre ? `cierra el ${n.cierre}` : null].filter(Boolean).join(" · ") : null,
    loQueDejo,
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
