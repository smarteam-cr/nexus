/**
 * lib/invariantes/tests-diagnostico.ts — los invariantes del TEST DEL DIAGNÓSTICO (área O, 2026-10-26).
 */
import type { PrismaClient } from "@prisma/client";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * ⚠ INV58 nace «no bloquea» (2026-10-26): el envío a HubSpot (`tests-hubspot`) está apagado hasta que Elías pruebe el test
 * nuevo y configure el formulario. Avisa sin poner el semáforo en rojo; el día que se prenda el envío y dé su primer
 * verde, esta línea pasa a `true` (el patrón de INV47).
 */
export const INV58_BLOQUEA = false;

/** Cuánto puede tardar un intento en llegar entero a HubSpot: la hora del abandono, más las tandas de 10 minutos. */
export const HORAS_PARA_LLEGAR_A_HUBSPOT = 3;

type FilaDeIntento = { id: string; email: string; area: string; estado: string; hubspotError: string | null; createdAt: Date };

/**
 * El delegado de `IntentoDelTest`. Se pide por su forma y no por el tipo del cliente: en una rama de trabajo el cliente
 * de Prisma compartido todavía no tiene el modelo (se genera en el deploy, con el schema de esta rama).
 */
function intentos(db: PrismaClient): { findMany(args: unknown): Promise<FilaDeIntento[]> } {
  return (db as unknown as { intentoDelTest: { findMany(args: unknown): Promise<FilaDeIntento[]> } }).intentoDelTest;
}

const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");

/**
 * INV58 · Ningún lead del test se pierde: todo intento de más de `HORAS_PARA_LLEGAR_A_HUBSPOT` horas ya llegó a HubSpot
 * (el formulario y, si lo terminó o lo dejó, la nota). Con el envío apagado lo dice, sin contarlo como falla: los intentos
 * quedan en Nexus y salen solos el día que se prenda.
 */
export const INV58: Invariante = {
  id: "58",
  nombre: "todo intento del test del diagnóstico llegó a HubSpot",
  async correr(db, ahora) {
    const antes = new Date(ahora.getTime() - HORAS_PARA_LLEGAR_A_HUBSPOT * 3_600_000);
    let filas: FilaDeIntento[];
    try {
      filas = await intentos(db).findMany({
        where: {
          createdAt: { lt: antes },
          OR: [{ hubspotFormAt: null }, { hubspotNotaAt: null, estado: { in: ["terminado", "abandonado"] } }],
        },
        select: { id: true, email: true, area: true, estado: true, hubspotError: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      if (code === "P2021" || code === "P2022") return cumple("⚠ INV58: falta scripts/sql/2026-10-26-tests-diagnostico.sql (el test todavía no existe en esta base).");
      throw e;
    }
    if (!filas.length) return cumple("✓ INV58: todos los intentos del test llegaron a HubSpot.");
    const titular = `${filas.length}${filas.length === 200 ? "+" : ""} ${filas.length === 1 ? "intento del test no llegó" : "intentos del test no llegaron"} a HubSpot`;
    const detalle = lista(filas.map((f) => `${f.email} · área ${f.area} · ${f.estado}${f.hubspotError ? ` — ${f.hubspotError}` : ""} (${f.id})`));
    if (process.env.TESTS_HUBSPOT_ENABLED !== "1") {
      return cumple(`⚠ INV58: el envío a HubSpot está apagado (TESTS_HUBSPOT_ENABLED); ${titular} y esperan a que se prenda.`, detalle);
    }
    const remedio = "    Remedio: Escala › Tests › Intentos muestra el error de cada uno y deja reintentar (el job tests-hubspot los manda cada 10 minutos).";
    if (!INV58_BLOQUEA) return cumple(`⚠ INV58 (no bloquea hasta su primer verde): ${titular}.`, detalle, remedio);
    return viola(`✗ INV58 VIOLADO: ${titular}.`, detalle, remedio);
  },
};
