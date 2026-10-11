/**
 * scripts/uso-de-nexus.ts — imprime los datos de «Uso de Nexus»: cuánto de lo que propuso Nexus se usó, se desestimó
 * o venció, por tipo y por módulo (lib/lo-propuesto/uso-server.ts). SOLO LECTURA y sin correos.
 *
 * La conexión nace de solo lectura: cada conexión del pool abre con `default_transaction_read_only=on` (lo mismo que
 * `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, pero desde que abre, sin carrera con la primera consulta), y
 * antes de leer se comprueba. Aunque algo intentara escribir, la base lo rechaza. Por persona no imprime nombres ni correos: solo cuántas personas
 * decidieron algo (la lista por persona es para el panel de dirección, sin ranking).
 *
 * Uso (desde una PC de desarrollo; contra producción solo lee):
 *   npx tsx scripts/uso-de-nexus.ts                    # los últimos 30 días
 *   npx tsx scripts/uso-de-nexus.ts --dias 90
 *   npx tsx scripts/uso-de-nexus.ts --desde 2026-09-01 --hasta 2026-10-01
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createScriptPool } from "./lib/db";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/** Medianoche de Costa Rica de un AAAA-MM-DD. */
const inicioDelDia = (iso: string) => new Date(`${iso}T00:00:00-06:00`);

function columnas(filas: (string | number)[][]): string {
  const anchos = filas[0].map((_, i) => Math.max(...filas.map((f) => String(f[i]).length)));
  return filas.map((f) => f.map((c, i) => (i === 0 ? String(c).padEnd(anchos[i]) : String(c).padStart(anchos[i]))).join("  ")).join("\n");
}

async function main() {
  const desdeArg = arg("--desde");
  const hastaArg = arg("--hasta");
  const dias = Number(arg("--dias") ?? 30);
  if ((desdeArg && !AAAA_MM_DD.test(desdeArg)) || (hastaArg && !AAAA_MM_DD.test(hastaArg)) || !Number.isFinite(dias) || dias <= 0) {
    console.log("Uso: npx tsx scripts/uso-de-nexus.ts [--dias N] [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]");
    process.exit(1);
  }
  const ahora = new Date();
  const hasta = hastaArg ? inicioDelDia(hastaArg) : ahora;
  const desde = desdeArg ? inicioDelDia(desdeArg) : new Date(hasta.getTime() - dias * 86_400_000);

  // ⛔ Ni por error: cada conexión nace de solo lectura y con tope de tiempo (pg lee PGOPTIONS al abrir cada conexión).
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
  const { pool, close } = createScriptPool();
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const prueba = await pool.connect();
    try {
      await prueba.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
      const r = await prueba.query<{ default_transaction_read_only: string }>("SHOW default_transaction_read_only");
      if (r.rows[0]?.default_transaction_read_only !== "on") throw new Error("La conexión no quedó de solo lectura: no se lee nada.");
    } finally {
      prueba.release();
    }
    const { usoDeLoPropuesto } = await import("../lib/lo-propuesto/uso-server");
    const { GUARDA } = await import("../lib/lo-propuesto/tipos");
    const r = await usoDeLoPropuesto({ desde, hasta, ahora, conPersonas: true, db });

    console.log(`\nUso de Nexus · lo que nació entre ${r.desde.slice(0, 10)} y ${r.hasta.slice(0, 10)} (cómo está hoy)\n`);
    const encabezado = ["", "Nacieron", "Pendientes", "Usados", "Desestimados", "Vencidos", "Sin firma", "De antes"];
    console.log(
      columnas([
        [...encabezado, "Guarda"],
        ...r.porTipo.map((t) => {
          const g = GUARDA[t.tipo];
          const guarda = !g.quien ? "no guarda quién" : !g.descarte ? "sin desestimar" : "completa";
          return [t.nombre, t.nacieron, t.pendientes, t.usados, t.desestimados, t.vencidos, t.sinFirma, t.deAntes, guarda];
        }),
      ]),
    );
    console.log("\nPor módulo\n");
    console.log(
      columnas([
        encabezado,
        ...r.porModulo.map((m) => [m.nombre, m.nacieron, m.pendientes, m.usados, m.desestimados, m.vencidos, m.sinFirma, m.deAntes]),
        ["Total", r.total.nacieron, r.total.pendientes, r.total.usados, r.total.desestimados, r.total.vencidos, r.total.sinFirma, r.total.deAntes],
      ]),
    );
    const personas = r.porPersona?.length ?? 0;
    console.log(`\n${personas} ${personas === 1 ? "persona decidió" : "personas decidieron"} algo de lo que nació en la ventana (sin nombres: la lista va en el panel de dirección).`);
    console.log("«De antes» = decisiones de la ventana sobre lo que nació antes; no entran a los demás números.\n");
  } finally {
    await db.$disconnect().catch(() => {});
    await close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
