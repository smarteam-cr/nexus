/**
 * lib/para-ti/fuentes/proyectos.ts — lo PERSONAL de los proyectos que llevas (encargado en HubSpot o cuenta compartida
 * contigo). Las reglas son las del índice de clientes y del «Qué sigue» del proyecto: la propuesta de cronograma
 * (`hayPropuestaParaRevisar`), el alta a medio hacer (`altaEnCurso`), las reuniones que asignó la IA sin revisar
 * (`contarSesionesSinRevisar`) y los pedidos fuera de alcance que nadie decidió.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { altaEnCurso, EXPLICACION_DEL_PASO, siguientePaso } from "@/lib/projects/alta";
import { contarSesionesSinRevisar } from "@/lib/sessions/project-sources";
import { urlDeSolicitudes } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { fechaEnPalabras } from "@/lib/canvas/presentacion-del-diagnostico";
import { elDocumento, nombreDelDocumento, tituloParaTi } from "@/lib/presentaciones/reglas";
import { presentacionesQueTeTocan } from "@/lib/presentaciones/servidor";
import { hayPropuestaParaRevisar } from "@/lib/timeline/borrador";
import { leerAutoriaDeLasPropuestas } from "@/lib/timeline/leer-autoria";
import { fraseDeAutoria } from "@/lib/timeline/autoria-de-la-propuesta";
import { vencioSinRevisar } from "@/lib/lo-propuesto/ciclo";
import { pedidoCubiertoPorLaReunion } from "@/lib/seguimiento/tarjeta";
import { haceCuanto, plural } from "../armar";
import { reunionesDelRenglon } from "./reuniones";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

const conProyectos = (a: { proyectos: readonly unknown[] }) => a.proyectos.length > 0;

export const PROPUESTA_DE_CRONOGRAMA: Fuente = {
  clave: "cronograma-propuesta",
  frente: null,
  alDia: "Las propuestas de cronograma de tus proyectos",
  aplica: conProyectos,
  async medir(a, c) {
    const porId = new Map(a.proyectos.map((p) => [p.id, p]));
    const timelines = await prisma.projectTimeline.findMany({
      where: { projectId: { in: [...porId.keys()] }, pendingProposal: { not: Prisma.DbNull } },
      select: { projectId: true, pendingProposal: true, pendingProposalRunId: true },
    });
    const con = timelines.filter((t) => hayPropuestaParaRevisar(t.pendingProposal));
    const autorias = await leerAutoriaDeLasPropuestas(
      con.map((t) => ({ token: t.pendingProposalRunId, guardado: t.pendingProposal })),
    );
    return con.flatMap((t, i): Pendiente[] => {
      const p = porId.get(t.projectId);
      if (!p) return [];
      const autoria = autorias[i];
      const espera = haceCuanto(autoria?.cuando, c.ahora);
      return [
        {
          clave: `cronograma-propuesta:${p.id}`,
          fuente: "cronograma-propuesta",
          cuando: "hoy",
          delAgente: true,
          titulo: `Decide la propuesta de cronograma de ${p.empresa}`,
          detalle: autoria
            ? `Llegó ${fraseDeAutoria(autoria)}. No se aplica sola${espera && espera !== "hoy" ? `: espera desde ${espera}` : ""}.`
            : "No se aplica sola: espera tu decisión.",
          meta: `Cronograma · ${p.name}`,
          accion: "Abrir el cronograma",
          href: `${urlDeProyecto(p.clientId, p.id)}&canvas=timeline#cronograma-gantt`,
          desde: autoria?.cuando ?? null,
        },
      ];
    });
  },
};

export const ALTA_A_MEDIO_HACER: Fuente = {
  clave: "alta",
  frente: null,
  alDia: "Las altas de tus proyectos",
  aplica: conProyectos,
  async medir(a) {
    return a.proyectos.flatMap((p): Pendiente[] => {
      const estado = p.altaEstado as Parameters<typeof altaEnCurso>[0];
      const paso = altaEnCurso(estado) ? siguientePaso(estado) : null;
      if (!paso) return [];
      return [
        {
          clave: `alta:${p.id}`,
          fuente: "alta",
          cuando: "hoy",
          delAgente: false,
          titulo: `Termina el alta de «${p.name}» de ${p.empresa}`,
          detalle: `${EXPLICACION_DEL_PASO[paso].titulo}: no cobra ni suma a la cartera hasta terminarla.`,
          meta: `Alta de proyecto · ${p.empresa}`,
          accion: "Retomarla",
          href: urlDeProyecto(p.clientId, p.id),
        },
      ];
    });
  },
};

export const REUNIONES_SIN_REVISAR: Fuente = {
  clave: "reuniones-sin-revisar",
  frente: null,
  alDia: "Las reuniones que la IA asignó a tus proyectos",
  aplica: (a) => a.proyectos.some((p) => p.multiproyecto),
  async medir(a) {
    const multi = a.proyectos.filter((p) => p.multiproyecto);
    const porId = new Map(multi.map((p) => [p.id, p]));
    const sinRevisar = await contarSesionesSinRevisar(multi.map((p) => ({ id: p.id, clientId: p.clientId })));
    const conReuniones = [...sinRevisar]
      .map(([projectId, n]) => ({ p: porId.get(projectId), n }))
      .filter((x): x is { p: NonNullable<typeof x.p>; n: number } => !!x.p && x.n > 0)
      .sort((x, y) => y.n - x.n);
    if (conReuniones.length === 0) return [];
    // UNA fila para todos los proyectos (2026-10-05): con una por proyecto, a quien lleva muchos se le llenaba la parte
    // de arriba de la página. Nombra los dos que más tienen y lleva al primero.
    const total = conReuniones.reduce((s, x) => s + x.n, 0);
    const [primero, segundo] = conReuniones;
    const nombres = segundo
      ? `«${primero.p.name}» (${primero.n}) y «${segundo.p.name}» (${segundo.n})${conReuniones.length > 2 ? `, y ${conReuniones.length - 2} proyectos más` : ""}`
      : `«${primero.p.name}» de ${primero.p.empresa}`;
    return [
      {
        clave: "reuniones-sin-revisar",
        fuente: "reuniones-sin-revisar",
        cuando: "hoy",
        delAgente: true,
        titulo:
          conReuniones.length === 1
            ? `Revisa ${plural(total, "reunión que la IA asignó", "reuniones que la IA asignó")} a «${primero.p.name}»`
            : `Revisa ${total} reuniones que la IA asignó en ${conReuniones.length} proyectos`,
        detalle: `Nadie las confirmó: podrían ser de otro proyecto de la empresa. ${segundo ? `Las que más tienen: ${nombres}.` : ""}`.trim(),
        meta: conReuniones.length === 1 ? `Reuniones · ${primero.p.empresa}` : "Reuniones",
        accion: segundo ? "Empezar por la primera" : total === 1 ? "Revisarla" : "Revisarlas",
        href: urlDeProyecto(primero.p.clientId, primero.p.id),
      },
    ];
  },
};

/**
 * Los pedidos fuera de alcance que nadie decidió. Desde el 2026-10-09 (memoria de la cuenta, etapa 1) deja afuera los que
 * salieron de una reunión de los últimos 30 días (ya están en «Lo que dejaron tus reuniones»: cada cosa en un solo
 * renglón) y los que llevan más de 30 días sin revisar (vencidos: se siguen viendo en La cuenta › Fuera de alcance).
 */
