/**
 * lib/feedback/escala-server.ts — el feedback que se manda desde la escala, del lado del servidor.
 *
 * Desde el 2026-10-05 la escala no tiene sistema de comentarios propio (ver `lib/feedback/escala.ts`): el
 * botón de cada criterio abre el panel de Feedback y el reporte se guarda con `crearReporte`, como todos.
 * Acá vive lo que ese reporte tiene de la escala:
 *   · `anclarALaEscala`: el ancla se resuelve contra la versión PUBLICADA y su texto se congela acá (nunca
 *     lo manda el navegador); la «pantalla» y la dirección del reporte pasan a ser las del criterio;
 *   · los contadores de la escala (los ve quien revisa);
 *   · lo que la bandeja muestra de un reporte de la escala, y la fila del manual al llevarlo a la hoja de ruta;
 *   · los cambios de la escala que están en la hoja de ruta, para el manual.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { resolverAncla } from "@/lib/escala/documento/anclas";
import { aplicarEdicion, edicionPorSlug } from "@/lib/escala/documento/edicion";
import { describirPerfil, type Cierre, type Despues } from "@/lib/escala/documento/perfil";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { ErrorDeFeedback } from "./error";
import {
  filaSugerida,
  leerEscalaDelReporte,
  pantallaDeLaEscala,
  rutaEnLaEscala,
  type ConteosPorClave,
  type DetalleDeEscala,
  type EscalaDelReporte,
  type FilaDelManual,
} from "./escala";
import type { CambioDeLaEscala } from "./manual-de-la-escala";

/** El SQL que le suma a Feedback lo de la escala. */
export const SQL_DE_LA_ESCALA_EN_FEEDBACK = "scripts/sql/2026-10-05-feedback-escala.sql";

/** Solo lo mandado desde la escala: un reporte de pantalla nunca sale por acá. */
const DE_LA_ESCALA = { escalaAncla: { not: null } } satisfies Prisma.FeedbackReporteWhereInput;

/** Lo que manda el panel cuando se abrió desde la escala. */
export interface AnclaPedida {
  ancla: string;
  edicion?: string | null;
  perfilCierre?: string | null;
  perfilDespues?: string | null;
}

/** Lo que el reporte guarda de la escala: sus columnas, y la pantalla y la dirección del criterio. */
export interface ReporteEnLaEscala {
  escalaAncla: string;
  escalaArea: string;
  escala: Prisma.InputJsonValue;
  pantalla: string;
  ruta: string;
}

/**
 * El ancla tiene que existir en la versión publicada, leída con la edición con que se estaba mirando (un
 * criterio propio de una edición no existe en la general, y uno reescrito se lee distinto).
 */
export async function anclarALaEscala(pedida: AnclaPedida): Promise<ReporteEnLaEscala> {
  const vigente = await leerEscalaVigente();
  if (vigente.estado !== "ok") throw new ErrorDeFeedback("La escala todavía no está publicada en Nexus.", 409);
  const escala = vigente.escala;
  const edicion = pedida.edicion ? edicionPorSlug(escala, pedida.edicion) : null;
  if (pedida.edicion && !edicion) throw new ErrorDeFeedback(`La versión ${escala.version} no tiene la edición «${pedida.edicion}».`, 400);
  const ancla = resolverAncla(aplicarEdicion(escala, edicion?.slug ?? null), pedida.ancla);
  if (!ancla) {
    throw new ErrorDeFeedback(`«${pedida.ancla}» no existe en la versión ${escala.version}${edicion ? `, edición ${edicion.nombre}` : ""}.`, 400);
  }
  const contexto: EscalaDelReporte = {
    tipoDeAncla: ancla.tipo,
    dimension: ancla.dimension.id,
    version: escala.version,
    textoAnclado: ancla.texto,
    edicion: edicion?.slug ?? null,
    // El esquema de la ruta ya los validó contra CIERRES y DESPUES.
    perfil: { cierre: (pedida.perfilCierre as Cierre | null | undefined) ?? null, despues: (pedida.perfilDespues as Despues | null | undefined) ?? null },
    cambio: null,
  };
  return {
    escalaAncla: ancla.id,
    escalaArea: ancla.area.id,
    escala: contexto as unknown as Prisma.InputJsonValue,
    pantalla: pantallaDeLaEscala(ancla.area.nombre),
    ruta: rutaEnLaEscala({ slug: ancla.area.slug, ancla: ancla.id, edicion: edicion?.slug ?? null }),
  };
}

