/**
 * lib/external/escala-view.ts — CHOKEPOINT de la escala que ve el cliente (Elías, 30 oct). Único lugar donde el token de
 * `/external/escala/[token]` se resuelve a contenido. SERVIDOR.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoALaEscala` con él, sin revocar;
 *   2. lo demás lo decide la puerta (`escalaParaElCliente`): exploración viva, de la misma empresa, solo con evidencia.
 * null = el 404 neutro; `resultados` vacío = el enlace sirve, pero la empresa ya no tiene nada con evidencia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { escalaParaElCliente, type EscalaParaElCliente } from "@/lib/exploraciones/escala-para-el-cliente-server";

const TOKEN = /^[0-9a-f]{64}$/;

export async function escalaParaElToken(token: string): Promise<EscalaParaElCliente | null> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoALaEscala.findUnique({ where: { accessToken: token }, select: { id: true, exploracionId: true, revokedAt: true } });
  if (!acceso || acceso.revokedAt) return null;
  const escala = await escalaParaElCliente(acceso.exploracionId);
  if (escala) await prisma.accesoALaEscala.update({ where: { id: acceso.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return escala;
}
