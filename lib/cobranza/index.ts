/**
 * lib/cobranza — exports públicos del módulo (aislamiento ARCHITECTURE §5).
 * Otros módulos/páginas importan de acá, nunca de archivos internos.
 */
export {
  loadCartera,
  getCuentaDetail,
  loadAlertas,
  getLatestSnapshot,
  type CarteraRow,
  type CuentaDetailDTO,
  type ServicioDTO,
  type CobroDTO,
  type AlertaDTO,
  type SnapshotDTO,
} from "./queries";
export { runCobranzaDigest, type DigestResult } from "./digest";
export { semaforoCobro, semaforoCuenta, type Semaforo } from "./engine";
