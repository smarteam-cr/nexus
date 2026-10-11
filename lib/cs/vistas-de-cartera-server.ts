/**
 * lib/cs/vistas-de-cartera-server.ts — las vistas guardadas de la pestaña «Cartera» (`VistaDeCartera`,
 * 2026-10-09, entrega 3). Compartidas entre la CSL y dirección; solo quien la creó la borra.
 *
 * Sin la tabla (scripts/sql/2026-10-09-cartera-de-la-csl.sql sin correr) leer devuelve ninguna y lo dice; las de
 * arranque (lib/cs/filtros-de-cartera.ts) se ven igual.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { faltaLaTabla } from "./clasificacion-server";
import { filtrosDeUnaVista, filtrosParaGuardar, type FiltrosDeCartera } from "./filtros-de-cartera";

export interface VistaGuardada {
  id: string;
  nombre: string;
  filtros: FiltrosDeCartera;
  creadaPorEmail: string;
  creadaPorNombre: string | null;
  /** ISO. */
  creadaEn: string;
}

const SELECT = { id: true, nombre: true, filtros: true, creadaPorEmail: true, creadaPorNombre: true, createdAt: true } as const;

function vistaDesdeFila(f: { id: string; nombre: string; filtros: unknown; creadaPorEmail: string; creadaPorNombre: string | null; createdAt: Date }): VistaGuardada {
  return {
    id: f.id,
    nombre: f.nombre,
    filtros: filtrosDeUnaVista(f.filtros),
    creadaPorEmail: f.creadaPorEmail,
    creadaPorNombre: f.creadaPorNombre,
    creadaEn: f.createdAt.toISOString(),
  };
}

export async function leerVistas(): Promise<{ vistas: VistaGuardada[]; faltaLaTabla: boolean }> {
  try {
    const filas = await prisma.vistaDeCartera.findMany({ orderBy: { nombre: "asc" }, select: SELECT, take: 100 });
    return { vistas: filas.map(vistaDesdeFila), faltaLaTabla: false };
  } catch (e) {
    if (faltaLaTabla(e)) return { vistas: [], faltaLaTabla: true };
    throw e;
  }
}

export async function crearVista(
  nombre: string,
  filtros: unknown,
  quien: { email: string; nombre: string | null },
): Promise<VistaGuardada> {
  const limpios = filtrosParaGuardar(filtrosDeUnaVista(filtros));
  const fila = await prisma.vistaDeCartera.create({
    data: { nombre: nombre.trim(), filtros: limpios, creadaPorEmail: quien.email, creadaPorNombre: quien.nombre },
    select: SELECT,
  });
  return vistaDesdeFila(fila);
}

/** Borra la vista si la creó `email`. «no-existe» o «no-es-tuya» si no. */
export async function borrarVista(id: string, email: string): Promise<"ok" | "no-existe" | "no-es-tuya"> {
  const v = await prisma.vistaDeCartera.findUnique({ where: { id }, select: { creadaPorEmail: true } });
  if (!v) return "no-existe";
  if (v.creadaPorEmail.toLowerCase() !== email.toLowerCase()) return "no-es-tuya";
  await prisma.vistaDeCartera.delete({ where: { id } });
  return "ok";
}
