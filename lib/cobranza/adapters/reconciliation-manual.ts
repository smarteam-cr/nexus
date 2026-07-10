/**
 * lib/cobranza/adapters/reconciliation-manual.ts
 *
 * ReconciliationPort "manual" (puerto 3, v1): la persona confirma. Wrapper
 * DELGADO sobre cambiarEstadoCobro — el ÚNICO escritor de Cobro.estado (INV3:
 * ningún COBRADO sin confirmadoPor). Un futuro adaptador Mercury/Odoo (webhook)
 * embudará por acá igual: puerto distinto, chokepoint idéntico.
 */
import type { ConfirmacionPago, ReconciliationPort } from "../ports";
import { cambiarEstadoCobro } from "../mutations";

export const reconciliationManual: ReconciliationPort = {
  slot: "manual",
  async confirmar(conf: ConfirmacionPago, ctx: { byEmail: string }): Promise<void> {
    await cambiarEstadoCobro(
      conf.cobroId,
      {
        estado: "COBRADO",
        fechaCobro: conf.fechaCobroISO,
        referenciaExterna: conf.referenciaExterna,
      },
      ctx.byEmail,
    );
  },
};