/** Los contadores de la escala: abiertos = sin revisar. Sin tablas o sin columnas, vacíos. */
async function contarPor(campo: "escalaAncla" | "escalaArea", where: Prisma.FeedbackReporteWhereInput): Promise<ConteosPorClave> {
  if (!modeloDisponible(prisma.feedbackReporte)) return {};
  try {
    const grupos = await prisma.feedbackReporte.groupBy({ by: [campo, "estado"], where: { ...DE_LA_ESCALA, ...where }, _count: { _all: true } });
    const out: ConteosPorClave = {};
    for (const g of grupos) {
      const clave = g[campo];
      if (!clave) continue;
      const c = (out[clave] ??= { total: 0, abiertos: 0 });
      c.total += g._count._all;
      if (g.estado === "sin_revisar") c.abiertos += g._count._all;
    }
    return out;
  } catch (e) {
    if (esquemaDesactualizado(e)) return {};
    throw e;
  }
}

export function contarPorAncla(area: string): Promise<ConteosPorClave> {
  return contarPor("escalaAncla", { escalaArea: area });
}

export function contarPorArea(): Promise<ConteosPorClave> {
  return contarPor("escalaArea", {});
}

/** La columna `escala` con lo mínimo si vino rota: sin inventar textos. */
function escalaDe(escala: unknown, escalaAncla: string): EscalaDelReporte {
  return (
    leerEscalaDelReporte(escala) ?? {
      tipoDeAncla: "criterio",
      dimension: escalaAncla.split(".").slice(0, 2).join("."),
      version: "",
      textoAnclado: "",
      edicion: null,
      perfil: { cierre: null, despues: null },
      cambio: null,
    }
  );
}

/** Para un reporte de la escala: lo que se estaba leyendo, contra la versión vigente. */
export async function detalleDeEscala(f: { escalaAncla: string | null; escala: unknown; cuerpo: string; tipo: string; estado: string }): Promise<DetalleDeEscala | null> {
  if (!f.escalaAncla) return null;
  const e = escalaDe(f.escala, f.escalaAncla);
  const vigente = await leerEscalaVigente();
  const escala = vigente.estado === "ok" ? vigente.escala : null;
  const edicion = e.edicion && escala ? edicionPorSlug(escala, e.edicion) : null;
  const hoy = escala ? resolverAncla(aplicarEdicion(escala, e.edicion), f.escalaAncla) : null;
  const nombreDeLaEdicion = e.edicion ? (edicion?.nombre ?? e.edicion) : null;
  return {
    ancla: f.escalaAncla,
    ruta: hoy?.ruta ?? null,
    textoAnclado: e.textoAnclado,
    textoDeHoy: escala ? (hoy?.texto ?? null) : e.textoAnclado,
    version: e.version,
    versionVigente: escala?.version ?? null,
    edicion: nombreDeLaEdicion,
    perfil: describirPerfil(e.perfil) || null,
    cambio: f.estado === "en_hoja" ? e.cambio : null,
    sugerida: filaSugerida({ ancla: f.escalaAncla, edicion: nombreDeLaEdicion, tipo: f.tipo, cuerpo: f.cuerpo, cambio: e.cambio }),
  };
}

/** Al llevar un reporte de la escala a la hoja de ruta: su fila del manual (la pide la decisión). */
export function conLaFilaDelManual(escala: unknown, escalaAncla: string, cambio: FilaDelManual): Prisma.InputJsonValue {
  return { ...escalaDe(escala, escalaAncla), cambio } as unknown as Prisma.InputJsonValue;
}

/** Los cambios de la escala que están en la hoja de ruta, con su fila del manual, en el orden en que llegaron. */
export async function cambiosDeLaEscala(): Promise<CambioDeLaEscala[]> {
  const filas = await prisma.feedbackReporte.findMany({
    where: { ...DE_LA_ESCALA, estado: "en_hoja" },
    orderBy: { createdAt: "asc" },
    select: { autorEmail: true, createdAt: true, escala: true, escalaAncla: true },
  });
  const emails = [...new Set(filas.map((f) => f.autorEmail.toLowerCase()))];
  const gente = emails.length
    ? await prisma.teamMember.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombre = new Map(gente.map((g) => [g.email.toLowerCase(), g.name || g.email]));
  return filas.flatMap((f) => {
    const cambio = escalaDe(f.escala, f.escalaAncla ?? "").cambio;
    return cambio ? [{ creado: f.createdAt.toISOString(), autor: nombre.get(f.autorEmail.toLowerCase()) ?? f.autorEmail, cambio }] : [];
  });
}
