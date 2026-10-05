/**
 * lib/cs/licencias.ts — las LICENCIAS de HubSpot de un cliente y sus renovaciones (2026-10-02). PURO.
 *
 * Pedido de Liliana Moreno: en la información del cliente, la fecha de compra, la de renovación, los
 * hubs y el plan, y el monto, con aviso con anticipación.
 *
 * ── DE DÓNDE SALE CADA DATO (verificado contra producción) ───────────────────────────────────
 * El objeto Partner Clients de HubSpot (ya lo copia `lib/cs/partner-sync.ts` en
 * `ClientPartnerSnapshot.properties`) trae, por hub: la fecha de renovación
 * (`hs_<hub>_hub_renewal_date`), el plan (`hs_<hub>_hub_edition`) y el monto MENSUAL
 * (`hs_<hub>_hub_mrr`), con la moneda en `hs_managed_local_mrr_currency`. Solo cuando Smarteam
 * ADMINISTRA la cuenta («managed»): 53 de 157 registros traen renovación.
 * Lo que NO trae es la fecha de COMPRA por hub: esa se carga A MANO (decisión de Elías), igual que
 * todo lo demás cuando HubSpot no lo da (`LicenciaCliente`).
 *
 * ⛔ Interno: nunca va a un documento del cliente (lib/delivery/privacidad.test.ts).
 */
import { normalizarMoneda } from "./formato";

export const HUBS = ["marketing", "sales", "service", "content", "operations", "commerce"] as const;
export type Hub = (typeof HUBS)[number];

export const NOMBRE_DEL_HUB: Record<Hub, string> = {
  marketing: "Marketing Hub",
  sales: "Sales Hub",
  service: "Service Hub",
  content: "Content Hub",
  operations: "Operations Hub",
  commerce: "Commerce Hub",
};

export interface LicenciaDeHub {
  hub: Hub;
  /** El plan («Professional», «Enterprise»…), o null. */
  plan: string | null;
  /** AAAA-MM-DD, o null. */
  renovacion: string | null;
  /** Monto mensual, o null. */
  montoMensual: number | null;
  moneda: string | null;
  /** AAAA-MM-DD, siempre a mano. */
  fechaCompra: string | null;
  nota: string | null;
  /** De dónde salió la renovación: HubSpot o una persona. */
  fuenteRenovacion: "hubspot" | "manual" | null;
}

/** Lo que una persona cargó a mano para un hub (`LicenciaCliente`). */
export interface LicenciaManual {
  hub: string;
  plan: string | null;
  fechaCompra: Date | string | null;
  fechaRenovacion: Date | string | null;
  montoMensual: number | null;
  moneda: string | null;
  nota: string | null;
}

/** Una fecha de HubSpot (epoch en ms como texto, o ISO) a AAAA-MM-DD. */
export function fechaDeHubspot(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : /^\d{10,}$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n) : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function aFecha(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function plan(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t || t.toLowerCase() === "none" || t.toLowerCase() === "free") return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function monto(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Las licencias que dice HubSpot. Solo los hubs con algo: plan pago, renovación o monto. */
export function licenciasDesdePartner(properties: unknown): LicenciaDeHub[] {
  if (!properties || typeof properties !== "object") return [];
  const p = properties as Record<string, unknown>;
  const moneda = typeof p.hs_managed_local_mrr_currency === "string" ? normalizarMoneda(p.hs_managed_local_mrr_currency) : null;
  const out: LicenciaDeHub[] = [];
  for (const hub of HUBS) {
    const pre = `hs_${hub}_hub`;
    const l: LicenciaDeHub = {
      hub,
      plan: plan(p[`${pre}_edition`]),
      renovacion: fechaDeHubspot(p[`${pre}_renewal_date`]),
      montoMensual: monto(p[`${pre}_mrr`]),
      moneda,
      fechaCompra: null,
      nota: null,
      fuenteRenovacion: null,
    };
    if (l.renovacion) l.fuenteRenovacion = "hubspot";
    if (l.plan || l.renovacion || l.montoMensual) out.push(l);
  }
  return out;
}

/**
 * HubSpot + lo cargado a mano. HubSpot manda cuando trae el dato; lo manual completa lo que falta
 * (y la fecha de compra, que HubSpot no tiene nunca). Un hub cargado solo a mano también aparece.
 */
export function combinarLicencias(partner: readonly LicenciaDeHub[], manuales: readonly LicenciaManual[]): LicenciaDeHub[] {
  const porHub = new Map<Hub, LicenciaDeHub>(partner.map((l) => [l.hub, { ...l }]));
  for (const m of manuales) {
    if (!(HUBS as readonly string[]).includes(m.hub)) continue;
    const hub = m.hub as Hub;
    const base: LicenciaDeHub = porHub.get(hub) ?? {
      hub, plan: null, renovacion: null, montoMensual: null, moneda: null, fechaCompra: null, nota: null, fuenteRenovacion: null,
    };
    const renovacionManual = aFecha(m.fechaRenovacion);
    // La moneda va con el monto: si el monto sale de lo cargado a mano, su moneda también.
    const montoManual = base.montoMensual === null && m.montoMensual != null;
    porHub.set(hub, {
      ...base,
      plan: base.plan ?? (m.plan?.trim() || null),
      montoMensual: base.montoMensual ?? m.montoMensual ?? null,
      moneda: montoManual ? (normalizarMoneda(m.moneda) ?? base.moneda) : (base.moneda ?? normalizarMoneda(m.moneda)),
      renovacion: base.renovacion ?? renovacionManual,
      fuenteRenovacion: base.renovacion ? "hubspot" : renovacionManual ? "manual" : null,
      fechaCompra: aFecha(m.fechaCompra),
      nota: m.nota?.trim() || null,
    });
  }
  return HUBS.filter((h) => porHub.has(h)).map((h) => porHub.get(h)!);
}

/** Los avisos, en días antes de la renovación. */
export const UMBRALES_DE_AVISO = [90, 60, 30] as const;

/**
 * Cuántos días faltan y en qué umbral cae (el más cercano ya alcanzado). null si falta más de 90
 * días, o si ya venció (una renovación vencida no se avisa: el dato de HubSpot quedó viejo).
 */
export function avisoDeRenovacion(renovacion: string | null, hoy: string): { dias: number; umbral: 90 | 60 | 30 } | null {
  if (!renovacion) return null;
  const dias = Math.round((Date.parse(`${renovacion}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 0 || dias > 90) return null;
  const umbral = dias <= 30 ? 30 : dias <= 60 ? 60 : 90;
  return { dias, umbral };
}

export function severidadDelAviso(umbral: 90 | 60 | 30): "LOW" | "MEDIUM" | "HIGH" {
  return umbral === 30 ? "HIGH" : umbral === 60 ? "MEDIUM" : "LOW";
}

/** Una línea para el aviso: «Sales Hub Professional renueva el 2027-02-27 (en 45 días) · 6.520 USD al mes». */
export function lineaDelAviso(l: LicenciaDeHub, dias: number): string {
  const nombre = `${NOMBRE_DEL_HUB[l.hub]}${l.plan ? ` ${l.plan}` : ""}`;
  const dinero = l.montoMensual ? ` · ${l.montoMensual.toLocaleString("es-CR")} ${l.moneda ?? ""} al mes`.trimEnd() : "";
  return `${nombre} renueva el ${l.renovacion} (en ${dias} días)${dinero}`;
}
