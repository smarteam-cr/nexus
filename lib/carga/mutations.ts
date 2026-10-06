/**
 * lib/carga/mutations.ts — guarda los supuestos de la carga. SERVER-ONLY.
 *
 * Append-only: cada guardado es una fila nueva de `ConfigCarga` con quién lo hizo y por qué. La más reciente manda;
 * las anteriores quedan como historia. Nada se pisa ni se borra.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ConfigCarga } from "./config";

export class TablaDeSupuestosFaltante extends Error {
  constructor() {
    super("Falta la tabla de los supuestos en esta base: hay que correr scripts/sql/2026-10-06-config-carga.sql.");
  }
}

export async function guardarConfigCarga(valores: ConfigCarga, creadoPor: string, motivo?: string | null): Promise<{ id: string; en: string }> {
  try {
    const fila = await prisma.configCarga.create({
      data: { valores: valores as unknown as Prisma.InputJsonValue, motivo: motivo?.trim() || null, creadoPor: creadoPor.trim().toLowerCase() },
      select: { id: true, createdAt: true },
    });
    return { id: fila.id, en: fila.createdAt.toISOString() };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) throw new TablaDeSupuestosFaltante();
    throw e;
  }
}
