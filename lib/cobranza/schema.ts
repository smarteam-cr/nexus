/**
 * lib/cobranza/schema.ts
 *
 * Schemas Zod de las fronteras HTTP del módulo Cobranza + ESPEJOS client-safe de
 * los enums Prisma (arrays const — patrón lib/marketing/schema.ts) para que los
 * Client Components (selects, badges) no importen @prisma/client.
 */
import { z } from "zod";

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
