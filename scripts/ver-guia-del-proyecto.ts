/**
 * scripts/ver-guia-del-proyecto.ts — qué muestra la guía de la próxima sesión de la exploración de un PROYECTO (Customer
 * Success) con las mejoras de la preventa (2026-10-19). NO ESCRIBE y NO LLAMA A CLAUDE.
 *
 * Arma, con el mismo camino que la pantalla y el asistente (lib/exploraciones/guia-ajustes-server.ts ›
 * `preguntasDeLaProxima`), «Lo que ya sabemos», el plan por pasos, si la guía guardada es de antes del plan (y entonces se
 * sigue viendo como se armó) y las preguntas que ve el CSE, con su paso y la ⓘ. Así se puede revisar en seco qué cambia
 * en una exploración real antes de que alguien toque «Actualizar la guía». ⚠ Imprime palabras de clientes: no sale de la PC.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/ver-guia-del-proyecto.ts                       # las 5 exploraciones de proyecto más recientes
 *   npx tsx scripts/ver-guia-del-proyecto.ts --cliente "Noelito"   # las de un cliente (por nombre)
 *   npx tsx scripts/ver-guia-del-proyecto.ts --id <exploracionId>  # una en particular
 *
 * Wherex queda fuera siempre (hizo churn y es el cliente de prueba de Nexus).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptPool } from "./lib/db";

// El pool de la app (lo usa la lectura de la escala y de la memoria) con tope chico: el pooler se comparte (RUNBOOK #3).
process.env.DB_POOL_MAX ??= "2";

const EXCLUIDOS_POR_NOMBRE = /wherex/i;

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}

async function elegir(): Promise<{ id: string; empresa: string; proyecto: string }[]> {
  const { pool, close } = createScriptPool();
  try {
    const c = await pool.connect();
    try {
      await c.query("SET default_transaction_read_only = on");
      const id = arg("--id");
      const cliente = arg("--cliente");
      const r = await c.query<{ id: string; empresa: string; proyecto: string }>(
        `select e.id, cl.name as empresa, p.name as proyecto
           from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId" join "Project" p on p.id = e."projectId"
          where e."projectId" is not null and e."archivadaEn" is null
            and ($1::text is null or e.id = $1) and ($2::text is null or cl.name ilike '%' || $2 || '%')
          order by e."updatedAt" desc limit 20`,
        [id, cliente],
      );
      return r.rows.filter((x) => !EXCLUIDOS_POR_NOMBRE.test(x.empresa)).slice(0, id || cliente ? 20 : 5);
    } finally {
      c.release();
    }
  } finally {
    await close();
  }
}

async function main() {
  const { contextoParaLaGuia } = await import("@/lib/exploraciones/agente");
  const { preguntasDeLaProxima } = await import("@/lib/exploraciones/guia-ajustes-server");
  const { guiaDeAntesDelPlan, QUE_BUSCA_CADA_PASO } = await import("@/lib/exploraciones/plan-de-la-guia");
  const { ordenDeLaConversacion } = await import("@/lib/exploraciones/guia");
  const elegidas = await elegir();
  if (!elegidas.length) {
    console.log("No hay exploraciones de proyecto que coincidan.");
    return;
  }
  for (const x of elegidas) {
    const base = await contextoParaLaGuia(x.id);
    const { estado, ctx, marco } = base;
    const sesionId = ctx.proxima.sesionId ?? null;
    const guia = (sesionId ? estado.propuesta.guias[sesionId] : null) ?? estado.propuesta.guia;
    const antes = guiaDeAntesDelPlan(guia, marco.clave);
    console.log(`\n══ ${x.empresa} · ${x.proyecto} (${x.id}) · marco ${marco.clave} · sesión ${ctx.proxima.numero}`);
    console.log(`Guía guardada: ${guia ? `del ${guia.en.slice(0, 10)}, ${guia.preguntas.length} preguntas, ${guia.loVendido?.length ?? 0} de lo vendido` : "ninguna (la de base)"}`);
    console.log(antes ? "→ Es de ANTES del plan: se sigue viendo como se armó, y el estado pide «Actualizar la guía»." : "→ Se ve con el plan.");
    console.log("\nLo que ya sabemos:");
    for (const l of ctx.saber?.lineas ?? []) console.log(`  · ${l.para}: «${l.texto.slice(0, 120)}» — ${l.de}`);
    if (!ctx.saber?.lineas.length) console.log("  (nada todavía: el cliente no dijo nada citado en el proyecto)");
    console.log("\nEl plan (lo que pediría «Actualizar la guía»):");
    for (const p of ctx.plan ?? []) console.log(`  · ${p.para} · ${p.paso} (${QUE_BUSCA_CADA_PASO[p.paso]})${p.motivo ? ` · parte de ${p.motivo.slice(0, 100)}` : ""}`);
    if (ctx.faltanAlCerrar?.length) console.log(`Al cerrar pide: ${ctx.faltanAlCerrar.join(", ")}`);
    console.log("\nLo que ve hoy el CSE:");
    for (const p of ordenDeLaConversacion(preguntasDeLaProxima(base).preguntas)) {
      console.log(`  · [${p.tipo}] ${p.tema ?? p.para}${p.paso ? ` · ${p.paso}` : ""} — ${p.pregunta}${p.motivo ? `  ⓘ ${p.motivo.de}` : ""}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect().catch(() => undefined);
    process.exit();
  });
