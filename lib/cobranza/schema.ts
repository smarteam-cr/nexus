/**
 * lib/cobranza/schema.ts
 *
 * Schemas Zod de las fronteras HTTP del módulo Cobranza + ESPEJOS client-safe de
 * los enums Prisma (arrays const — patrón lib/marketing/schema.ts) para que los
 * Client Components (selects, badges) no importen @prisma/client.
 */
import { z } from "zod";
import { FRECUENCIA_PARTNER_MIN, FRECUENCIA_PARTNER_MAX } from "./partners";

// ── Espejos client-safe de los enums (mantener en sync con prisma/schema.prisma) ──

export const COBRANZA_TIPOS_CUENTA = ["NACIONAL", "INTERNACIONAL"] as const;
export const COBRANZA_VIAS_COBRO = ["MERCURY", "ODOO", "OTRA"] as const;
export const COBRANZA_MONEDAS = ["CRC", "USD"] as const;
export const COBRANZA_TERMINOS_PAGO = ["ANTICIPADO", "VENCIDO"] as const;
export const COBRANZA_ESTADOS_CUENTA = [
  "PENDIENTE_DATOS",
  "PENDIENTE_CONTRATO",
  "ACTIVA",
  "CON_ATRASO",
  "SUSPENDIDA",
] as const;
export const COBRANZA_TIPOS_SERVICIO = [
  "SUSCRIPCION",
  "IMPLEMENTACION",
  "WEB",
  "SOPORTE",
  "CRM",
  "CONECTOR",
  "OTRO",
] as const;
export const COBRANZA_MODALIDADES = ["RECURRENTE", "PROYECTO"] as const;
export const COBRANZA_ESTADOS_SERVICIO = ["ACTIVO", "FINALIZADO", "PAUSADO"] as const;
export const COBRANZA_PLAN_TEMPLATES = [
  "PAREJO",
  "ENTRADA_Y_RESTO",
  "SUSCRIPCION",
  "PERSONALIZADO",
] as const;
export const COBRANZA_CUOTA_BASES = ["PORCENTAJE", "MONTO_FIJO"] as const;
export const COBRANZA_ESTADOS_COBRO = ["PROGRAMADO", "POR_COBRAR", "COBRADO", "SIN_DATO"] as const;
export const COBRANZA_TIPOS_ALERTA = [
  "COBRO_PROXIMO",
  "FACTURACION_ATRASADA",
  "COBRO_VENCIDO",
  "CUENTA_SIN_DATOS",
  "INCONSISTENCIA_CICLO",
  "ARRANQUE_CAMBIADO",
  "MONTOS_DESCUADRADOS",
  "PROMESA_INCUMPLIDA",
] as const;
export const COBRANZA_URGENCIAS = ["ALTA", "MEDIA", "BAJA"] as const;
export const COBRANZA_ALERTA_ESTADOS = ["ABIERTA", "VISTA", "RESUELTA", "DESCARTADA"] as const;
export const BITACORA_TIPOS = ["LLAMADA", "CORREO", "NOTA"] as const; // ACTUALIZACION_IA solo la escribe el sistema
export const COBRANZA_IMPORT_ESTADOS = ["BORRADOR", "EN_REVISION", "APLICADO", "DESCARTADO"] as const;
export const COBRANZA_IMPORT_FILA_ESTADOS = ["VALIDA", "REVISAR", "APLICADA", "OMITIDA"] as const;

