/**
 * lib/cobranza — exports públicos del módulo (aislamiento ARCHITECTURE §5).
 * Otros módulos/páginas importan de acá, nunca de archivos internos.
 */
export {
  loadCartera,
  getCuentaDetail,
  loadAlertas,
  getLatestSnapshot,
  loadSnapshotSeries,
  loadRiesgo,
  loadProyeccion,
  type CarteraRow,
  type CuentaDetailDTO,
  type ServicioDTO,
  type CobroDTO,
  type AlertaDTO,
  type SnapshotDTO,
  type SnapshotSerieDTO,
} from "./queries";
export { runCobranzaDigest, type DigestResult } from "./digest";
export {
  semaforoCobro,
  semaforoCuenta,
  type Semaforo,
  type ProyeccionIngresos,
  type BucketProyeccion,
  type TotalesMoneda,
  type CobroProyeccionInput,
  type MetricasCartera,
  type MetricasMoneda,
  type AgingBuckets,
  type RiesgoPagoItem,
} from "./engine";
// Puertos (interfaces client-safe) + factory de adaptadores (server-side).
export type {
  AccountSource,
  BorradorMensaje,
  CobranzaFuente,
  ComContexto,
  CommunicationPort,
  ConfirmacionPago,
  CuentaEntrante,
  EntregaResultado,
  FuenteRef,
  IngestResultado,
  ReconciliationPort,
} from "./ports";
export { getAccountSource, getCommunicationPort, getReconciliationPort } from "./adapters";
