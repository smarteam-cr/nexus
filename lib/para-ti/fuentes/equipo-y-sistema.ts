/**
 * lib/para-ti/fuentes/equipo-y-sistema.ts — los frentes que juntan lo que el EQUIPO deja para alguien: los comentarios
 * de la Escala y de la Documentación, lo que Marketing tiene por revisar, los pedidos de clientes que esperan a Ventas
 * y lo que falló en el servidor.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { nombreDeJob } from "@/lib/jobs/nombres";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";
import { recortar } from "./proyectos";

export const COMENTARIOS_DE_LA_ESCALA: Fuente = {
  clave: "escala-comentarios",
  frente: "ESCALA",
  alDia: "Los comentarios de la Escala",
  async medir() {
    // Desde el 2026-10-05 un comentario de la Escala es un reporte de Feedback con su ancla (lib/feedback/escala.ts) y
    // se decide en la bandeja de Feedback. Los que esperan son los que nadie revisó todavía.
    const abiertos = await prisma.feedbackReporte.findMany({
      where: { escalaAncla: { not: null }, estado: "sin_revisar" },
      select: { id: true, escalaAncla: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (abiertos.length === 0) return [];
    const viejo = abiertos[0];
    return [
      {
        clave: "escala-comentarios",
        fuente: "escala-comentarios",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(abiertos.length, "comentario de la Escala espera", "comentarios de la Escala esperan")} una decisión`,
        detalle: `El más viejo es del ${diaCorto(viejo.createdAt)}, en ${viejo.escalaAncla}.`,
        meta: "Escala · se decide en Feedback",
        accion: "Abrir la bandeja",
        href: "/feedback?origen=escala",
        desde: viejo.createdAt.toISOString(),
      },
    ];
  },
};

export const COMENTARIOS_DE_LA_DOCUMENTACION: Fuente = {
  clave: "documentacion-comentarios",
  frente: "DOCUMENTACION",
  alDia: "Los comentarios de la Documentación",
  async medir() {
    const hilos = await prisma.hiloDeComentariosDoc.findMany({
      where: { resueltoAt: null },
      select: { id: true, createdAt: true, pagina: { select: { slug: true, titulo: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (hilos.length === 0) return [];
    const paginas = [...new Set(hilos.map((h) => h.pagina.titulo))];
    const viejo = hilos[0];
    return [
      {
        clave: "documentacion-comentarios",
        fuente: "documentacion-comentarios",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(hilos.length, "comentario abierto", "comentarios abiertos")} en la Documentación`,
        detalle:
          paginas.length <= 2
            ? `En ${paginas.map((t) => `«${t}»`).join(" y ")}.`
            : `En «${paginas[0]}», «${paginas[1]}» y ${paginas.length - 2} páginas más.`,
        meta: "Documentación",
        accion: "Ver el más viejo",
        href: `/documentacion/${encodeURIComponent(viejo.pagina.slug)}`,
        desde: viejo.createdAt.toISOString(),
      },
    ];
  },
};

export const MARKETING_POR_REVISAR: Fuente = {
  clave: "marketing-revisar",
  frente: "MARKETING",
  alDia: "Las publicaciones y las ideas de campaña",
  async medir() {
    const [publicaciones, ideas] = await Promise.all([
      prisma.contentIdea.count({ where: { selectedAt: null, usedAt: null, discardedAt: null } }),
      prisma.campaignIdea.count({ where: { status: "PENDING" } }),
    ]);
    const out: Pendiente[] = [];
    if (publicaciones > 0) {
      out.push({
        clave: "marketing-revisar:publicaciones",
        fuente: "marketing-revisar",
        cuando: "semana",
        delAgente: true,
        titulo: `${plural(publicaciones, "publicación sugerida espera", "publicaciones sugeridas esperan")} revisión`,
        detalle: "Las parecidas van juntas: se descartan de a grupo.",
        meta: "Marketing › Publicaciones",
        accion: "Revisarlas",
        href: "/marketing/contenido",
      });
    }
    if (ideas > 0) {
      out.push({
        clave: "marketing-revisar:sem",
        fuente: "marketing-revisar",
        cuando: "semana",
        delAgente: true,
        titulo: `${plural(ideas, "idea de campaña espera", "ideas de campaña esperan")} revisión`,
        detalle: "Ideas de SEM que dejó el agente.",
        meta: "Marketing › Ideas de SEM",
        accion: "Revisarlas",
        href: "/marketing/ideas-de-campana",
      });
    }
    return out;
  },
};

export const PEDIDOS_PARA_VENTAS: Fuente = {
  clave: "ventas-pedidos",
  frente: "VENTAS",
  alDia: "Los pedidos de clientes que pueden ser venta",
  async medir(_a, c) {
    // Lo mismo que «Oportunidades detectadas» de Ventas (lib/ventas/cargar-oportunidades.ts): lo que el cliente pidió
    // fuera del alcance y sigue abierto. Solo lo de los últimos 60 días: lo viejo ya se habló o se perdió.
    const desde = new Date(c.ahora.getTime() - DIAS_DE_UN_PEDIDO_FRESCO * 86_400_000);
    const pedidos = await prisma.pedidoFueraDeAlcance.findMany({
      where: { estado: { in: ["PEDIDO", "COTIZADO"] }, createdAt: { gte: desde }, NOT: { project: { proyectoInterno: true } } },
      select: { id: true, pedido: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    if (pedidos.length === 0) return [];
    const p = pedidos[0];
    return [
      {
        clave: "ventas-pedidos",
        fuente: "ventas-pedidos",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(pedidos.length, "pedido de un cliente puede", "pedidos de clientes pueden")} ser venta`,
        detalle: `${pedidos.length === 1 ? "Es" : "El más viejo"}: ${p.client.name}, «${recortar(p.pedido, 90)}».`,
        meta: "Ventas › Oportunidades detectadas",
        accion: "Ver oportunidades",
        href: "/sales",
        desde: p.createdAt.toISOString(),
      },
    ];
  },
};

const DIAS_DE_UN_PEDIDO_FRESCO = 60;

export const PROCESOS_QUE_FALLARON: Fuente = {
  clave: "sistema-jobs",
  frente: "SISTEMA",
  alDia: "Las copias automáticas y los procesos del servidor",
  async medir() {
    /* Solo las filas que son jobs del scheduler: CronJobState también guarda candados y turnos, que no se avisan.
       La lista sale de `allJobs()` y no de los nombres: hasta el 2026-10-05 un job sin nombre escrito a mano se
       descartaba en silencio (lib/jobs/nombres.ts). Import diferido, como hace defs.ts con lo suyo: arrastra los jobs. */
    const { allJobs } = await import("@/lib/jobs/defs");
    const filas = await prisma.cronJobState.findMany({
      where: { id: { in: allJobs().map((j) => j.key) } },
      select: { id: true, lastResult: true },
    });
    const out: Pendiente[] = [];
    for (const f of filas) {
      const r = f.lastResult as { ok?: unknown; error?: unknown; at?: unknown } | null;
      if (!r || r.ok !== false || typeof r.at !== "string") continue;
      const nombre = nombreDeJob(f.id);
      out.push({
        clave: `sistema-jobs:${f.id}`,
        fuente: "sistema-jobs",
        cuando: "hoy",
        delAgente: false,
        error: true,
        titulo: `${nombre} falló`,
        detalle: typeof r.error === "string" ? recortar(r.error, 140) : "El último intento terminó con error.",
        meta: "Integraciones · falló",
        accion: "Ver el error",
        href: "/integrations",
        desde: r.at,
      });
    }
    return out;
  },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function diaCorto(d: Date): string {
  const cr = new Date(d.getTime() - 6 * 3_600_000);
  return `${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
}
