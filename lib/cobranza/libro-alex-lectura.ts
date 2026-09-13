/**
 * lib/cobranza/libro-alex-lectura.ts
 *
 * Lee el libro de cobranza de Alex («Asientos Contables Mercury Bank & Odoo Oficial.xlsx») ya pasado a
 * celdas, y lo devuelve como filas con nombre. PURO: sin exceljs, sin Prisma, sin reloj. El paso de
 * .xlsx a celdas vive en libro-alex-xlsx.ts; la comparación contra Nexus, en libro-alex.ts.
 *
 * ⚠ No es la hoja «Facturaciones 2026» de facturaciones-sheet.ts (tripletas de quincena por mes). Este
 * es el libro de ASIENTOS: una fila por factura, en pestañas por plataforma. Se reusa de allá solo la
 * forma de la celda y cómo se lee un monto escrito con calculadora (`=950*4`).
 *
 * ── LO QUE HAY QUE SABER DEL LIBRO ──────────────────────────────────────────────
 * 1. Las pestañas no tienen un encabezado fijo: hay SECCIONES dentro de cada una. Odoo repite el
 *    encabezado por mes; Mercury también, con el mes en el título; la de QuickBooks tiene dos
 *    («Quickbooks» y «No Inscritos») y un tercer bloque, «Planes de Pago», sin encabezado propio.
 *    Por eso cada encabezado se reconoce por su TEXTO y fija las columnas hasta el siguiente.
 * 2. ⛔ «Importe pendiente firmado» de las pestañas de Odoo está en COLONES aunque la factura sea en
 *    dólares (FAC/2026/0206: 2.109,71 USD de total y 1.050.044,86 de «pendiente»). No se lee: manda
 *    «Total en moneda firmado».
 * 3. ⚠ El VERDE del libro es «en gracia», no «pagado» (en la hoja de Facturaciones era al revés). El
 *    estado lo dice la columna, cuando la hay; el color se guarda solo para mostrar.
 * 4. Una fila puede ocupar dos renglones con celdas fusionadas (Bluesat: «Welcome Kit» y «SignNow»
 *    comparten la cuota de 950). exceljs repite el valor en el renglón de abajo: sin marcarlo, la
 *    misma deuda entraba dos veces.
 */
import { montoDeCelda, type CeldaCruda } from "./facturaciones-sheet";
import { normalizarNumeroFactura } from "./numero-factura";

/** `ImportacionCobranza.fuente` de un lote que es el libro de Alex y no un CSV de cuentas. */
export const FUENTE_LIBRO_ALEX = "libro-alex";

export type SeccionLibro = "ODOO" | "MERCURY" | "QUICKBOOKS" | "NO_INSCRITOS" | "PLAN_DE_PAGO" | "COMPENDIO";
export type ColorLibro = "VENCIDA" | "EN_GRACIA" | "SIN_COLOR" | "OTRO";
export type EstadoLibro = "PAGADO" | "SIN_PAGAR" | "ACTIVA";

export const COLOR_LIBRO_VENCIDA = "FFFFFF00";
export const COLOR_LIBRO_EN_GRACIA = "FF00FF00";

/** La celda de exceljs, con la marca de que es la parte de abajo (o derecha) de una fusión. */
export type CeldaLibro = CeldaCruda & { fusionada?: boolean };
export type FilaCrudaLibro = { fila: number; celdas: CeldaLibro[] };
export type HojaCruda = { nombre: string; filas: FilaCrudaLibro[] };

/**
 * Una fila del libro. `type` y no `interface` a propósito: se guarda tal cual como JSON en
 * `ImportacionFila.raw`, y Prisma exige la firma de índice que una interface no tiene.
 */
export type FilaLibro = {
  hoja: string;
  /** 1-based, como la ve Alex en Excel. */
  fila: number;
  seccion: SeccionLibro;
  /** Normalizado (`normalizarNumeroFactura`). null en QuickBooks, No inscritos y planes de pago. */
  numero: string | null;
  /** Como sale en la factura: la razón social, con su cédula pegada si la trae. */
  cliente: string;
  /** El servicio, en las secciones sin factura. «Welcome Kit + SignNow» si ocupaba dos renglones. */
  proyecto: string | null;
  /** `YYYY-MM-DD` */
  fechaFactura: string | null;
  fechaVencimiento: string | null;
  fechaPago: string | null;
  /** «Total en moneda firmado», «Monto» o «Monto total»: en la moneda de la fila, con IVA si lo lleva. */
  total: number | null;
  /**
   * Lo que el libro deja pendiente, SOLO donde está en la moneda de la fila (QuickBooks, No inscritos,
   * planes de pago y el Compendio). En las pestañas de Odoo es null: ahí viene en colones.
   */
  pendiente: number | null;
  moneda: string | null;
  estado: EstadoLibro | null;
  /** `YYYY-MM`: el «Mes» de Alex si la pestaña lo trae; si no, el de la fecha de la factura. */
  periodo: string | null;
  color: ColorLibro;
  anotacion: string | null;
  /** Solo el Compendio: «Odoo - Principal», «Mercury Bank - No Inscritos», «Odoo - QBs». */
  origen: string | null;
};

