/**
 * lib/external/plan-view.ts — CHOKEPOINT del plan general que ve el cliente (2026-11-19). Único lugar donde el token de
 * `/external/plan/[token]` se resuelve a contenido. SERVIDOR.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoAlPlanGeneral` con él, sin revocar;
 *   2. lo que ve es la FOTO PUBLICADA (lib/plan-general/foto.ts), nunca los cronogramas vivos. La foto no lleva
 *      proyectos, ids ni el detalle de las actividades.
 * null = el 404 neutro; «sin-publicar» = el enlace sirve pero no hay foto (o es de otro formato).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { leerFoto, type FotoDelPlan } from "@/lib/plan-general/foto";

const TOKEN = /^[0-9a-f]{64}$/;

export interface PlanParaElCliente {
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale: number | null;
  foto: FotoDelPlan | null;
}

export async function planParaElToken(token: string): Promise<PlanParaElCliente | null> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoAlPlanGeneral.findUnique({
    where: { accessToken: token },
    select: { id: true, revokedAt: true, publicado: true, client: { select: { name: true, logoUrl: true, logoScale: true } } },
  });
  if (!acceso || acceso.revokedAt) return null;
  await prisma.accesoAlPlanGeneral.update({ where: { id: acceso.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return {
    clientName: acceso.client.name,
    clientLogoUrl: acceso.client.logoUrl ?? null,
    clientLogoScale: acceso.client.logoScale ?? null,
    foto: leerFoto(acceso.publicado),
  };
}
