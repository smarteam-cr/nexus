/**
 * lib/finanzas/cobranza-contra-excel.ts
 *
 * «En la calle» de Nexus contra «Monto pendiente» del Excel de Alex, por moneda, con la diferencia
 * repartida en pocas causas. PURO: sin Prisma, sin reloj (la fecha entra), sin convertir moneda.
 *
 * ── DE DÓNDE SALE CADA LADO ─────────────────────────────────────────────────────
 * · El Excel: las filas de la pestaña «Compendio de Facturación General», que es de donde Alex saca su
 *   resumen «Rendimiento de Cobranza» (medido el 2026-09-14: US$121.325,27 y ₡39.920.993,51 al
 *   centavo). No su fila TOTAL, que está escrita a mano y no es la suma de las filas.
 * · Nexus: lo facturado y sin cobrar del año, cobro por cobro, tal como lo cuenta el reporte
 *   (`tipoIngresoDeCobro`). Sin IVA.
 *
 * ── CÓMO SE REPARTE LA DIFERENCIA ───────────────────────────────────────────────
 * Cada peso pendiente del Excel cae en UNA causa y cada cobro por cobrar de Nexus se resta en UNA
 * causa. Por eso las causas suman la diferencia exacta, en centavos: no hay un «resto» que esconda lo
 * que no se entendió. Qué factura es qué cobro lo decide primero la comparación que ya usa Cobranza ›
 * Importar (`compararLibro`), para que las dos pantallas no cuenten historias distintas de la misma
 * factura. Lo que esa comparación deja suelto se empareja acá, en dos pasos que NO escriben nada:
 *  1. por cuenta: una factura del Excel sin cobro atado y las cuotas sin atar de la MISMA cuenta son
 *     la misma deuda (Iberorutas FAC/2026/0328: US$8.023 con IVA contra dos cuotas de US$3.550). Sin
 *     esto, la misma plata salía dos veces, una como «falta cargar» y otra como «Nexus la cuenta y el
 *     Excel no»: US$24.167,70 y −US$26.782,67 que se anulaban entre sí.
 *  2. sin cuenta: la razón social del Excel que Nexus no liga a ninguna cuenta, contra una cuota del
 *     mismo monto emitida con pocos días de diferencia (INV-57 de «Soluciones Analíticos…» y la
 *     cuota de Teamnet). Es una pista, no una elección: la partida queda en «sin cuenta» y vale cero.
 *
 * ⚠ La conversión de moneda sigue viviendo solo en `equilibrio.ts`: acá cada moneda va aparte.
 */
import type { CobranzaDeMoneda } from "@/lib/cobranza/antiguedad";
import { centavos, IVA_COSTA_RICA } from "@/lib/cobranza/montos";
import { esFactura, type CobroAtado, type PropuestaDelLibro } from "@/lib/cobranza/libro-alex";
import { normalizarTexto, type FilaLibro } from "@/lib/cobranza/libro-alex-lectura";

/* ── Entradas ───────────────────────────────────────────────────────────────────── */

/** Un cobro que el reporte cuenta como facturado y sin cobrar. */
export interface PorCobrarDeNexus {
  cobroId: string;
  cuentaId: string;
  /** El nombre de la cuenta en Nexus. */
  cliente: string;
  moneda: string;
  monto: number;
  /** `YYYY-MM-DD` */
  fechaEmision: string;
  numeroFactura: string | null;
}

/** Lo que hace falta de cada documento comparado (`compararLibro`). */
export type DocumentoComparado = Pick<
  PropuestaDelLibro,
  "clave" | "numero" | "cliente" | "fechaFactura" | "total" | "neto" | "veredicto" | "accion" | "atadura"
> & {
  cuenta: { cuentaId: string; nombre: string } | null;
  cobros: ReadonlyArray<Pick<CobroAtado, "id" | "estado" | "fechaEmision" | "monto">>;
};

/* ── Salidas ────────────────────────────────────────────────────────────────────── */

