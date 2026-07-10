/**
 * lib/cobranza/adapters/account-source-csv.ts
 *
 * AccountSource "sheet" (puerto 1): el APPLY del importador CSV. Mismo núcleo de
 * ingesta que el manual — la diferencia vive aguas arriba (parseo + mapeo + cola
 * de revisión en app/api/cobranza/import/**), no acá.
 */
import type { AccountSource, CuentaEntrante, IngestResultado } from "../ports";
import { ingestCuentasEntrantes } from "../ingest";
import { crDateParts } from "@/lib/jobs/time";

export const accountSourceCsv: AccountSource = {
  slot: "sheet",
  async ingest(cuentas: CuentaEntrante[], ctx: { byEmail: string }): Promise<IngestResultado[]> {
    return ingestCuentasEntrantes(cuentas, {
      byEmail: ctx.byEmail,
      todayISO: crDateParts(new Date()).dateKey,
    });
  },
};