export const PEDIDOS_FUERA_DE_ALCANCE: Fuente = {
  clave: "pedidos-fuera-de-alcance",
  frente: null,
  alDia: "Los pedidos fuera de alcance de tus clientes",
  aplica: conProyectos,
  async medir(a, c) {
    const porId = new Map(a.proyectos.map((p) => [p.id, p]));
    const [todos, delRenglon] = await Promise.all([
      prisma.pedidoFueraDeAlcance.findMany({
        where: { projectId: { in: [...porId.keys()] }, estado: "PEDIDO", decididoAt: null },
        select: { id: true, projectId: true, pedido: true, createdAt: true, sessionId: true },
        orderBy: { createdAt: "asc" },
      }),
      reunionesDelRenglon(a.proyectos, c.hoyISO),
    ]);
    const cubiertas = new Set(delRenglon.map((r) => r.sessionId));
    const pedidos = todos.filter((pe) => !pedidoCubiertoPorLaReunion(pe, cubiertas) && !vencioSinRevisar(pe.createdAt, c.hoyISO));
    const porProyecto = new Map<string, typeof pedidos>();
    for (const pe of pedidos) {
      if (!pe.projectId) continue;
      porProyecto.set(pe.projectId, [...(porProyecto.get(pe.projectId) ?? []), pe]);
    }
    return [...porProyecto].flatMap(([projectId, lista]): Pendiente[] => {
      const p = porId.get(projectId);
      if (!p) return [];
      const primero = lista[0];
      return [
        {
          clave: `pedidos-fuera-de-alcance:${p.id}`,
          fuente: "pedidos-fuera-de-alcance",
          cuando: "semana",
          delAgente: false,
          titulo:
            lista.length === 1
              ? `${p.empresa} pidió algo fuera del alcance`
              : `${p.empresa} pidió ${lista.length} cosas fuera del alcance`,
          detalle: `«${recortar(primero.pedido, 110)}». Confírmala o descártala: al confirmarla les avisamos a Customer Success y al vendedor.`,
          meta: `Fuera de alcance · ${p.name}`,
          accion: lista.length === 1 ? "Revisarla" : "Revisarlas",
          href: urlDeSolicitudes(p.clientId),
          desde: primero.createdAt.toISOString(),
        },
      ];
    });
  },
};

