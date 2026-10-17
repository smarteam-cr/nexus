/**
 * lib/mi-dia/cifras.ts — la franja de cuatro números del inicio y «Tu siguiente movimiento» (ficha D, 2026-10-17;
 * diseño «Para ti · Ventas y CSE»). PURO y client-safe: lo arma la página con los datos que ya leyó.
 *
 * Cada número dice de qué es en una línea; lo que falta va en ámbar. Ningún número se inventa: sin el dato, «—».
 */
import { cierresMasCerca, diasHasta, esPausado, fechaCorta, montoCorto, pasoDeVentas, pasoVencido, type NegocioVisto } from "@/lib/ventas/negocios";
import type { VarianteDelInicio } from "./inicio";
import { horaCR } from "./inicio";
import { DIAS_PARA_LA_REUNION } from "./constantes";
import { MAX_LO_QUE_IMPORTA } from "@/lib/para-ti/importa";

export interface Cifra {
  clave: string;
  rotulo: string;
  valor: string;
  /** Al lado del número, más chico. */
  unidad?: string;
  sub?: string;
  /** La línea de abajo pide atención (ámbar). */
  subAviso?: boolean;
  /** 0–100: una barra (la meta). */
  barra?: number | null;
  /** Los colores de las cuentas (en lugar del número). */
  colores?: { riesgo: number; senales: number; bien: number };
}

export interface ReunionParaCifras {
  inicio: string;
  fin: string | null;
  empresas: string[];
  nombres: Record<string, string>;
}

