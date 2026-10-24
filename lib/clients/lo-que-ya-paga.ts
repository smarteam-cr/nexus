/**
 * lib/clients/lo-que-ya-paga.ts — lo que una empresa ya le paga a HubSpot y los hubs que le faltan (U27, 2026-10-24). PURO.
 *
 * Sale de la copia de HubSpot Partner que Nexus ya tiene (`ClientPartnerSnapshot.properties`, copiada por
 * `lib/cs/partner-sync.ts`): de las cuentas que Smarteam GESTIONA, el plan y el MRR de cada hub (`hs_<hub>_hub_edition`,
 * `hs_<hub>_hub_mrr`, leídos con `licenciasDesdePartner`), sumado a lo cargado a mano en «Licencias» (`LicenciaCliente`)
 * con la MISMA regla que esa pestaña y la cartera (`combinarLicencias`); de las que no gestiona, solo lo VENDIDO
 * (`hs_sold_product_lines`, «cms;marketing_hub;sales_hub», y `hs_sold_mrr`, el total). Va al lado del TAM estimado v1, y
 * lo que el TAM le asigna y no tiene (o tiene en una edición más chica) es la venta cruzada. No se guarda aparte: la
 * copia es la fuente. Interno: nunca va a un documento del cliente.
 */
import { combinarLicencias, licenciasDesdePartner, NOMBRE_DEL_HUB, type Hub, type LicenciaManual } from "@/lib/cs/licencias";
import { NOMBRE_DE_LA_EDICION, type Edicion, type HubDelTam } from "./tam-v1";

export interface HubQueYaPaga {
  hub: Hub;
  nombre: string;
  /** «Professional», o null si solo se sabe que lo compró. */
  plan: string | null;
  montoMensual: number | null;
  /** La moneda de ESTE monto: lo cargado a mano puede estar en colones aunque Partner esté en dólares. */
  moneda: string | null;
  /** De dónde se sabe: el registro de Partner (gestionada), lo cargado a mano en «Licencias», o lo vendido. */
  origen: "partner" | "a_mano" | "vendida";
}

export interface LoQueYaPaga {
  /** gestionada = Smarteam administra la cuenta (hay MRR por hub); a_mano = solo lo cargado en «Licencias»;
   *  vendida = solo se sabe qué compró. */
  fuente: "gestionada" | "a_mano" | "vendida";
  hubs: HubQueYaPaga[];
  /** La suma al mes, solo si todos los montos están en la MISMA moneda (no se suman dólares con colones). */
  totalMensual: number | null;
  moneda: string | null;
  /** Cuándo se copió del registro de Partner (día de Costa Rica). null = no salió de Partner. */
  copiadaAt: string | null;
}

/** «cms» es como HubSpot llama a Content Hub en lo vendido; «core_seats» no es un hub. */
const HUB_DE_LA_LINEA: Record<string, Hub> = {
  marketing_hub: "marketing",
  sales_hub: "sales",
  service_hub: "service",
  cms: "content",
  content_hub: "content",
  operations_hub: "operations",
  commerce_hub: "commerce",
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** El día de Costa Rica de una fecha (una copia de las 7 p. m. del 24 no es del 25). */
const diaDeCostaRica = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(d));

/**
 * Lo que ya paga, o null si ni el registro de Partner ni lo cargado a mano ni lo vendido dicen nada. `manuales` son las
 * filas de `LicenciaCliente` de la empresa: sin ellas, la ficha diría «no lo tiene» de un hub que la pestaña Licencias
 * muestra. Lo vendido (`hs_sold_product_lines`) suma los hubs que no aparecen en lo otro, sin plan ni monto.
 */
