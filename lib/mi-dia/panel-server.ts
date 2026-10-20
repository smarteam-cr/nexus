/**
 * lib/mi-dia/panel-server.ts — lo que muestra el panel de una reunión en el inicio (ficha D, 2026-10-17; diseño «Para
 * ti · Ventas y CSE»). SERVER-ONLY, solo lectura.
 *
 * Arma sobre el resumen antes de cada reunión (lib/mi-dia/resumen-server.ts, sin IA): la guía con su objetivo
 * (lib/mi-dia/guia.ts), quién viene, la última vez y el negocio (lo pendiente lo lee el panel de Tareas, con sus botones:
 * components/para-ti/inicio/PendientesDelPanel.tsx, 2026-10-20); para una reunión que ya
 * pasó, lo que dejó (la tarjeta de la reunión); y lo que la persona preparó (su objetivo y sus notas).
 *
 * Un evento PROPIO (2026-10-19: «Preparar demo para Accesos Automáticos», sin otros invitados) usa el mismo panel con
 * `propio`: no se lee el evento ni lo que dejó (no es una reunión), y suma la próxima reunión con la cuenta y su
 * siguiente paso. La cuenta la decide la agenda (lib/mi-dia/agenda.ts › empresasDelEventoPropio).
 *
 * Una reunión INTERNA que nombra a una empresa (2026-10-19, prueba 151: «Preparar demo para Accesos Automáticos» con
 * alguien más de la casa) usa `interna`: lo de la cuenta como un evento propio (la próxima reunión desde ahora, el
 * siguiente paso, lo pendiente), sin la guía ni lo que dejó (no fue con el cliente), pero con su sesión si ya pasó.
 * La cuenta la decide la agenda (lib/mi-dia/agenda.ts › empresasDeLaReunionInterna).
 *
 * ⛔ Quien lo pide ya pasó por `requireAccessToClient` (lo exige la ruta antes de llamar acá).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { equipoDelRol } from "@/lib/siguiente-paso/reglas";
import { resumenParaLaReunion } from "./resumen-server";
import { guiaDeLaReunion, siguientePasoParaElPanel, type GuiaDeLaReunion } from "./guia";
import { NOMBRE_DEL_EQUIPO } from "@/lib/siguiente-paso/reglas";
import { leerPreparacion, preparacionDisponible, type PreparacionGuardada } from "./preparacion-server";
import { loQueDejoElEvento, sesionDelEvento, type DespuesDeLaReunion } from "./despues-server";
import { servicioDeLasCuentas } from "./servicio-server";
import { cuandoEsLaReunion, diaCorto } from "./servicio";
import { horaCR } from "./inicio";

export interface PersonaQueViene {
  nombre: string;
  cargo: string | null;
  /** «primera vez» si es del cliente y nunca estuvo en una reunión con él. */
  nota: string | null;
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
  negocio: string | null;
  loQueDejo: DespuesDeLaReunion | null;
  /** La sesión de Nexus de este evento, si ya pasó y llegó: «Revisar sesión» lleva a su página. */
  sesionId: string | null;
  /** La próxima reunión con la cuenta en los próximos 8 días (la muestra el panel de un evento propio). */
  proxima: { titulo: string; cuando: string } | null;
  /** El siguiente paso sobre la cuenta: el de tu equipo o, si no tiene, el más próximo (lo muestra el panel de un evento propio). */
  siguientePaso: { equipo: string; que: string; cuando: string | null; quien: string | null } | null;
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
  /** Es un evento propio, no una reunión: no se lee el evento ni lo que dejó. */
  propio?: boolean;
  /** Es una reunión interna que nombra a la cuenta: lo de la cuenta como un evento propio, y su sesión si ya pasó. */
  interna?: boolean;
}): Promise<PanelDeLaReunion | null> {
  // Lo de la cuenta sin la reunión: el evento no fue con el cliente (uno propio, o uno interno que lo nombra).
  const soloLaCuenta = !!o.propio || !!o.interna;
  // Con «Ver como», quien mira de verdad es dirección: el objetivo y las notas son de la persona (las ve solo ella), así
  // que no se leen ni se dejan escribir.
  const verComo = !!o.user.verComoDe;
  const yaPaso = !o.propio && (o.inicio ? Date.parse(o.inicio) < o.ahora.getTime() : false);
  const [preparacion, sesionId] = await Promise.all([
    verComo ? Promise.resolve({ objetivo: null, notas: null, actualizadaAt: null }) : leerPreparacion(o.email, o.eventoId),
    yaPaso ? sesionDelEvento(o.eventoId).catch(() => null) : Promise.resolve(null),
  ]);
  const base: PanelDeLaReunion = {
    eventoId: o.eventoId,
    cliente: null,
    guia: { objetivo: null, puntos: [] },
    preparacion,
    sePuedeGuardar: !verComo && preparacionDisponible(),
    verComo,
    vienen: [],
    ultima: null,
    negocio: null,
    loQueDejo: null,
    sesionId,
    proxima: null,
    siguientePaso: null,
  };
  if (!o.clientId) return base;

  // Todo en paralelo (2026-10-17): «lo que dejó» ya no espera al resumen. Medido: el panel bajó de ~1,9 s a ~1,1 s.
  const [cliente, resumen, servicio, loQueDejo] = await Promise.all([
    prisma.client.findUnique({ where: { id: o.clientId }, select: { id: true, name: true, kind: true } }),
    resumenParaLaReunion({ clientId: o.clientId, eventoId: soloLaCuenta ? null : o.eventoId, email: o.email, veAlertas: o.veAlertas, veMontos: o.veMontos, ahora: o.ahora }),
    servicioDeLasCuentas([{ clientId: o.clientId, empresa: "", llevaEmail: o.email }], {
      ahora: o.ahora,
      hoyISO: o.hoyISO,
      quienMira: { email: o.email, esSuperAdmin: o.rol === "SUPER_ADMIN" },
    }).catch(() => null),
    yaPaso && !soloLaCuenta ? loQueDejoElEvento(o.eventoId, o.clientId, o.user, o.rol, o.ahora).catch(() => null) : Promise.resolve(null),
  ]);
  if (!cliente || !resumen) return null;

  // Otra reunión con la cuenta DESPUÉS de esta (no la primera de la lista: esa suele ser esta misma).
  const proximas = servicio?.get(o.clientId)?.proximas ?? [];
  const hayReunionDespues = o.inicio
    ? proximas.some((r) => Date.parse(r.inicio) > Date.parse(o.inicio!) + 60_000)
    : proximas.length > 0;

  // La próxima reunión con la cuenta (para un evento propio o interno, la primera que viene desde ahora).
  const desde = soloLaCuenta ? o.ahora.getTime() : o.inicio ? Date.parse(o.inicio) + 60_000 : o.ahora.getTime();
  const proxima = proximas.find((r) => Date.parse(r.inicio) > desde) ?? null;
  const paso = siguientePasoParaElPanel(resumen.pasos?.pasos ?? [], equipoDelRol(o.rol));

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
    negocio: n ? [n.nombre, n.etapa, n.monto, n.cierre ? `cierra el ${n.cierre}` : null].filter(Boolean).join(" · ") : null,
    loQueDejo,
    proxima: proxima ? { titulo: proxima.titulo, cuando: `${cuandoEsLaReunion(proxima.inicio, o.hoyISO)} · ${horaCR(proxima.inicio)}` } : null,
    siguientePaso: paso
      ? {
          equipo: NOMBRE_DEL_EQUIPO[paso.equipo],
          que: paso.que,
          cuando: paso.fecha ? (paso.fecha < o.hoyISO ? `venció el ${diaYMes(paso.fecha)}` : paso.fecha === o.hoyISO ? "hoy" : `para el ${diaYMes(paso.fecha)}`) : null,
          quien: paso.responsableNombre ?? paso.responsableEmail,
        }
      : null,
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
