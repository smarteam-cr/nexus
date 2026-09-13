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
import { contextoDeComunicacion, ENTRADAS_DE_BITACORA_A_LEER } from "../borrador-contexto";

export const communicationBitacora: CommunicationPort = {
  slot: "bitacora",

  /**
   * ⚠ Con `cobroId`, solo lo general de la cuenta y lo de ESE cobro. Hasta el 2026-09-12 leía la
   * última entrada de la cuenta entera, y el borrador de una factura citaba la nota de otra. Qué
   * se elige lo decide `contextoDeComunicacion`; la consulta aplica la misma regla
   * (`leCorrespondeAlCobro`) para que las notas de otras facturas no ocupen la ventana.
   */
  async obtenerContexto(cuentaId: string, cobroId: string | null = null): Promise<ComContexto> {
    const [cuenta, entradas] = await Promise.all([
      prisma.cuentaFinanciera.findUnique({
        where: { id: cuentaId },
        select: { correoCobro: true },
      }),
      prisma.bitacoraCobro.findMany({
        where: {
          cuentaId,
          tipo: { not: "ACTUALIZACION_IA" },
          ...(cobroId ? { OR: [{ cobroId: null }, { cobroId }] } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: ENTRADAS_DE_BITACORA_A_LEER,
        select: { tipo: true, contenido: true, createdAt: true, cobroId: true },
      }),
    ]);
    return contextoDeComunicacion(entradas, cobroId, cuenta?.correoCobro ?? null);
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
