/**
 * scripts/medir-motivos-sin-texto.ts — SOLO LECTURA. Por qué no dejaron texto las reuniones de los últimos 90 días (T4):
 * cuántas hay de cada motivo y cuántas cambiarían el que tienen guardado. No escribe nada: el motivo lo guarda el job
 * `reuniones-motivos` (cada 10 minutos, desde el deploy), y INV52 vigila que esté.
 *
 * Uso:
 *   npx tsx scripts/medir-motivos-sin-texto.ts
 *   npx tsx scripts/medir-motivos-sin-texto.ts --dias 14
 *
 * ⚠ Después del SQL (sin él, la columna del motivo no existe y el script lo dice).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino } from "./lib/guard";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const dias = Math.max(1, Number(arg("--dias") ?? 90));
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (solo lectura)\n`);
  const { guardarMotivosSinTexto, hayColumnaDelMotivo } = await import("@/lib/sessions/motivo-sin-texto-server");
  const { DE_QUIEN_ES } = await import("@/lib/google/por-que-falta");
  const { prisma } = await import("@/lib/db/prisma");
  try {
    if (!(await hayColumnaDelMotivo())) {
      console.error("⛔ A la base le falta scripts/sql/2026-10-25-reuniones-parte-2.sql.");
      process.exitCode = 1;
      return;
    }
    const r = await guardarMotivosSinTexto({ dias, simulacro: true });
    console.log(`Reuniones de los últimos ${dias} días: ${r.miradas}`);
    console.log(`  recibirían un motivo nuevo (o distinto del guardado): ${r.escritas}`);
    console.log(`  perderían el que tenían (ya tienen texto): ${r.borradas}`);
    console.log("\nSin texto, por motivo:");
    for (const [m, n] of Object.entries(r.porMotivo).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) {
      console.log(`  ${String(n).padStart(5)}  ${m} — ${DE_QUIEN_ES[m as keyof typeof DE_QUIEN_ES]?.texto ?? ""}`);
    }
    console.log("\nSolo lectura: el motivo lo guarda el job reuniones-motivos.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
