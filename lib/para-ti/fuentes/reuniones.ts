/**
 * lib/para-ti/fuentes/reuniones.ts — lo que dejaron tus reuniones y espera tu revisión (2026-10-09, memoria de la cuenta,
 * etapa 1). Desde el 2026-10-16 (fase 1.4 de docs/nexus-sistema-de-trabajo-plan.md), UNA LÍNEA POR REUNIÓN, con su
 * cuenta (así «Lo que importa hoy» muestra una por cuenta), que lleva a su tarjeta «Lo que dejó esta reunión». Cuenta
 * también TUS tareas propuestas de esa reunión (las de un cliente o un prospecto); las de una reunión interna siguen en
 * el renglón de Tareas.
 *
 * Mira las reuniones de los últimos 30 días de los proyectos que llevas, más las de tus tareas propuestas (también de un
 * prospecto), y cuenta SOLO lo que se decide en la tarjeta, con la misma regla (`loQuePideDecision`): la
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
import { reunionParaLaTarjeta, reunionesRecientesDeProyectos } from "@/lib/sessions/reuniones-para-seguimiento";
import { sumarDias, vencioSinRevisar } from "@/lib/lo-propuesto/ciclo";
import { PLAZO_PARA_REVISAR_DIAS } from "@/lib/lo-propuesto/tipos";
import { DESTINOS } from "@/lib/seguimiento/destinos";
import { novedadesPorDecidirPorReunion } from "@/lib/seguimiento/novedades-server";
import { loQuePideDecision } from "@/lib/seguimiento/tarjeta";
import { plural } from "../armar";
import type { Alcance } from "../alcance-server";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

/** Cuántas reuniones, como mucho (una línea cada una). */
const MAX_REUNIONES = 8;

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
  async medir(a, c) {
    const yo = a.email.toLowerCase();
    const [deProyectos, propuestas] = await Promise.all([
      a.proyectos.length ? reunionesDelRenglon(a.proyectos, c.hoyISO) : Promise.resolve([]),
      // Tus tareas propuestas que salieron de una reunión con un cliente o un prospecto (fase 1.4).
      prisma.tarea
        .groupBy({
          by: ["sessionId"],
          where: { estado: "propuesta", archivadaAt: null, responsableEmail: yo, sessionId: { not: null }, clientId: { not: null }, origen: { in: ["reunion", "notas"] } },
          _count: { _all: true },
        })
        .catch((e) => {
          if (esquemaDesactualizado(e)) return [];
          throw e;
        }),
    ]);
    const tareasDe = new Map(propuestas.flatMap((g) => (g.sessionId ? [[g.sessionId, g._count._all] as const] : [])));
    // Las reuniones de tus propuestas que no son de tus proyectos (un prospecto, la cuenta de otro): se leen por el
    // lector de la tarjeta, con su regla de dueño.
    const conocidas = new Set(deProyectos.map((r) => r.sessionId));
    const otras = (
      await Promise.all(
        [...tareasDe.keys()]
          .filter((id) => !conocidas.has(id))
          .slice(0, MAX_REUNIONES)
          .map((id) => reunionParaLaTarjeta(id).catch(() => null)),
      )
    ).flatMap((r) => (r && !vencioSinRevisar(r.fecha, c.hoyISO) ? [{ sessionId: r.id, projectId: r.proyectos[0]?.id ?? "", clientId: r.clientId, titulo: r.titulo, fecha: r.fecha, empresa: r.empresa.nombre }] : []));
    const reuniones = [...deProyectos.map((r) => ({ ...r, empresa: null as string | null })), ...otras];
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

    const vistas = new Set<string>();
    const conAlgo = reuniones
      .filter((r) => (vistas.has(r.sessionId) ? false : (vistas.add(r.sessionId), true)))
      .map((r) => {
        const ficha = fichaDe.get(r.clientId);
        const partes = {
          minuta: conMinuta.has(r.sessionId),
          pedidos: pedidos.filter((p) => p.sessionId === r.sessionId && p.clientId === r.clientId).length,
          campos: ficha ? camposDeLaReunion(ficha, { title: r.titulo, date: r.fecha }).length : 0,
          novedades: novedades.get(r.sessionId) ?? 0,
          tareas: tareasDe.get(r.sessionId) ?? 0,
        };
        return { r, partes, n: loQuePideDecision(partes), empresa: r.empresa ?? empresaDe.get(r.projectId) ?? "" };
      })
      .filter((x) => x.n > 0)
      .sort((x, y) => y.r.fecha.localeCompare(x.r.fecha))
      .slice(0, MAX_REUNIONES);
    if (conAlgo.length === 0) return [];

    return conAlgo.map(({ r, partes, n, empresa }): Pendiente => {
      const que: string[] = [];
      if (partes.tareas) que.push(plural(partes.tareas, "tarea para ti", "tareas para ti"));
      if (partes.minuta) que.push("la minuta");
      if (partes.pedidos) que.push(plural(partes.pedidos, "pedido fuera de alcance", "pedidos fuera de alcance"));
      if (partes.campos) que.push(plural(partes.campos, "dato de la información del cliente", "datos de la información del cliente"));
      if (partes.novedades) que.push(plural(partes.novedades, "novedad para los documentos", "novedades para los documentos"));
      return {
        clave: `reuniones-por-revisar-lo-que-dejaron:${r.sessionId}`,
        fuente: "reuniones-por-revisar-lo-que-dejaron",
        cuando: "semana",
        delAgente: true,
        clientId: r.clientId,
        titulo: `Revisa lo que dejó «${r.titulo}»`,
        detalle: `Nexus propuso ${plural(n, "cosa", "cosas")} al leerla: ${que.join(", ")}. Lo que nadie revisa en 30 días deja de pedirse.`,
        meta: empresa ? `Reuniones · ${empresa}` : "Reuniones",
        accion: "Revisarla",
        href: urlDeLoQueDejo(r.sessionId),
        desde: r.fecha,
      };
    });
  },
};