// Labels legibles para la UI (tuteo/español operativo).
export const TIPO_CUENTA_LABEL: Record<string, string> = {
  NACIONAL: "Nacional",
  INTERNACIONAL: "Internacional",
};
export const ESTADO_CUENTA_LABEL: Record<string, string> = {
  PENDIENTE_DATOS: "Pendiente de datos",
  PENDIENTE_CONTRATO: "Pendiente de contrato",
  ACTIVA: "Activa",
  CON_ATRASO: "Con atraso",
  SUSPENDIDA: "Suspendida",
};
export const TIPO_SERVICIO_LABEL: Record<string, string> = {
  SUSCRIPCION: "Suscripción",
  IMPLEMENTACION: "Implementación",
  WEB: "Web",
  SOPORTE: "Soporte",
  CRM: "CRM",
  CONECTOR: "Conector",
  OTRO: "Otro",
};
export const PLAN_TEMPLATE_LABEL: Record<string, string> = {
  PAREJO: "Cuotas parejas",
  ENTRADA_Y_RESTO: "Entrada + resto",
  SUSCRIPCION: "Suscripción mensual",
  PERSONALIZADO: "Personalizado",
};
// Ejemplo corto y concreto por plantilla (voseo) — plata real de la sesión con Alex.
export const PLAN_TEMPLATE_HELP: Record<string, string> = {
  PAREJO: "Ej.: $4.000 en 4 cuotas de $1.000, una por mes.",
  ENTRADA_Y_RESTO: "Ej.: paga $3.000 de entrada y después $500 × 4.",
  SUSCRIPCION: "El monto total se interpreta como monto mensual; el horizonte de cobros se extiende solo en cada corte.",
  PERSONALIZADO: "Ej.: 70% de entrada por descuento y 30% al terminar la implementación (caso Actividad).",
};
export const ESTADO_COBRO_LABEL: Record<string, string> = {
  PROGRAMADO: "Programado",
  POR_COBRAR: "Por cobrar",
  COBRADO: "Cobrado",
  SIN_DATO: "Sin dato",
};
export const TIPO_ALERTA_LABEL: Record<string, string> = {
  COBRO_PROXIMO: "Falta facturar",
  FACTURACION_ATRASADA: "Facturación atrasada",
  COBRO_VENCIDO: "Cobro vencido",
  CUENTA_SIN_DATOS: "Cuenta sin datos",
  INCONSISTENCIA_CICLO: "Inconsistencia de ciclo",
  ARRANQUE_CAMBIADO: "Arranque cambiado",
  MONTOS_DESCUADRADOS: "Montos descuadrados",
  PROMESA_INCUMPLIDA: "Promesa incumplida",
};
export const IMPORT_ESTADO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  APLICADO: "Aplicado",
  DESCARTADO: "Descartado",
};
export const IMPORT_FILA_ESTADO_LABEL: Record<string, string> = {
  VALIDA: "Válida",
  REVISAR: "Revisar",
  APLICADA: "Aplicada",
  OMITIDA: "Omitida",
};

// ── Zod: fronteras HTTP ─────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (esperado YYYY-MM-DD)");
// isoDate valida el FORMATO; este refine valida que la fecha EXISTA de verdad
// (2026-02-30 pasa el regex pero no es un día real) — roundtrip UTC.
const isoDateReal = isoDate.refine((s) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Fecha inexistente");
const monto = z.number().positive("El monto debe ser positivo").multipleOf(0.01, "Máximo 2 decimales");
// Dominio ya NORMALIZADO (lowercase, sin @, sin protocolo — lo normaliza import-core).
const dominio = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, "Dominio inválido (esperado ej. empresa.com)");

export const cuentaCreateSchema = z.object({
  clientId: z.string().cuid(),
  tipo: z.enum(COBRANZA_TIPOS_CUENTA).default("NACIONAL"),
  viaCobro: z.enum(COBRANZA_VIAS_COBRO).default("ODOO"),
  moneda: z.enum(COBRANZA_MONEDAS).default("CRC"),
  terminosPago: z.enum(COBRANZA_TERMINOS_PAGO).default("ANTICIPADO"),
  diaCobroAncla: z.number().int().min(1).max(31).nullish(),
  // Días de crédito tras facturar (Reloj 2 del semáforo). Vacío = default global
  // (DEFAULT_CREDITO_DIAS en engine.ts). Rango 1-365 para que Colby (90) entre cómodo.
  creditoDias: z.number().int().min(1).max(365).nullish(),
  notas: z.string().max(4000).nullish(),
});

export const cuentaPatchSchema = z
  .object({
    tipo: z.enum(COBRANZA_TIPOS_CUENTA),
    viaCobro: z.enum(COBRANZA_VIAS_COBRO),
    moneda: z.enum(COBRANZA_MONEDAS),
    terminosPago: z.enum(COBRANZA_TERMINOS_PAGO),
    diaCobroAncla: z.number().int().min(1).max(31).nullable(),
    creditoDias: z.number().int().min(1).max(365).nullable(),
    estadoCuenta: z.enum(COBRANZA_ESTADOS_CUENTA),
    excluidaOperacion: z.boolean(),
    responsableCobroTerceros: z.string().max(500).nullable(),
    correoCobro: z.string().email("Correo inválido").max(200).nullable(),
    // Identidad legal (distinta del nombre comercial) — ver DECISIONS.md.
    razonSocial: z.string().max(200).nullable(),
    cedulaJuridica: z.string().max(200).nullable(),
    notas: z.string().max(4000).nullable(),
  })
  .partial();

