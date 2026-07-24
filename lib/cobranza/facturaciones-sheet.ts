/**
 * lib/cobranza/facturaciones-sheet.ts
 *
 * Decodificador PURO de la hoja de facturación de Smarteam ("Facturaciones 2026"):
 * cero exceljs/Prisma/red — recibe celdas ya leídas y devuelve servicios + cobros.
 * El lector real (exceljs) vive en scripts/import-facturaciones-xlsx.ts.
 *
 * Por qué existe (y por qué NO se usa el wizard CSV de import-core.ts):
 *  1. El ESTADO del cobro está codificado en el COLOR de la celda (verde = pagado,
 *     amarillo = facturado sin pagar, blanco = pendiente de facturar). Un CSV pierde
 *     el color; solo exceljs expone el relleno.
 *  2. La carga es HISTÓRICA (enero-2026 en adelante) y `clampInicioCicloCorriente`
 *     impide por diseño materializar cobros hacia atrás.
 *
 * Forma de la hoja: columna 1 = nombre de la fila; el resto son tripletas
 * `[día 15, día 30, IVA]` por mes. Los encabezados de las quincenas son FECHAS reales
 * (con año basura de plantilla: 2022/2025) → las columnas se DERIVAN del encabezado,
 * no de posiciones fijas, y el año se fuerza a `anio`. Las columnas de IVA son
 * fórmulas (13% calculado, no un cargo aparte) y no generan cobros.
 */
import { nombreEnSkipList } from "./import-core";

// ── Tipos de entrada (lo que produce el lector exceljs) ─────────────────────────

/** Una celda ya leída: valor crudo + color de relleno en ARGB (null si no tiene). */
export type CeldaCruda = { valor: unknown; fillArgb: string | null };

/** Una fila de la hoja. `celdas[0]` = columna 1 de Excel (el nombre). */
export type FilaCruda = { fila: number; celdas: CeldaCruda[] };

// ── Colores → estado ────────────────────────────────────────────────────────────

export const COLOR_PAGADO = "FF42E4B3"; // verde
export const COLOR_FACTURADO = "FFFFFF00"; // amarillo
/** Blanco explícito: en esta hoja significa "sin color", no un tercer estado. */
const BLANCOS = new Set(["FFFFFFFF", "FFFFFF"]);

export type ColorCelda = "PAGADO" | "FACTURADO" | "PENDIENTE";

export function colorDeCelda(fillArgb: string | null | undefined): ColorCelda {
  if (!fillArgb) return "PENDIENTE";
  const c = fillArgb.toUpperCase();
  if (BLANCOS.has(c)) return "PENDIENTE";
  if (c === COLOR_PAGADO) return "PAGADO";
  if (c === COLOR_FACTURADO) return "FACTURADO";
  return "PENDIENTE"; // color desconocido → lo más conservador (nada facturado ni cobrado)
}

/**
 * Estado del cobro según el color. Espeja `CobranzaEstadoCobro` sin importar el enum
 * de Prisma (este módulo es puro y lo consume también el front del reporte).
 *  - PAGADO     → COBRADO    (exige confirmadoPor — INV3 — y fechaCobro explícita)
 *  - FACTURADO  → POR_COBRAR (factura emitida, plata sin entrar)
 *  - PENDIENTE  → PROGRAMADO (ni siquiera se facturó; si la fecha ya pasó, la alerta
 *                             FACTURACION_ATRASADA lo levanta sola)
 */
export const ESTADO_POR_COLOR = {
  PAGADO: "COBRADO",
  FACTURADO: "POR_COBRAR",
  PENDIENTE: "PROGRAMADO",
} as const satisfies Record<ColorCelda, string>;

// ── Configuración de las hojas ──────────────────────────────────────────────────

export type HojaConfig = {
  /** Nombre EXACTO de la pestaña (ojo con los espacios finales del documento). */
  hoja: string;
  tipoServicio: "WEB" | "CRM" | "SOPORTE" | "IMPLEMENTACION" | "CONECTOR";
  modalidad: "RECURRENTE" | "PROYECTO";
  tipoCuenta: "NACIONAL" | "INTERNACIONAL";
};

