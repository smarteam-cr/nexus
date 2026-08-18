/**
 * scripts/cargar-tipo-cambio.ts
 *
 * Carga (o corrige) el tipo de cambio de uno o de los doce meses de un año.
 *
 * POR QUÉ EXISTE: es el único dato que autoriza a mezclar colones con dólares, y sin él
 * el reporte anual de equilibrio deja la planilla en colones FUERA de los totales — o
 * sea, un piso creíble y bajísimo. Mientras no exista la pantalla para editarlo, esta es
 * la vía; cuando exista, este script sigue sirviendo para la carga inicial del año.
 *
 * ⚠ La `fuente` es OBLIGATORIA y va en texto libre a propósito: un número de conversión
 * sin procedencia no se puede auditar ni discutir. "500" no dice nada; "el TC único con
 * que Alex arma la hoja de egresos 2026" sí.
 *
 * Idempotente por período: re-correrlo ACTUALIZA la tasa del mes, no duplica.
 *
 * Uso:
 *   npx tsx scripts/cargar-tipo-cambio.ts --anio=2026 --tasa=500 --fuente="..."   (dry-run)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/cargar-tipo-cambio.ts --anio=2026 --tasa=500 --fuente="..." --apply
 *   ... --periodo=2026-08   para tocar UN solo mes
 */
import "dotenv/config";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const { prisma, close } = createScriptDb();

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const APPLY = resolverApply();
const POR = "script:cargar-tipo-cambio";

const ANIO = opt("anio");
const PERIODO = opt("periodo");
const TASA = opt("tasa");
const FUENTE = opt("fuente");
const NOTAS = opt("notas");

async function main() {
  if (!TASA || !FUENTE) {
    console.error(
      `\n✗ Faltan --tasa=NNN y --fuente="de dónde sale". La fuente no es adorno: es lo que\n` +
        `  hace auditable cada número convertido del reporte.`,
    );
    process.exitCode = 1;
    return;
  }
  const tasa = Number(TASA);
  if (!Number.isFinite(tasa) || tasa <= 50 || tasa >= 5000) {
    console.error(`\n✗ Tasa fuera de rango (${TASA}). Se esperan colones por UN dólar, entre 50 y 5000.`);
    process.exitCode = 1;
    return;
  }

  let periodos: string[];
  if (PERIODO) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(PERIODO)) {
      console.error(`\n✗ --periodo va como YYYY-MM (recibí "${PERIODO}").`);
      process.exitCode = 1;
      return;
    }
    periodos = [PERIODO];
  } else if (ANIO && /^\d{4}$/.test(ANIO)) {
    periodos = Array.from({ length: 12 }, (_, i) => `${ANIO}-${String(i + 1).padStart(2, "0")}`);
  } else {
    console.error(`\n✗ Falta --anio=YYYY (los 12 meses) o --periodo=YYYY-MM (uno solo).`);
    process.exitCode = 1;
    return;
  }

  const existentes = await prisma.tipoCambioMes.findMany({
    where: { periodo: { in: periodos } },
    select: { periodo: true, crcPorUsd: true, fuente: true },
  });
  const previo = new Map(existentes.map((e) => [e.periodo, e]));

  console.log(`\nTipo de cambio a cargar: ₡${tasa} por US$1`);
  console.log(`Fuente declarada: "${FUENTE}"`);
  console.log(`Períodos: ${periodos.length}\n`);
  for (const p of periodos) {
    const antes = previo.get(p);
    const estado = !antes
      ? "nuevo"
      : Number(antes.crcPorUsd) === tasa
        ? "sin cambio"
        : `CAMBIA: ₡${Number(antes.crcPorUsd)} → ₡${tasa}`;
    console.log(`  ${p}  ${estado}`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — no se escribió nada. Agregá --apply para cargar.)`);
    return;
  }

  let nuevos = 0;
  let actualizados = 0;
  for (const periodo of periodos) {
    const antes = previo.get(periodo);
    await prisma.tipoCambioMes.upsert({
      where: { periodo },
      create: {
        periodo,
        crcPorUsd: tasa,
        fuente: FUENTE,
        notas: NOTAS ?? null,
        registradoPor: POR,
        registradoEn: new Date(),
      },
      update: {
        crcPorUsd: tasa,
        fuente: FUENTE,
        ...(NOTAS ? { notas: NOTAS } : {}),
        registradoPor: POR,
        registradoEn: new Date(),
      },
    });
    if (antes) actualizados++;
    else nuevos++;
  }
  console.log(`\n✓ ${nuevos} período(s) nuevos · ${actualizados} actualizado(s).`);
  console.log(`  El reporte de /finanzas/equilibrio ya convierte con esta tasa y la declara en pantalla.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(close);
