/**
 * lib/external/escala-view.ts — CHOKEPOINT de la escala que ve el cliente (Elías, 30 oct). Único lugar donde el token de
 * `/external/escala/[token]` se resuelve a contenido. SERVIDOR.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoALaEscala` con él, sin revocar;
 *   2. la exploración todavía se puede mostrar (`seMuestraAlCliente`: viva y de la misma empresa);
 *   3. lo que ve es la FOTO PUBLICADA (16 nov, lib/exploraciones/escala-publicada.ts), no lo medido hoy. La armó la
 *      puerta (`escalaParaElCliente`) al publicar: solo lo que el vendedor usó en las áreas que eligió.
 * null = el 404 neutro; «sin-publicar» = el enlace sirve, pero no hay foto (o es de otro formato): la página dice «Tu
 * escala todavía no está lista», lo mismo que con una foto sin ningún equipo.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { paginaDeLaFoto, seMuestraAlCliente, type EscalaParaElCliente } from "@/lib/exploraciones/escala-para-el-cliente-server";

const TOKEN = /^[0-9a-f]{64}$/;

export async function escalaParaElToken(token: string): Promise<EscalaParaElCliente | "sin-publicar" | null> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoALaEscala.findUnique({ where: { accessToken: token }, select: { id: true, exploracionId: true, revokedAt: true, publicada: true } });
  if (!acceso || acceso.revokedAt) return null;
  if (!(await seMuestraAlCliente(acceso.exploracionId))) return null;
  const foto = paginaDeLaFoto(acceso.publicada);
  if (!foto) console.warn("[escala del cliente] sin foto publicada (o de otro formato):", acceso.id);
  await prisma.accesoALaEscala.update({ where: { id: acceso.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return foto ?? "sin-publicar";
}