/**
 * Las causas, en el orden en que se leen:
 *  - SIN_CUENTA   el Excel factura a una razón social que Nexus no liga a ninguna cuenta
 *  - SIN_FACTURA  deudas de QuickBooks y «No inscritos»: Nexus no las cuenta porque no tienen factura
 *  - FALTA_CARGAR la cuenta está, pero Nexus no tiene esa factura como facturada
 *  - IVA          la misma factura en los dos lados: el Excel con IVA, Nexus sin IVA
 *  - NO_CUADRA    los dos lados la tienen y dicen otra cosa (pagada en uno, otro monto, lo que el
 *                 resumen del Excel no suma)
 */
export type CausaDeDiferencia = "SIN_CUENTA" | "SIN_FACTURA" | "FALTA_CARGAR" | "IVA" | "NO_CUADRA";

export const ORDEN_DE_CAUSAS: readonly CausaDeDiferencia[] = ["SIN_CUENTA", "SIN_FACTURA", "FALTA_CARGAR", "IVA", "NO_CUADRA"];

/** Una factura (o un cobro) dentro de una causa. Positivo = el Excel cuenta más; negativo = Nexus cuenta más. */
export interface PartidaDeDiferencia {
  cliente: string;
  numero: string | null;
  monto: number;
  que: string;
}

export interface CausaConMonto {
  causa: CausaDeDiferencia;
  monto: number;
  /** Ordenadas por el tamaño de la plata, la más grande primero. */
  partidas: PartidaDeDiferencia[];
}

export interface EnLaCalleContraExcel {
  moneda: string;
  excel: number;
  nexus: number;
  /** excel − nexus. */
  diferencia: number;
  /** Solo las causas que tienen alguna partida. Suman `diferencia` al centavo. */
  causas: CausaConMonto[];
}

/* ── Piezas ─────────────────────────────────────────────────────────────────────── */

const deCentavos = (c: number) => c / 100;

/** Días entre dos fechas `YYYY-MM-DD`, sin signo. */
function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
}

/** Cuántos días de diferencia admite la pista «misma plata, misma fecha» de una factura sin cuenta. */
export const DIAS_DE_PISTA_SIN_CUENTA = 10;

/** Las filas del Compendio que vienen de QuickBooks o de «No inscritos»: contratos sin factura en el libro. */
export function esDeudaSinFactura(f: Pick<FilaLibro, "origen">): boolean {
  const origen = normalizarTexto(f.origen ?? "");
  return origen.includes("no inscritos") || origen.includes("qbs") || origen.includes("quickbooks");
}

/** La clave con que `agruparDocumentos` agrupa una fila: el número, o `hoja#fila` si no lo tiene. */
const claveDeFila = (f: FilaLibro) => (esFactura(f) && f.numero ? f.numero : `${f.hoja}#${f.fila}`);

/** Un dólar o el 5 %: el mismo criterio de «parecido» que `documentosDelLibroPorCobro`. */
const parecidos = (a: number, b: number) => Math.abs(a - b) <= Math.max(100, Math.round(Math.abs(b) * 0.05));

/**
 * ⚠ «La única cuota del mes» con otro monto no es la misma factura: Iberorutas 0328 (US$7.100) caía en
 * la cuota de US$150.
 */
function cobrosDeVerdad(d: DocumentoComparado): DocumentoComparado["cobros"] {
  if (d.atadura !== "MES_UNICO") return d.cobros;
  const [unica] = d.cobros;
  const objetivo = d.neto ?? d.total;
  if (d.cobros.length !== 1 || !unica || objetivo === null) return [];
  return parecidos(centavos(objetivo), centavos(unica.monto)) ? d.cobros : [];
}

/** La parte de un pendiente que es IVA, en proporción: la factura entera pendiente da justo total − neto. */
function ivaDelPendiente(pendiente: number, d: Pick<DocumentoComparado, "neto" | "total">): number {
  if (d.neto === null || d.total === null || d.total <= 0 || d.neto >= d.total) return 0;
  return Math.round(pendiente * (1 - d.neto / d.total));
}

/* ── La función ─────────────────────────────────────────────────────────────────── */

