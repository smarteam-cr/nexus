/**
 * lib/cobranza/ports.ts
 *
 * Los TRES PUERTOS del módulo Cobranza — SOLO interfaces y tipos (client-safe,
 * sin Prisma ni imports de servidor). El módulo queda listo para conectarse a
 * HubSpot / Odoo / Gmail / WhatsApp sin reescribir el motor: el motor puro
 * (engine.ts) nunca conoce una implementación concreta; los adaptadores viven en
 * lib/cobranza/adapters/ y se resuelven en el borde (routes = composition root).
 *
 *  1. AccountSource      — provee/crea empresas y cuentas de cobro.
 *  2. CommunicationPort  — contexto de la última comunicación + entrega del mensaje.
 *  3. ReconciliationPort — dice si un cobro se pagó (v1: confirmación humana, INV3).
 *
 * Regla transversal: toda entidad de fuente externa lleva (fuente + id_externo)
 * → upsert idempotente (re-sincronizar NO duplica) + trazabilidad de origen.
 */

// ── Regla transversal ───────────────────────────────────────────────────────────

/** Slots de fuente. "hubspot" y "odoo" están DEFINIDOS pero NO cableados (futuro). */
export type CobranzaFuente = "manual" | "sheet" | "hubspot" | "odoo";

export interface FuenteRef {
  fuente: CobranzaFuente;
  idExterno: string; // id estable en la fuente (fila del sheet, company de HubSpot…)
}

// ── Puerto 1: AccountSource ─────────────────────────────────────────────────────

/** Una cuenta de cobro entrante desde una fuente (ya normalizada y validada). */
export interface CuentaEntrante {
  fuenteRef: FuenteRef;
  clienteNombre: string;
  dominio: string | null; // normalizado (lowercase, sin @); null = sin dominio (permitido)
  correoCobro?: string | null;
  tipo?: "NACIONAL" | "INTERNACIONAL";
  viaCobro?: "MERCURY" | "ODOO" | "OTRA";
  moneda?: "CRC" | "USD";
  terminosPago?: "ANTICIPADO" | "VENCIDO";
  diaCobroAncla?: number | null;
  notas?: string | null;
  /** Si la fuente dice suscripción: se pre-arma el ServicioContratado + PlanDePago. */
  suscripcion?: {
    montoMensual: number;
    moneda: "CRC" | "USD";
    fechaInicio: string | null; // ISO date; el ingest la CLAMPEA al ciclo corriente (sin backfill)
  } | null;
  /** Vínculo pre-confirmado por la persona en la cola de revisión (gana sobre el dedup automático). */
  dedupClientId?: string | null;
}

export interface IngestResultado {
  fuenteRef: FuenteRef;
  clientId: string;
  cuentaId: string;
  clientCreado: boolean; // false = el dedup vinculó uno existente
  cuentaCreada: boolean;
  servicioCreado: boolean; // pre-armado SUSCRIPCION
  error?: string; // fila que falló (TX por fila — no tumba el batch)
}

/** PUERTO 1 — provee/crea empresas y cuentas. Impl actuales: "manual" y "sheet" (CSV). */
export interface AccountSource {
  readonly slot: CobranzaFuente;
  ingest(cuentas: CuentaEntrante[], ctx: { byEmail: string }): Promise<IngestResultado[]>;
}

// ── Puerto 2: CommunicationPort ─────────────────────────────────────────────────

export type ComCanal = "bitacora" | "gmail" | "meetings"; // gmail/meetings: definidos, NO cableados

/** Contexto de la última comunicación con el cliente (para el borrador de cobro). */
export interface ComContexto {
  /** Última entrada humana de la bitácora (llamada/correo/nota). null = sin historial. */
  ultimaComunicacion: { fechaISO: string; tipo: string; resumen: string } | null;
  /** Último hilo de CORREO pegado a mano en la bitácora (texto crudo). */
  hiloReciente: string | null;
  correoCobro: string | null;
}

export interface BorradorMensaje {
  asunto: string;
  cuerpo: string;
}

export interface EntregaResultado {
  modo: "manual"; // v1: el humano copia/abre — SIN envío automático
  mailtoUrl: string | null; // null si la cuenta no tiene correoCobro
}

/** PUERTO 2 — contexto de comunicación + entrega. Impl actual: "bitacora" (manual). */
export interface CommunicationPort {
  readonly slot: ComCanal;
  obtenerContexto(cuentaId: string): Promise<ComContexto>;
  /** v1 NO envía: registra la gestión en bitácora y devuelve cómo entregarlo a mano. */
  registrarEntrega(
    cuentaId: string,
    cobroId: string | null,
    borrador: BorradorMensaje,
    ctx: { byEmail: string },
  ): Promise<EntregaResultado>;
}

// ── Puerto 3: ReconciliationPort ────────────────────────────────────────────────

export type ReconciliacionCanal = "manual" | "mercury" | "odoo"; // mercury/odoo: futuros

export interface ConfirmacionPago {
  cobroId: string;
  fechaCobroISO: string | null; // null = hoy
  referenciaExterna: string | null; // id transacción Mercury / factura Odoo — OPCIONAL
}

/**
 * PUERTO 3 — ¿se pagó? v1 = confirmación manual de la persona. TODA implementación
 * (incluidas las futuras automáticas) embuda en cambiarEstadoCobro — el ÚNICO
 * escritor de Cobro.estado (INV3: ningún COBRADO sin confirmadoPor).
 */
export interface ReconciliationPort {
  readonly slot: ReconciliacionCanal;
  confirmar(conf: ConfirmacionPago, ctx: { byEmail: string }): Promise<void>;
}
