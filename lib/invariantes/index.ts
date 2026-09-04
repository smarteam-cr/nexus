/**
 * lib/invariantes/index.ts — el registro de los invariantes SOLO-BASE (B-07, 2026-09-04).
 *
 * «Solo-base» = se contestan con una lectura de Postgres y nada más: sin HubSpot (INV2, INV13),
 * sin el sistema de archivos (INV6, INV12, INV17), sin el schema ni los enums del cliente (INV4,
 * INV7), sin el predicado de alcance en memoria (INV9), sin el registry de agentes (INV15) ni la
 * lectura de Meet (INV16). Esos siguen viviendo en `scripts/check-invariants.ts`, que corre a mano.
 *
 * Los de acá los corre el script (como consumidor: `lib/invariantes/invariantes.test.ts` vigila
 * que consuma TODOS), y desde B-08 un job diario que deja el resultado en el semáforo de
 * Integraciones. `/api/health` los resume en un booleano (B-09).
 */
import type { PrismaClient } from "@prisma/client";
import type { Invariante, ResultadoDeInvariante } from "./contrato";
import { INV1, INV21 } from "./sesiones";
import { INV10, INV11, INV14, INV8, INV8c } from "./proyectos";
import { INV18, INV20, INV25, INV26, INV27, INV28, INV3, INV5 } from "./cobranza";
import { INV22 } from "./cronograma";
import { INV23, INV24 } from "./odoo";

export type { Invariante, ResultadoDeInvariante } from "./contrato";
export { INV1, INV21, INV8, INV8c, INV10, INV11, INV14, INV3, INV5, INV18, INV20, INV25, INV26, INV27, INV28, INV22, INV23, INV24 };

/** En el orden en que el gate los imprime. Sumar uno acá es lo que lo pone en el job y en /api/health. */
export const INVARIANTES_SOLO_BASE: readonly Invariante[] = [
  INV1, INV3, INV5, INV8, INV8c, INV10, INV11, INV14, INV18, INV20, INV21, INV22, INV23, INV24, INV25, INV26, INV27, INV28,
];

export type CorridaDeInvariantes = {
  ok: boolean;
  resultados: Array<{ id: string; nombre: string } & ResultadoDeInvariante>;
};

/**
 * Corre todos los solo-base en orden. A diferencia del script (donde una excepción tumba el gate
 * entero, y está bien: alguien lo está mirando), acá una excepción se registra como «no
 * verificable» y NO cuenta como cumplido: para un job, «no pude mirar» y «está bien» tienen que
 * ser cosas distintas.
 */
export async function correrInvariantesSoloBase(
  db: PrismaClient,
  ahora: Date = new Date(),
  invariantes: readonly Invariante[] = INVARIANTES_SOLO_BASE,
): Promise<CorridaDeInvariantes> {
  const resultados: CorridaDeInvariantes["resultados"] = [];
  for (const inv of invariantes) {
    try {
      const r = await inv.correr(db, ahora);
      resultados.push({ id: inv.id, nombre: inv.nombre, ...r });
    } catch (e) {
      const mensaje = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      resultados.push({ id: inv.id, nombre: inv.nombre, ok: false, lineas: [`⚠ INV${inv.id} no verificable: ${mensaje}`] });
    }
  }
  return { ok: resultados.every((r) => r.ok), resultados };
}
