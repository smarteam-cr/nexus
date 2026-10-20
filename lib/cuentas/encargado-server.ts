/**
 * lib/cuentas/encargado-server.ts — quién lleva cada cuenta, leído de la base (2026-10-19). SERVIDOR.
 *
 * La regla vive en ./encargado.ts (pura). Acá: qué columnas hacen falta (`SELECT_PARA_EL_ENCARGADO`), cómo se pasa
 * una fila de `Project` a la forma de la regla (`proyectoQueLleva`) y las lecturas de la base.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { encargadoDeLaCuenta, proyectoQueLleva, quienesLlevanLaCuenta, SIN_ENCARGADO, type EncargadoDeLaCuenta, type ProyectoQueLleva } from "./encargado";
export { proyectoQueLleva, type FilaParaElEncargado } from "./encargado";

/** Las columnas de `Project` que necesita la regla. */
export const SELECT_PARA_EL_ENCARGADO = {
  status: true,
  serviceType: true,
  hubspotServiceId: true,
  hubspotPipelineId: true,
  proyectoInterno: true,
  hermanoCsProjectId: true,
  altaEstado: true,
  esPrueba: true,
  hubspotOwnerEmail: true,
  hubspotOwnerName: true,
  hubspotCreatedAt: true,
  hubspotOwnerId: true,
} as const;

/** Correo → nombre de quienes están dados de baja, y correo → nombre en Nexus de todo el equipo. */
export async function nombresDelEquipo(): Promise<{ deBaja: Map<string, string>; nombres: Map<string, string> }> {
  const filas = await prisma.teamMember.findMany({ select: { email: true, name: true, deactivatedAt: true } });
  const deBaja = new Map<string, string>();
  const nombres = new Map<string, string>();
  for (const m of filas) {
    const e = m.email.toLowerCase();
    nombres.set(e, m.name);
    if (m.deactivatedAt) deBaja.set(e, m.name);
  }
  return { deBaja, nombres };
}

/** Quién lleva cada una de estas cuentas. Una cuenta sin proyectos que la definan queda sin encargado. */
export async function encargadosDeLasCuentas(clientIds: readonly string[]): Promise<Map<string, EncargadoDeLaCuenta>> {
  const ids = [...new Set(clientIds.filter(Boolean))];
  const out = new Map<string, EncargadoDeLaCuenta>(ids.map((id) => [id, SIN_ENCARGADO]));
  if (ids.length === 0) return out;
  const [filas, equipo] = await Promise.all([
    prisma.project.findMany({
      where: { clientId: { in: ids }, status: "active", hubspotOwnerEmail: { not: null } },
      select: { clientId: true, ...SELECT_PARA_EL_ENCARGADO },
    }),
    nombresDelEquipo(),
  ]);
  const porCliente = new Map<string, ProyectoQueLleva[]>();
  for (const f of filas) {
    const l = porCliente.get(f.clientId) ?? [];
    l.push(proyectoQueLleva(f));
    porCliente.set(f.clientId, l);
  }
  for (const [id, ps] of porCliente) out.set(id, encargadoDeLaCuenta(ps, equipo.deBaja, equipo.nombres));
  return out;
}

/** Quién lleva la cuenta. */
export async function encargadoDe(clientId: string): Promise<EncargadoDeLaCuenta> {
  return (await encargadosDeLasCuentas([clientId])).get(clientId) ?? SIN_ENCARGADO;
}

/** ¿Esta persona lleva la cuenta? El encargado o quien lleva algún proyecto de CS activo de ella (no uno cerrado). */
export async function llevaLaCuentaDe(clientId: string, email: string | null | undefined): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  const [filas, equipo] = await Promise.all([
    prisma.project.findMany({ where: { clientId, status: "active", hubspotOwnerEmail: { not: null } }, select: SELECT_PARA_EL_ENCARGADO }),
    nombresDelEquipo(),
  ]);
  return quienesLlevanLaCuenta(filas.map(proyectoQueLleva), equipo.deBaja).some((p) => p.email === e);
}
