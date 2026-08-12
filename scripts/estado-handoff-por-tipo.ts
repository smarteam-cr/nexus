/**
 * scripts/estado-handoff-por-tipo.ts — PRENDER/APAGAR los dos agentes de handoff por tipo.
 *
 * ── POR QUÉ EXISTE (auditoría pre-push, 2026-08-08) ─────────────────────────
 * Los seeds corrieron ANTES del deploy del resolver — el orden exacto que la migración de
 * `pipelineKey` decía evitar. Mientras prod corra el código viejo (findFirst sin orderBy ni
 * status sobre el grupo handoff), con 3 filas ACTIVE una Implementación puede recibir el
 * prompt de Desarrollo o Sitios web al regenerar, sin error y sin log. Y además los 2 nuevos
 * aparecen como bloques en la pantalla de etapa 1 de cualquier proyecto.
 *
 * La mitigación reversible: DRAFT hasta el deploy (el resolver nuevo filtra por ACTIVE, así
 * que reactivar es un update de status, no un re-seed — el prompt no se toca).
 *
 * Uso:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/estado-handoff-por-tipo.ts --apply --estado DRAFT
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/estado-handoff-por-tipo.ts --apply --estado ACTIVE   # post-deploy
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";

const IDS = ["agent-handoff-development", "agent-handoff-web"];
const APPLY = resolverApply();
const estado = (() => {
  const i = process.argv.indexOf("--estado");
  const v = i >= 0 ? process.argv[i + 1] : "";
  if (v !== "ACTIVE" && v !== "DRAFT") {
    console.error("Falta --estado ACTIVE|DRAFT");
    process.exit(1);
  }
  return v;
})();

async function main() {
  const actuales = await prisma.agent.findMany({
    where: { id: { in: IDS } },
    select: { id: true, status: true },
  });
  for (const a of actuales) console.log(`  ${a.id}: ${a.status} → ${estado}`);
  if (!APPLY) {
    console.log("DRY-RUN. Con --apply se escribe.");
    return;
  }
  const r = await prisma.agent.updateMany({ where: { id: { in: IDS } }, data: { status: estado } });
  console.log(`✓ ${r.count} agente(s) en ${estado}.`);
}

main().finally(() => prisma.$disconnect());
