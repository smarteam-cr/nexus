/**
 * scripts/import-comisiones-partner.ts — carga las comisiones de aliados desde el Excel
 * «Comisiones 2026», hoja visible «Comisiones Smarteam».
 *
 * DRY-RUN por default; escribe solo con `--apply` + ALLOW_PROD_WRITE=1.
 *
 * ── POR QUÉ ESTE SCRIPT SE REESCRIBIÓ (2026-08-18) ──────────────────────────────
 * La primera versión traía las cinco filas ESCRITAS A MANO, con este razonamiento:
 * «son 5 pagos y no 10; la hoja trae una fila de ACUMULADO que repite cada total, y
 * sumarla da $198.961,05, que es exactamente el doble de lo que entró». **Era falso, y
 * se ve con una resta**: el doble de $91.262,55 sería $182.525,10, no $198.961,05.
 *
 * Lo que pasaba de verdad: cuatro comisiones no tenían color de relleno y quedaron
 * afuera sin que nadie lo notara — HubSpot de agosto y noviembre ($51.000 cada una) y
 * Atom Chat de agosto y noviembre ($2.849,25 cada una). Justo $107.698,50, que es
 * exactamente lo que faltaba para llegar a los $198.961,05 que declara el documento.
 * Más de la mitad del año no estaba en el sistema.
 *
 * Las de Atom Chat son peores que las sin color: traen `FFF6F8F9`, un blanco roto que
 * NO está en la leyenda y que a simple vista es blanco. Por eso ahora **toda celda con
 * monto entra**, y el color solo decide el ESTADO. Un color desconocido se declara en
 * pantalla en vez de hacer desaparecer la plata.
 *
 * ── CÓMO SE LEE LA HOJA ─────────────────────────────────────────────────────────
 * Fila 1: los encabezados de quincena, que son FECHAS con año basura de plantilla
 *   (2022/2025) — se toman el día y el mes, y el año lo declara `--anio`.
 * Filas 3, 5, 7, 9: un aliado por fila (HubSpot · Atom Chat · Cooby · Nua talk).
 * Fila 11: totales por columna · Fila 12: acumulado. **Ninguna de las dos se lee** —
 *   la 12 es la que confundió a la versión anterior.
 * El color de la celda dice el estado, con el mismo código que las facturaciones:
 *   verde FF42E4B3 → COBRADO · amarillo FFFFFF00 → POR_COBRAR (facturada, sin entrar)
 *   sin color / blanco → POR_COBRAR (todavía no toca)
 *
 * ⚠ Las 3 hojas OCULTAS del archivo son de un año anterior (otro roster, otras
 * tarjetas, HubSpot a $300) y NO se cargan.
 *
 * `clientId` queda null: ninguno de los aliados existe como Client (el único ALIADO de
 * la cartera es 4am Saatchi). El partner vive como string — para eso la FK es opcional.
 *
 * Idempotente por (partner, fecha): re-correrlo actualiza el monto y el estado.
 *
 * Uso:
 *   npx tsx scripts/import-comisiones-partner.ts --anio=2026
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/import-comisiones-partner.ts --anio=2026 --apply
 */
import ExcelJS from "exceljs";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const REGISTRADO_POR = "import:comisiones-2026";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const FILE = opt("file") ?? "C:/Users/ideli/Downloads/Copia de Comisiones 2026 para Nexus.xlsx";
const ANIO = opt("anio");
const HOJA = "Comisiones Smarteam";

/** Las filas de aliado. El resto de la hoja son totales y acumulados. */
const FILAS_ALIADO = [3, 5, 7, 9];

const COLOR_COBRADO = "FF42E4B3"; // verde
const COLOR_FACTURADO = "FFFFFF00"; // amarillo
/** Blancos: los dos del estándar más el `FFF6F8F9` que esta hoja usa en Atom Chat. */
const BLANCOS = new Set(["FFFFFFFF", "FFFFFF", "FFF6F8F9"]);

interface Fila {
  partner: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: "COBRADO" | "POR_COBRAR";
  celda: string;
  colorCrudo: string | null;
  colorDesconocido: boolean;
}

