/**
 * scripts/import-comisiones-vendedor.ts — carga el historial de comisiones de un vendedor desde su «Tabla de Comisiones»
 * (Excel o CSV: una fila por venta, una columna por mes) a `CuotaComisionVendedor` (2026-10-06, pedido de Elías).
 *
 * DRY-RUN por default: muestra lo que entraría, mes por mes, y todo lo que no cuadra (meses que no suman la comisión,
 * comisión que no es contrato × %, meses que no dan el «Total a Pagar»). Escribe solo con `--apply` + ALLOW_PROD_WRITE=1
 * (y respalda la tabla antes).
 *
 * Las columnas y la regla del estado de cada celda: lib/finanzas/comisiones-historial.ts. En corto:
 *   · xlsx: verde = PAGADA; otro color o sin color = POR_CONFIRMAR (Dinia o Alex lo confirman con el botón).
 *   · csv: hasta `--pagadas-hasta` = PAGADA, después POR_CONFIRMAR; una celda con «?» = POR_CONFIRMAR.
 *
 * Idempotente por (vendedor, venta, mes): re-correrlo actualiza monto y datos de la venta. ⛔ Una cuota que una persona
 * ya confirmó en la pantalla (`confirmadoPor` que no empieza con «import:») NO se toca: su estado manda.
 *
 * Uso (En tu PC, PowerShell):
 *   npx tsx scripts/import-comisiones-vendedor.ts --file=<ruta> --vendedor=apinzon@smarteamcr.com --anio=2026 --pagadas-hasta=2026-08
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/import-comisiones-vendedor.ts <lo mismo> --apply
 * Opcionales: --moneda=USD (default) · --hoja=<nombre de la hoja del xlsx>
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import { leerTablaDeComisiones, type CeldaLeida, type TablaDeComisiones } from "@/lib/finanzas/comisiones-historial";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

const FILE = opt("file");
const VENDEDOR = opt("vendedor");
const ANIO = Number(opt("anio"));
const PAGADAS_HASTA = opt("pagadas-hasta");
const MONEDA = (opt("moneda") ?? "USD").toUpperCase();
const HOJA = opt("hoja");

function salir(msg: string): never {
  console.error(`⛔ ${msg}`);
  process.exit(1);
}

if (!FILE) salir("Falta --file=<ruta del Excel o CSV>.");
if (!VENDEDOR) salir("Falta --vendedor=<email del vendedor>.");
if (!Number.isInteger(ANIO) || ANIO < 2020 || ANIO > 2100) salir("Falta --anio=AAAA.");
if (PAGADAS_HASTA && !/^\d{4}-(0[1-9]|1[0-2])$/.test(PAGADAS_HASTA)) salir("--pagadas-hasta va como AAAA-MM.");
if (MONEDA !== "USD" && MONEDA !== "CRC") salir("--moneda es USD o CRC.");

/** Un CSV con comillas (los montos traen comas de miles). */
function leerCsv(texto: string): string[][] {
  const sep = texto.split("\n", 1)[0]!.includes("\t") ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/** El relleno de la celda, clasificado: verde (pagada), amarillo (dudosa) u otro. */
function colorDe(argb: string | undefined): CeldaLeida["color"] {
  if (!argb || argb.length < 6) return null;
  const hex = argb.slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  if (r > 230 && g > 230 && b > 230) return null; // blanco
  if (g > r + 20 && g > b + 20) return "VERDE";
  if (r > 200 && g > 200 && b < 140) return "AMARILLO";
  return "OTRO";
}

async function leerGrilla(ruta: string): Promise<{ grilla: CeldaLeida[][]; conColores: boolean }> {
  if (/\.(csv|tsv|txt)$/i.test(ruta)) {
    return { grilla: leerCsv(fs.readFileSync(ruta, "utf8")).map((f) => f.map((texto) => ({ texto }))), conColores: false };
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = HOJA ? libro.getWorksheet(HOJA) : libro.worksheets.find((w) => w.state === "visible");
  if (!hoja) salir(HOJA ? `No hay una hoja «${HOJA}».` : "El libro no tiene hojas visibles.");
  const grilla: CeldaLeida[][] = [];
  hoja.eachRow({ includeEmpty: true }, (row, n) => {
    const fila: CeldaLeida[] = [];
    for (let c = 1; c <= hoja.columnCount; c++) {
      const cell = row.getCell(c);
      const fill = cell.fill as { fgColor?: { argb?: string } } | undefined;
      fila.push({ texto: cell.text ?? "", color: colorDe(fill?.fgColor?.argb) });
    }
    grilla[n - 1] = fila;
  });
  return { grilla: Array.from(grilla, (f) => f ?? []), conColores: true };
}

function informe(t: TablaDeComisiones) {
  const cuotas = t.ventas.flatMap((v) => v.cuotas);
  const suma = (xs: typeof cuotas) => xs.reduce((n, c) => n + Math.round(c.monto * 100), 0) / 100;
  console.log(`\n${t.ventas.length} ventas · ${cuotas.length} cuotas`);
  console.log("Mes       pagadas      por confirmar");
  for (const p of Object.keys(t.porMes).sort()) {
    const delMes = cuotas.filter((c) => c.periodo === p);
    const pag = suma(delMes.filter((c) => c.estado === "PAGADA"));
    const conf = suma(delMes.filter((c) => c.estado === "POR_CONFIRMAR"));
    console.log(`${p}  ${pag.toFixed(2).padStart(10)}  ${conf.toFixed(2).padStart(14)}`);
  }
  console.log(`Total     ${suma(cuotas.filter((c) => c.estado === "PAGADA")).toFixed(2).padStart(10)}  ${suma(cuotas.filter((c) => c.estado === "POR_CONFIRMAR")).toFixed(2).padStart(14)}`);
  if (t.avisos.length) {
    console.log(`\n${t.avisos.length} cosas que no cuadran o se saltaron (no frenan la carga):`);
    for (const a of t.avisos) console.log(`  · ${a}`);
  }
}

async function main() {
  const ruta = path.resolve(FILE!);
  if (!fs.existsSync(ruta)) salir(`No existe ${ruta}.`);
  const { grilla, conColores } = await leerGrilla(ruta);
  if (!conColores && !PAGADAS_HASTA) {
    console.error("⚠ Un CSV no trae colores: sin --pagadas-hasta, todas las cuotas quedan POR CONFIRMAR.");
  }
  const tabla = leerTablaDeComisiones(grilla, { anio: ANIO, pagadasHasta: PAGADAS_HASTA, usarColores: conColores });
  console.log(`Archivo: ${path.basename(ruta)} · ${conColores ? "estado por color de celda" : `pagadas hasta ${PAGADAS_HASTA ?? "—"}`}`);
  informe(tabla);

  const APPLY = resolverApply({ tablas: ["CuotaComisionVendedor"] });
  const { prisma, close } = createScriptDb();
  try {
    const persona = await prisma.teamMember.findFirst({
      where: { email: { equals: VENDEDOR!, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!persona) salir(`No hay nadie en el equipo con el email ${VENDEDOR}.`);
    console.log(`\nVendedor: ${persona.name}`);
    const origen = `import:${path.basename(ruta)}`;

    const existentes = await prisma.cuotaComisionVendedor
      .findMany({
        where: { teamMemberId: persona.id, periodo: { startsWith: `${ANIO}-` } },
        select: { id: true, ventaClave: true, periodo: true, confirmadoPor: true },
      })
      .catch((e: { code?: string }) => {
        // La tabla todavía no existe: en seco se puede mirar igual; para escribir hay que correr el SQL primero.
        if (e.code !== "P2021") throw e;
        if (APPLY) salir("Falta el SQL: corre scripts/sql/2026-10-06-cuotas-comision-vendedor.sql antes del --apply.");
        console.log("(La tabla todavía no existe en esta base: corre el SQL antes del --apply.)");
        return [];
      });
    const yaEsta = new Map(existentes.map((e) => [`${e.ventaClave}|${e.periodo}`, e]));
    let nuevas = 0;
    let actualizadas = 0;
    let respetadas = 0;
    for (const v of tabla.ventas) {
      for (const c of v.cuotas) {
        const previa = yaEsta.get(`${v.ventaClave}|${c.periodo}`);
        if (previa && previa.confirmadoPor && !previa.confirmadoPor.startsWith("import:")) {
          respetadas++;
          continue;
        }
        const datos = {
          cliente: v.cliente,
          tipoVenta: v.tipoVenta,
          porcentaje: v.porcentaje,
          montoContrato: v.montoContrato,
          montoComision: v.montoComision,
          fechaIngreso: v.fechaIngreso ? new Date(`${v.fechaIngreso}T00:00:00Z`) : null,
          monto: c.monto,
          moneda: MONEDA as "USD" | "CRC",
          estado: c.estado,
          confirmadoPor: c.estado === "PAGADA" ? origen : null,
          confirmadoEn: c.estado === "PAGADA" ? new Date() : null,
          origen,
          detalle: { fila: v.fila, celda: c.celda, nacionalidad: v.nacionalidad, tiempoContrato: v.tiempoContrato },
        };
        if (previa) actualizadas++;
        else nuevas++;
        if (!APPLY) continue;
        await prisma.cuotaComisionVendedor.upsert({
          where: { teamMemberId_ventaClave_periodo: { teamMemberId: persona.id, ventaClave: v.ventaClave, periodo: c.periodo } },
          create: { teamMemberId: persona.id, ventaClave: v.ventaClave, periodo: c.periodo, ...datos },
          update: datos,
        });
      }
    }
    console.log(
      `\n${APPLY ? "Escrito" : "En seco (sin --apply no se escribe nada)"}: ${nuevas} nuevas · ${actualizadas} actualizadas · ${respetadas} ya confirmadas por una persona (no se tocan).`,
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