export type HojaLeida = { nombre: string; filas: number; secciones: SeccionLibro[] };
export type LibroLeido = { filas: FilaLibro[]; hojas: HojaLeida[] };

/* ── Celdas ─────────────────────────────────────────────────────────────────────── */

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoDeValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim().toLowerCase() === "nan" ? "" : v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    /* Texto enriquecido, hipervínculo o fórmula: exceljs los entrega como objeto. */
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText
        .map((r: unknown) => (r && typeof r === "object" && "text" in r && typeof r.text === "string" ? r.text : ""))
        .join("")
        .trim();
    }
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return textoDeValor(v.result);
  }
  return "";
}

const textoDeCelda = (c: CeldaLibro | undefined) => textoDeValor(c?.valor);

function numeroDeCelda(c: CeldaLibro | undefined): number | null {
  const v = c?.valor;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  /* `=950*4` es un monto escrito con calculadora; `=SUM(C2:C11)` es un total y no se lee. */
  return montoDeCelda(v);
}

function fechaDeCelda(c: CeldaLibro | undefined): string | null {
  const v = c?.valor;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const t = textoDeValor(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function mesDeTexto(s: string): number | null {
  const t = normalizarTexto(s);
  if (t === "setiembre") return 8;
  const i = MESES.indexOf(t);
  return i >= 0 ? i : null;
}

export function colorDeFila(fillArgb: string | null | undefined): ColorLibro {
  if (!fillArgb) return "SIN_COLOR";
  const c = fillArgb.toUpperCase();
  if (c === COLOR_LIBRO_VENCIDA) return "VENCIDA";
  if (c === COLOR_LIBRO_EN_GRACIA) return "EN_GRACIA";
  if (c === "FFFFFFFF" || c === "FFFFFF") return "SIN_COLOR";
  return "OTRO";
}

function estadoDeTexto(s: string): EstadoLibro | null {
  const t = normalizarTexto(s);
  if (t === "pagado" || t === "pagada") return "PAGADO";
  if (t === "sin pagar") return "SIN_PAGAR";
  if (t === "active" || t === "activa") return "ACTIVA";
  return null;
}

/* ── Encabezados ────────────────────────────────────────────────────────────────── */

type Campo =
  | "cliente"
  | "numero"
  | "fechaFactura"
  | "fechaVencimiento"
  | "fechaPago"
  | "total"
  | "pendiente"
  | "pendienteEnColones"
  | "moneda"
  | "estado"
  | "mes"
  | "anotacion"
  | "proyecto"
  | "origen"
  | "pagado";

type MapaDeColumnas = Partial<Record<Campo, number>>;
type Encabezado = { seccion: SeccionLibro; mapa: MapaDeColumnas };

function campoDeEncabezado(texto: string): Campo | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  if (t.startsWith("nombre del") || t === "no inscritos" || t === "quickbooks" || t === "cliente") return "cliente";
  if (t === "numero" || t === "numero de factura" || t === "factura") return "numero";
  if (t === "fecha de la factura" || t === "fecha de factura") return "fechaFactura";
  if (t === "fecha de vencimiento") return "fechaVencimiento";
  if (t === "fecha de la factura pagada") return "fechaPago";
  if (t === "total en moneda firmado" || t === "monto" || t === "monto total" || t === "monto total del servicio" || t === "facturado") {
    return "total";
  }
  if (t === "importe pendiente firmado") return "pendienteEnColones";
  if (t === "monto pendiente de pago" || t === "monto adeudado" || t === "pendiente") return "pendiente";
  if (t === "moneda") return "moneda";
  if (t === "estado del pago" || t === "estado") return "estado";
  if (t === "mes") return "mes";
  if (t.startsWith("anotacion")) return "anotacion";
  if (t === "proyecto") return "proyecto";
  if (t === "origen") return "origen";
  if (t === "pagado") return "pagado";
  return null;
}

/** El renglón es un encabezado si nombra al menos tres columnas conocidas y su primera celda dice cuál. */
function leerEncabezado(celdas: readonly CeldaLibro[]): Encabezado | null {
  const mapa: MapaDeColumnas = {};
  celdas.forEach((c, i) => {
    const campo = campoDeEncabezado(textoDeCelda(c));
    if (campo && mapa[campo] === undefined) mapa[campo] = i;
  });
  if (Object.keys(mapa).length < 3) return null;
  const primero = normalizarTexto(textoDeCelda(celdas[0]));
  if (primero === "numero" && mapa.total !== undefined) return { seccion: "ODOO", mapa };
  if (primero.startsWith("nombre del cliente a mostrar")) return { seccion: "MERCURY", mapa };
  if (primero === "no inscritos") return { seccion: "NO_INSCRITOS", mapa };
  if (primero === "quickbooks") return { seccion: "QUICKBOOKS", mapa };
  if (primero === "factura" && mapa.origen !== undefined) return { seccion: "COMPENDIO", mapa };
  return null;
}

/** Secciones sin columna de moneda. El Compendio las lista en USD, y así se leen. */
const SECCIONES_EN_DOLARES: ReadonlySet<SeccionLibro> = new Set(["QUICKBOOKS", "NO_INSCRITOS", "PLAN_DE_PAGO"]);

/* ── Lectura ────────────────────────────────────────────────────────────────────── */

export function leerHoja(hoja: HojaCruda): FilaLibro[] {
  const out: FilaLibro[] = [];
  let actual: Encabezado | null = null;

  for (const renglon of hoja.filas) {
    const encabezado = leerEncabezado(renglon.celdas);
    if (encabezado) {
      actual = encabezado;
      continue;
    }
    const primero = normalizarTexto(textoDeCelda(renglon.celdas[0]));
    if (primero === "planes de pago" && actual) {
      /* Sin encabezado propio: hereda las columnas del bloque de arriba. */
      actual = { seccion: "PLAN_DE_PAGO", mapa: actual.mapa };
      continue;
    }
    if (!actual) continue;

    const { seccion, mapa } = actual;
    const celda = (campo: Campo): CeldaLibro | undefined => {
      const i = mapa[campo];
      return i === undefined ? undefined : renglon.celdas[i];
    };

    const cliente = textoDeCelda(celda("cliente"));
    if (cliente.replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
    /* Las filas de totales del propio libro («Total a Recaudar», «TOTAL USD | Sumatoria Dólares»). */
    if (/^(total|sumatoria)\b/.test(primero) || /^(total|sumatoria)\b/.test(normalizarTexto(cliente))) continue;

    const proyecto = textoDeCelda(celda("proyecto")) || null;
    const celdaTotal = celda("total");
    const continuacion = celdaTotal?.fusionada === true;
    if (continuacion) {
      const previa = out[out.length - 1];
      if (previa && previa.seccion === seccion && normalizarTexto(previa.cliente) === normalizarTexto(cliente)) {
        if (proyecto) previa.proyecto = previa.proyecto ? `${previa.proyecto} + ${proyecto}` : proyecto;
        continue;
      }
    }

    const fechaFactura = fechaDeCelda(celda("fechaFactura"));
    const mes = mesDeTexto(textoDeCelda(celda("mes")));
    let periodo: string | null = null;
    /* Mercury no tiene columna de mes, y la pestaña «Operación Recaudo» copió «Enero» en el título de
       todas sus filas: manda la fecha de la factura. */
    if (seccion !== "MERCURY" && mes !== null && fechaFactura) {
      periodo = `${fechaFactura.slice(0, 4)}-${String(mes + 1).padStart(2, "0")}`;
    } else if (fechaFactura) {
      periodo = fechaFactura.slice(0, 7);
    }

    const moneda = textoDeCelda(celda("moneda")).toUpperCase() || (SECCIONES_EN_DOLARES.has(seccion) ? "USD" : null);

    out.push({
      hoja: hoja.nombre,
      fila: renglon.fila,
      seccion,
      numero: normalizarNumeroFactura(textoDeCelda(celda("numero"))),
      cliente,
      proyecto,
      fechaFactura,
      fechaVencimiento: fechaDeCelda(celda("fechaVencimiento")),
      fechaPago: fechaDeCelda(celda("fechaPago")),
      total: continuacion ? null : numeroDeCelda(celdaTotal),
      pendiente: seccion === "ODOO" || continuacion ? null : numeroDeCelda(celda("pendiente")),
      moneda,
      estado: estadoDeTexto(textoDeCelda(celda("estado"))),
      periodo,
      color: colorDeFila(renglon.celdas[0]?.fillArgb),
      anotacion: textoDeCelda(celda("anotacion")) || null,
      origen: textoDeCelda(celda("origen")) || null,
    });
  }
  return out;
}

/**
 * Todas las pestañas. Una pestaña sin ningún encabezado conocido («Generalidades») queda en `hojas`
 * con cero filas: se ve que se leyó y que no aportó nada.
 */
export function leerLibro(hojas: readonly HojaCruda[]): LibroLeido {
  const filas: FilaLibro[] = [];
  const resumen: HojaLeida[] = [];
  for (const hoja of hojas) {
    const deLaHoja = leerHoja(hoja);
    filas.push(...deLaHoja);
    resumen.push({
      nombre: hoja.nombre,
      filas: deLaHoja.length,
      secciones: [...new Set(deLaHoja.map((f) => f.seccion))],
    });
  }
  return { filas, hojas: resumen };
}