export const servicioCreateSchema = z.object({
  tipoServicio: z.enum(COBRANZA_TIPOS_SERVICIO),
  modalidad: z.enum(COBRANZA_MODALIDADES),
  montoTotal: monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  fechaInicioFacturacion: isoDate.nullish(), // sin valor + projectId → se lee del anchor
  duracionMeses: z.number().int().min(1).max(120).nullish(),
  projectId: z.string().cuid().nullish(),
  descripcion: z.string().max(500).nullish(),
});

export const servicioPatchSchema = z
  .object({
    tipoServicio: z.enum(COBRANZA_TIPOS_SERVICIO),
    modalidad: z.enum(COBRANZA_MODALIDADES),
    montoTotal: monto,
    moneda: z.enum(COBRANZA_MONEDAS),
    fechaInicioFacturacion: isoDate.nullable(),
    duracionMeses: z.number().int().min(1).max(120).nullable(),
    projectId: z.string().cuid().nullable(),
    estado: z.enum(COBRANZA_ESTADOS_SERVICIO),
    descripcion: z.string().max(500).nullable(),
  })
  .partial();

const cuotaPlanSchema = z.object({
  orden: z.number().int().min(1),
  base: z.enum(COBRANZA_CUOTA_BASES),
  valor: z.number().positive(),
  offsetMeses: z.number().int().min(0).max(120),
  descripcion: z.string().max(300).nullish(),
});

/**
 * PUT del plan activo. Refinamientos por template:
 *  - PAREJO: numCuotas ≥ 1 O el servicio tiene duracionMeses (eso se valida en la
 *    mutación, que ve el servicio).
 *  - ENTRADA_Y_RESTO: exige cuota orden 1 PORCENTAJE 0<valor<100 + numCuotas ≥ 1.
 *  - PERSONALIZADO: cuotas no vacías, órdenes únicos.
 *  - SUSCRIPCION: sin requisitos extra (montoTotal = mensual).
 */
export const planPutSchema = z
  .object({
    template: z.enum(COBRANZA_PLAN_TEMPLATES),
    numCuotas: z.number().int().min(1).max(120).nullish(),
    cuotas: z.array(cuotaPlanSchema).max(60).default([]),
    notas: z.string().max(2000).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.template === "ENTRADA_Y_RESTO") {
      const entrada = val.cuotas.find((c) => c.orden === 1);
      if (!entrada || entrada.base !== "PORCENTAJE" || entrada.valor <= 0 || entrada.valor >= 100) {
        ctx.addIssue({
          code: "custom",
          message: "Entrada + resto necesita una cuota 1 de tipo porcentaje entre 0 y 100.",
          path: ["cuotas"],
        });
      }
      if (!val.numCuotas) {
        ctx.addIssue({ code: "custom", message: "Indicá en cuántas cuotas va el resto.", path: ["numCuotas"] });
      }
    }
    if (val.template === "PERSONALIZADO") {
      if (val.cuotas.length === 0) {
        ctx.addIssue({ code: "custom", message: "Personalizado necesita al menos una cuota.", path: ["cuotas"] });
      }
      const ordenes = val.cuotas.map((c) => c.orden);
      if (new Set(ordenes).size !== ordenes.length) {
        ctx.addIssue({ code: "custom", message: "Los órdenes de cuota deben ser únicos.", path: ["cuotas"] });
      }
    }
  });

/**
 * PATCH de un cobro. fechaProgramada/monto solo se aceptan si el cobro está
 * PROGRAMADO (lo valida la mutación, que ve el estado actual). COBRADO exige
 * confirmación (la mutación setea confirmadoPor desde el guard — INV3).
 */
