/**
 * lib/finanzas/conciliacion-por-documento.ts — «Lo que no cuadra» contado por documento (2026-10-22). PURO.
 *
 * Elías, revisando la pestaña: «¿qué quiere decir filas? Esto no es una hoja de cálculo. Debería decir: hay 5 facturas
 * en Odoo y 25 en Mercury que no calzan, por tal y tal razón». Una «fila» podía ser una factura, una cuota, un cliente,
 * un año de pagos o un depósito, y «116 filas» no le decía nada a nadie.
 *
 * Acá cada línea de lo que no cuadra (lib/cobranza/odoo/diferencias.ts y mercury/diferencias.ts) pasa a ser una RAZÓN
 * dentro de la sección del documento del que habla: facturas de Odoo, facturas de Mercury, cuotas de Nexus, depósitos
 * de Mercury o cuentas por emparejar. Cada razón cuenta DOCUMENTOS (las claves `f:`, `fm:`, `c:`, `mov:`, `l:`,
 * `cuenta:` de sus filas), no filas, y dice qué hacer. El total de una sección cuenta cada documento una vez, aunque
 * esté en dos razones. Aparte: las preguntas para quien vendió y lo que es de contabilidad (no cambia nada en Nexus).
 *
 * Diseño: Claude Design «Lo que no cuadra · Conciliación», página «por documento» (datos del 22 oct).
 */
