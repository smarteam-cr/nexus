/**
 * lib/clients/tam-v1.ts — el TAM estimado v1: cuánto le podría vender Smarteam a una empresa en un año (2026-10-24). PURO.
 *
 * Elías, 24 oct: sale de cómo es la empresa —su tamaño (empleados), si es casa matriz o filial (y cuántas filiales), su
 * industria y su modelo de negocio—. Con eso, las licencias de HubSpot que le corresponden por tamaño y por los hubs que
 * le sirven, a precio de lista y por año, e Insider si califica. **Los servicios no suman** (sus precios los fija Ventas
 * hasta que existan las actividades) y no hay monto por nivel de la escala. El resultado dice «estimado v1» y lleva cada
 * línea, para mostrar cómo se calculó. El TAM v2 (después de A2) suma los servicios con las horas de las actividades.
 *
 * Todo lo que es criterio (qué hubs, qué edición, cuántos asientos, los precios) está en constantes con nombre, para que
 * Ventas y Elías lo puedan revisar en un solo lugar. Lo ve solo el equipo: nunca va a la memoria de la cuenta ni a un
 * documento del cliente. Decisión: DECISIONS › «Qué ES una empresa» (enmienda del 24 oct) y «Los datos de la empresa».
 */
import type { Hub } from "@/lib/cs/licencias";

export const VERSION_DEL_TAM = "v1";

export type Edicion = "starter" | "professional" | "enterprise";
export const NOMBRE_DE_LA_EDICION: Record<Edicion, string> = { starter: "Starter", professional: "Professional", enterprise: "Enterprise" };

/** Los hubs que puede sumar el TAM v1 (Operations y Commerce no: ninguna regla de hoy los asigna). */
export type HubDelTam = Extract<Hub, "marketing" | "sales" | "service" | "content">;
const NOMBRE: Record<HubDelTam, string> = { marketing: "Marketing Hub", sales: "Sales Hub", service: "Service Hub", content: "Content Hub" };

/**
 * Precios de lista de HubSpot en USD al mes, con pago anual, Professional y Enterprise por hub y asiento (Elías,
 * 2026-10-24). Tomados el 2026-10-24 de las páginas de precios públicas (HubSpot no publica una API de precios); la
 * cuota de incorporación, que se paga una vez, no entra al TAM anual. Si Ventas usa otra tabla, se cambia acá y el
 * script de recálculo (`--recalcular-tam`) dice qué cuentas se mueven.
 */
export const PRECIOS_DE_LISTA = {
  fecha: "2026-10-24",
  /** Precio por asiento. */
  porAsiento: {
    sales: { starter: 15, professional: 90, enterprise: 150 },
    service: { starter: 15, professional: 90, enterprise: 150 },
  },
  marketing: {
    starter: { base: 15, asientosIncluidos: 1, contactosIncluidos: 1000, porBloque: 0, bloque: 1 },
    professional: { base: 890, asientosIncluidos: 3, contactosIncluidos: 2000, porBloque: 250, bloque: 5000 },
    enterprise: { base: 3600, asientosIncluidos: 5, contactosIncluidos: 10000, porBloque: 100, bloque: 10000 },
  },
  content: { starter: 15, professional: 450, enterprise: 1500 },
} as const;

/**
 * El precio de Insider por año, en USD: el ticket mínimo de Insider One, unos USD 3.500 al mes (Elías, 2026-10-24).
 * ⚠ PROVISIONAL, por validar: Elías lo confirma. Se cambia acá y el script de recálculo
 * (`scripts/cargar-datos-de-la-empresa.ts --recalcular-tam`) dice qué cuentas se mueven. null = Insider no suma.
 */
export const PRECIO_INSIDER_ANUAL_USD: number | null = 42_000;
export const PRECIO_INSIDER = { fecha: "2026-10-24", porValidar: true } as const;

/** Desde cuántos empleados una empresa pasa de Starter a Professional, y de Professional a Enterprise. */
export const UMBRALES_DE_EDICION = { professional: 15, enterprise: 1000 } as const;
/** Una casa matriz con al menos tantas filiales necesita Enterprise (unidades de negocio, permisos por equipo). */
export const FILIALES_PARA_ENTERPRISE = 3;
/** Qué parte de la empresa usa cada hub: asientos = empleados × proporción, entre el mínimo y el máximo. */
export const ASIENTOS = {
  sales: { proporcion: 0.05, min: 2, max: 200 },
  service: { proporcion: 0.03, min: 2, max: 100 },
} as const;
/** Las industrias de Smarteam que venden por su sitio: les sirve Content Hub. */
export const INDUSTRIAS_CON_SITIO = ["Retail Especializado", "Turismo", "Alimentos y bebidas", "Automotriz", "Inmobiliaria", "Educación"] as const;
/** Cuántos contactos con consentimiento se toman de cada rango de `baseConsentimiento` (el borde de arriba del rango). */
export const CONTACTOS_DEL_RANGO: Record<string, number> = {
  menos_1k: 1000,
  "1k_10k": 10000,
  "10k_50k": 50000,
  "50k_200k": 200000,
  mas_200k: 500000,
};

