/**
 * scripts/restore-project-tags-from-runs.ts — DRY-RUN por default.
 *
 * Repara el daño del bug de tags (2026-07-24): el sync de HubSpot escribía
 * `tags: hubTag ? [hubTag] : []` (REEMPLAZO), así que todo proyecto cuyo nombre no
 * matcheara el catálogo de `inferServiceMapping` quedaba con `tags: []` en cada sync,
 * borrando lo que el agente de handoff había clasificado.
 *
 * El código ya está arreglado (`mergeHubTag`, aditivo), pero los proyectos ya vaciados
 * NO se recuperan solos: habría que re-correr el handoff de cada uno (caro, y re-escribe
 * el documento). Esta restauración es barata y no toca nada más.
 *
 * De dónde sale el dato: `AgentRun.output` del handoff guarda los tags que el agente
 * emitió en cada corrida — se perdieron del proyecto, no del historial.
 *
 * ADITIVO como el resto del sistema: une lo emitido con lo que el proyecto tenga HOY.
 * Nunca quita un tag (si el CSE borró uno a propósito y el agente lo había emitido,
 * vuelve — es el precio de restaurar sin poder distinguir "borrado a mano" de "borrado
 * por el bug"; se revisa en la tira, que es un clic).
 *
 *   npx tsx scripts/restore-project-tags-from-runs.ts            # dry-run
 *   npx tsx scripts/restore-project-tags-from-runs.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import { sanitizeTags } from "../lib/tags/catalog";

const APPLY = resolverApply();
const HANDOFF_AGENT_ID = "cmmla1g1x00005wijix3qnr7u";

const { prisma, close } = createScriptDb();

async function main() {
  // Corridas del handoff, de la MÁS RECIENTE a la más vieja: para cada proyecto nos
  // quedamos con la primera que traiga tags (la clasificación vigente del agente).
  const runs = await prisma.agentRun.findMany({
    where: { agentId: HANDOFF_AGENT_ID, status: "DONE", projectId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { projectId: true, createdAt: true, output: true },
  });

  const emitidoPorProyecto = new Map<string, { tags: string[]; cuando: Date }>();
  for (const r of runs) {
    if (!r.projectId || emitidoPorProyecto.has(r.projectId)) continue;
    let tags: string[] = [];
    try {
      // `output` se guarda como STRING JSON; toleramos cualquier forma sin romper.
      const parsed = typeof r.output === "string" ? JSON.parse(r.output) : r.output;
      tags = sanitizeTags((parsed as { tags?: unknown } | null)?.tags);
    } catch {
      continue; // output corrupto/truncado → esa corrida no sirve, seguimos con la anterior
    }
    if (tags.length) emitidoPorProyecto.set(r.projectId, { tags, cuando: r.createdAt });
  }

  const proyectos = await prisma.project.findMany({
    where: { id: { in: [...emitidoPorProyecto.keys()] } },
    select: { id: true, name: true, tags: true, client: { select: { name: true } } },
  });

  const cambios: Array<{ id: string; etiqueta: string; antes: string[]; despues: string[] }> = [];
  for (const p of proyectos) {
    const emitido = emitidoPorProyecto.get(p.id)!;
    const actual = sanitizeTags(p.tags);
    const next = [...actual];
    for (const t of emitido.tags) if (!next.includes(t)) next.push(t);
    if (JSON.stringify(next) !== JSON.stringify(p.tags)) {
      cambios.push({
        id: p.id,
        etiqueta: `${p.client?.name ?? "?"} / ${p.name}`,
        antes: p.tags,
        despues: next,
      });
    }
  }

  console.log(`Proyectos con clasificación del handoff en el historial: ${proyectos.length}`);
  console.log(`Proyectos a restaurar: ${cambios.length}\n`);
  for (const c of cambios) {
    console.log(`  ${c.etiqueta}`);
    console.log(`    antes:   ${JSON.stringify(c.antes)}`);
    console.log(`    después: ${JSON.stringify(c.despues)}`);
  }

  if (!APPLY) {
    console.log(`\n(DRY-RUN — nada se escribió. Correr con --apply para aplicar.)`);
    return;
  }
  for (const c of cambios) {
    await prisma.project.update({ where: { id: c.id }, data: { tags: c.despues } });
  }
  console.log(`\n✅ ${cambios.length} proyecto(s) actualizado(s).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => close());
