/**
 * lib/finanzas/comisiones-historial.ts — leer la «Tabla de Comisiones» de un vendedor (2026-10-06).
 *
 * Pedido de Elías: importar el historial de comisiones del año desde el Excel de cada vendedor y que lo dudoso lo
 * confirmen Dinia o Alex con un botón en la pantalla de comisiones. Lo escribe scripts/import-comisiones-vendedor.ts en
 * `CuotaComisionVendedor`. PURO: sin Prisma ni archivos — recibe la grilla ya leída.
 *
 * ── LAS COLUMNAS (encabezados en cualquier fila; mayúsculas y tildes no importan) ──────────────────────────────────
 *   Cliente · Tipo de Venta · Comisión · Enero … Diciembre          obligatorias
 *   Fecha de Ingreso · Monto del Contrato · Monto de Comisión        recomendadas (la clave y las revisiones)
 *   Nacionalidad · Tiempo de Contrato                                 opcionales (quedan en el detalle)
 * Una fila «Total a Pagar» no se importa: sirve para revisar que cada mes sume lo mismo.
 *
 * ── EL ESTADO DE CADA CELDA ─────────────────────────────────────────────────────────────────────────────────────────
 * Con colores (xlsx): verde = PAGADA; cualquier otro (amarillo, blanco) = POR_CONFIRMAR.
 * Sin colores (csv): hasta `pagadasHasta` = PAGADA, después POR_CONFIRMAR; una celda con «?» = POR_CONFIRMAR siempre.
 * Una celda vacía o en 0 no es cuota. POR_CONFIRMAR de un mes que ya llegó lleva el botón en la pantalla; uno futuro se
 * ve como programado.
 */
import { parseFechaLocal, parseMontoLocal } from "@/lib/cobranza/import-core";

export type EstadoCuota = "PAGADA" | "NO_PAGADA" | "POR_CONFIRMAR";
export type TipoVenta = "SERVICIO" | "LICENCIA";

export interface CeldaLeida {
  texto: string;
  /** Solo del xlsx: el color de relleno ya clasificado. */
  color?: "VERDE" | "AMARILLO" | "OTRO" | null;
}

export interface CuotaImportada {
  periodo: string;
  monto: number;
  estado: EstadoCuota;
  /** La celda tal cual, para el detalle. */
  celda: string;
}

export interface VentaImportada {
  fila: number;
  ventaClave: string;
  cliente: string;
  tipoVenta: TipoVenta;
  porcentaje: number;
  montoContrato: number | null;
  montoComision: number | null;
  fechaIngreso: string | null;
  nacionalidad: string | null;
  tiempoContrato: string | null;
  cuotas: CuotaImportada[];
}

// ── Lo que viaja a la pantalla (lo arma comisiones-historial-server.ts) ─────────────────────────────────────────────

export interface CuotaComisionDTO {
  id: string;
  periodo: string;
  monto: number;
  estado: EstadoCuota;
  /** Quién la confirmó: el nombre de pila si es del equipo; «el Excel» si vino del import. */
  confirmadoPor: string | null;
  confirmadoEn: string | null;
}

export interface VentaComisionDTO {
  ventaClave: string;
  cliente: string;
  tipoVenta: TipoVenta;
  porcentaje: number;
  montoContrato: number | null;
  montoComision: number | null;
  fechaIngreso: string | null;
  cuotas: CuotaComisionDTO[];
}

export interface VendedorConHistorialDTO {
  teamMemberId: string;
  nombre: string;
  moneda: string;
  ventas: VentaComisionDTO[];
}

export interface HistorialComisionesDTO {
  anio: number;
  vendedores: VendedorConHistorialDTO[];
  /** La tabla no existe todavía (el código llegó antes que scripts/sql/2026-10-06-cuotas-comision-vendedor.sql). */
  faltaSql: boolean;
}

