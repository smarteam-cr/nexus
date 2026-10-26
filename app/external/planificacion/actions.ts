"use server";

/**
 * app/external/planificacion/actions.ts — el CLIENTE llena su parte de la Planificación desde su enlace (L4 etapa 6 del
 * roadmap, 2026-10-27): sus usuarios, sus canales y quiénes participan de su lado, en las secciones que el CSE le abrió.
 *
 * POR QUÉ UNA SERVER ACTION: las credenciales del navegador viven en cookies con `path: "/external"` y no viajan a
 * `/api/external/*` (app/external/kickoff/actions.ts, el mismo molde). Atada al proyecto de la página con
 * `.bind(null, acceso)`.
 *
 * Los checks, en orden: la forma de lo que llega · el acceso de ESTA página (`elegirAcceso`, que revisa revocado,
 * contraseña y publicable) · la Planificación publicada · el límite de escrituras · la sección ABIERTA al cliente en el
 * documento guardado · la regla pura (`aplicarLoDelCliente`: solo su lista, solo sus campos, lo nuevo marcado). Escribe la
 * data de UNA sección bajo `FOR UPDATE` del bloque: si el CSE guarda a la vez, gana el último y nada queda a medias.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { touchAccess } from "@/lib/external/access";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { elegirAcceso } from "@/lib/external/selector-de-proyectos";
import { esIdDeAcceso } from "@/lib/external/rutas";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import {
  SECCIONES_DEL_CLIENTE,
  TOPE_DE_TEXTO,
  aplicarLoDelCliente,
  puedeEscribirElCliente,
  idDelCliente,
  type OperacionDelCliente,
  type SeccionDelCliente,
} from "@/lib/planificacion/lo-del-cliente";

export type GuardarLoDelClienteResult = { ok: true } | { ok: false; error: string };

const SIN_ACCESO = "Tu acceso ya no está disponible. Recarga la página.";
const CERRADA = "Esta parte ya no está abierta para que la edites. Recarga la página.";

const Seccion = z.enum(SECCIONES_DEL_CLIENTE as [SeccionDelCliente, ...SeccionDelCliente[]]);
const Operacion = z.union([
  z.strictObject({ seccion: Seccion, op: z.literal("guardar"), fila: z.record(z.string(), z.string().max(TOPE_DE_TEXTO * 2)).refine((f) => Object.keys(f).length <= 20) }),
  z.strictObject({ seccion: Seccion, op: z.literal("quitar"), id: z.string().min(1).max(60) }),
]);

export async function guardarLoDelClienteAction(acceso: string, op: unknown): Promise<GuardarLoDelClienteResult> {
  const parsed = Operacion.safeParse(op);
  if (!esIdDeAcceso(acceso) || !parsed.success) return { ok: false, error: "Solicitud inválida." };
  const o = parsed.data as OperacionDelCliente;

  // El proyecto que nombra la página, y solo si este navegador lo tiene abierto con su contraseña.
  const actual = elegirAcceso(await accesosDelNavegador(), acceso);
  if (!actual) return { ok: false, error: SIN_ACCESO };
  // Si el equipo dejó de compartir la Planificación, la credencial viva no habilita nada.
  if (!actual.project.planificacionPublishedAt) return { ok: false, error: SIN_ACCESO };
  if (!checkExternalWriteRate(actual.credencial)) return { ok: false, error: "Demasiados cambios seguidos. Espera unos segundos." };

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: actual.project.id, ...canvasOf("planning") },
    select: { id: true, sections: true, canvasSections: { where: { key: o.seccion }, select: { id: true } } },
  });
  const seccion = canvas?.canvasSections[0];
  if (!canvas || !seccion) return { ok: false, error: CERRADA };
  const entrada = (Array.isArray(canvas.sections) ? (canvas.sections as Array<Record<string, unknown>>) : []).find((e) => e?.key === o.seccion);

  const ahora = new Date().toISOString();
  const r = await prisma.$transaction(async (tx) => {
    const bloques = await tx.$queryRaw<Array<{ id: string; data: unknown }>>`
      SELECT id, data FROM "CanvasBlock"
      WHERE "sectionId" = ${seccion.id} AND "blockType" = 'CARD' AND status = 'CONFIRMED'
      ORDER BY "order" ASC LIMIT 1 FOR UPDATE`;
    const bloque = bloques[0];
    // LOS CANDADOS, en una regla probada (lib/planificacion/lo-del-cliente.ts › puedeEscribirElCliente): publicada,
    // no oculta, con la tarjeta y abierta al cliente.
    if (!bloque || !puedeEscribirElCliente({ publicada: !!actual.project.planificacionPublishedAt, oculta: entrada?.hidden === true, data: bloque.data })) {
      return { ok: false as const, error: CERRADA };
    }
    const aplicado = aplicarLoDelCliente(bloque.data, o, ahora, () => idDelCliente(randomBytes(8).toString("hex")));
    if (!aplicado.ok) return aplicado;
    await tx.canvasBlock.update({ where: { id: bloque.id }, data: { data: aplicado.data as Prisma.InputJsonValue } });
    return { ok: true as const };
  });
  if (!r.ok) return r;

  await touchCanvasContent(seccion.id).catch(() => {});
  await touchAccess(actual.accessId);
  return { ok: true };
}