export interface EntradaDelTam {
  empleados: number | null;
  estructura: string | null;
  filiales: number | null;
  industriaSmarteam: string | null;
  aQuienVende: string | null;
  perfilCierre: string | null;
  perfilDespues: string | null;
  baseConsentimiento: string | null;
  calificaInsider: string | null;
}

export interface LineaDelTam {
  concepto: string;
  /** El monto ANUAL en USD; null = no suma (la línea dice por qué). */
  montoAnual: number | null;
  detalle: string;
}

/**
 * Los datos de la empresa que lee el TAM v1: cambiar cualquiera lo recalcula (lib/clients/datos-de-la-empresa-server.ts).
 * Una sola lista, atada a `EntradaDelTam`: si la entrada suma un campo y la lista no, tsc no compila.
 */
export const DATOS_QUE_LEE_EL_TAM = [
  "empleados",
  "estructura",
  "filiales",
  "industriaSmarteam",
  "aQuienVende",
  "perfilCierre",
  "perfilDespues",
  "baseConsentimiento",
  "calificaInsider",
] as const satisfies readonly (keyof EntradaDelTam)[];
type FaltaEnLaLista = Exclude<keyof EntradaDelTam, (typeof DATOS_QUE_LEE_EL_TAM)[number]>;
/** Si esto deja de compilar, a `DATOS_QUE_LEE_EL_TAM` le falta un campo de `EntradaDelTam`. */
export const LA_LISTA_DEL_TAM_ESTA_COMPLETA: [FaltaEnLaLista] extends [never] ? true : never = true;

export interface CalculoDelTam {
  version: typeof VERSION_DEL_TAM;
  /** El TAM en USD al año, o null si falta lo mínimo (los empleados). */
  total: number | null;
  edicion: Edicion | null;
  hubs: HubDelTam[];
  lineas: LineaDelTam[];
  /** Una frase con lo que leyó: «Casa matriz de 310 empleados que vende a personas…». */
  porQue: string;
  /** Lo que faltó y se supuso, para que se pregunte. */
  supuestos: string[];
  preciosAl: string;
}

const redondear = (n: number) => Math.round(n);
const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** La edición que le toca por tamaño y estructura. */
export function edicionDelTam(e: Pick<EntradaDelTam, "empleados" | "estructura" | "filiales">): Edicion | null {
  if (e.empleados === null) return null;
  if (e.empleados >= UMBRALES_DE_EDICION.enterprise) return "enterprise";
  if (e.estructura === "casa_matriz" && (e.filiales ?? 0) >= FILIALES_PARA_ENTERPRISE) return "enterprise";
  if (e.empleados >= UMBRALES_DE_EDICION.professional) return "professional";
  return "starter";
}

/**
 * Los hubs que le sirven, por su modelo de negocio. Sin perfil, se suponen Marketing, Sales y Service (lo común de la
 * cartera) y se anota el supuesto.
 */
export function hubsDelTam(e: EntradaDelTam): { hubs: HubDelTam[]; supuestos: string[] } {
  const supuestos: string[] = [];
  const hubs: HubDelTam[] = ["marketing"];
  const soloPersonasSinVendedor = e.aQuienVende === "personas" && e.perfilCierre === "transaccional";
  if (e.perfilCierre === null && e.aQuienVende === null) supuestos.push("No se sabe cómo vende: se supone que tiene equipo de ventas.");
  if (!soloPersonasSinVendedor) hubs.push("sales");
  if (e.perfilDespues === null) supuestos.push("No se sabe qué pasa después de la venta: se supone que atiende a sus clientes.");
  if (e.perfilDespues !== "única") hubs.push("service");
  const vendePorElSitio = e.perfilCierre === "transaccional" || e.perfilCierre === "mixta";
  if (vendePorElSitio || (INDUSTRIAS_CON_SITIO as readonly string[]).includes(e.industriaSmarteam ?? "")) hubs.push("content");
  return { hubs, supuestos };
}

function asientos(hub: "sales" | "service", e: EntradaDelTam): number {
  const a = ASIENTOS[hub];
  if (hub === "sales" && e.perfilCierre === "transaccional") return a.min;
  return acotar(Math.round((e.empleados ?? 0) * a.proporcion), a.min, a.max);
}

