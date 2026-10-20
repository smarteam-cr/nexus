/**
 * scripts/validar-guias.ts — SOLO LECTURA y SIN CLAUDE. ¿La guía de exploración saca lo correcto? (pasada de validación
 * del 2026-10-19, docs/validacion-2026-10-19.md › área 4). Igual que ver-guia-del-proyecto.ts, pero para la preventa y
 * para los proyectos, con chequeos:
 *   · «Lo que ya sabemos»: de qué fuentes sale (en un proyecto nunca el test) y cuántas líneas;
 *   · cada pregunta que ve el CSE o el vendedor: si vuelve a preguntar lo que el cliente ya dijo (`repiteLoSabido`, la
 *     misma regla del pedido), si tiene ⓘ cuando el tema tiene algo sabido, voseo, y el total.
 * ⚠ Imprime palabras de clientes: no sale de la PC.
 *
 *   npx tsx scripts/validar-guias.ts --cliente "Larce"
 *   npx tsx scripts/validar-guias.ts --cliente "Cemaco"
 */
import "dotenv/config";
import "./lib/permitir-server-only";

// Solo lectura en TODA conexión, también la del pool de la app (contextoParaLaGuia): si algo intentara escribir, la base
// lo rechaza.
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
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
        `select e.id, cl.name as empresa, coalesce(p.name, '(preventa)') as proyecto
           from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId" left join "Project" p on p.id = e."projectId"
          where e."archivadaEn" is null
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
  const { repiteLoSabido } = await import("@/lib/exploraciones/plan-de-la-guia");
  const { voseoEnProsa } = await import("@/lib/ui/voseo-formas");
  const hallazgos: string[] = [];
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
    const preguntas = ordenDeLaConversacion(preguntasDeLaProxima(base).preguntas);
    for (const p of preguntas) {
      console.log(`  · [${p.tipo}] ${p.tema ?? p.para}${p.paso ? ` · ${p.paso}` : ""} — ${p.pregunta}${p.motivo ? `  ⓘ ${p.motivo.de}` : ""}`);
      const saber = ctx.saber;
      if (saber && p.paso && repiteLoSabido(p.pregunta, { para: p.para, paso: p.paso }, saber)) hallazgos.push(`${x.empresa}: repite lo sabido: «${p.pregunta.slice(0, 90)}»`);
      if (saber && (saber.porTema.get(p.para)?.length ?? 0) > 0 && !p.motivo && p.tipo !== "propia") hallazgos.push(`${x.empresa}: «${p.pregunta.slice(0, 70)}» sin ⓘ y el tema ${p.para} tiene algo sabido`);
      const vos = voseoEnProsa(p.pregunta);
      if (vos.length) hallazgos.push(`${x.empresa}: voseo (${vos.join(", ")}) en «${p.pregunta.slice(0, 70)}»`);
    }
    const fuentes = new Set((ctx.saber?.lineas ?? []).map((l) => l.de));
    if (marco.clave === "cs" && [...fuentes].some((f) => /test|diagn[oó]stico de rendimiento/i.test(f))) hallazgos.push(`${x.empresa}: «Lo que ya sabemos» de un proyecto cita el test`);
    console.log(`→ ${preguntas.length} preguntas · ${ctx.saber?.lineas.length ?? 0} líneas de «Lo que ya sabemos»`);
  }
  console.log(`
══ Hallazgos (${hallazgos.length})`);
  for (const h of hallazgos) console.log(`   ✗ ${h}`);
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
