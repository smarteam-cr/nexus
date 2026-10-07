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
import { hayPropuestaParaRevisar } from "@/lib/timeline/borrador";
import { leerAutoriaDeLasPropuestas } from "@/lib/timeline/leer-autoria";
import { fraseDeAutoria } from "@/lib/timeline/autoria-de-la-propuesta";
import { haceCuanto, plural } from "../armar";
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

export const PEDIDOS_FUERA_DE_ALCANCE: Fuente = {
  clave: "pedidos-fuera-de-alcance",
  frente: null,
  alDia: "Los pedidos fuera de alcance de tus clientes",
  aplica: conProyectos,
  async medir(a) {
    const porId = new Map(a.proyectos.map((p) => [p.id, p]));
    const pedidos = await prisma.pedidoFueraDeAlcance.findMany({
      where: { projectId: { in: [...porId.keys()] }, estado: "PEDIDO", decididoAt: null },
      select: { id: true, projectId: true, pedido: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
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
          detalle: `«${recortar(primero.pedido, 110)}». Decide si se lo pasas a Ventas.`,
          meta: `Pedidos fuera de alcance · ${p.name}`,
          accion: "Decidir",
          href: urlDeProyecto(p.clientId, p.id),
          desde: primero.createdAt.toISOString(),
        },
      ];
    });
  },
};

/** Un pendiente vencido hace más que esto ya no se persigue desde «Para ti»: es historia, no lo de hoy. */
export const DIAS_DE_UN_PENDIENTE_VIGENTE = 30;

export const PENDIENTES_DE_REUNIONES: Fuente = {
  clave: "pendientes-de-reuniones",
  frente: null,
  alDia: "Los pendientes que salieron de tus reuniones",
  async medir(a, c) {
    const inicioDeHoy = new Date(`${c.hoyISO}T00:00:00-06:00`);
    const enUnaSemana = new Date(inicioDeHoy.getTime() + 7 * 86_400_000);
    // Solo lo vencido en los últimos 30 días (2026-10-05): había ~1.900 pendientes vencidos de meses atrás, y la fila
    // decía «200» (un tope de la consulta) donde había 449. Ahora el número es la cuenta real de lo reciente.
    const desde = new Date(inicioDeHoy.getTime() - DIAS_DE_UN_PENDIENTE_VIGENTE * 86_400_000);
    const base = {
      ownerEmail: { equals: a.email, mode: "insensitive" as const },
      done: false,
      deletedAt: null,
      status: { not: "DONE" as const },
    };
    const vencidosWhere = { ...base, dueDate: { gte: desde, lt: inicioDeHoy } };
    const proximosWhere = { ...base, dueDate: { gte: inicioDeHoy, lt: enUnaSemana } };
    const select = { id: true, text: true, dueDate: true, clientId: true, projectId: true, client: { select: { name: true } } } as const;
    const [nVencidos, nProximos, viejo, siguiente, clientesVencidos, clientesProximos] = await Promise.all([
      prisma.actionItem.count({ where: vencidosWhere }),
      prisma.actionItem.count({ where: proximosWhere }),
      prisma.actionItem.findFirst({ where: vencidosWhere, select, orderBy: { dueDate: "asc" } }),
      prisma.actionItem.findFirst({ where: proximosWhere, select, orderBy: { dueDate: "asc" } }),
      prisma.actionItem.groupBy({ by: ["clientId"], where: vencidosWhere }),
      prisma.actionItem.groupBy({ by: ["clientId"], where: proximosWhere }),
    ]);
    const out: Pendiente[] = [];
    const hrefDe = (i: NonNullable<typeof viejo>) =>
      i.projectId ? urlDeProyecto(i.clientId, i.projectId) : `/clients/${encodeURIComponent(i.clientId)}`;
    if (nVencidos > 0 && viejo) {
      out.push({
        clave: "pendientes-de-reuniones:vencidos",
        fuente: "pendientes-de-reuniones",
        cuando: "hoy",
        delAgente: false,
        titulo:
          nVencidos === 1
            ? "Venció un pendiente de tus reuniones"
            : `Vencieron ${nVencidos} pendientes de tus reuniones en el último mes`,
        detalle: `${nVencidos === 1 ? "Es" : "El más viejo"}: «${recortar(viejo.text, 90)}», de ${viejo.client.name} (venció el ${diaCorto(viejo.dueDate!)}).`,
        meta: `Pendientes de reuniones · ${plural(clientesVencidos.length, "cliente", "clientes")}`,
        accion: nVencidos === 1 ? "Ir al pendiente" : "Ir al más viejo",
        href: hrefDe(viejo),
        desde: viejo.dueDate!.toISOString(),
      });
    }
    if (nProximos > 0 && siguiente) {
      out.push({
        clave: "pendientes-de-reuniones:semana",
        fuente: "pendientes-de-reuniones",
        cuando: "semana",
        delAgente: false,
        titulo:
          nProximos === 1
            ? "Un pendiente de tus reuniones vence esta semana"
            : `${nProximos} pendientes de tus reuniones vencen esta semana`,
        detalle: `${nProximos === 1 ? "Es" : "El primero"}: «${recortar(siguiente.text, 90)}», de ${siguiente.client.name} (vence el ${diaCorto(siguiente.dueDate!)}).`,
        meta: `Pendientes de reuniones · ${plural(clientesProximos.length, "cliente", "clientes")}`,
        accion: nProximos === 1 ? "Ir al pendiente" : "Ir al primero",
        href: hrefDe(siguiente),
        desde: siguiente.dueDate!.toISOString(),
      });
    }
    return out;
  },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «30 sep», en la fecha de Costa Rica. */
export function diaCorto(d: Date): string {
  const cr = new Date(d.getTime() - 6 * 3_600_000);
  return `${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
}

export function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
