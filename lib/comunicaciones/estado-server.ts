/**
 * lib/comunicaciones/estado-server.ts — cómo está la copia de los correos, las notas y las llamadas de HubSpot. SOLO
 * LECTURA. La lee scripts/validar-datos.ts (la pasada de validación del 2026-10-19): la tabla se consulta solo desde
 * lib/comunicaciones (lib/comunicaciones/guardas.test.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";

export interface EstadoDeLasComunicaciones {
  porTipo: { tipo: string; vigentes: number; ultimaCopia: Date | null; laMasNueva: Date | null }[];
  /** Cuántos correos hay en cada estado de la lectura de compromisos («—» = sin estado). */
  compromisos: { estado: string; cuantos: number }[];
}

export async function estadoDeLasComunicaciones(): Promise<EstadoDeLasComunicaciones> {
  const [tipos, estados] = await Promise.all([
    prisma.comunicacionDeHubspot.groupBy({ by: ["tipo"], where: { vigente: true }, _count: true, _max: { copiadoAt: true, ocurrioAt: true } }),
    prisma.comunicacionDeHubspot.groupBy({ by: ["compromisosEstado"], where: { vigente: true }, _count: true }),
  ]);
  return {
    porTipo: tipos.map((t) => ({ tipo: t.tipo, vigentes: t._count, ultimaCopia: t._max.copiadoAt, laMasNueva: t._max.ocurrioAt })),
    compromisos: estados.map((e) => ({ estado: e.compromisosEstado ?? "—", cuantos: e._count })),
  };
}