import type { DiferenciaOdoo, MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";

export type SeccionDeDocumento = "ODOO" | "MERCURY" | "NEXUS" | "DEPOSITOS" | "BANCO" | "CUENTAS" | "PREGUNTAS" | "CONTABILIDAD";

export const ORDEN_DE_SECCIONES: readonly SeccionDeDocumento[] = ["ODOO", "MERCURY", "NEXUS", "DEPOSITOS", "BANCO", "CUENTAS", "PREGUNTAS", "CONTABILIDAD"];

/**
 * Las secciones que no entran a «por resolver», el número de arriba. CONTABILIDAD no cambia nada en Nexus. BANCO son las
 * líneas del banco de Odoo sin conciliar (U15, 2026-10-26): van en su sección propia y fuera del número para que el
 * criterio de la tarjeta 13 del roadmap («los dos números bajan semana a semana») se siga comparando con lo de antes.
 */
export const FUERA_DE_POR_RESOLVER: ReadonlySet<SeccionDeDocumento> = new Set(["CONTABILIDAD", "BANCO"]);

/** Cómo se lee una línea en esta vista: dónde va, qué cuenta, cómo se dice y qué hacer. */
interface DeLaLinea {
  seccion: SeccionDeDocumento;
  /** Los prefijos de los documentos que cuenta. Vacío = cuenta sus filas (las preguntas). */
  cuenta: readonly string[];
  razon: string;
  queHacer: string;
  /** Mueve lo que Nexus da por cobrado: Cobranza, alertas, punto de equilibrio y comisiones. */
  cambiaLoCobrado?: true;
}

const F = ["f:"];
const FM = ["fm:"];
const C = ["c:"];

export const DE_LA_LINEA: Readonly<Record<string, DeLaLinea>> = {
  /* Facturas de Odoo */
  "ODOO-POR-COBRAR-PAGADA": { seccion: "ODOO", cuenta: F, razon: "Pagada en Odoo, y Nexus la sigue dando por cobrar", queHacer: "Anotar su número en la cuota: se cobra sola", cambiaLoCobrado: true },
  "ODOO-COBRADO-SIN-PAGAR": { seccion: "ODOO", cuenta: F, razon: "Cobrada en Nexus y sin pagar en Odoo", queHacer: "Registrar el pago en Odoo, o sacar la cuota de Cobrado", cambiaLoCobrado: true },
  "ODOO-SIN-CUENTA": { seccion: "ODOO", cuenta: F, razon: "El cliente de Odoo no está en ninguna cuenta de Nexus", queHacer: "Emparejar el cliente con su cuenta (una vez)" },
  "ODOO-FACTURA-SIN-COBRO": { seccion: "ODOO", cuenta: F, razon: "No hay una cuota en Nexus que la explique", queHacer: "Cargar la cuota, o desestimarla si Nexus no la planifica" },
  "ODOO-FACTURA-VARIAS-CUOTAS": { seccion: "ODOO", cuenta: F, razon: "Cubre varias cuotas y calza de más de una forma", queHacer: "Elegir las cuotas que cubre" },
  "ODOO-LIBERADAS-PENDIENTES": { seccion: "ODOO", cuenta: ["l:", "f:"], razon: "Nexus la soltó y sigue emitida en Odoo", queHacer: "Anularla en Odoo" },
  "ODOO-LIBERADAS-SIN-NUMERO": { seccion: "ODOO", cuenta: ["l:"], razon: "Nexus la soltó, sin número de documento", queHacer: "Ubicarla en Odoo y anularla" },
  "ODOO-MONTO": { seccion: "ODOO", cuenta: F, razon: "El monto es distinto al de su cuota", queHacer: "Usar el monto de la factura" },
  "ODOO-MONEDA": { seccion: "ODOO", cuenta: F, razon: "El mismo importe facturado en dos monedas", queHacer: "Revisar en Odoo y anular la que sobra" },
  "ODOO-EXENTAS": { seccion: "ODOO", cuenta: F, razon: "Salió sin impuesto", queHacer: "Confirmar si es exenta" },
  "ODOO-NOTA-SIN-APLICAR": { seccion: "ODOO", cuenta: F, razon: "Nota de crédito sin aplicar a su factura", queHacer: "Aplicarla en Odoo" },
  /* Facturas de Mercury */
  "MERCURY-PAGADA-SIN-COBRAR": { seccion: "MERCURY", cuenta: FM, razon: "Pagada en Mercury, y Nexus la sigue dando por cobrar", queHacer: "Registrar el pago con el día que dice Mercury", cambiaLoCobrado: true },
  "MERCURY-COBRADO-SIN-PAGAR": { seccion: "MERCURY", cuenta: FM, razon: "Cobrada en Nexus y sin pagar en Mercury", queHacer: "Registrar el pago en Mercury, o sacar la cuota de Cobrado", cambiaLoCobrado: true },
  "MERCURY-SIN-CUENTA": { seccion: "MERCURY", cuenta: FM, razon: "El cliente de Mercury no está en ninguna cuenta de Nexus", queHacer: "Emparejar el cliente con su cuenta (una vez)" },
  "MERCURY-FACTURA-SIN-COBRO": { seccion: "MERCURY", cuenta: FM, razon: "No hay una cuota en Nexus que la explique", queHacer: "Unirla a sus cuotas, o cargar la cuota" },
  "MERCURY-MONTO-DISTINTO": { seccion: "MERCURY", cuenta: FM, razon: "El monto es distinto al de sus cuotas", queHacer: "Usar el monto de la factura" },
  "LIBERADAS-FUERA-DE-ODOO": { seccion: "MERCURY", cuenta: ["l:"], razon: "Nexus la soltó y se emitió fuera de Odoo", queHacer: "Anularla donde se emitió" },
  /* Cuotas de Nexus */
  "ODOO-COBRO-SIN-FACTURA": { seccion: "NEXUS", cuenta: C, razon: "Facturada por Odoo, y Odoo no tiene esa factura", queHacer: "Quitarle «facturada» o anotar su factura" },
  "ODOO-NUMERO-SIN-DOCUMENTO": { seccion: "NEXUS", cuenta: C, razon: "Anota una factura que Odoo no tiene vigente", queHacer: "Corregir el número" },
  "ODOO-NUMERO-DE-OTRO-CLIENTE": { seccion: "NEXUS", cuenta: C, razon: "Anota una factura de Odoo de otro cliente", queHacer: "Corregir el número o el emparejado" },
  "ODOO-COBRO-FACTURADO-EN-MERCURY": { seccion: "NEXUS", cuenta: C, razon: "Se facturó por Mercury y no tiene el número", queHacer: "Anotar el número de Mercury" },
  "MERCURY-COBRO-SIN-FACTURA": { seccion: "NEXUS", cuenta: C, razon: "Facturada por Mercury, y Mercury no tiene una factura por ese monto", queHacer: "Unirla a su factura de Mercury (casi siempre una de varios meses)" },
  "MERCURY-FALTA-NUMERO": { seccion: "NEXUS", cuenta: C, razon: "Facturada sin el número de su factura de Mercury", queHacer: "Anotar el número" },
  "MERCURY-NUMERO-INEXISTENTE": { seccion: "NEXUS", cuenta: C, razon: "Anota un número que no existe en Mercury", queHacer: "Corregir el número" },
  "MERCURY-NUMERO-DE-OTRA-CUENTA": { seccion: "NEXUS", cuenta: C, razon: "Anota una factura de Mercury de otra cuenta", queHacer: "Corregir el número o el emparejado" },
  "MERCURY-ANULADA-CON-COBRO": { seccion: "NEXUS", cuenta: C, razon: "Su factura de Mercury está anulada", queHacer: "Anotar la factura nueva, o soltar la cuota" },
  /* Depósitos de Mercury */
  "MERCURY-ENTRADA-SIN-FACTURA": { seccion: "DEPOSITOS", cuenta: ["mov:"], razon: "Entró plata a Mercury y no es de ninguna factura", queHacer: "Decir de qué es, o unirla a su factura" },
  /* Cuentas */
  "MERCURY-CUENTA-SIN-CLIENTE": { seccion: "CUENTAS", cuenta: ["cuenta:"], razon: "Factura por Mercury y no tiene su cliente de Mercury", queHacer: "Emparejarla con su cliente de Mercury" },
  "CUENTA-INTERNACIONAL-EN-ODOO": { seccion: "CUENTAS", cuenta: ["cuenta:"], razon: "Dice facturar por Odoo y tiene facturas en Mercury", queHacer: "Revisar su vía de cobro" },
  /* El banco de Odoo sin conciliar (U15) */
  "ODOO-BANCO-ENTRADA-SIN-CONCILIAR": { seccion: "BANCO", cuenta: ["bo:"], razon: "Entró plata al banco y Odoo no la tiene atada a ninguna factura", queHacer: "Conciliarla en Odoo, o decir de qué es" },
  "ODOO-BANCO-SALIDA-SIN-CONCILIAR": { seccion: "BANCO", cuenta: ["bo:"], razon: "Salió plata del banco o de una tarjeta y Odoo no la tiene conciliada", queHacer: "Que contabilidad la concilie en Odoo" },
  /* Aparte */
  "VENTA-CONTADA-DOS-VECES": { seccion: "PREGUNTAS", cuenta: [], razon: "La factura puede ser la misma venta que una cuota", queHacer: "Preguntarle a quien vendió" },
  "ODOO-IN-PAYMENT": { seccion: "CONTABILIDAD", cuenta: F, razon: "Pagadas en Odoo y sin conciliar con el banco", queHacer: "Que contabilidad las concilie" },
  /* Cada fila nombra la factura equivocada, su reverso y las buenas: se cuentan los casos, no los cuatro documentos. */
  "ODOO-MONEDA-CORREGIDA": { seccion: "CONTABILIDAD", cuenta: [], razon: "Salieron en la moneda equivocada y ya se corrigieron en Odoo", queHacer: "Nada: es historia" },
};

/** Una línea que no está en la tabla: va por el prefijo de sus documentos, con su propio título y su «qué hacer». */
function deUnaLineaNueva(l: DiferenciaOdoo): DeLaLinea {
  const claves = l.items.flatMap((i) => i.fila.documentos.map((d) => d.clave));
  const hay = (p: string) => claves.some((k) => k.startsWith(p));
  const seccion: SeccionDeDocumento = hay("fm:") ? "MERCURY" : hay("f:") ? "ODOO" : hay("mov:") ? "DEPOSITOS" : hay("cuenta:") ? "CUENTAS" : "NEXUS";
  const cuenta = { ODOO: F, MERCURY: FM, DEPOSITOS: ["mov:"], CUENTAS: ["cuenta:"], NEXUS: C } as Record<string, string[]>;
  return { seccion, cuenta: cuenta[seccion] ?? C, razon: l.titulo.replace(/^\d+\s+/, ""), queHacer: l.queHacer };
}

export interface EjemploDeDocumento {
  texto: string;
}

export interface Razon {
  codigo: string;
  razon: string;
  queHacer: string;
  cambiaLoCobrado: boolean;
  /** Cuántos documentos de la sección nombra (las preguntas: cuántas filas). */
  documentos: number;
  /** Los documentos que cuenta, para el total de la sección sin repetir. */
  claves: string[];
  montos: MontoEnMoneda[];
  /** Los primeros documentos, para que se vea de qué se habla sin abrir nada. */
  ejemplos: EjemploDeDocumento[];
  /** Cuántos más hay además de los ejemplos. */
  mas: number;
  /** La línea entera, con sus filas y sus botones, para abrirla. */
  linea: DiferenciaOdoo;
}

export interface Seccion {
  seccion: SeccionDeDocumento;
  /** Documentos distintos de la sección: uno que está en dos razones cuenta una vez. */
  documentos: number;
  razones: Razon[];
}

export interface PorDocumento {
  secciones: Seccion[];
  /** Documentos que cambian lo cobrado, sin repetir. */
  cambianLoCobrado: number;
  /** Lo que hay que resolver: todo menos lo de contabilidad y el banco de Odoo (`FUERA_DE_POR_RESOLVER`). */
  porResolver: number;
}

/** Los documentos de las filas que empiezan con alguno de los prefijos, sin repetir. */
function documentosDe(l: DiferenciaOdoo, prefijos: readonly string[]): string[] {
  if (!prefijos.length) return l.items.map((i) => `fila:${l.codigo}:${i.fila.clave}`);
  const out = new Set<string>();
  for (const i of l.items) for (const k of [i.fila.clave, ...i.fila.documentos.map((d) => d.clave)]) if (prefijos.some((p) => k.startsWith(p))) out.add(k);
  return [...out];
}

/** El texto corto de una fila: lo que dice antes del segundo «·», sin pasar de 64 letras. */
export function textoCorto(texto: string): string {
  const corto = texto.split(" · ").slice(0, 2).join(" · ").replace(/\s+SOCIEDAD (ANONIMA|DE RESPONSABILIDAD LIMITADA)\b/gi, "");
  return corto.length > 64 ? `${corto.slice(0, 63)}…` : corto;
}

const EJEMPLOS = 8;

/** «Lo que no cuadra» en secciones por documento, en el orden de la pantalla. */
export function porDocumento(lineas: readonly DiferenciaOdoo[]): PorDocumento {
  const razones = lineas
    .filter((l) => l.items.length > 0)
    .map((l): Razon & { seccion: SeccionDeDocumento } => {
      const d = DE_LA_LINEA[l.codigo] ?? deUnaLineaNueva(l);
      const claves = documentosDe(l, d.cuenta);
      const ejemplos = l.items.slice(0, EJEMPLOS).map((i) => ({ texto: textoCorto(i.texto) }));
      return {
        seccion: d.seccion,
        codigo: l.codigo,
        razon: d.razon,
        queHacer: d.queHacer,
        cambiaLoCobrado: !!d.cambiaLoCobrado,
        documentos: claves.length || l.items.length,
        claves,
        montos: l.montos,
        ejemplos,
        mas: Math.max(0, l.items.length - ejemplos.length),
        linea: l,
      };
    });
  /* Primero lo que cambia lo cobrado; después, lo que más documentos tiene. */
  razones.sort((a, b) => Number(b.cambiaLoCobrado) - Number(a.cambiaLoCobrado) || b.documentos - a.documentos);
  const secciones = ORDEN_DE_SECCIONES.map((seccion): Seccion => {
    const rs = razones.filter((r) => r.seccion === seccion);
    return { seccion, documentos: new Set(rs.flatMap((r) => (r.claves.length ? r.claves : [`razon:${r.codigo}`]))).size, razones: rs };
  }).filter((s) => s.razones.length > 0);
  const cobrado = new Set(razones.filter((r) => r.cambiaLoCobrado).flatMap((r) => r.claves));
  return {
    secciones,
    cambianLoCobrado: cobrado.size,
    porResolver: secciones.filter((s) => !FUERA_DE_POR_RESOLVER.has(s.seccion)).reduce((n, s) => n + s.documentos, 0),
  };
}
