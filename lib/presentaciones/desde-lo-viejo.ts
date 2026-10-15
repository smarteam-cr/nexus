/**
 * lib/presentaciones/desde-lo-viejo.ts — el Json de `Project.diagnosticoPresentacion` (2026-10-07 al 2026-10-14) pasado a
 * filas de `PresentacionDeDocumento`. PURO. Lo usa scripts/migrar-presentacion-del-diagnostico.ts.
 *
 * El Json guardaba solo lo último que pasó; acá se arma la historia que se puede reconstruir, en orden: la fecha que
 * leyó Nexus, lo descartado (con quién, si se sabía), la fecha fijada o «Todavía no sé», y «Está listo» con su aviso.
 * Lo que el Json no guardaba (un descarte sin quién), no se inventa: se deja afuera.
 */
import { leerPresentacion } from "@/lib/canvas/presentacion-del-diagnostico";
import type { EventoDePresentacion } from "./reglas";

export interface FilaNueva {
  evento: EventoDePresentacion;
  fecha: string | null;
  porEmail: string | null;
  sessionId: string | null;
  detalle: Record<string, unknown> | null;
  createdAt: Date;
}

const cuando = (iso: string | null | undefined, respaldo: Date): Date => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : respaldo;
};

/** Las filas que dicen lo mismo que el Json. `respaldo` = la fecha para lo que no guardó cuándo (la del proyecto). */
export function filasDesdeLoViejo(raw: unknown, respaldo: Date): FilaNueva[] {
  const v = leerPresentacion(raw);
  const out: FilaNueva[] = [];
  for (const d of v.descartadasPor ?? []) {
    out.push({ evento: "descarte", fecha: d.fecha, porEmail: d.por.toLowerCase(), sessionId: null, detalle: null, createdAt: cuando(d.en, respaldo) });
  }
  if (v.fecha && v.fijadaPor) {
    const deLaPropuesta = v.fuente?.startsWith("Lo leyó Nexus") ? { deLaPropuesta: "anterior-al-2026-10-14" } : {};
    out.push({
      evento: "fecha",
      fecha: v.fecha,
      porEmail: v.fijadaPor.toLowerCase(),
      sessionId: null,
      detalle: v.fuente ? { ...deLaPropuesta, fuente: v.fuente } : null,
      createdAt: cuando(v.fijadaEn, respaldo),
    });
  } else if (v.sinFecha) {
    out.push({ evento: "sin-fecha", fecha: null, porEmail: v.sinFecha.por.toLowerCase(), sessionId: null, detalle: null, createdAt: cuando(v.sinFecha.en, respaldo) });
  }
  if (v.listo && v.fecha === v.listo.fecha) {
    out.push({
      evento: "listo",
      fecha: v.listo.fecha,
      porEmail: v.listo.por.toLowerCase(),
      sessionId: null,
      detalle: { aviso: v.aviso ? { para: v.aviso.para, motivo: v.aviso.motivo } : null },
      createdAt: cuando(v.listo.en, respaldo),
    });
  }
  // La fecha que leyó Nexus y nadie decidió todavía (la usada ya no estaba en el Json: queda la fecha fijada, con su fuente).
  if (v.propuesta) {
    out.push({
      evento: "propuesta",
      fecha: v.propuesta.fecha,
      porEmail: null,
      sessionId: v.propuesta.reunion.id,
      detalle: { cita: v.propuesta.cita, reunion: v.propuesta.reunion },
      createdAt: cuando(v.propuesta.en, respaldo),
    });
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
