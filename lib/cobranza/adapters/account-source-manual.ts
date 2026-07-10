/**
 * lib/cobranza/adapters/account-source-manual.ts
 *
 * AccountSource "manual" (puerto 1): crear empresa + cuenta desde el módulo
 * (botón "Nueva empresa" del panel). Wrapper delgado sobre el núcleo compartido
 * de ingesta — la interfaz estandariza el shape de entrada para que el futuro
 * adaptador de HubSpot/Odoo enchufe sin tocar consumidores.
 */
import type { AccountSource, CuentaEntrante, IngestResultado } from "../ports";
import { ingestCuentasEntrantes } from "../ingest";
import { crDateParts } from "@/lib/jobs/time";

export const accountSourceManual: AccountSource = {
  slot: "manual",
  async ingest(cuentas: CuentaEntrante[], ctx: { byEmail: string }): Promise<IngestResultado[]> {
    return ingestCuentasEntrantes(cuentas, {
      byEmail: ctx.byEmail,
      todayISO: crDateParts(new Date()).dateKey,
    });
  },
};
