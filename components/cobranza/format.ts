/**
 * components/cobranza/format.ts
 *
 * Helpers de formato compartidos de la UI de Cobranza (client-safe, sin
 * dependencias de servidor). Las fechas ISO "YYYY-MM-DD" se formatean a mano
 * (sin `new Date`) → determinístico entre SSR y browser, cero corrimiento de zona.
 */
import type { Semaforo } from "@/lib/cobranza/engine";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-07-15" → "15 jul 2026" ("—" si null). */
export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${y}`;
}

/** Monto con símbolo por moneda (USD → $, resto → ₡) en formato es-CR. */
export function fmtMonto(monto: number | null | undefined, moneda: string | null | undefined): string {
  if (monto == null) return "—";
  const simbolo = moneda === "USD" ? "$" : "₡";
  return `${simbolo}${monto.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;
}

/** Colores del semáforo (tokens + colores de estado permitidos — patrón SEV_META). */
export const SEMAFORO_META: Record<Semaforo, { label: string; dot: string; chip: string }> = {
  verde: {
    label: "Cobrado",
    dot: "bg-emerald-500",
    chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  },
  amarillo: {
    label: "Por cobrar",
    dot: "bg-amber-500",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  },
  rojo: {
    label: "Vencido",
    dot: "bg-red-500",
    chip: "text-red-600 bg-red-500/10 border-red-500/30",
  },
  gris: {
    label: "Programado",
    dot: "bg-fg-muted",
    chip: "text-fg-muted bg-surface-muted border-line",
  },
};

/** Monto mensualizado de un costo: ANUAL → monto/12 (round 2), MENSUAL → monto. */
export function mensualizado(monto: number, frecuencia: string): number {
  return frecuencia === "ANUAL" ? Math.round((monto / 12) * 100) / 100 : monto;
}

/** Movimientos de costos (fase 4.5): label + colores de estado (patrón SEMAFORO_META). */
export const MOVIMIENTO_TIPO_META: Record<string, { label: string; chip: string }> = {
  ALTA: { label: "Alta", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  BAJA: { label: "Baja", chip: "text-red-600 bg-red-500/10 border-red-500/30" },
  REACTIVACION: { label: "Reactivación", chip: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  PAUSA: { label: "Pausa", chip: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  CAMBIO_MONTO: { label: "Cambio de monto", chip: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  ELIMINACION: { label: "Eliminación", chip: "text-fg-muted bg-surface-muted border-line" },
};

// Labels que lib/cobranza/schema.ts no trae (espejos chicos de la UI).
export const VIA_COBRO_LABEL: Record<string, string> = {
  MERCURY: "Mercury",
  ODOO: "Odoo",
  OTRA: "Otra",
};
export const TERMINOS_PAGO_LABEL: Record<string, string> = {
  ANTICIPADO: "Anticipado",
  VENCIDO: "Vencido",
};
export const MODALIDAD_LABEL: Record<string, string> = {
  RECURRENTE: "Recurrente",
  PROYECTO: "Proyecto",
};
export const ESTADO_SERVICIO_LABEL: Record<string, string> = {
  ACTIVO: "Activo",
  FINALIZADO: "Finalizado",
  PAUSADO: "Pausado",
};
export const BITACORA_TIPO_LABEL: Record<string, string> = {
  LLAMADA: "Llamada",
  CORREO: "Correo",
  NOTA: "Nota",
  ACTUALIZACION_IA: "Sistema",
};

// Clases repetidas de formularios (mismo look que marketing/*Client).
export const INPUT_CLS =
  "w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";
export const SELECT_CLS =
  "w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand";
export const FILTER_SELECT_CLS =
  "text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand";
export const LABEL_CLS = "block text-[11px] font-medium text-fg-muted mb-1";