export interface TablaDeComisiones {
  ventas: VentaImportada[];
  /** Lo que no cuadra o se saltó, en palabras. No frena: se muestra en la corrida en seco. */
  avisos: string[];
  /** Suma de las cuotas por mes ("YYYY-MM" → monto). */
  porMes: Record<string, number>;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** «Servicio Smarteam» → SERVICIO · «Collab» / «Licencia…» → LICENCIA. */
export function tipoDeVenta(texto: string): TipoVenta | null {
  const t = normal(texto);
  if (!t) return null;
  if (t.includes("collab") || t.includes("licencia")) return "LICENCIA";
  if (t.includes("servicio")) return "SERVICIO";
  return null;
}

/** «5%», «2.50%», «0.05», «10» → puntos porcentuales (5, 2.5, 10). */
export function porcentajeDe(texto: string): number | null {
  const n = parseMontoLocal(texto.replace("%", ""));
  if (n === null || n <= 0) return null;
  const puntos = texto.includes("%") || n >= 1 ? n : n * 100;
  return Math.round(puntos * 10_000) / 10_000;
}

const slug = (s: string) => normal(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const centavos = (n: number) => Math.round(n * 100);

export function leerTablaDeComisiones(
  grilla: ReadonlyArray<ReadonlyArray<CeldaLeida>>,
  opciones: { anio: number; pagadasHasta: string | null; usarColores: boolean },
): TablaDeComisiones {
  const avisos: string[] = [];
  const texto = (fila: ReadonlyArray<CeldaLeida>, i: number | undefined) => (i === undefined ? "" : (fila[i]?.texto ?? "").trim());

  // El encabezado: la primera fila con «Cliente» y «Enero».
  const iEnc = grilla.findIndex((f) => f.some((c) => normal(c.texto) === "cliente") && f.some((c) => normal(c.texto) === "enero"));
  if (iEnc < 0) throw new Error("No encontré la fila de encabezados: tiene que tener «Cliente» y «Enero».");
  const enc = grilla[iEnc]!.map((c) => normal(c.texto));
  const col = (...nombres: string[]) => {
    const i = enc.findIndex((h) => nombres.includes(h));
    return i < 0 ? undefined : i;
  };
  const cCliente = col("cliente")!;
  const cTipo = col("tipo de venta", "tipo");
  const cPct = col("comision", "% comision", "porcentaje");
  const cFecha = col("fecha de ingreso", "fecha");
  const cContrato = col("monto del contrato", "monto contrato");
  const cMontoCom = col("monto de comision", "monto comision");
  const cNac = col("nacionalidad", "pais");
  const cTiempo = col("tiempo de contrato", "duracion");
  const cMeses = MESES.map((m) => col(m));
  const faltan = [
    cTipo === undefined && "Tipo de Venta",
    cPct === undefined && "Comisión",
    ...MESES.filter((_, i) => cMeses[i] === undefined).map((m) => m[0]!.toUpperCase() + m.slice(1)),
  ].filter(Boolean);
  if (faltan.length > 0) throw new Error(`Faltan columnas: ${faltan.join(", ")}.`);

  const periodo = (i: number) => `${opciones.anio}-${String(i + 1).padStart(2, "0")}`;
  const ventas: VentaImportada[] = [];
  const claves = new Map<string, number>();
  const porMes: Record<string, number> = {};
  let totalAPagar: Array<number | null> | null = null;

  for (let r = iEnc + 1; r < grilla.length; r++) {
    const f = grilla[r]!;
    const cliente = texto(f, cCliente);
    if (!cliente) continue;
    const nFila = r + 1;
    // La fila de totales: «Total», «Total a Pagar»… y NO un cliente que se llame así («Total Finco» es un cliente).
    if (/^total(es)?( a pagar| general| del mes)?$/.test(normal(cliente))) {
      totalAPagar = cMeses.map((i) => parseMontoLocal(texto(f, i)));
      continue;
    }
    const tipo = tipoDeVenta(texto(f, cTipo));
    const pct = porcentajeDe(texto(f, cPct));
    if (!tipo || pct === null) {
      avisos.push(`Fila ${nFila} (${cliente}): sin tipo de venta o sin % de comisión reconocible; no se importa.`);
      continue;
    }
    const fechaCruda = texto(f, cFecha);
    const fechaIngreso = fechaCruda ? parseFechaLocal(fechaCruda) : null;
    if (fechaCruda && !fechaIngreso) avisos.push(`Fila ${nFila} (${cliente}): no entendí la fecha de ingreso «${fechaCruda}».`);
    const montoContrato = parseMontoLocal(texto(f, cContrato));
    const montoComision = parseMontoLocal(texto(f, cMontoCom));

    const cuotas: CuotaImportada[] = [];
    cMeses.forEach((i, m) => {
      const celda = texto(f, i);
      if (!celda) return;
      const monto = parseMontoLocal(celda.replace("?", ""));
      if (monto === null) {
        avisos.push(`Fila ${nFila} (${cliente}), ${MESES[m]}: «${celda}» no es un monto; no se importa.`);
        return;
      }
      if (monto === 0) return;
      const p = periodo(m);
      const color = f[i!]?.color ?? null;
      const estado: EstadoCuota = celda.includes("?")
        ? "POR_CONFIRMAR"
        : opciones.usarColores
          ? color === "VERDE"
            ? "PAGADA"
            : "POR_CONFIRMAR"
          : opciones.pagadasHasta && p <= opciones.pagadasHasta
            ? "PAGADA"
            : "POR_CONFIRMAR";
      cuotas.push({ periodo: p, monto, estado, celda });
      porMes[p] = (centavos(porMes[p] ?? 0) + centavos(monto)) / 100;
    });
    if (cuotas.length === 0) {
      avisos.push(`Fila ${nFila} (${cliente}): todavía no tiene ninguna cuota; no se importa.`);
      continue;
    }

    // La clave de la venta: estable entre importaciones. Dos ventas iguales sin fecha se distinguen por orden.
    const base = `${slug(cliente)}|${fechaIngreso ?? ""}|${tipo}`;
    const vez = (claves.get(base) ?? 0) + 1;
    claves.set(base, vez);
    const ventaClave = vez === 1 ? base : `${base}|${vez}`;

    // Revisiones: que los meses sumen la comisión, y que la comisión sea contrato × %.
    const suma = cuotas.reduce((n, c) => n + centavos(c.monto), 0);
    if (montoComision !== null && suma !== centavos(montoComision)) {
      avisos.push(`Fila ${nFila} (${cliente}): los meses suman ${(suma / 100).toFixed(2)} y la comisión dice ${montoComision.toFixed(2)}.`);
    }
    if (montoContrato !== null && montoComision !== null && Math.abs(centavos((montoContrato * pct) / 100) - centavos(montoComision)) > 1) {
      avisos.push(`Fila ${nFila} (${cliente}): ${pct}% de ${montoContrato.toFixed(2)} es ${((montoContrato * pct) / 100).toFixed(2)}, no ${montoComision.toFixed(2)}.`);
    }

    ventas.push({
      fila: nFila,
      ventaClave,
      cliente,
      tipoVenta: tipo,
      porcentaje: pct,
      montoContrato,
      montoComision,
      fechaIngreso,
      nacionalidad: texto(f, cNac) || null,
      tiempoContrato: texto(f, cTiempo) || null,
      cuotas,
    });
  }

  if (totalAPagar) {
    totalAPagar.forEach((t, m) => {
      const p = periodo(m);
      if (t !== null && centavos(t) !== centavos(porMes[p] ?? 0)) {
        avisos.push(`${MESES[m]![0]!.toUpperCase()}${MESES[m]!.slice(1)}: las cuotas suman ${(porMes[p] ?? 0).toFixed(2)} y «Total a Pagar» dice ${t.toFixed(2)}.`);
      }
    });
  }
  return { ventas, avisos, porMes };
}
