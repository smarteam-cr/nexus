/**
 * scripts/medir-guia-de-preventa.ts — la guía de la preventa, la de antes contra la nueva (iniciativa A). NO ESCRIBE.
 *
 * Rearma en SECO la guía de la próxima sesión de unas preventas con test (Distribuidora Larce siempre, más las que se
 * pidan) con el mismo camino que el botón «Actualizar la guía» (lib/exploraciones/agente.ts › `armarLaGuiaSinGuardar`):
 * lo que ya sabemos, el plan, el pedido al agente, el filtro de lo que repite y la de respaldo. No guarda la guía: Elías
 * la rearma desde la pantalla. Deja el antes y el después, una al lado de la otra, en backups/<fecha>-preventa-guia/
 * (gitignoreado). ⚠ Lleva palabras de clientes: no sale de la PC.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Nada en la base, salvo la telemetría de `LlmCall` que anota el cliente de Anthropic, a nombre de --por (cuenta
 *     contra el presupuesto humano). Las preventas se eligen con una conexión de SOLO LECTURA.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: una llamada por preventa (dos si sale voseo), unos US$0,05 cada una.
 *
 *   npx tsx scripts/medir-guia-de-preventa.ts --por egonzalez@smarteamcr.com             # Larce y 3 más con test
 *   npx tsx scripts/medir-guia-de-preventa.ts --por egonzalez@smarteamcr.com --mas 0     # solo Larce
 *   npx tsx scripts/medir-guia-de-preventa.ts --por … --id <exploracionId>               # una en particular
 *
 * Wherex queda fuera siempre (hizo churn y es el cliente de prueba de Nexus).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptPool } from "./lib/db";

// El pool de la app (lo usan la lectura de la escala y el medidor) con tope chico: el pooler se comparte (RUNBOOK #3).
process.env.DB_POOL_MAX ??= "2";

const LARCE = "cmvbcuvcs016706t1xcny5pss";
const EXCLUIDOS_POR_NOMBRE = /wherex/i;

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const POR = (arg("--por") ?? "").trim().toLowerCase();
const MAS = Math.max(0, Number(arg("--mas") ?? 3) || 0);
const UNA = arg("--id");

interface Elegida {
  id: string;
  empresa: string;
}

async function elegir(): Promise<Elegida[]> {
  const { pool, close } = createScriptPool();
  try {
    const c = await pool.connect();
    try {
      await c.query("SET default_transaction_read_only = on");
      const ids = UNA ? [UNA] : [LARCE];
      const una = await c.query<{ id: string; empresa: string }>(
        `select e.id, cl.name as empresa from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId" where e.id = any($1)`,
        [ids],
      );
      if (UNA || MAS === 0) return una.rows;
      const otras = await c.query<{ id: string; empresa: string }>(
        `select e.id, cl.name as empresa
           from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId"
          where e."projectId" is null and e."archivadaEn" is null and e.id <> $1
            and jsonb_array_length(coalesce(e.test->'tests', '[]'::jsonb)) > 0
          order by e."updatedAt" desc limit 20`,
        [LARCE],
      );
      return [...una.rows, ...otras.rows.filter((r) => !EXCLUIDOS_POR_NOMBRE.test(r.empresa)).slice(0, MAS)];
    } finally {
      c.release();
    }
  } finally {
    await close();
  }
}

async function main() {
  if (!POR.includes("@")) {
    console.error("Falta --por <tu correo>: la llamada a Claude se anota a tu nombre, contra el presupuesto humano.");
    process.exit(1);
  }
  const elegidas = (await elegir()).filter((e) => !EXCLUIDOS_POR_NOMBRE.test(e.empresa));
  console.log(`Preventas: ${elegidas.map((e) => e.empresa).join(" · ") || "(ninguna)"}`);

  const { armarLaGuiaSinGuardar } = await import("@/lib/exploraciones/agente");
  const { leerPropuesta } = await import("@/lib/exploraciones/esquemas");
  const { prisma } = await import("@/lib/db/prisma");
  const { QUE_BUSCA_CADA_PASO } = await import("@/lib/exploraciones/plan-de-la-guia");

  const dia = new Date().toISOString().slice(0, 10);
  const carpeta = join("backups", `${dia}-preventa-guia`);
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  const resumen: string[] = [`# La guía de la preventa: antes y ahora (${dia})`, "", "| Preventa | Antes | Ahora | Lo que ya sabemos |", "|---|---|---|---|"];

  try {
    for (const e of elegidas) {
      process.stdout.write(`· ${e.empresa}… `);
      const fila = await prisma.exploracionDeVenta.findUnique({ where: { id: e.id }, select: { propuesta: true } });
      const antes = leerPropuesta(fila?.propuesta).guia;
      const armada = await armarLaGuiaSinGuardar(null, e.id, { triggeredByEmail: POR });
      if (!armada) {
        console.log("el agente no devolvió nada que sirva");
        continue;
      }
      const { ctx, guia, preguntas } = armada;
      const md: string[] = [`# ${e.empresa}`, "", `Exploración ${e.id} · próxima sesión: la ${ctx.proxima.numero}${ctx.proxima.titulo ? ` («${ctx.proxima.titulo}»)` : ""}`, ""];

      md.push("## Antes (la guía guardada)", "");
      if (!antes) md.push("(no tenía guía armada: se veía la de base)", "");
      else {
        md.push(`Armada el ${antes.en.slice(0, 10)} · ${antes.preguntas.length} preguntas, ${antes.preguntas.reduce((n, p) => n + p.repreguntas.length, 0)} repreguntas.`, "");
        antes.preguntas.forEach((p, i) => {
          md.push(`${i + 1}. **[${p.para}]** ${p.pregunta}`);
          for (const r of p.repreguntas) md.push(`   - ${r}`);
        });
        md.push("", `Cierre: ${antes.cierre ?? "(el de base)"}`, "");
      }

      md.push("## Ahora", "", "### Lo que ya sabemos", "");
      const lineas = ctx.saber?.lineas ?? [];
      if (!lineas.length) md.push("(nada del cliente todavía)");
      for (const l of lineas) md.push(`- **[${l.para}]** ${l.origen === "resumen" ? l.texto : `«${l.texto}»`} — ${l.de}`);
      md.push("", `### La guía (${preguntas.length} preguntas, como la ve el vendedor)`, "");
      preguntas.forEach((p, i) => {
        const delAgente = guia.preguntas.some((q) => q.para === p.para && q.pregunta === p.pregunta);
        md.push(`${i + 1}. **[${p.para}${p.paso ? ` · ${QUE_BUSCA_CADA_PASO[p.paso]}` : ""}]** ${p.pregunta}${delAgente ? "" : " _(de respaldo: el agente la repitió o no la escribió)_"}`);
        for (const r of p.repreguntas) md.push(`   - (plegada) ${r}`);
      });
      md.push("", `Cierre: «¿Hay algo que no hayamos hablado y que deba saber para proponerte el primer paso?» ${guia.cierre ?? ""}`);
      if (ctx.faltanAlCerrar?.length) md.push(`Si no salió: ${ctx.faltanAlCerrar.join(", ")}.`);
      md.push("", `Objetivo sugerido: ${guia.objetivo ?? "(ninguno)"}`, "");

      const archivo = `${e.empresa.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.md`;
      writeFileSync(join(carpeta, archivo), md.join("\n"));
      resumen.push(`| ${e.empresa} | ${antes ? `${antes.preguntas.length} preguntas` : "de base"} | ${preguntas.length} preguntas | ${lineas.length} líneas |`);
      console.log(`listo → ${archivo}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
  writeFileSync(join(carpeta, "resumen.md"), resumen.join("\n"));
  console.log(`\nEl antes y el después quedaron en ${carpeta}. No se guardó ninguna guía.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