export function loQueYaPaga(
  snapshot: { properties: unknown; fetchedAt?: Date | string | null } | null,
  manuales: readonly LicenciaManual[] = [],
): LoQueYaPaga | null {
  const p = (snapshot?.properties && typeof snapshot.properties === "object" ? snapshot.properties : {}) as Record<string, unknown>;
  const delPartner = licenciasDesdePartner(p).filter((l) => l.plan || l.montoMensual);
  const dePartner = new Set(delPartner.map((l) => l.hub));
  const pagadas = combinarLicencias(licenciasDesdePartner(p), manuales).filter((l) => l.plan || l.montoMensual);
  const hubs: HubQueYaPaga[] = pagadas.map((l) => ({
    hub: l.hub,
    nombre: NOMBRE_DEL_HUB[l.hub],
    plan: l.plan,
    montoMensual: l.montoMensual,
    moneda: l.montoMensual !== null ? (l.moneda ?? "USD") : null,
    origen: dePartner.has(l.hub) ? "partner" : "a_mano",
  }));

  const lineas = typeof p.hs_sold_product_lines === "string" ? p.hs_sold_product_lines.split(";").map((x) => x.trim().toLowerCase()) : [];
  const vendidos = [...new Set(lineas.map((l) => HUB_DE_LA_LINEA[l]).filter((h): h is Hub => !!h))];
  for (const hub of vendidos) {
    if (!hubs.some((h) => h.hub === hub)) hubs.push({ hub, nombre: NOMBRE_DEL_HUB[hub], plan: null, montoMensual: null, moneda: null, origen: "vendida" });
  }
  if (hubs.length === 0) return null;

  const fuente: LoQueYaPaga["fuente"] = dePartner.size > 0 ? "gestionada" : hubs.some((h) => h.origen === "a_mano") ? "a_mano" : "vendida";
  const conMonto = hubs.filter((h) => h.montoMensual !== null);
  const monedas = new Set(conMonto.map((h) => h.moneda));
  let totalMensual: number | null = null;
  let moneda: string | null = monedas.size === 1 ? [...monedas][0] : null;
  if (conMonto.length > 0 && monedas.size === 1) totalMensual = Math.round(conMonto.reduce((s, h) => s + h.montoMensual!, 0) * 100) / 100;
  else if (conMonto.length === 0) {
    // Sin montos por hub: el total que da Partner (gestionado o vendido), en dólares.
    totalMensual = fuente === "vendida" ? numero(p.hs_sold_mrr) : numero(p.hs_total_subscription_mrr);
    moneda = totalMensual !== null ? "USD" : null;
  }
  const saleDePartner = dePartner.size > 0 || vendidos.length > 0;
  return { fuente, hubs, totalMensual, moneda, copiadaAt: saleDePartner && snapshot?.fetchedAt ? diaDeCostaRica(snapshot.fetchedAt) : null };
}

const ORDEN: Record<Edicion, number> = { starter: 1, professional: 2, enterprise: 3 };
const edicionDelPlan = (plan: string | null): Edicion | null => {
  const t = (plan ?? "").toLowerCase();
  return t === "starter" || t === "professional" || t === "enterprise" ? t : null;
};

export interface LoQueLeFalta {
  hub: HubDelTam;
  nombre: string;
  /** «No lo tiene» o «Tiene Starter; le corresponde Professional». */
  motivo: string;
}

/**
 * La venta cruzada: los hubs que el TAM v1 le asigna y no paga, o paga en una edición más chica. De una cuenta solo
 * vendida no se sabe la edición: cuenta solo si no lo tiene.
 */
export function loQueLeFalta(tam: { hubs: readonly HubDelTam[]; edicion: Edicion | null }, ya: LoQueYaPaga | null): LoQueLeFalta[] {
  if (!tam.edicion) return [];
  const out: LoQueLeFalta[] = [];
  for (const hub of tam.hubs) {
    const tiene = ya?.hubs.find((h) => h.hub === hub);
    const nombre = NOMBRE_DEL_HUB[hub];
    if (!tiene) {
      out.push({ hub, nombre, motivo: "No lo tiene" });
      continue;
    }
    const suya = edicionDelPlan(tiene.plan);
    if (suya && ORDEN[suya] < ORDEN[tam.edicion]) {
      out.push({ hub, nombre: `${nombre} ${NOMBRE_DE_LA_EDICION[tam.edicion]}`, motivo: `Tiene ${NOMBRE_DE_LA_EDICION[suya]}; le corresponde ${NOMBRE_DE_LA_EDICION[tam.edicion]}` });
    }
  }
  return out;
}
