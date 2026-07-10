/**
 * lib/cobranza/adapters/communication-bitacora.ts
 *
 * CommunicationPort "bitacora" (puerto 2, v1 manual):
 *  - contexto = última entrada HUMANA de la bitácora + último hilo de CORREO
 *    pegado a mano (los slots "gmail"/"meetings" quedan definidos, NO cableados);
 *  - entrega = SIN envío automático: registra la gestión en bitácora y devuelve
 *    el mailto para que la persona lo abra/copie.
 */
import { prisma } from "@/lib/db/prisma";
import type { BorradorMensaje, ComContexto, CommunicationPort, EntregaResultado } from "../ports";

export const communicationBitacora: CommunicationPort = {
  slot: "bitacora",

  async obtenerContexto(cuentaId: string): Promise<ComContexto> {
    const [cuenta, ultimaHumana, ultimoCorreo] = await Promise.all([
      prisma.cuentaFinanciera.findUnique({
        where: { id: cuentaId },
        select: { correoCobro: true },
      }),
      prisma.bitacoraCobro.findFirst({
        where: { cuentaId, tipo: { not: "ACTUALIZACION_IA" } },
        orderBy: { createdAt: "desc" },
        select: { tipo: true, contenido: true, createdAt: true },
      }),
      prisma.bitacoraCobro.findFirst({
        where: { cuentaId, tipo: "CORREO" },
        orderBy: { createdAt: "desc" },
        select: { contenido: true },
      }),
    ]);
    return {
      ultimaComunicacion: ultimaHumana
        ? {
            fechaISO: ultimaHumana.createdAt.toISOString().slice(0, 10),
            tipo: ultimaHumana.tipo,
            resumen: ultimaHumana.contenido.slice(0, 1500),
          }
        : null,
      hiloReciente: ultimoCorreo?.contenido.slice(0, 4000) ?? null,
      correoCobro: cuenta?.correoCobro ?? null,
    };
  },

  async registrarEntrega(
    cuentaId: string,
    cobroId: string | null,
    borrador: BorradorMensaje,
    ctx: { byEmail: string },
  ): Promise<EntregaResultado> {
    const cuenta = await prisma.cuentaFinanciera.findUnique({
      where: { id: cuentaId },
      select: { correoCobro: true },
    });
    await prisma.bitacoraCobro.create({
      data: {
        cuentaId,
        cobroId,
        tipo: "CORREO",
        contenido: `Borrador de cobro preparado para envío manual — asunto: "${borrador.asunto}".`,
        usuarioEmail: ctx.byEmail,
      },
    });
    const correo = cuenta?.correoCobro ?? null;
    const mailtoUrl = correo
      ? `mailto:${encodeURIComponent(correo)}?subject=${encodeURIComponent(borrador.asunto)}&body=${encodeURIComponent(borrador.cuerpo.slice(0, 1800))}`
      : null;
    return { modo: "manual", mailtoUrl };
  },
};