/**
 * Las 7 pestañas de facturación. Quedan FUERA a propósito: "Tablas de Pago"
 * (acuerdo puntual), "Copia de Gasto Proyectados por…" (tarjetas → costos, ya
 * cargados) y "Gráfico1 Punto de Equilibrio…" (derivado).
 *
 * `tipoCuenta` acá es solo el default de la hoja: el importador lo resuelve por
 * CLIENTE (si aparece en alguna hoja internacional, la cuenta es INTERNACIONAL),
 * porque "Conectores SAAS" mezcla ambos (Ferretería Noelito intl, Iberorutas CR).
 */
export const HOJAS_FACTURACION: HojaConfig[] = [
  { hoja: "Sitios Web CR", tipoServicio: "WEB", modalidad: "PROYECTO", tipoCuenta: "NACIONAL" },
  { hoja: "Sitios Web Internacional", tipoServicio: "WEB", modalidad: "PROYECTO", tipoCuenta: "INTERNACIONAL" },
  { hoja: "Continuidad Web", tipoServicio: "WEB", modalidad: "RECURRENTE", tipoCuenta: "NACIONAL" },
  { hoja: "Continuidad CRM", tipoServicio: "CRM", modalidad: "RECURRENTE", tipoCuenta: "NACIONAL" },
  { hoja: "Soportes CR ", tipoServicio: "SOPORTE", modalidad: "PROYECTO", tipoCuenta: "NACIONAL" },
  { hoja: "Implementaciones CR", tipoServicio: "IMPLEMENTACION", modalidad: "PROYECTO", tipoCuenta: "NACIONAL" },
  {
    hoja: "Implementaciones Internacionale",
    tipoServicio: "IMPLEMENTACION",
    modalidad: "PROYECTO",
    tipoCuenta: "INTERNACIONAL",
  },
  { hoja: "Conectores SAAS", tipoServicio: "CONECTOR", modalidad: "RECURRENTE", tipoCuenta: "NACIONAL" },
];

/** El año real de la carga. Los encabezados traen 2022/2025 (basura de plantilla). */
export const ANIO_FACTURACION = 2026;

// ── Columnas de quincena ────────────────────────────────────────────────────────

export type ColumnaQuincena = { col: number; mes0: number; dia: 15 | 30 };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Deriva las columnas de quincena del encabezado. Acepta dos formas:
 *  - Fecha real (el caso normal): mes y día salen del valor UTC; el AÑO se descarta.
 *  - Texto "Febrero 30" (encabezado roto del documento en la columna 6).
 * Todo lo demás (IVA, SALDO, "Notas al Contrato", vacío) se ignora.
 */
export function columnasDeQuincena(header: CeldaCruda[]): ColumnaQuincena[] {
  const out: ColumnaQuincena[] = [];
  header.forEach((celda, i) => {
    const col = i + 1;
    if (col === 1) return; // columna del nombre
    const v = celda?.valor;
    if (v instanceof Date) {
      // Día 15 y día 30 son los únicos anclajes de la hoja; cualquier otro día es ruido.
      const dia = v.getUTCDate();
      if (dia !== 15 && dia !== 30) return;
      out.push({ col, mes0: v.getUTCMonth(), dia });
      return;
    }
    if (typeof v === "string") {
      const m = /^\s*([a-záéíóúñ]+)\s*(15|30)\s*$/i.exec(v);
      if (!m) return;
      const mes0 = MESES.indexOf(sinAcentos(m[1].toLowerCase()));
      if (mes0 < 0) return;
      out.push({ col, mes0, dia: Number(m[2]) as 15 | 30 });
    }
  });
  return out;
}

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ── Monto de una celda ──────────────────────────────────────────────────────────

/** Fórmula de Excel tal como la entrega exceljs (con el resultado cacheado). */
type CeldaFormula = { formula?: string; sharedFormula?: string; result?: unknown };

/**
 * Monto de una celda, o null si no lo hay.
 *
 * Las celdas con FÓRMULA no se pueden descartar en bloque: en esta hoja hay cobros
 * reales escritos como aritmética literal — `=7167*3` (Kaizen Kapital, $21.501),
 * `=1500/6` (Bluesat Welcome kit), `=8400/5` (MSC Payroll), `=1620*2` (AE I TEC).
 * Descartarlas hacía desaparecer clientes enteros de la carga.
 *
 * Pero SÍ hay que descartar las fórmulas AGREGADAS (`=SUM(B3:B8)` de las filas de
 * totales y `=B3*0.13` de las columnas de IVA): son datos derivados, no obligaciones
 * de cobro. La regla es la referencia a otra celda — una fórmula que solo opera sobre
 * números literales es un monto escrito con calculadora; una que lee otras celdas es
 * un derivado.
 */
