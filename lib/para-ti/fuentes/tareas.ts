/**
 * lib/para-ti/fuentes/tareas.ts — lo que te toca en Tareas internas (docs/tareas-plan.md §5.8 y §8).
 *
 * Personal: le llega a quien tiene algo propio. Cuenta, no serializa (cada medición es un puñado de `count` y un
 * `groupBy`):
 *   · lo que espera tu decisión (de una reunión: en azul, con la chispa; pedido por otra persona: normal);
 *   · las semanas pasadas sin revisar, en orden, y la de hoy del viernes 15:00 al lunes 6:00;
 *   · lo de esta semana que no está en tu agenda;
 *   · si lideras un sprint: lo que está por asignar y, en la ventana de la revisión, quién no revisó su semana.
 * Los avisos («Lidia te sugiere…», «Alejandra revisó contigo…») van aparte, con `avisar()`.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { miembrosActivos, tareasDisponible } from "@/lib/tareas/servidor";
import { ABIERTAS_WHERE, PROPUESTAS_WHERE } from "@/lib/tareas/donde";
import { claveDeEquipo, equiposQueLidera, nombreDelEquipo } from "@/lib/tareas/equipos";
import { aDate, comoFecha, enVentanaDeRevision, lunesDeHoy, rangoDeLaSemana } from "@/lib/tareas/semana";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const TAREAS: Fuente = {
  clave: "tareas",
  frente: null,
  alDia: "Tus tareas",
  async medir(a, c) {
    if (!(await tareasDisponible())) return [];
    const yo = a.email.toLowerCase();
    const lunes = lunesDeHoy(c.ahora);
    const ventana = enVentanaDeRevision(c.ahora);
    const miembros = await miembrosActivos();
    const m = miembros.find((x) => x.email === yo);
    const lidera = m ? equiposQueLidera(m) : [];

    const [porDecidir, abiertasPorSemana, revisadas, sinAgendar, porAsignar] = await Promise.all([
      prisma.tarea.groupBy({
        by: ["origen"],
        where: {
          ...PROPUESTAS_WHERE,
          responsableEmail: yo,
          NOT: { proyecto: { estado: "propuesta", origen: { in: ["chat", "plantilla"] } } },
          // Las de una reunión con un cliente o un prospecto se cuentan en la línea de esa reunión (fase 1.4).
          AND: [{ OR: [{ sessionId: null }, { clientId: null }, { origen: { notIn: ["reunion", "notas"] } }] }],
        },
        _count: { _all: true },
      }),
      prisma.tarea.groupBy({ by: ["semana"], where: { ...ABIERTAS_WHERE, responsableEmail: yo, semana: { lte: aDate(lunes) } }, _count: { _all: true } }),
      prisma.cierreDeSemana.findMany({ where: { personaEmail: yo, semana: { lte: aDate(lunes) } }, select: { semana: true } }),
      prisma.tarea.count({ where: { ...ABIERTAS_WHERE, responsableEmail: yo, semana: aDate(lunes), agendaEstado: { not: "agendada" } } }),
      lidera.length
        ? prisma.tarea.groupBy({ by: ["equipo", "estado"], where: { archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso"] }, responsableEmail: null, proyectoId: null, equipo: { in: lidera } }, _count: { _all: true } })
        : Promise.resolve([]),
    ]);

    const salida: Pendiente[] = [];

    // Lo que espera tu decisión.
    const deReuniones = porDecidir.filter((g) => g.origen === "reunion" || g.origen === "notas" || g.origen === "chat").reduce((s, g) => s + g._count._all, 0);
    const pedidas = porDecidir.reduce((s, g) => s + g._count._all, 0) - deReuniones;
    if (deReuniones > 0) {
      salida.push({
        clave: "tareas:por-decidir:ia",
        fuente: "tareas",
        cuando: "hoy",
        delAgente: true,
        titulo: `Nexus te propone ${plural(deReuniones, "tarea", "tareas")}`,
        detalle: "Salieron de las reuniones de tu equipo o del asistente. Úsalas, déjalas para más adelante o descártalas: nada entra solo.",
        meta: "Tareas · Por decidir",
        accion: "Decidir",
        href: "/tareas",
      });
    }
    if (pedidas > 0) {
      salida.push({
        clave: "tareas:por-decidir:pedidas",
        fuente: "tareas",
        cuando: "hoy",
        delAgente: false,
        titulo: `Te pidieron ${plural(pedidas, "tarea", "tareas")}`,
        detalle: "Otra persona te las sugirió. Decide si las tomas.",
        meta: "Tareas · Por decidir",
        accion: "Decidir",
        href: "/tareas",
      });
    }

    // Las semanas sin revisar (las pasadas, en orden) y la de hoy en la ventana del viernes.
    const yaRevisadas = new Set(revisadas.map((r) => comoFecha(r.semana)!));
    const sinRevisar = abiertasPorSemana
      .map((g) => ({ semana: comoFecha(g.semana)!, abiertas: g._count._all }))
      .filter((s) => s.semana && !yaRevisadas.has(s.semana) && (s.semana < lunes || ventana))
      .sort((x, y) => x.semana.localeCompare(y.semana));
    const primera = sinRevisar[0];
    if (primera) {
      const esLaDeHoy = primera.semana === lunes;
      salida.push({
        clave: `tareas:revisar:${primera.semana}`,
        fuente: "tareas",
        cuando: "hoy",
        delAgente: false,
        titulo: esLaDeHoy ? `Revisa tu semana · ${plural(primera.abiertas, "sin marcar", "sin marcar")}` : `Revisa la semana del ${rangoDeLaSemana(primera.semana)}`,
        detalle: [
          esLaDeHoy ? "Marca qué terminaste; lo que no, sigue la próxima semana." : `Quedaron ${plural(primera.abiertas, "tarea", "tareas")} sin marcar.`,
          sinRevisar.length > 1 ? `Y ${plural(sinRevisar.length - 1, "semana más", "semanas más")}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        meta: "Tareas · Revisa tu semana",
        accion: "Revisar",
        href: `/tareas?revisar=${primera.semana}`,
      });
    }

    // Lo de esta semana fuera de tu agenda (no en la ventana: ahí manda revisar).
    if (sinAgendar > 0 && !ventana) {
      salida.push({
        clave: "tareas:agenda",
        fuente: "tareas",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(sinAgendar, "tarea de esta semana no está", "tareas de esta semana no están")} en tu agenda`,
        detalle: "Agéndalas: cada tarea en su propio bloque de Google Calendar.",
        meta: "Tareas · Agenda",
        accion: "Agendar",
        href: "/tareas",
      });
    }

    // Si lideras un sprint: lo que le pidieron a tu equipo (una propuesta sin dueño) lo decides tú en «Por decidir»; lo
    // aceptado sin dueño está en «Por asignar» de la semana del equipo.
    const pedidosAlEquipo = porAsignar.filter((g) => g.estado === "propuesta").reduce((s, g) => s + g._count._all, 0);
    if (pedidosAlEquipo > 0) {
      salida.push({
        clave: "tareas:por-decidir:equipo",
        fuente: "tareas",
        cuando: "hoy",
        delAgente: false,
        titulo: `Le pidieron ${plural(pedidosAlEquipo, "tarea", "tareas")} a tu equipo`,
        detalle: "Tómalas o pásaselas a alguien de tu equipo.",
        meta: "Tareas · Por decidir",
        accion: "Decidir",
        href: "/tareas",
      });
    }
    const sinDueno = new Map<string, number>();
    for (const g of porAsignar) if (g.equipo && g.estado !== "propuesta") sinDueno.set(g.equipo, (sinDueno.get(g.equipo) ?? 0) + g._count._all);
    for (const [equipo, n] of sinDueno) {
      const g = { equipo, _count: { _all: n } };
      salida.push({
        clave: `tareas:por-asignar:${g.equipo}`,
        fuente: "tareas",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(g._count._all, "tarea", "tareas")} por asignar en ${nombreDelEquipo(g.equipo)}`,
        detalle: "No tienen dueño claro. Asígnalas o déjalas para más adelante.",
        meta: "Tareas · Semana del equipo",
        accion: "Asignar",
        href: `/tareas/equipo?equipo=${encodeURIComponent(g.equipo)}`,
      });
    }
    if (ventana && lidera.length) {
      for (const equipo of lidera) {
        const personas = miembros.filter((x) => claveDeEquipo(x.area, x.email) === equipo && x.email !== yo).map((x) => x.email);
        if (!personas.length) continue;
        const [conAbiertas, cerraron] = await Promise.all([
          prisma.tarea.groupBy({ by: ["responsableEmail"], where: { ...ABIERTAS_WHERE, equipo, semana: aDate(lunes), responsableEmail: { in: personas } }, _count: { _all: true } }),
          prisma.cierreDeSemana.findMany({ where: { semana: aDate(lunes), personaEmail: { in: personas } }, select: { personaEmail: true } }),
        ]);
        const cerro = new Set(cerraron.map((x) => x.personaEmail));
        const faltan = conAbiertas.filter((x) => x.responsableEmail && !cerro.has(x.responsableEmail)).length;
        if (!faltan) continue;
        salida.push({
          clave: `tareas:equipo-sin-revisar:${equipo}`,
          fuente: "tareas",
          cuando: "semana",
          delAgente: false,
          titulo: `${plural(faltan, "persona", "personas")} de ${nombreDelEquipo(equipo)} no ${faltan === 1 ? "revisó su" : "revisaron su"} semana`,
          detalle: "Cada persona revisa la suya; puedes recordárselo en la retro.",
          meta: "Tareas · Semana del equipo",
          accion: "Ver",
          href: `/tareas/equipo?equipo=${encodeURIComponent(equipo)}`,
        });
      }
    }
    return salida;
  },
};