function lineaDeMarketing(ed: Edicion, e: EntradaDelTam, supuestos: string[]): LineaDelTam {
  const p = PRECIOS_DE_LISTA.marketing[ed];
  const contactos = e.baseConsentimiento ? (CONTACTOS_DEL_RANGO[e.baseConsentimiento] ?? p.contactosIncluidos) : p.contactosIncluidos;
  if (!e.baseConsentimiento) supuestos.push("No se sabe el tamaño de su base: se toman los contactos que trae la edición.");
  const extra = ed === "starter" ? 0 : Math.max(0, Math.ceil((contactos - p.contactosIncluidos) / p.bloque)) * p.porBloque;
  const mensual = p.base + extra;
  return {
    concepto: `${NOMBRE.marketing} ${NOMBRE_DE_LA_EDICION[ed]}`,
    montoAnual: redondear(mensual * 12),
    detalle: `${p.asientosIncluidos} asiento${p.asientosIncluidos === 1 ? "" : "s"} · ${contactos.toLocaleString("es-CR")} contactos`,
  };
}

/** El TAM estimado v1 de una empresa. Sin empleados no hay TAM: es lo mínimo para saber qué edición le toca. */
export function calcularTamV1(e: EntradaDelTam): CalculoDelTam {
  const edicion = edicionDelTam(e);
  const base = { version: VERSION_DEL_TAM, preciosAl: PRECIOS_DE_LISTA.fecha } as const;
  if (edicion === null) {
    return { ...base, total: null, edicion: null, hubs: [], lineas: [], porQue: "Falta saber cuántos empleados tiene.", supuestos: [] };
  }
  const { hubs, supuestos } = hubsDelTam(e);
  const lineas: LineaDelTam[] = [];
  for (const hub of hubs) {
    if (hub === "marketing") lineas.push(lineaDeMarketing(edicion, e, supuestos));
    else if (hub === "content") {
      lineas.push({ concepto: `${NOMBRE.content} ${NOMBRE_DE_LA_EDICION[edicion]}`, montoAnual: redondear(PRECIOS_DE_LISTA.content[edicion] * 12), detalle: "su sitio" });
    } else {
      const n = asientos(hub, e);
      lineas.push({
        concepto: `${NOMBRE[hub]} ${NOMBRE_DE_LA_EDICION[edicion]}`,
        montoAnual: redondear(n * PRECIOS_DE_LISTA.porAsiento[hub][edicion] * 12),
        detalle: `${n} asientos`,
      });
    }
  }
  lineas.push(lineaDeInsider(e.calificaInsider));
  const total = lineas.reduce((s, l) => s + (l.montoAnual ?? 0), 0);
  return { ...base, total, edicion, hubs, lineas, porQue: porQue(e, edicion), supuestos };
}

function lineaDeInsider(califica: string | null): LineaDelTam {
  if (califica !== "lista") {
    const como = califica === "casi_lista" ? "«casi lista»" : califica === "todavia_no" ? "«todavía no»" : "sin evaluar";
    return { concepto: "Insider", montoAnual: null, detalle: `no suma: califica ${como}` };
  }
  if (PRECIO_INSIDER_ANUAL_USD === null) return { concepto: "Insider", montoAnual: null, detalle: "califica, pero falta su precio de lista" };
  return { concepto: "Insider", montoAnual: PRECIO_INSIDER_ANUAL_USD, detalle: PRECIO_INSIDER.porValidar ? "califica · precio por validar" : "califica" };
}

function porQue(e: EntradaDelTam, ed: Edicion): string {
  const quien =
    e.estructura === "casa_matriz"
      ? `Casa matriz${e.filiales ? ` con ${e.filiales} filial${e.filiales === 1 ? "" : "es"}` : ""}`
      : e.estructura === "filial"
        ? "Filial"
        : "Empresa";
  const vende = e.aQuienVende === "personas" ? " que vende a personas" : e.aQuienVende === "empresas" ? " que vende a empresas" : e.aQuienVende === "ambos" ? " que vende a empresas y a personas" : "";
  const cierre = e.perfilCierre === "transaccional" ? " y cierra sin vendedor" : e.perfilCierre === "con equipo" ? " con equipo de ventas" : e.perfilCierre === "mixta" ? " con venta mixta" : "";
  return `${quien} de ${(e.empleados ?? 0).toLocaleString("es-CR")} empleados${vende}${cierre}: le corresponde la edición ${NOMBRE_DE_LA_EDICION[ed]}.`;
}

/** La frase con que se guarda en la historia del dato (la cita de la propuesta). */
export function citaDelTam(c: CalculoDelTam): string {
  if (c.total === null) return c.porQue;
  return `TAM estimado ${c.version}: ${c.porQue} ${c.lineas.filter((l) => l.montoAnual !== null).map((l) => l.concepto).join(", ")}, a precio de lista del ${c.preciosAl}. Los servicios no suman.`;
}