export function montoDeCelda(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (!valor || typeof valor !== "object") return null;
  const f = valor as CeldaFormula;
  const expr = f.formula ?? f.sharedFormula;
  if (typeof expr !== "string") return null;
  // Referencia a celda (B3, AA12, Hoja!B3) o función → derivado, no es un cobro.
  if (/[A-Za-z]/.test(expr)) return null;
  const r = f.result;
  return typeof r === "number" && Number.isFinite(r) ? r : null;
}

/**
 * Fecha de la quincena como instante UTC (patrón anchorStartDate del repo).
 * El día 30 se CLAMPEA al largo del mes: febrero-2026 → 28 (la hoja tiene una
 * columna "Febrero 30" que no existe en el calendario).
 */
export function fechaQuincena(anio: number, mes0: number, dia: 15 | 30): Date {
  const ultimoDia = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes0, Math.min(dia, ultimoDia)));
}

export function periodoDe(anio: number, mes0: number): string {
  return `${anio}-${String(mes0 + 1).padStart(2, "0")}`;
}

// ── Nombre de la fila → cliente + detalle ───────────────────────────────────────

/**
 * Filas que NUNCA son un servicio, propias de ESTA hoja: la fila "Cobrar" del
 * encabezado, el "$" de los totales y las etiquetas de columna sueltas.
 * Se COMBINA con `nombreEnSkipList` de import-core.ts, que ya cubre lo transversal
 * (total/subtotal/smarteam/n-a/guiones) y no se duplica acá.
 */
const FILA_NO_SERVICIO = /^(cobrar|\$|saldo|iva|suma|acumulado)$/i;

export function esFilaDeServicio(nombre: string): boolean {
  const n = nombre.trim();
  return n.length > 1 && !FILA_NO_SERVICIO.test(n) && !nombreEnSkipList(n);
}

/**
 * Parte el nombre de la fila en cliente + detalle. El documento usa " I " (i
 * mayúscula) como separador, pero de forma AMBIGUA: a veces marca el servicio
 * ("Transportes Juanva I Marca", "AMC I Hub & SAP") y a veces el país
 * ("Alfa I Nicaragua", "Visual Branding I El Salvador"). En ambos casos el lado
 * IZQUIERDO es el cliente, que es lo único que se usa para resolver contra Nexus;
 * el nombre COMPLETO queda como descripción del servicio.
 *
 * Además quita del cliente el nombre de la hoja repetido al final
 * ("Selectrica Continuidad Web" + hoja "Continuidad Web" → "Selectrica").
 */
export function parseNombreServicio(raw: string, hoja?: string): { cliente: string; detalle: string | null } {
  const limpio = raw.replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s+(?:I|\||-)\s+(.*)$/.exec(limpio);
  let cliente = (m ? m[1] : limpio).trim();
  const detalle = m ? m[2].trim() : null;

  if (hoja) {
    const sufijo = hoja.trim();
    if (cliente.length > sufijo.length && cliente.toLowerCase().endsWith(sufijo.toLowerCase())) {
      cliente = cliente.slice(0, -sufijo.length).trim();
    }
  }
  return { cliente: cliente || limpio, detalle };
}

// ── Extracción ──────────────────────────────────────────────────────────────────

export type CobroExtraido = {
  /** 1-based, cronológico dentro del servicio. Se usa como `Cobro.numCuota` → el
   *  `@@unique([servicioId, numCuota])` hace la re-carga idempotente. */
  orden: number;
  periodo: string; // "YYYY-MM"
  fecha: Date; // fecha programada (quincena) como instante UTC
  dia: 15 | 30;
  monto: number;
  color: ColorCelda;
  estado: (typeof ESTADO_POR_COLOR)[ColorCelda];
};