export function enLaCalleContraExcel(entrada: {
  /** Todas las filas del lote; acá se usan solo las del Compendio. */
  filas: readonly FilaLibro[];
  documentos: readonly DocumentoComparado[];
  porCobrar: readonly PorCobrarDeNexus[];
  hoyISO: string;
}): Record<string, EnLaCalleContraExcel> {
  type Partida = PartidaDeDiferencia & { causa: CausaDeDiferencia; moneda: string; centavos: number };
  const partidas: Partida[] = [];
  /** Una partida en cero no mueve la plata, pero sí dice qué hay que arreglar: solo se anota si se pide. */
  const anotar = (causa: CausaDeDiferencia, moneda: string, cents: number, cliente: string, numero: string | null, que: string, aunEnCero = false) => {
    if (cents !== 0 || aunEnCero) partidas.push({ causa, moneda, centavos: cents, monto: deCentavos(cents), cliente, numero, que });
  };

  const excelPorMoneda = new Map<string, number>();
  const nexusPorMoneda = new Map<string, number>();
  const porCobrar = new Map(entrada.porCobrar.map((c) => [c.cobroId, c]));
  for (const c of entrada.porCobrar) nexusPorMoneda.set(c.moneda, (nexusPorMoneda.get(c.moneda) ?? 0) + centavos(c.monto));
  const usados = new Set<string>();
  /** Lo que Nexus cuenta por cobrar de estos cobros, por moneda. Los marca: un cobro se resta una sola vez. */
  const tomar = (ids: Iterable<string>) => {
    const out = new Map<string, number>();
    for (const id of ids) {
      const n = porCobrar.get(id);
      if (!n || usados.has(id)) continue;
      usados.add(id);
      out.set(n.moneda, (out.get(n.moneda) ?? 0) + centavos(n.monto));
    }
    return out;
  };
  const sinUsar = () => entrada.porCobrar.filter((c) => !usados.has(c.cobroId));

  // ── 1. Lo pendiente del Excel, agrupado por documento y moneda ────────────────
  const documentos = new Map(entrada.documentos.map((d) => [d.clave, d]));
  const pendientes = new Map<string, { clave: string; moneda: string; centavos: number; fila: FilaLibro }>();
  for (const f of entrada.filas) {
    if (f.seccion !== "COMPENDIO") continue;
    const moneda = f.moneda ?? "USD";
    const cents = centavos(f.pendiente ?? 0);
    excelPorMoneda.set(moneda, (excelPorMoneda.get(moneda) ?? 0) + cents);
    if (esDeudaSinFactura(f)) {
      anotar("SIN_FACTURA", moneda, cents, f.cliente, null, "contrato de QuickBooks o «No inscritos» sin factura en Nexus");
      continue;
    }
    const clave = claveDeFila(f);
    const previo = pendientes.get(`${clave}|${moneda}`);
    if (previo) previo.centavos += cents;
    else pendientes.set(`${clave}|${moneda}`, { clave, moneda, centavos: cents, fila: f });
  }

  // ── 2. Cada documento del resumen contra sus cobros de Nexus ──────────────────
  type Suelto = { d: DocumentoComparado; moneda: string; P: number };
  const sueltos: Suelto[] = [];
  const anuladas: Suelto[] = [];
  for (const { clave, moneda, centavos: P, fila } of pendientes.values()) {
    const d = documentos.get(clave);
    if (!d) {
      anotar("NO_CUADRA", moneda, P, fila.cliente, fila.numero, "el Excel la suma y no se pudo cruzar con Nexus");
      continue;
    }
    const cliente = d.cuenta?.nombre ?? d.cliente;
    if (d.veredicto === "NO_ES_CARTERA") {
      const anulada = d.accion === "NINGUNA";
      anotar("NO_CUADRA", moneda, P, cliente, d.numero, anulada ? "anulada en Odoo y el Excel la sigue sumando" : "el Excel la suma y no es venta a un cliente");
      for (const [m, cents] of tomar(d.cobros.map((c) => c.id))) {
        anotar("NO_CUADRA", m, -cents, cliente, d.numero, "anulada en Odoo y Nexus la sigue contando por cobrar");
      }
      if (anulada && d.cuenta) anuladas.push({ d, moneda, P });
      continue;
    }
    if (!d.cuenta) {
      if (P > 0) sueltos.push({ d, moneda, P });
      continue;
    }

    const cobros = cobrosDeVerdad(d);
    const n = tomar(cobros.map((c) => c.id));
    const nMismaMoneda = n.get(moneda) ?? 0;
    for (const [m, cents] of n) {
      if (m !== moneda) anotar("NO_CUADRA", m, -cents, cliente, d.numero, `Nexus la cobra en ${m} y el Excel en ${moneda}`);
    }

    if (P > 0 && nMismaMoneda > 0) {
      const iva = ivaDelPendiente(P, d);
      anotar("IVA", moneda, iva, cliente, d.numero, "el Excel con IVA, Nexus sin IVA");
      anotar("NO_CUADRA", moneda, P - iva - nMismaMoneda, cliente, d.numero, "el monto no es el mismo en los dos lados");
    } else if (P > 0) {
      if (cobros.some((c) => c.estado === "COBRADO")) {
        anotar("NO_CUADRA", moneda, P, cliente, d.numero, "cobrada en Nexus y sin pagar en el Excel");
      } else if (d.fechaFactura && d.fechaFactura > entrada.hoyISO) {
        anotar("FALTA_CARGAR", moneda, P, cliente, d.numero, "tiene fecha futura: cuenta cuando se emita");
      } else if (cobros.some((c) => !c.fechaEmision)) {
        anotar("FALTA_CARGAR", moneda, P, cliente, d.numero, "en Nexus la cuota no está marcada facturada");
      } else if (cobros.some((c) => porCobrar.has(c.id))) {
        anotar("NO_CUADRA", moneda, P, cliente, d.numero, "la cuota de Nexus ya está contada con otra factura del Excel");
      } else if (cobros.length > 0) {
        anotar("NO_CUADRA", moneda, P, cliente, d.numero, "Nexus la tiene facturada en otro año");
      } else {
        sueltos.push({ d, moneda, P });
      }
    } else if (nMismaMoneda > 0) {
      anotar("NO_CUADRA", moneda, -nMismaMoneda, cliente, d.numero, "pagada según el Excel y por cobrar en Nexus");
    }
  }

  // ── 3. Lo que Nexus ata a una factura que el resumen del Excel no suma ────────
  const enElResumen = new Set([...pendientes.values()].map((p) => p.clave));
  for (const d of entrada.documentos) {
    if (enElResumen.has(d.clave) || !d.cuenta) continue;
    for (const [m, cents] of tomar(cobrosDeVerdad(d).map((c) => c.id))) {
      anotar("NO_CUADRA", m, -cents, d.cuenta.nombre, d.numero, "está en otra pestaña del Excel, pero su resumen no la suma");
    }
  }

  // ── 4. Una factura anulada que Nexus cuenta en una cuota sin número ───────────
  for (const { d, moneda, P } of anuladas) {
    const cuota = sinUsar().find(
      (c) => c.cuentaId === d.cuenta!.cuentaId && c.moneda === moneda && (parecidos(centavos(c.monto), P) || parecidos(centavos(c.monto * IVA_COSTA_RICA), P)),
    );
    if (!cuota) continue;
    for (const [m, cents] of tomar([cuota.cobroId])) {
      anotar("NO_CUADRA", m, -cents, d.cuenta!.nombre, d.numero, "anulada en Odoo y Nexus la sigue contando por cobrar");
    }
  }

  // ── 5. Sueltos de una cuenta contra las cuotas sin atar de esa misma cuenta ───
  const grupos = new Map<string, Suelto[]>();
  for (const s of sueltos) {
    if (!s.d.cuenta) continue;
    const k = `${s.d.cuenta.cuentaId}|${s.moneda}`;
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  const emparejados = new Set<Suelto>();
  for (const [k, docs] of grupos) {
    const [cuentaId, moneda] = k.split("|") as [string, string];
    const cuotas = sinUsar().filter((c) => c.cuentaId === cuentaId && c.moneda === moneda);
    if (cuotas.length === 0) continue;
    const n = tomar(cuotas.map((c) => c.cobroId)).get(moneda) ?? 0;
    const nombre = docs[0]!.d.cuenta!.nombre;
    let resto = -n;
    for (const s of docs) {
      emparejados.add(s);
      const iva = ivaDelPendiente(s.P, s.d);
      anotar("IVA", moneda, iva, nombre, s.d.numero, "el Excel con IVA, Nexus sin IVA (en cuotas sin número)");
      resto += s.P - iva;
    }
    const numeros = docs.map((s) => s.d.numero).filter(Boolean).join(", ") || null;
    anotar(
      "NO_CUADRA",
      moneda,
      resto,
      nombre,
      numeros,
      `el Excel no suma lo mismo que ${cuotas.length === 1 ? "la cuota" : `las ${cuotas.length} cuotas`} sin número de Nexus`,
    );
  }

  // ── 6. La pista de la misma plata con pocos días de diferencia, en otra cuenta ─
  // Sin cuenta: la razón social del Excel no es la de Nexus (INV-57 y Teamnet). Con cuenta: la factura
  // quedó en una cuenta y la cuota en otra de nombre parecido (Librería Internacional, 2026-09-14).
  for (const s of sueltos) {
    if (emparejados.has(s) || !s.d.fechaFactura) continue;
    const cuota = sinUsar().find(
      (c) =>
        c.moneda === s.moneda &&
        (centavos(c.monto) === s.P || centavos(c.monto * IVA_COSTA_RICA) === s.P) &&
        diasEntre(c.fechaEmision, s.d.fechaFactura!) <= DIAS_DE_PISTA_SIN_CUENTA,
    );
    if (!cuota) continue;
    emparejados.add(s);
    const n = tomar([cuota.cobroId]).get(s.moneda) ?? 0;
    if (s.d.cuenta) {
      const iva = ivaDelPendiente(s.P, s.d);
      anotar("IVA", s.moneda, iva, s.d.cuenta.nombre, s.d.numero, "el Excel con IVA, Nexus sin IVA");
      anotar("NO_CUADRA", s.moneda, s.P - iva - n, s.d.cuenta.nombre, s.d.numero, `la factura está en «${s.d.cuenta.nombre}» y la cuota en «${cuota.cliente}»`, true);
      continue;
    }
    anotar("IVA", s.moneda, s.P - n, cuota.cliente, s.d.numero, "el Excel con IVA, Nexus sin IVA");
    anotar("SIN_CUENTA", s.moneda, 0, s.d.cliente, s.d.numero, `puede ser la cuota de ${cuota.cliente} (misma plata, misma fecha): elegí la cuenta`, true);
  }

  // ── 7. Lo que quedó sin pareja ────────────────────────────────────────────────
  for (const s of sueltos) {
    if (emparejados.has(s)) continue;
    if (s.d.cuenta) anotar("FALTA_CARGAR", s.moneda, s.P, s.d.cuenta.nombre, s.d.numero, "la cuenta no tiene esa factura en Nexus");
    else anotar("SIN_CUENTA", s.moneda, s.P, s.d.cliente, s.d.numero, "ninguna cuenta de Nexus tiene esa razón social");
  }
  for (const c of sinUsar()) {
    anotar("NO_CUADRA", c.moneda, -centavos(c.monto), c.cliente, c.numeroFactura, "por cobrar en Nexus y el Excel no la tiene");
  }

  // ── 8. Por moneda ─────────────────────────────────────────────────────────────
  const monedas = [...new Set([...excelPorMoneda.keys(), ...nexusPorMoneda.keys()])].sort();
  const out: Record<string, EnLaCalleContraExcel> = {};
  for (const moneda of monedas) {
    const excel = excelPorMoneda.get(moneda) ?? 0;
    const nexus = nexusPorMoneda.get(moneda) ?? 0;
    const causas: CausaConMonto[] = [];
    for (const causa of ORDEN_DE_CAUSAS) {
      const deLaCausa = partidas.filter((p) => p.moneda === moneda && p.causa === causa);
      if (deLaCausa.length === 0) continue;
      causas.push({
        causa,
        monto: deCentavos(deLaCausa.reduce((s, p) => s + p.centavos, 0)),
        partidas: deLaCausa
          .sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos))
          .map(({ cliente, numero, monto, que }) => ({ cliente, numero, monto, que })),
      });
    }
    out[moneda] = { moneda, excel: deCentavos(excel), nexus: deCentavos(nexus), diferencia: deCentavos(excel - nexus), causas };
  }
  return out;
}

