/**
 * scripts/traer-tipo-de-cambio.ts — trae el tipo de cambio del BCCR, día por día, y lo guarda en `TipoCambioDia`
 * (2026-10-05). Es lo mismo que hace el job diario `tipo-cambio-daily`; sirve para la primera carga del histórico (desde
 * 2023) y para volver a pedir un rango.
 *
 * De dónde: el servicio del BCCR si hay `BCCR_TOKEN` en el .env (cualquier rango); si no, el API de Hacienda (sin token:
 * el histórico cuando responde, y siempre la tasa de hoy). Solo agrega o corrige tasas: no toca ningún monto.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/traer-tipo-de-cambio.ts                                   (mira: qué hay y qué falta, sin escribir)
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/traer-tipo-de-cambio.ts --apply
 *   ... --desde=2025-01-01 --hasta=2025-12-31   para volver a pedir un rango
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "../lib/db/prisma";
import { sincronizarTipoDeCambio } from "../lib/finanzas/tipo-cambio-server";
import { DIAS_HACIA_ATRAS, TIPO_CAMBIO_DESDE, sumarDias } from "../lib/finanzas/tipo-cambio";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const desde = opt("desde");
  const hasta = opt("hasta");
  if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) {
    console.error("\n✗ --desde y --hasta van como YYYY-MM-DD.");
    process.exitCode = 1;
    return;
  }
  const [cuantos, primera, ultima] = await Promise.all([
    prisma.tipoCambioDia.count(),
    prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "asc" }, select: { fecha: true } }),
    prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" }, select: { fecha: true } }),
  ]);
  console.log(`\nGuardados: ${cuantos} día(s)${primera ? `, del ${primera.fecha} al ${ultima!.fecha}` : ""}.`);
  console.log(`Fuente: ${process.env.BCCR_TOKEN?.trim() ? "el servicio del BCCR (hay token)" : "el API de Hacienda (sin token del BCCR)"}.`);
  console.log(`Rango a pedir: ${desde ?? (primera && primera.fecha <= sumarDias(TIPO_CAMBIO_DESDE, DIAS_HACIA_ATRAS) ? "desde 3 días antes del último" : TIPO_CAMBIO_DESDE)} a ${hasta ?? "hoy"}.`);

  if (!resolverApply()) {
    console.log("\n(solo mirar — no se pidió ni se escribió nada. Agrega --apply para traer y guardar.)");
    return;
  }
  const r = await sincronizarTipoDeCambio({ desde, hasta });
  console.log(`\n${r.ok ? "✓" : "✗"} ${r.nuevos} día(s) nuevos, ${r.corregidos} corregidos · fuente: ${r.fuente ?? "ninguna"} · ${r.desde} a ${r.hasta}`);
  if (r.faltaHistorico) console.log("  ⚠ Todavía falta el histórico desde 2023: hace falta BCCR_TOKEN o que vuelva el histórico de Hacienda.");
  for (const a of r.avisos) console.log(`  · ${a}`);
  if (!r.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