export const cobroPatchSchema = z
  .object({
    estado: z.enum(COBRANZA_ESTADOS_COBRO),
    fechaProgramada: isoDate,
    monto,
    fechaEmision: isoDate.nullable(),
    fechaCobro: isoDate.nullable(),
    // ReconciliationPort v1: id de transacción Mercury / factura Odoo al confirmar COBRADO.
    referenciaExterna: z.string().max(200).nullable(),
    // Promesa de pago: calla las alertas de este cobro hasta la fecha (null = quitarla).
    promesaPago: isoDate.nullable(),
    notas: z.string().max(2000).nullable(),
  })
  .partial();

/**
 * Pago manual: registrar un pago que NO salió de un plan. Crea un Cobro
 * origen=MANUAL sobre un servicio EXISTENTE y lo marca COBRADO (por el chokepoint
 * cambiarEstadoCobro — INV3). El schema exige servicioId: no hay pago flotante.
 */
export const cobroManualSchema = z.object({
  servicioId: z.string().cuid(),
  monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  fechaCobro: isoDate, // cuándo entró la plata (la UI la capa a hoy)
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Período inválido (esperado YYYY-MM)")
    .optional(),
  referenciaExterna: z.string().max(200).nullable().optional(),
});

export const alertaPatchSchema = z
  .object({
    estado: z.enum(COBRANZA_ALERTA_ESTADOS),
    // Snooze manual: la alerta desaparece del feed hasta esta fecha (null = quitar snooze).
    posponerHasta: isoDate.nullable(),
  })
  .partial()
  .refine((v) => v.estado !== undefined || v.posponerHasta !== undefined, {
    message: "Indicá el estado o la fecha de posposición.",
  });

// ── Reporte de finanzas (agente reporter, fase 3) ──────────────────────────────

export const REPORTE_VOCES = ["operativa", "ejecutiva"] as const;
export const reporteFinanzasSchema = z.object({
  voz: z.enum(REPORTE_VOCES),
});

export const bitacoraCreateSchema = z.object({
  tipo: z.enum(BITACORA_TIPOS),
  contenido: z.string().min(1).max(4000),
  cobroId: z.string().cuid().nullish(),
});

// ── Ingresos variables ─────────────────────────────────────────────────────────
// Entrada de dinero fuera del ciclo quincenal que NO cuelga de un servicio
// contratado. `clientId` es OPCIONAL a propósito: el ingreso puede relacionarse
// con un cliente o ser general (ver el comentario del modelo en schema.prisma).