const letraCol = (c: number) => {
  let s = "";
  let n = c;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** El relleno de una celda, mirando fgColor y bgColor (varía según el patrón). */
function rellenoDe(cell: ExcelJS.Cell): string | null {
  const f = cell.fill as { type?: string; fgColor?: { argb?: string }; bgColor?: { argb?: string } } | undefined;
  if (!f || f.type !== "pattern") return null;
  return f.fgColor?.argb ?? f.bgColor?.argb ?? null;
}

/** El número de una celda, resolviendo la fórmula por su resultado cacheado. */
function montoDe(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

async function main() {
  const apply = resolverApply();
  if (!ANIO || !/^\d{4}$/.test(ANIO)) {
    console.error(`\n✗ Falta --anio=YYYY. Los encabezados de la hoja traen años de plantilla (2022/2025),`);
    console.error(`  así que el año real lo tiene que declarar una persona.`);
    process.exitCode = 1;
    return;
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet(HOJA);
  if (!ws) throw new Error(`No encuentro la pestaña "${HOJA}" en ${FILE}`);

  // ── Encabezado: columna → fecha ─────────────────────────────────────────────
  const fechaPorColumna = new Map<number, string>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, c) => {
    const v = cell.value;
    if (!(v instanceof Date)) return;
    const mes = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(v.getUTCDate()).padStart(2, "0");
    fechaPorColumna.set(c, `${ANIO}-${mes}-${dia}`);
  });
  console.log(`\nHoja "${HOJA}": ${fechaPorColumna.size} quincenas en el encabezado.`);

  // ── Las filas de aliado ─────────────────────────────────────────────────────
  const filas: Fila[] = [];
  const desconocidos: string[] = [];
  for (const r of FILAS_ALIADO) {
    const row = ws.getRow(r);
    const partner = String(row.getCell(1).value ?? "").trim();
    if (!partner) continue;
    for (const [c, fecha] of fechaPorColumna) {
      const cell = row.getCell(c);
      const monto = montoDe(cell);
      // Un cero no es una comisión: es una columna vacía (el caso de Nua talk).
      if (monto === null || monto <= 0) continue;
      const argb = rellenoDe(cell);
      const up = argb?.toUpperCase() ?? null;
      const esBlanco = up === null || BLANCOS.has(up);
      const conocido = esBlanco || up === COLOR_COBRADO || up === COLOR_FACTURADO;
      if (!conocido) desconocidos.push(`${letraCol(c)}${r} (${partner}, ${argb})`);
      filas.push({
        partner,
        concepto: `Comisión quincena ${fecha.slice(8)}-${fecha.slice(5, 7)}`,
        monto,
        fecha,
        // Solo el VERDE afirma que la plata entró. Todo lo demás —amarillo, blanco, sin
        // color, o un color que no conocemos— es plata que todavía se espera.
        estado: up === COLOR_COBRADO ? "COBRADO" : "POR_COBRAR",
        celda: `${letraCol(c)}${r}`,
        colorCrudo: argb,
        colorDesconocido: !conocido,
      });
    }
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.partner.localeCompare(b.partner));

  const total = filas.reduce((s, f) => s + f.monto, 0);
  const cobrado = filas.filter((f) => f.estado === "COBRADO").reduce((s, f) => s + f.monto, 0);
  console.log(`${filas.length} comisiones · USD ${total.toFixed(2)} (cobrado ${cobrado.toFixed(2)})\n`);
  for (const f of filas) {
    const marca = f.estado === "COBRADO" ? "✓ cobrada " : "· esperada";
    console.log(
      `  ${marca} ${f.partner.padEnd(12)} ${f.fecha}  USD ${f.monto.toFixed(2).padStart(10)}  ${f.celda}` +
        (f.colorDesconocido ? `  ⚠ color ${f.colorCrudo} fuera de la leyenda` : ""),
    );
  }

  // Control contra el propio documento: la celda del total anual.
  const totalDoc = montoDe(ws.getCell("AL12"));
  if (totalDoc !== null) {
    const dif = Math.abs(totalDoc - total);
    console.log(
      `\n  El documento declara USD ${totalDoc.toFixed(2)} en AL12 · leído ${total.toFixed(2)} · diferencia ${dif.toFixed(2)}` +
        (dif < 0.02 ? "  ✓ cuadra" : "  ⚠ NO cuadra: revisar antes de aplicar"),
    );
  }
  if (desconocidos.length > 0) {
    console.log(`\n  ⚠ ${desconocidos.length} celda(s) con un color fuera de la leyenda: ${desconocidos.join(", ")}`);
    console.log(`    Entran igual, como plata esperada. Un color raro no puede borrar una comisión.`);
  }

  const { prisma, close } = createScriptDb();
  try {
    let altas = 0;
    let actualizadas = 0;
    let iguales = 0;
    for (const f of filas) {
      const fecha = new Date(`${f.fecha}T00:00:00Z`);
      const existente = await prisma.comisionPartner.findFirst({
        where: { partner: f.partner, fecha },
        select: { id: true, monto: true, estado: true },
      });
      if (!existente) {
        altas++;
        if (apply) {
          await prisma.comisionPartner.create({
            data: {
              partner: f.partner,
              concepto: f.concepto,
              monto: f.monto,
              moneda: "USD",
              fecha,
              estado: f.estado,
              // INV20: un COBRADO sin firma es una violación. La firma dice de dónde
              // salió la afirmación — el Excel, no una persona mirando el banco.
              ...(f.estado === "COBRADO"
                ? { fechaCobro: fecha, confirmadoPor: REGISTRADO_POR, confirmadoEn: new Date() }
                : {}),
              registradoPor: REGISTRADO_POR,
              notas: `Del Excel de comisiones ${ANIO}, celda ${f.celda}. La fecha es la quincena del documento, no dato bancario.`,
            },
          });
        }
        continue;
      }
      if (Number(existente.monto) === f.monto && existente.estado === f.estado) {
        iguales++;
        continue;
      }
      actualizadas++;
      if (apply) {
        await prisma.comisionPartner.update({
          where: { id: existente.id },
          data: {
            monto: f.monto,
            estado: f.estado,
            ...(f.estado === "COBRADO"
              ? { fechaCobro: fecha, confirmadoPor: REGISTRADO_POR, confirmadoEn: new Date() }
              : { fechaCobro: null, confirmadoPor: null, confirmadoEn: null }),
          },
        });
      }
    }

    console.log(`\n  ${altas} nueva(s) · ${actualizadas} actualizada(s) · ${iguales} sin cambio`);
    if (!apply) {
      console.log(`\n(dry-run — no se escribió nada. Agregá --apply para cargar.)`);
    } else {
      const enDb = await prisma.comisionPartner.aggregate({ _sum: { monto: true }, _count: true });
      console.log(`  ✓ En la base ahora: ${enDb._count} comisiones · USD ${Number(enDb._sum.monto ?? 0).toFixed(2)}`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