export type ServicioExtraido = {
  hoja: string;
  fila: number;
  /** Nombre completo tal cual está en el documento (va a `ServicioContratado.descripcion`). */
  nombreCrudo: string;
  cliente: string;
  detalle: string | null;
  tipoServicio: HojaConfig["tipoServicio"];
  modalidad: HojaConfig["modalidad"];
  tipoCuenta: HojaConfig["tipoCuenta"];
  cobros: CobroExtraido[];
  /** Suma de todas las celdas de la fila. */
  montoTotal: number;
  /** Monto de la cuota si todas son iguales (las recurrentes lo son); null si varían. */
  montoUniforme: number | null;
  /** Día de la primera quincena — default de `CuentaFinanciera.diaCobroAncla`. */
  diaAncla: 15 | 30;
  advertencias: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extrae los cobros de UNA fila. Devuelve null si la fila no es un servicio o no
 * tiene ningún monto (cero fabricación: una fila vacía no genera nada).
 */
export function extraerServicio(
  fila: FilaCruda,
  columnas: ColumnaQuincena[],
  cfg: HojaConfig,
  anio = ANIO_FACTURACION,
): ServicioExtraido | null {
  const nombreCrudo = String(fila.celdas[0]?.valor ?? "").replace(/\s+/g, " ").trim();
  if (!nombreCrudo || !esFilaDeServicio(nombreCrudo)) return null;

  const advertencias: string[] = [];
  const brutos: Array<Omit<CobroExtraido, "orden">> = [];

  for (const c of columnas) {
    const celda = fila.celdas[c.col - 1];
    const v = montoDeCelda(celda?.valor);
    if (v === null || v === 0) continue;
    if (v < 0) {
      advertencias.push(`monto negativo en ${MESES[c.mes0]} ${c.dia} ($${v}) — se omite`);
      continue;
    }
    const color = colorDeCelda(celda.fillArgb);
    brutos.push({
      periodo: periodoDe(anio, c.mes0),
      fecha: fechaQuincena(anio, c.mes0, c.dia),
      dia: c.dia,
      monto: round2(v),

      color,
      estado: ESTADO_POR_COLOR[color],
    });
  }

  if (brutos.length === 0) return null;

  brutos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const cobros: CobroExtraido[] = brutos.map((b, i) => ({ ...b, orden: i + 1 }));

  // Señal de dato raro: un pago verde ANTES de una factura amarilla es normal
  // (se cobró una y la otra quedó pendiente), pero conviene verlo en el reporte.
  const primerAmarillo = cobros.findIndex((c) => c.color === "FACTURADO");
  if (primerAmarillo >= 0 && cobros.slice(primerAmarillo + 1).some((c) => c.color === "PAGADO")) {
    advertencias.push("hay un cobro pagado DESPUÉS de uno facturado sin pagar (mora real, revisar)");
  }

  const montos = new Set(cobros.map((c) => c.monto));
  const { cliente, detalle } = parseNombreServicio(nombreCrudo, cfg.hoja);

  return {
    hoja: cfg.hoja,
    fila: fila.fila,
    nombreCrudo,
    cliente,
    detalle,
    tipoServicio: cfg.tipoServicio,
    modalidad: cfg.modalidad,
    tipoCuenta: cfg.tipoCuenta,
    cobros,
    montoTotal: round2(cobros.reduce((acc, c) => acc + c.monto, 0)),
    montoUniforme: montos.size === 1 ? cobros[0].monto : null,
    diaAncla: cobros[0].dia,
    advertencias,
  };
}

/**
 * Clave de identidad de un servicio para dedup e idempotencia
 * (`CuentaFinanciera.fuenteIdExterno` / `ImportacionFila.idExterno`).
 * Incluye la hoja porque el mismo cliente tiene servicios distintos en varias.
 */
export function claveServicio(s: Pick<ServicioExtraido, "hoja" | "nombreCrudo">): string {
  return `${slug(s.hoja)}:${slug(s.nombreCrudo)}`;
}

function slug(s: string): string {
  return sinAcentos(s.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Huella del CONTENIDO de un servicio (montos + fechas + estados). Dos filas con la
 * misma huella son el mismo servicio duplicado en dos hojas — el caso real de
 * "Honda Soporte I 6 Meses", que está idéntico en "Continuidad CRM" y "Soportes CR".
 */
export function huellaServicio(s: ServicioExtraido): string {
  return `${slug(s.nombreCrudo)}|${s.cobros
    .map((c) => `${c.periodo}-${c.dia}:${c.monto}:${c.color}`)
    .join(",")}`;
}