/* ── Lo que muestra la pantalla ─────────────────────────────────────────────────── */

/** Qué se pudo comparar contra el último Excel de Alex. La métrica de Nexus se muestra en todos los casos. */
export type ComparacionConExcel =
  | {
      estado: "OK";
      /** Día de Costa Rica en que se subió (`YYYY-MM-DD`). */
      subidoEl: string;
      archivo: string;
      /** Filas del lote que no se pudieron leer: si hay, los totales del Excel pueden quedar cortos. */
      filasIlegibles: number;
      porMoneda: Record<string, EnLaCalleContraExcel>;
    }
  /** Nunca se subió el Excel. */
  | { estado: "SIN_EXCEL" }
  /**
   * El último Excel no trae la pestaña del resumen. ⚠ Comparar igual daría toda la cartera de Nexus como
   * «el Excel no la tiene»: se dice que falta, no se inventa la diferencia.
   */
  | { estado: "SIN_RESUMEN"; subidoEl: string; archivo: string }
  | { estado: "ERROR"; mensaje: string };

/** La cobranza del año en UNA moneda, en esa moneda, con lo que dice el Excel al lado. */
export interface RendimientoDeMoneda {
  moneda: string;
  facturado: number;
  cobrado: number;
  /** Facturado y sin cobrar: «Monto pendiente (en la calle)» en el Excel de Alex. */
  enLaCalle: number;
  vencido: number;
  enPlazo: number;
  /** cobrado ÷ facturado. null = no hay nada facturado. */
  pctCobrado: number | null;
  /** en la calle ÷ facturado, como complemento de `pctCobrado`: los dos suman 100 % sin un redondeo de más. */
  pctEnLaCalle: number | null;
  /**
   * cobrado ÷ (cobrado + vencido): la misma pregunta sin lo que todavía está en plazo. Es el equivalente
   * del «sin las cuentas que no se han vencido» del Excel, y va siempre al lado de `pctCobrado`: suelto,
   * cualquiera de los dos se cita mal (`lecturaDeCobranza`).
   */
  pctSinLoEnPlazo: number | null;
  /** Facturado en años anteriores y todavía sin cobrar. No suma a lo de arriba. null = nada. */
  deAniosAnteriores: { porCobrar: number; vencido: number; facturas: number } | null;
  /** null = no hay comparación (sin Excel, o el Excel no tiene nada en esta moneda). */
  excel: EnLaCalleContraExcel | null;
}