export const ingresoVariableCreateSchema = z.object({
  concepto: z.string().trim().min(1, "El concepto es requerido").max(160),
  monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  fecha: isoDateReal,
  // null / ausente = ingreso general, sin cliente.
  clientId: z.string().cuid().nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const ingresoVariablePatchSchema = ingresoVariableCreateSchema.partial();

// ── Comisiones de PARTNER (ingreso — superficie ADMIN, gate cobranza.read) ─────
// Lo que Smarteam GANA de un aliado comercial (HubSpot, Atom Chat, Cooby…).
// ⚠ NUNCA comparte ruta, endpoint ni loader con las de VENDEDOR, que son
// remuneración de una persona y viven en la superficie SUPER_ADMIN.

/**
 * "HubSpot " y "hubspot" son el MISMO partner. Se normaliza para agrupar, pero
 * el nombre que se GUARDA es el que escribió la persona (con sus mayúsculas):
 * lo que se compara es la clave, no lo que se muestra.
 */
export { FRECUENCIA_PARTNER_MIN, FRECUENCIA_PARTNER_MAX } from "./partners";

export function normalizePartner(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El ALIADO con su cadencia. Su frecuencia es del aliado y no del pago (decisión
 * de Elías): HubSpot paga cada 3 meses y eso no cambia pago a pago. El rango
 * espeja el CHECK de la base — dos frenos para el mismo hecho, a propósito: uno
 * atrapa la UI y el otro lo que entre por un script.
 */
const partnerBase = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido").max(80),
  frecuenciaMeses: z
    .number()
    .int("La frecuencia va en meses enteros")
    .min(FRECUENCIA_PARTNER_MIN, "Mínimo 1 mes")
    .max(FRECUENCIA_PARTNER_MAX, "Máximo 24 meses"),
  activo: z.boolean().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const partnerCreateSchema = partnerBase;
export const partnerPatchSchema = partnerBase.partial();

const comisionPartnerBase = z.object({
  partner: z.string().trim().min(1, "El partner es requerido").max(80),
  // El aliado configurado. null = todavía no está dado de alta; el pago se
  // registra igual (`partner` como string es el snapshot) y se puede ligar
  // después. Forzarlo obligaría a configurar antes de poder anotar la plata.
  partnerId: z.string().cuid().nullable().optional(),
  concepto: z.string().trim().max(160).nullable().optional(),
  monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  fecha: isoDateReal,
  // null / ausente = el aliado no está en la cartera como Client. No se inventa.
  clientId: z.string().cuid().nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const comisionPartnerCreateSchema = comisionPartnerBase;
export const comisionPartnerPatchSchema = comisionPartnerBase.partial();

// ── Costos recurrentes (fase 4 — SUPER_ADMIN-only) ─────────────────────────────
// Espejos client-safe de los enums Prisma (mantener en sync con schema.prisma).
// La superficie completa de costos/caja-neta está gateada por COSTOS_ROLES
// (lib/auth/cobranza-roles.ts) — estos arrays/labels solo nombran categorías,
// no llevan datos.

export const COSTOS_CATEGORIAS = ["SALARIO", "HERRAMIENTA", "FIJO_OPERACION"] as const;
export const COSTOS_FRECUENCIAS = ["MENSUAL", "ANUAL"] as const;

export const CATEGORIA_COSTO_LABEL: Record<string, string> = {
  SALARIO: "Salario",
  HERRAMIENTA: "Herramienta",
  FIJO_OPERACION: "Fijo de operación",
};
export const FRECUENCIA_COSTO_LABEL: Record<string, string> = {
  MENSUAL: "Mensual",
  ANUAL: "Anual",
};

/** Multiplicador EDITABLE del usuario (ej. 1.35) — NO es una tasa fiscal nuestra.
 *  Sin multipleOf flotante (falsos negativos); la mutación redondea a 4 decimales. */
const factorCargas = z
  .number()
  .positive("El factor debe ser positivo")
  .max(9.9999, "Factor demasiado grande (máx 9.9999)");

const costoBase = z.object({
  categoria: z.enum(COSTOS_CATEGORIAS),
  nombre: z.string().trim().min(1, "El nombre es requerido").max(120),
  // El ALL-IN canónico SIEMPRE viaja (directo, o ya calculado base×factor en el client).
  monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  frecuencia: z.enum(COSTOS_FRECUENCIAS),
  teamMemberId: z.string().cuid().nullable().optional(),
  montoBase: monto.nullable().optional(),
  factorCargas: factorCargas.nullable().optional(),
  activo: z.boolean().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  // Baja DEFINITIVA (≠ pausa): la mutación emite un movimiento BAJA con esta fecha
  // y el motor excluye el costo pasada la fecha. null = reactivar. (fase 4.5)
  finalizadoEl: isoDateReal.nullable().optional(),
  // Fecha efectiva del movimiento que genera este cambio (ALTA retroactiva al
  // crear, o la fecha de la baja); default hoy en la mutación. NO se persiste en
  // CostoRecurrente — solo alimenta CostoMovimiento.
  fechaEfectiva: isoDateReal.optional(),
  // Motivo libre del movimiento ("renuncia", "desvinculación", "contratación").
  motivoMovimiento: z.string().trim().max(500).nullable().optional(),
});

export const costoCreateSchema = costoBase
  .refine((d) => d.categoria === "SALARIO" || d.teamMemberId == null, {
    message: "Solo un costo de salario liga persona del equipo",
    path: ["teamMemberId"],
  })
  .refine((d) => (d.montoBase == null) === (d.factorCargas == null), {
    message: "Base y factor van juntos (o ninguno)",
    path: ["factorCargas"],
  });

// Los cross-field del PATCH se re-validan en updateCosto sobre la fila MERGEADA
// (con un partial, `categoria` puede venir ausente y `teamMemberId` presente).
export const costoPatchSchema = costoBase.partial();

// ── Gastos puntuales (fase 4.5 — SUPER_ADMIN-only) ─────────────────────────────
// Vocabulario ABIERTO de tags: se normaliza a slug al escribir (sin catálogo).
// La función es client-safe (la usa el preview del TagsInput) — mismo resultado
// en el form y en el server para que lo que ves sea lo que se guarda.

/** "Evento San José!" → "evento-san-jose". Vacío tras normalizar = descartar. */
export function normalizeGastoTag(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin diacríticos (marcas combinantes)
    .toLowerCase()
    .replace(/[\s_]+/g, "-") // espacios/underscore → guion
    .replace(/[^a-z0-9-]/g, "") // solo alfanumérico + guion
    .replace(/-+/g, "-") // colapsar guiones
    .slice(0, 40)
    .replace(/^-+|-+$/g, ""); // sin guiones al borde
}

/** Normaliza + dedupe + tope de 8 tags. */
export function normalizeGastoTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const n = normalizeGastoTag(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 8);
}

const gastoTags = z.array(z.string().max(60)).max(32).transform(normalizeGastoTags).default([]);

const gastoBase = z.object({
  nombre: z.string().trim().min(1, "El nombre es requerido").max(120),
  monto,
  moneda: z.enum(COBRANZA_MONEDAS),
  fecha: isoDateReal, // día del gasto (pasado = ejecutado; futuro = planificado)
  tags: gastoTags,
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const gastoCreateSchema = gastoBase;
export const gastoPatchSchema = gastoBase.partial();

// ── Tarjetas de crédito (SUPER_ADMIN-only) ─────────────────────────────────────
// Disponible = límite − saldo, y el saldo lo escribe una persona con su fecha de
// corte. Lo que Nexus suma de los costos asignados es REFERENCIA y nunca calcula
// el saldo (ver la doctrina completa en lib/cobranza/tarjetas.ts).

const diaDelMes = z.number().int().min(1, "Día inválido").max(31, "Día inválido");

const tarjetaBase = z.object({
  alias: z.string().trim().min(1, "El alias es requerido").max(80),
  emisor: z.string().trim().max(80).nullable().optional(),
  // ⚠ EXACTAMENTE cuatro dígitos. Este regex es la frontera que impide que el
  // número COMPLETO de una tarjeta entre a la base — no es una validación de
  // formato, es la regla de cumplimiento escrita donde se puede hacer cumplir.
  ultimos4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Son exactamente los últimos 4 dígitos, nunca el número completo")
    .nullable()
    .optional(),
  moneda: z.enum(COBRANZA_MONEDAS),
  limite: monto.nullable().optional(),
  titularTeamMemberId: z.string().cuid().nullable().optional(),
  diaCorte: diaDelMes.nullable().optional(),
  diaPago: diaDelMes.nullable().optional(),
  activa: z.boolean().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

export const tarjetaCreateSchema = tarjetaBase;
export const tarjetaPatchSchema = tarjetaBase.partial();

/**
 * Registrar el saldo usado. Los dos campos van JUNTOS y son obligatorios: un
 * saldo sin fecha de corte no dice nada (¿de cuándo es?) y una fecha sin saldo
 * tampoco. El `saldoPorEmail` lo pone el server desde el guard, nunca el body.
 * Acepta 0 (una tarjeta al día tiene saldo cero, y eso es un dato).
 */
export const tarjetaSaldoSchema = z.object({
  saldoUsado: z
    .number()
    .min(0, "El saldo no puede ser negativo")
    .multipleOf(0.01, "Máximo 2 decimales"),
  saldoAlDia: isoDateReal,
});

/** Asignar o quitar un costo recurrente de una tarjeta (la tabla puente). */
export const tarjetaCostoSchema = z.object({
  costoId: z.string().cuid(),
  asignar: z.boolean(),
});

// ── Libro de planilla (SUPER_ADMIN-only) ───────────────────────────────────────
// Lo que se PAGÓ de verdad, quincena por quincena. Es otra cosa que la hoja
// «Planillas», que muestra el all-in ESTIMADO de CostoRecurrente para el burn.

export const PLANILLA_ESTADOS = ["PENDIENTE", "PAGADO"] as const;

export const ESTADO_PLANILLA_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  PAGADO: "Pagado",
};

const periodoPlanilla = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período va en formato YYYY-MM");

const quincenaPlanilla = z.union([z.literal(1), z.literal(2)], {
  message: "La quincena es 1 (1–15) o 2 (16–fin)",
});

/**
 * Generar las quincenas de un período. NO recibe la lista de personas: se deriva
 * server-side de los salarios ACTIVOS, para que el cliente no pueda pedir que se
 * materialice a alguien que ya no está.
 * La materialización es CREATE-ONLY (ver `generarQuincena`).
 */
export const planillaGenerarSchema = z.object({
  periodo: periodoPlanilla,
  quincena: quincenaPlanilla,
});

/**
 * Marcar una quincena como PAGADA. `fechaPago` opcional (default hoy, capada a
 * hoy en la UI): la plata suele salir días antes de que alguien la registre.
 */
export const planillaPagarSchema = z.object({
  fechaPago: isoDateReal.optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Editar una quincena. Solo mientras está PENDIENTE — un PAGADO es intocable
 * (la mutación lo frena con 409). Sin `estado` a propósito: pagar tiene su
 * propia ruta, que es el chokepoint de INV18.
 */
export const pagoPlanillaPatchSchema = z.object({
  monto: monto.optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

// ── Comisiones de VENDEDOR (remuneración — SUPER_ADMIN-only) ───────────────────
// Lo que Smarteam le PAGA a quien vendió, como % de lo COBRADO. La comisión
// devengada NO se escribe acá: es una vista derivada (lib/cobranza/comisiones.ts).
// Lo único que se persiste es la REGLA y, al liquidar, la comisión congelada.
// ⚠ Nunca comparte ruta, endpoint ni loader con las de PARTNER, que son ingreso.

/**
 * En PUNTOS PORCENTUALES: 13 = 13%, como lo dice la gente. > 0 porque una regla
 * al 0% no es una regla, es no tener comisión — y eso se expresa borrándola.
 * Techo 100: nadie cobra de comisión más de lo que entró.
 */
const porcentajeComision = z
  .number()
  .gt(0, "El porcentaje tiene que ser mayor a 0")
  .max(100, "El porcentaje no puede pasar de 100")
  .multipleOf(0.0001, "Máximo 4 decimales");

const reglaComisionBase = z.object({
  teamMemberId: z.string().cuid(),
  // null / ausente = la regla GENERAL, para todos los clientes. La del cliente
  // le gana (ver `reglaParaCobro`).
  clientId: z.string().cuid().nullable().optional(),
  porcentaje: porcentajeComision,
  vigenteDesde: isoDateReal,
  // null = vigente sin fecha de fin.
  vigenteHasta: isoDateReal.nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

/**
 * ⚠ El refine va acá y no en el `.partial()`: un rango invertido guardado en
 * silencio deja una regla que nunca aplica y una comisión que nadie devenga —
 * el fallo más caro de este modelo, porque no rompe nada, solo no paga.
 */
export const reglaComisionCreateSchema = reglaComisionBase.refine(
  (r) => !r.vigenteHasta || r.vigenteHasta >= r.vigenteDesde,
  { message: "La vigencia termina antes de empezar", path: ["vigenteHasta"] },
);

export const reglaComisionPatchSchema = reglaComisionBase
  .partial()
  .refine((r) => !r.vigenteDesde || !r.vigenteHasta || r.vigenteHasta >= r.vigenteDesde, {
    message: "La vigencia termina antes de empezar",
    path: ["vigenteHasta"],
  });

/**
 * Liquidar lo devengado de una persona en un período y una moneda. NO recibe el
 * monto ni los cobros: los recalcula el server con el mismo cálculo puro que
 * pintó la pantalla. Si el cliente pudiera mandar el monto, la comisión sería lo
 * que dijo el navegador y no lo que dicen los cobros.
 */
export const liquidarComisionSchema = z.object({
  teamMemberId: z.string().cuid(),
  periodo: periodoPlanilla,
  moneda: z.enum(COBRANZA_MONEDAS),
  // Opcional: engancharla a la quincena con la que se paga. Se puede liquidar
  // sin pago todavía (el schema lo permite y la FK es nullable).
  pagoPlanillaId: z.string().cuid().nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
});

// ── Crear empresa (AccountSource "manual" — puerto 1) ───────────────────────────

export const crearEmpresaSchema = z.object({
  nombre: z.string().trim().min(2).max(200),
  dominio: dominio.nullish(),
  correoCobro: z.string().email("Correo inválido").max(200).nullish(),
  tipo: z.enum(COBRANZA_TIPOS_CUENTA).default("NACIONAL"),
  viaCobro: z.enum(COBRANZA_VIAS_COBRO).default("ODOO"),
  moneda: z.enum(COBRANZA_MONEDAS).default("CRC"),
  terminosPago: z.enum(COBRANZA_TERMINOS_PAGO).default("ANTICIPADO"),
  diaCobroAncla: z.number().int().min(1).max(31).nullish(),
  creditoDias: z.number().int().min(1).max(365).nullish(),
  notas: z.string().max(4000).nullish(),
});

// ── Importador CSV (AccountSource "sheet" — puerto 1) ───────────────────────────

/** Campos canónicos del importador — el mapeo asigna una columna del CSV a cada uno. */
export const IMPORT_CAMPOS_CANONICOS = [
  "clienteNombre",
  "dominio",
  "correoCobro",
  "razonSocial",
  "cedulaJuridica",
  "idExterno",
  "tipo",
  "viaCobro",
  "moneda",
  "terminosPago",
  "diaCobroAncla",
  "suscripcionMonto",
  "suscripcionMoneda",
  "suscripcionInicio",
  "notas",
] as const;
export type ImportCampoCanonico = (typeof IMPORT_CAMPOS_CANONICOS)[number];

export const IMPORT_CAMPO_LABEL: Record<ImportCampoCanonico, string> = {
  clienteNombre: "Nombre del cliente (obligatorio)",
  dominio: "Dominio (ej. empresa.com)",
  correoCobro: "Correo de cobro",
  razonSocial: "Razón social",
  cedulaJuridica: "Cédula jurídica",
  idExterno: "Id externo (columna id del sheet)",
  tipo: "Tipo (nacional / internacional)",
  viaCobro: "Vía de cobro (Mercury / Odoo)",
  moneda: "Moneda (CRC / USD)",
  terminosPago: "Términos (anticipado / vencido)",
  diaCobroAncla: "Día de cobro (1–31)",
  suscripcionMonto: "Monto mensual de suscripción",
  suscripcionMoneda: "Moneda de la suscripción",
  suscripcionInicio: "Inicio de la suscripción (fecha)",
  notas: "Notas",
};

/** { campoCanonico: nombreColumnaCSV | null } — todas opcionales salvo que el apply exige clienteNombre. */
export const importMapeoSchema = z
  .object({
    clienteNombre: z.string().max(200).nullable(),
    dominio: z.string().max(200).nullable(),
    correoCobro: z.string().max(200).nullable(),
    razonSocial: z.string().max(200).nullable(),
    cedulaJuridica: z.string().max(200).nullable(),
    idExterno: z.string().max(200).nullable(),
    tipo: z.string().max(200).nullable(),
    viaCobro: z.string().max(200).nullable(),
    moneda: z.string().max(200).nullable(),
    terminosPago: z.string().max(200).nullable(),
    diaCobroAncla: z.string().max(200).nullable(),
    suscripcionMonto: z.string().max(200).nullable(),
    suscripcionMoneda: z.string().max(200).nullable(),
    suscripcionInicio: z.string().max(200).nullable(),
    notas: z.string().max(200).nullable(),
  })
  .partial();

/**
 * Payload CANÓNICO de una fila (post-mapeo + normalización de import-core; este
 * schema valida lo ya normalizado — la coerción de formatos locales vive en
 * lib/cobranza/import-core.ts).
 */
export const importFilaCanonicaSchema = z.object({
  clienteNombre: z.string().trim().min(2, "Nombre muy corto").max(200),
  dominio: dominio.nullish(),
  correoCobro: z.string().email("Correo inválido").max(200).nullish(),
  razonSocial: z.string().max(200).nullish(),
  cedulaJuridica: z.string().max(200).nullish(),
  idExterno: z.string().max(200).nullish(),
  tipo: z.enum(COBRANZA_TIPOS_CUENTA).nullish(),
  viaCobro: z.enum(COBRANZA_VIAS_COBRO).nullish(),
  moneda: z.enum(COBRANZA_MONEDAS).nullish(),
  terminosPago: z.enum(COBRANZA_TERMINOS_PAGO).nullish(),
  diaCobroAncla: z.number().int().min(1, "Día 1–31").max(31, "Día 1–31").nullish(),
  suscripcionMonto: monto.nullish(),
  suscripcionMoneda: z.enum(COBRANZA_MONEDAS).nullish(),
  suscripcionInicio: isoDate.nullish(),
  notas: z.string().max(4000).nullish(),
});
export type ImportFilaCanonica = z.infer<typeof importFilaCanonicaSchema>;
