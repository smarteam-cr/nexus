/**
 * lib/cobranza/adapters/index.ts
 *
 * Factory de adaptadores — el ÚNICO lugar que conoce las implementaciones de los
 * puertos. Las routes (composition root) resuelven acá y pasan el puerto por
 * parámetro; el motor puro y los servicios solo ven las interfaces de ports.ts.
 * Los slots futuros (hubspot/odoo/gmail/meetings/mercury) están DEFINIDOS pero
 * no cableados: pedirlos es un 501 explícito, no un fallback silencioso.
 */
import { CobranzaError } from "../mutations";
import type { AccountSource, CobranzaFuente, ComCanal, CommunicationPort, ReconciliationPort } from "../ports";
import { accountSourceManual } from "./account-source-manual";
import { accountSourceCsv } from "./account-source-csv";
import { communicationBitacora } from "./communication-bitacora";
import { reconciliationManual } from "./reconciliation-manual";

export function getAccountSource(slot: CobranzaFuente): AccountSource {
  switch (slot) {
    case "manual":
      return accountSourceManual;
    case "sheet":
      return accountSourceCsv;
    default:
      throw new CobranzaError(`Fuente de cuentas "${slot}" definida pero no cableada todavía.`, 501);
  }
}

export function getCommunicationPort(slot: ComCanal = "bitacora"): CommunicationPort {
  if (slot === "bitacora") return communicationBitacora;
  throw new CobranzaError(`Canal de comunicación "${slot}" definido pero no cableado todavía.`, 501);
}

export function getReconciliationPort(): ReconciliationPort {
  return reconciliationManual;
}