/**
 * Cuándo se le presenta cada documento al cliente (2026-10-14, lib/presentaciones): el kickoff, el diagnóstico, la
 * planificación y la entrega. Le llega SOLO a Customer Success, a quien le toca responder: el encargado del proyecto,
 * quien generó el documento, o la CSL si no hay nadie de Customer Success. Se va solo cuando se responde. La tarjeta
 * del documento («Ahora no») no lo calla: acá sigue.
 */
export const PRESENTACIONES: Fuente = {
  clave: "presentaciones",
  frente: null,
  alDia: "Cuándo se presentan tus documentos",
  aplica: (a) => a.rol === "CSE" || a.rol === "CSL",
  async medir(a, c) {
    const tocan = await presentacionesQueTeTocan({ email: a.email, rol: a.rol }, a.proyectos.map((p) => p.id), c.ahora);
    return tocan.flatMap(({ vista: v, href }): Pendiente[] => {
      const p = v.presentacion;
      const meta = `${nombreDelDocumento(v.documento)} · ${v.proyecto}`;
      const responder = `${href}&presentacion=responder`;
      if (v.pide) {
        const urgente = v.estado === "por-reconfirmar" || v.estado === "paso-la-fecha";
        const detalle =
          v.estado === "por-reconfirmar"
            ? "Confírmalo y le avisamos al vendedor para que lo revise antes."
            : v.estado === "paso-la-fecha"
              ? `Era el ${fechaEnPalabras(p.fecha!)}. Di si se presentó o si se movió.`
              : v.estado === "sin-fecha"
                ? "La última vez dijiste «Todavía no sé»."
                : `Ya está generado. Di cuándo presentas ${elDocumento(v.documento)}, o si ya se presentó.`;
        return [
          {
            clave: `presentacion:${v.documento}:${v.projectId}`,
            fuente: "presentaciones",
            cuando: urgente ? "hoy" : "semana",
            delAgente: false,
            titulo: tituloParaTi(v.estado, v.documento, v.empresa),
            detalle,
            meta,
            accion: "Responder",
            href: responder,
            desde: p.ultima?.en ?? null,
          },
        ];
      }
      // La fecha que leyó Nexus en una reunión deja de pedirse a los 30 días (se sigue viendo en el documento).
      if (p.propuesta && !vencioSinRevisar(p.propuesta.en || p.propuesta.reunion.fecha, c.hoyISO)) {
        return [
          {
            clave: `presentacion:propuesta:${v.documento}:${v.projectId}`,
            fuente: "presentaciones",
            cuando: "semana",
            delAgente: true,
            titulo: `Nexus leyó cuándo se presenta ${elDocumento(v.documento)} de ${v.empresa}`,
            detalle: `El ${fechaEnPalabras(p.propuesta.fecha)}, según «${recortar(p.propuesta.cita, 100)}». Úsala o cámbiala.`,
            meta,
            accion: "Revisarla",
            href,
            desde: p.propuesta.en || null,
          },
        ];
      }
      return [];
    });
  },
};

/* Los pendientes de tus reuniones (`ActionItem`) dejaron de ser una fuente el 2026-10-10 (memoria de la cuenta, etapa 2):
   los compromisos de una reunión son propuestas de Tarea y los cuenta la fuente TAREAS (fuentes/tareas.ts). */

export function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