/** Dólares primero: es la moneda del reporte y la del resumen de Alex. */
const ORDEN_DE_MONEDAS = ["USD", "CRC"];

export function rendimientoPorMoneda(entrada: {
  cobranza: Readonly<Record<string, CobranzaDeMoneda>>;
  deAniosAnteriores: Readonly<Record<string, { porCobrar: number; vencido: number; facturas: number }>>;
  excel: ComparacionConExcel;
}): RendimientoDeMoneda[] {
  const porMonedaExcel = entrada.excel.estado === "OK" ? entrada.excel.porMoneda : {};
  const monedas = [
    ...new Set([
      ...Object.keys(entrada.cobranza),
      ...Object.entries(entrada.deAniosAnteriores)
        .filter(([, a]) => a.porCobrar > 0)
        .map(([m]) => m),
      ...Object.keys(porMonedaExcel),
    ]),
  ].sort((a, b) => {
    const ia = ORDEN_DE_MONEDAS.indexOf(a);
    const ib = ORDEN_DE_MONEDAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  return monedas.map((moneda) => {
    const c = entrada.cobranza[moneda];
    const deAntes = entrada.deAniosAnteriores[moneda];
    const facturado = c?.facturado ?? 0;
    const pctCobrado = c?.sobreFacturado ?? null;
    return {
      moneda,
      facturado,
      cobrado: c?.cobrado ?? 0,
      enLaCalle: c?.porCobrar ?? 0,
      vencido: c?.vencido ?? 0,
      enPlazo: c?.enPlazo ?? 0,
      pctCobrado,
      pctEnLaCalle: pctCobrado === null ? null : Math.round((1 - pctCobrado) * 1000) / 1000,
      pctSinLoEnPlazo: c?.sobreExigible ?? null,
      deAniosAnteriores: deAntes && deAntes.porCobrar > 0 ? deAntes : null,
      excel: porMonedaExcel[moneda] ?? null,
    };
  });
}