export interface CuentaParaCifras {
  empresa: string;
  salud: string | null;
  servicio: { falta: string[]; calendarioLeido: boolean } | null;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const listar = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function cifraDeReuniones(reuniones: readonly ReunionParaCifras[] | null, ahora: Date): Cifra {
  if (!reuniones) return { clave: "reuniones", rotulo: "Reuniones hoy", valor: "—", sub: "Tu calendario no se pudo leer" };
  const conClientes = reuniones.filter((r) => r.empresas.length > 0);
  const proxima = conClientes.find((r) => Date.parse(r.inicio) > ahora.getTime());
  return {
    clave: "reuniones",
    rotulo: "Reuniones hoy",
    valor: String(reuniones.length),
    unidad: reuniones.length ? `${conClientes.length} con clientes` : undefined,
    sub: proxima
      ? `Próxima: ${proxima.empresas.length === 1 ? proxima.nombres[proxima.empresas[0]] : "un cliente"} a las ${horaCR(proxima.inicio)}`
      : reuniones.length
        ? "Ninguna más con clientes hoy"
        : "Sin reuniones hoy",
  };
}

export function cifraDeLoQueImporta(importa: number, tambien: number): Cifra {
  return {
    clave: "importa",
    rotulo: "Lo que importa hoy",
    valor: String(importa),
    unidad: `de ${MAX_LO_QUE_IMPORTA} · una por cuenta`,
    sub: tambien ? `+${tambien} más para hoy` : "Nada más para hoy",
  };
}

/** La acción de la semana y la reunión de los próximos 8 días, como dos números. */
export function cifrasDeServicio(cuentas: readonly CuentaParaCifras[]): Cifra[] {
  const con = cuentas.filter((c) => c.servicio);
  const sinAccion = con.filter((c) => c.servicio!.falta.includes("accion")).map((c) => c.empresa);
  const sinReunion = con.filter((c) => c.servicio!.falta.includes("reunion")).map((c) => c.empresa);
  const sinCalendario = con.some((c) => !c.servicio!.calendarioLeido);
  const n = con.length;
  return [
    {
      clave: "accion",
      rotulo: "Con acción esta semana",
      valor: String(n - sinAccion.length),
      unidad: `de ${plural(n, "cuenta", "cuentas")}`,
      sub: sinAccion.length ? (sinAccion.length <= 2 ? `Faltan ${listar(sinAccion)}` : `${sinAccion.length} sin acción`) : n ? "Todas tienen su acción" : "Sin cuentas activas",
      subAviso: sinAccion.length > 0,
    },
    {
      clave: "reunion",
      rotulo: `Con reunión en ${DIAS_PARA_LA_REUNION} días`,
      valor: String(n - sinReunion.length),
      unidad: `de ${plural(n, "cuenta", "cuentas")}`,
      sub: sinCalendario
        ? "Un calendario no se pudo leer"
        : sinReunion.length
          ? `${plural(sinReunion.length, "sin reunión agendada", "sin reunión agendada")}`
          : n
            ? "Todas tienen su reunión"
            : "Sin cuentas activas",
      subAviso: sinReunion.length > 0 || sinCalendario,
    },
  ];
}

export function cifraDeColores(cuentas: readonly CuentaParaCifras[], rotulo: string): Cifra {
  const colores = { riesgo: 0, senales: 0, bien: 0 };
  for (const c of cuentas) {
    if (c.salud === "riesgo") colores.riesgo++;
    else if (c.salud === "senales") colores.senales++;
    else if (c.salud === "bien") colores.bien++;
  }
  const conColor = cuentas.filter((c) => c.salud).length;
  return conColor ? { clave: "colores", rotulo, valor: "", colores } : { clave: "colores", rotulo, valor: "—", sub: "Sin la lectura de las cuentas" };
}

export interface MetaParaCifras {
  avance: number | null;
  monto: number;
  moneda: string;
  cumplimiento: number | null;
}

export function cifrasDeVentas(o: {
  meta: MetaParaCifras | null;
  anio: number;
  ponderado: { usd: number; activos: number; sinMonto: number };
}): Cifra[] {
  const pct = o.meta?.cumplimiento != null ? Math.round(o.meta.cumplimiento * 100) : null;
  return [
    o.meta
      ? {
          clave: "meta",
          rotulo: `Tu meta ${o.anio}`,
          valor: pct != null ? `${pct} %` : "—",
          unidad: `${o.meta.avance != null ? montoCorto(o.meta.avance, o.meta.moneda) : "—"} de ${montoCorto(o.meta.monto, o.meta.moneda).replace(/^US\$/, "")}`,
          barra: pct,
        }
      : { clave: "meta", rotulo: `Tu meta ${o.anio}`, valor: "—", sub: "No tienes una meta de ventas en HubSpot" },
    {
      clave: "ponderado",
      rotulo: `Ponderado ${o.anio}`,
      valor: montoCorto(o.ponderado.usd, "USD"),
      sub: `${plural(o.ponderado.activos, "activo", "activos")}${o.ponderado.sinMonto ? ` · ${o.ponderado.sinMonto} sin monto` : ""}`,
    },
  ];
}

/** La franja de cuatro números de cada inicio. */
export function cifrasDelInicio(
  variante: VarianteDelInicio,
  d: {
    reuniones: readonly ReunionParaCifras[] | null;
    veAgenda: boolean;
    ahora: Date;
    importa: number;
    tambien: number;
    semana: number;
    avisosNuevos: number;
    cuentas: readonly CuentaParaCifras[];
    ventas: { meta: MetaParaCifras | null; anio: number; ponderado: { usd: number; activos: number; sinMonto: number } } | null;
    tareas: { hoy: number; porDecidir: number; internas: number } | null;
  },
): Cifra[] {
  const reuniones = d.veAgenda ? [cifraDeReuniones(d.reuniones, d.ahora)] : [];
  const importa = cifraDeLoQueImporta(d.importa, d.tambien);
  if (variante === "ventas") return [...reuniones, importa, ...(d.ventas ? cifrasDeVentas(d.ventas) : [])].slice(0, 4);
  if (variante === "cse" || variante === "csl") {
    return [...reuniones, ...cifrasDeServicio(d.cuentas), cifraDeColores(d.cuentas, variante === "csl" ? "Cómo está la cartera" : "Cómo están tus cuentas")].slice(0, 4);
  }
  if (variante === "dev") {
    return [
      ...reuniones,
      { clave: "dev", rotulo: "Clientes con desarrollo", valor: String(d.cuentas.length), unidad: "proyectos activos", sub: "Los de Desarrollo e integración en HubSpot" },
      ...cifrasDeServicio(d.cuentas).slice(0, 1),
      importa,
    ].slice(0, 4);
  }
  if (variante === "marketing") {
    const t = d.tareas ?? { hoy: 0, porDecidir: 0, internas: 0 };
    return [
      importa,
      { clave: "hoy", rotulo: "Tus tareas de hoy", valor: String(t.hoy), sub: t.hoy ? "Vencen hoy o ya vencieron" : "Nada vence hoy" },
      { clave: "internas", rotulo: "Tareas internas abiertas", valor: String(t.internas), sub: "Smarteam, SmartAgro y demás" },
      { clave: "decidir", rotulo: "Por decidir", valor: String(t.porDecidir), sub: t.porDecidir ? "Te las propusieron: úsalas o descártalas" : "Nada por decidir", subAviso: t.porDecidir > 0 },
    ];
  }
  return [
    ...reuniones,
    importa,
    { clave: "semana", rotulo: "Esta semana", valor: String(d.semana), sub: d.semana ? "Para esta semana en Nexus" : "Nada para esta semana" },
    { clave: "avisos", rotulo: "Avisos nuevos", valor: String(d.avisosNuevos), sub: d.avisosNuevos ? "Están a la derecha" : "Estás al día" },
  ].slice(0, 4);
}

// ── Tu siguiente movimiento (Ventas) ────────────────────────────────────────────────────────

export interface MovimientoDeVentas {
  id: string;
  empresa: string;
  clientId: string | null;
  monto: string | null;
  linea: string;
  estado: { texto: string; tono: "aviso" | "ok" };
}

/** Los negocios que cierran antes (60 días), como mucho cuatro, con lo que les falta. */
export function siguienteMovimiento(negocios: readonly NegocioVisto[], hoyISO: string, ahora: Date, max = 4): { lista: MovimientoDeVentas[]; total: number } {
  const cerca = cierresMasCerca(negocios, hoyISO);
  const lista = cerca.slice(0, max).map((n) => {
    const paso = pasoDeVentas(n);
    const ultima = [n.ultimaActividad, n.ultimaReunion].filter(Boolean).sort().at(-1) ?? null;
    const sinActividad = ultima ? Math.floor((ahora.getTime() - Date.parse(ultima)) / 86_400_000) : null;
    let estado: MovimientoDeVentas["estado"];
    if (!paso) estado = { texto: "Sin siguiente paso", tono: "aviso" };
    else if (pasoVencido(n, hoyISO)) estado = { texto: `El siguiente paso venció: ${paso.que}`, tono: "aviso" };
    else if (sinActividad != null && sinActividad >= 14) estado = { texto: `Sin actividad hace ${sinActividad} días`, tono: "aviso" };
    else estado = { texto: `${paso.que}${paso.fecha ? ` · ${fechaCorta(paso.fecha)}` : ""}`, tono: "ok" };
    return {
      id: n.id,
      empresa: n.empresa,
      clientId: n.clientId,
      monto: n.monto != null ? montoCorto(n.monto, n.moneda) : null,
      linea: [n.nombre, n.etapa, n.fechaCierre ? (diasHasta(n.fechaCierre, hoyISO) === 0 ? "hoy" : fechaCorta(n.fechaCierre)) : null].filter(Boolean).join(" · "),
      estado,
    };
  });
  return { lista, total: negocios.filter((n) => !esPausado(n)).length };
}
