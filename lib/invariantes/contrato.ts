/**
 * lib/invariantes/contrato.ts — lo que es un invariante para Nexus (B-07, 2026-09-04).
 *
 * Hasta el 2026-09-04 los 28 invariantes vivían adentro de `scripts/check-invariants.ts` como un
 * solo `main()` de 1.300 líneas que solo corría cuando alguien lo corría a mano. Los que miran
 * ÚNICAMENTE la base (sin HubSpot, sin el sistema de archivos, sin el schema) se extraen acá para
 * que los pueda correr también un job (B-08) y contestarlos `/api/health` (B-09).
 *
 * El contrato es deliberadamente chico: cada invariante recibe la base y el reloj, y devuelve si
 * se cumple más las líneas EXACTAS que el gate imprime (la primera es el veredicto; las demás,
 * el detalle y el remedio). El script sigue imprimiendo lo mismo que antes: solo cambió dónde
 * vive la pregunta. ⚠ Ninguno escribe: son lecturas, y el test lo vigila.
 */
import type { PrismaClient } from "@prisma/client";

export type ResultadoDeInvariante = { ok: boolean; lineas: string[] };

export interface Invariante {
  /** «1», «8c», «22»… — el número con el que el equipo lo nombra en el RUNBOOK y en los remedios. */
  id: string;
  nombre: string;
  correr(db: PrismaClient, ahora: Date): Promise<ResultadoDeInvariante>;
}

export const cumple = (...lineas: string[]): ResultadoDeInvariante => ({ ok: true, lineas });
export const viola = (...lineas: string[]): ResultadoDeInvariante => ({ ok: false, lineas });
