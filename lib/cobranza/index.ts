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
  loadColaCobros,
  loadIngresosVariables,
  RESCATE_UMBRAL_DIAS,
  loadCostos,
  loadCajaNeta,
  loadGastos,
  loadMovimientosCostos,
  loadTarjetas,
  loadLibroPlanilla,
  loadAguinaldo,
  loadComisionesPartner,
  loadComisionesVendedor,
  type ComisionPartnerDTO,
  type ComisionesPartnerDTO,
  type PartnerComercialDTO,
  type HistorialPartnerDTO,
  type ComisionesVendedorDTO,
  type DevengadaConQuincena,
  type ReglaComisionDTO,
  type ComisionLiquidadaDTO,
  type TarjetaDTO,
  type TarjetaCostoDTO,
  type LibroPlanillaDTO,
  type PagoPlanillaDTO,
  type PagoComisionDTO,
  type CostoRecurrenteDTO,
  type CajaNetaDTO,
  type GastoPuntualDTO,
  type CostoMovimientoDTO,
  type ColaCobroRow,
  type IngresoVariableRow,
  type CarteraRow,
  type CuentaDetailDTO,
  type ServicioDTO,
  type CobroDTO,
  type AlertaDTO,
  type SnapshotDTO,
  type SnapshotSerieDTO,
} from "./queries";
export { runCobranzaDigest, type DigestResult } from "./digest";
// El cálculo puro de la comisión de vendedor (la DEVENGADA no es una fila).
export type { ComisionDevengada, DetalleComision } from "./comisiones";
// El ciclo vivo de una tarjeta (viaja dentro de TarjetaDTO; la UI lo tipa).
export type { CicloTarjeta } from "./tarjetas";
// La cadencia de un aliado comercial (client-safe: el select de frecuencia).
export { FRECUENCIAS_PARTNER, labelDeFrecuencia, type TotalDeBucket } from "./partners";
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
  type CostoProyeccionInput,
  type ProyeccionCostos,
  type BucketCosto,
  type BucketCajaNeta,
  type CajaNeta,
  type GastoProyeccionInput,
  type ProyeccionGastos,
  type BucketGasto,
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
