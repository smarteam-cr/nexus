/**
 * scripts/comparar-modelo-del-clasificador.ts — ¿el clasificador de reuniones a proyectos decide lo mismo con Haiku 4.5
 * que con Sonnet 4.6? SIN ESCRIBIR NADA (DECISIONS «El gasto de la IA»; la palanca es `MODELO_DEL_CLASIFICADOR` en
 * lib/ai/ahorro.ts).
 *
 * Toma las reuniones más recientes de clientes con DOS o más proyectos a los que se les puede colgar una reunión (con
 * uno solo el clasificador no llama a la IA) y corre `classifySessionToProjects(..., { dryRun: true, modelo })` con
 * cada modelo. Imprime, por reunión, el proyecto principal de cada uno y los secundarios, y al final cuántas
 * coinciden. Sin Wherex: es el cliente de prueba de Nexus y hizo churn.
 *
 * ⚠ LLAMA A CLAUDE dos veces por reunión (≈US$0,03 entre las dos; 30 reuniones ≈ US$1). La conexión nace de SOLO
 * LECTURA: ni el medidor puede anotar (cada intento deja un aviso de consola). El costo que imprime sale del promedio de
 * lo que el clasificador gastó en los últimos 30 días.
 *
 * Uso:
 *   npx tsx scripts/comparar-modelo-del-clasificador.ts            # 30 reuniones
 *   npx tsx scripts/comparar-modelo-del-clasificador.ts --max 10
 *
 * Criterio para cambiar de modelo: el mismo principal en el 95 % o más, y ninguna reunión que Haiku deje sin proyecto
 * cuando Sonnet le encontró uno. Si se cumple, se cambia la línea de lib/ai/ahorro.ts y se despliega.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptDb } from "./lib/db";
import { describirDestino } from "./lib/guard";

/* ⛔ Ni por error: la conexión nace de solo lectura y con tope de tiempo (pg lee PGOPTIONS al abrir cada conexión). */
process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const max = Math.max(1, Number(arg("--max") ?? 30));
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (solo lectura)\n`);
  const { prisma: db, close } = createScriptDb();
  try {
    const { classifySessionToProjects } = await import("@/lib/sessions/classify-session-project");
    const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");
    const { proyectoClasificableWhere } = await import("@/lib/projects/scope");

    const filas = await db.firefliesSession.findMany({
      where: { date: { lte: new Date() }, transcript: { not: null }, OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }] },
      select: { id: true, title: true, date: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
      take: 400,
    });
    const duenos = [...new Set(filas.map((f) => duenoDeLaSesion(f)).filter((x): x is string => !!x))];
    const clientes = new Map((await db.client.findMany({ where: { id: { in: duenos } }, select: { id: true, name: true, kind: true } })).map((c) => [c.id, c]));
    const proyectosPorCliente = new Map<string, number>();
    for (const id of duenos) proyectosPorCliente.set(id, await db.project.count({ where: proyectoClasificableWhere({ clientId: id }) }));

    const promedio = await db.llmCall.groupBy({
      by: ["model"],
      where: { agentSlug: "agent-session-project-classifier", at: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      _avg: { costUsd: true },
    });
    const costoDe = (m: string) => promedio.find((p) => p.model === m)?._avg.costUsd ?? (m === SONNET ? 0.023 : 0.008);

    let comparadas = 0;
    let mismoPrincipal = 0;
    let haikuSinProyecto = 0;
    let mismosVinculos = 0;
    for (const f of filas) {
      if (comparadas >= max) break;
      const dueno = duenoDeLaSesion(f);
      const cliente = dueno ? clientes.get(dueno) : undefined;
      if (!dueno || !cliente || cliente.kind !== "CLIENTE" || /wherex/i.test(cliente.name)) continue;
      if ((proyectosPorCliente.get(dueno) ?? 0) < 2) continue;

      const [s, h] = await Promise.all([
        classifySessionToProjects(f.id, dueno, { dryRun: true, modelo: SONNET }),
        classifySessionToProjects(f.id, dueno, { dryRun: true, modelo: HAIKU }),
      ]);
      if (s.status !== "ok" || h.status !== "ok") {
        console.log(`━━ ${cliente.name} · «${f.title}» · ✗ ${s.status !== "ok" ? `Sonnet: ${s.reason}` : `Haiku: ${h.reason}`}`);
        continue;
      }
      comparadas++;
      const vinculos = (r: typeof s) => (r.proposals ?? []).map((p) => p.projectId).sort().join(",");
      const igualPrincipal = s.primaryProjectId === h.primaryProjectId;
      if (igualPrincipal) mismoPrincipal++;
      if (s.primaryProjectId && !h.primaryProjectId) haikuSinProyecto++;
      if (vinculos(s) === vinculos(h)) mismosVinculos++;
      console.log(
        `${igualPrincipal ? "✓" : "✗"} ${cliente.name} · «${f.title}» · ${f.date.toISOString().slice(0, 10)}\n` +
          `   Sonnet: ${s.primaryProjectId ?? "sin proyecto"} (${(s.proposals ?? []).length} vínculo/s) · Haiku: ${h.primaryProjectId ?? "sin proyecto"} (${(h.proposals ?? []).length} vínculo/s)`,
      );
    }
    const pct = (n: number) => (comparadas ? `${Math.round((n / comparadas) * 100)} %` : "—");
    console.log(
      `\nTotal: ${comparadas} reunión(es) · mismo principal en ${mismoPrincipal} (${pct(mismoPrincipal)}) · mismos vínculos en ${mismosVinculos} (${pct(mismosVinculos)}) · ` +
        `${haikuSinProyecto} que Haiku dejó sin proyecto y Sonnet no.`,
    );
    console.log(`Costo por reunión: Sonnet ≈US$${costoDe(SONNET).toFixed(4)} · Haiku ≈US$${costoDe(HAIKU).toFixed(4)} (promedios de 30 días).`);
    console.log("No se escribió nada. Para cambiar el modelo: MODELO_DEL_CLASIFICADOR en lib/ai/ahorro.ts.");
  } finally {
    await close();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect().catch(() => undefined);
  });
