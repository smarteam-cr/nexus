/**
 * lib/para-ti/fuentes/reuniones.ts — lo que dejaron tus reuniones y espera tu revisión (2026-10-09, memoria de la cuenta,
 * etapa 1). UN renglón agrupado, con un enlace por reunión a su tarjeta «Lo que dejó esta reunión» (lib/seguimiento).
 *
 * Mira las reuniones de los últimos 30 días de los proyectos que llevas (las de un prospecto no entran: se revisan en la
 * tarjeta de la reunión) y cuenta SOLO lo que se decide en la tarjeta, con la misma regla (`loQuePideDecision`): la
 * minuta en borrador, los pedidos fuera de alcance que propuso Nexus, los campos de la ficha que salieron de esa
 * reunión y, desde la etapa 6, los hechos con una novedad que puedes decidir (vacío con `SEGUIMIENTO_HECHOS` apagada).
 * Las tareas siguen en el renglón de Tareas, y la etapa y la fecha del diagnóstico, en los suyos: cada cosa en un solo
 * renglón. Pasados 30 días desde la reunión, deja de pedirse.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { camposDeLaReunion, leerFicha } from "@/lib/clients/ficha";
import { documentoConContexto } from "@/lib/contexto/documento";
import { reunionesRecientesDeProyectos } from "@/lib/sessions/reuniones-para-seguimiento";
import { sumarDias, vencioSinRevisar } from "@/lib/lo-propuesto/ciclo";
import { PLAZO_PARA_REVISAR_DIAS } from "@/lib/lo-propuesto/tipos";
import { DESTINOS } from "@/lib/seguimiento/destinos";
import { novedadesPorDecidirPorReunion } from "@/lib/seguimiento/novedades-server";
import { loQuePideDecision } from "@/lib/seguimiento/tarjeta";
import { plural } from "../armar";
import type { Alcance } from "../alcance-server";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

/** Cuántos enlaces lleva el renglón (uno por reunión). */
const MAX_ENLACES = 8;

/** El enlace a la tarjeta de una reunión. */
export function urlDeLoQueDejo(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}#lo-que-dejo`;
}

/** Las reuniones del renglón: las de tus proyectos de los últimos 30 días, una vez cada una. */
export async function reunionesDelRenglon(proyectos: readonly { id: string; clientId: string }[], hoyISO: string) {
  const desde = new Date(`${sumarDias(hoyISO, -(PLAZO_PARA_REVISAR_DIAS + 1))}T00:00:00-06:00`);
  const todas = await reunionesRecientesDeProyectos(proyectos, desde);
  const unaVez = new Map<string, (typeof todas)[number]>();
  for (const r of todas) if (!unaVez.has(r.sessionId) && !vencioSinRevisar(r.fecha, hoyISO)) unaVez.set(r.sessionId, r);
  return [...unaVez.values()];
}

/** Los documentos cuyas novedades puede decidir esta persona: la celda de generar ese documento, como en la tarjeta. */
export function piezasQueDecide(permisos: Alcance["permisos"]): Set<string> {
  const piezas = new Set<string>();
  for (const d of DESTINOS) {
    if (d.salida !== "novedad" || !d.pieza) continue;
    const seccion = documentoConContexto(d.pieza)?.seccion;
    if (seccion && permisos.sections[seccion]?.generate === true) piezas.add(d.pieza);
  }
  return piezas;
}

export const LO_QUE_DEJARON_TUS_REUNIONES: Fuente = {
  clave: "reuniones-por-revisar-lo-que-dejaron",
  frente: null,
  alDia: "Lo que dejaron tus reuniones",
  aplica: (a) => a.proyectos.length > 0,
  async medir(a, c) {
    const reuniones = await reunionesDelRenglon(a.proyectos, c.hoyISO);
    if (reuniones.length === 0) return [];
    const ids = reuniones.map((r) => r.sessionId);
    const clientes = [...new Set(reuniones.map((r) => r.clientId))];
    const [minutas, pedidos, fichas, novedades] = await Promise.all([
      prisma.sessionMinute.findMany({ where: { sessionId: { in: ids }, status: "DRAFT" }, select: { sessionId: true } }),
      prisma.pedidoFueraDeAlcance
        .findMany({ where: { sessionId: { in: ids }, estado: "PEDIDO", creadoPor: null }, select: { sessionId: true, clientId: true } })
        .catch((e) => {
          if (esquemaDesactualizado(e)) return [];
          throw e;
        }),
      prisma.client.findMany({ where: { id: { in: clientes } }, select: { id: true, ficha: true } }),
      novedadesPorDecidirPorReunion(reuniones, piezasQueDecide(a.permisos), c.ahora),
    ]);
    const conMinuta = new Set(minutas.map((m) => m.sessionId));
    const fichaDe = new Map(fichas.map((f) => [f.id, leerFicha(f.ficha)]));
    const empresaDe = new Map(a.proyectos.map((p) => [p.id, p.empresa]));

    const conAlgo = reuniones
      .map((r) => {
        const ficha = fichaDe.get(r.clientId);
        const n = loQuePideDecision({
          minuta: conMinuta.has(r.sessionId),
          pedidos: pedidos.filter((p) => p.sessionId === r.sessionId && p.clientId === r.clientId).length,
          campos: ficha ? camposDeLaReunion(ficha, { title: r.titulo, date: r.fecha }).length : 0,
          novedades: novedades.get(r.sessionId) ?? 0,
        });
        return { r, n, empresa: empresaDe.get(r.projectId) ?? "" };
      })
      .filter((x) => x.n > 0)
      .sort((x, y) => y.r.fecha.localeCompare(x.r.fecha));
    if (conAlgo.length === 0) return [];

    const total = conAlgo.reduce((s, x) => s + x.n, 0);
    const [primera] = conAlgo;
    const empresas = new Set(conAlgo.map((x) => x.empresa));
    const masVieja = conAlgo[conAlgo.length - 1];
    const pendiente: Pendiente = {
      clave: "reuniones-por-revisar-lo-que-dejaron",
      fuente: "reuniones-por-revisar-lo-que-dejaron",
      cuando: "semana",
      delAgente: true,
      titulo:
        conAlgo.length === 1
          ? `Revisa lo que dejó «${primera.r.titulo}»`
          : `Revisa lo que dejaron ${conAlgo.length} reuniones`,
      detalle:
        `Nexus propuso ${plural(total, "cosa", "cosas")} al ${conAlgo.length === 1 ? "leerla" : "leerlas"}: la minuta, los ` +
        `pedidos fuera de alcance, la información del cliente${conAlgo.some((x) => novedades.has(x.r.sessionId)) ? " y novedades para los documentos" : ""}. ` +
        "Lo que nadie revisa en 30 días deja de pedirse.",
      meta: empresas.size === 1 ? `Reuniones · ${primera.empresa}` : "Reuniones",
      accion: conAlgo.length === 1 ? "Revisarla" : "Empezar por la más reciente",
      href: urlDeLoQueDejo(primera.r.sessionId),
      enlaces:
        conAlgo.length > 1
          ? conAlgo.slice(0, MAX_ENLACES).map((x) => ({ texto: `${x.empresa ? `${x.empresa} · ` : ""}${x.r.titulo} (${x.n})`, href: urlDeLoQueDejo(x.r.sessionId) }))
          : undefined,
      desde: masVieja.r.fecha,
    };
    return [pendiente];
  },
};
