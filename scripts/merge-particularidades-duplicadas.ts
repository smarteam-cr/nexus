/**
 * scripts/merge-particularidades-duplicadas.ts
 *
 * SANEO de los duplicados ya cargados. Dry-run por default: NO toca nada sin `--apply`.
 *
 * Por qué existen: el agente de avance corría sobre los mismos transcripts sin identidad del hecho
 * (26 corridas en un proyecto real), y cada borrador aceptado creaba filas nuevas del MISMO hecho con
 * redacción distinta. Efecto: el corrimiento se cuenta dos veces (Wherex mostraba 13 semanas, 8 reales).
 * El fix de raíz ya está (huella + fusión en el apply); esto limpia lo que quedó de antes.
 *
 * Criterio de fusión — GANA la fila más informativa:
 *   1. la de MÁS semanas (el impacto mejor cuantificado)
 *   2. a igualdad, la que tiene cita
 *   3. a igualdad, la que tiene atribución más específica (CLIENTE/SMARTEAM/DEV antes que AMBOS)
 *   4. a igualdad, la más reciente
 * La ganadora HEREDA `visibleExternal=true` si CUALQUIERA del grupo era visible (no se le quita al
 * cliente algo que ya veía) y adopta la huella. Las demás se borran.
 *
 * Uso:  npx tsx scripts/merge-particularidades-duplicadas.ts            (dry-run)
 *       npx tsx scripts/merge-particularidades-duplicadas.ts --apply
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { buildDedupeKey, fingerprintFromTitle } from "@/lib/timeline/particularidad-identity";

const APPLY = process.argv.includes("--apply");

const STOP = new Set(["para", "que", "con", "los", "las", "del", "una", "por", "sobre", "entre", "como", "sus", "este", "esta"]);
function tokens(s: string): Set<string> {
  const norm = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/gi, " ");
  return new Set(norm.split(/\s+/).filter((w) => w.length >= 5 && !STOP.has(w)));
}

/** Atribución más específica gana sobre AMBOS (que es "no atribuido" disfrazado). */
const especificidad = (party: string) => (party === "AMBOS" ? 0 : 1);

async function main() {
  const timelines = await prisma.projectTimeline.findMany({
    where: { particularidades: { some: {} } },
    select: {
      id: true,
      project: { select: { name: true } },
      particularidades: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, kind: true, party: true, title: true, weeksImpact: true,
          visibleExternal: true, sourceQuote: true, createdAt: true, dedupeKey: true,
        },
      },
    },
  });

  let gruposTotal = 0, aBorrarTotal = 0, semanasRecuperadas = 0;
  const plan: Array<{ timelineId: string; keepId: string; dropIds: string[]; dedupeKey: string; visible: boolean }> = [];

  for (const tl of timelines) {
    // Agrupar por similitud de título dentro del MISMO kind (un ATRASO y un COMPROMISO del mismo
    // tema son hechos distintos a propósito).
    const grupos: Array<{ tok: Set<string>; items: typeof tl.particularidades }> = [];
    for (const p of tl.particularidades) {
      const t = tokens(p.title);
      const g = grupos.find(
        (gr) => gr.items[0].kind === p.kind && [...gr.tok].filter((w) => t.has(w)).length >= 3,
      );
      if (g) { for (const w of t) g.tok.add(w); g.items.push(p); }
      else grupos.push({ tok: t, items: [p] });
    }

    const conDuplicados = grupos.filter((g) => g.items.length > 1);
    if (conDuplicados.length === 0) continue;

    console.log(`\n=== ${tl.project?.name ?? tl.id} ===`);
    for (const g of conDuplicados) {
      const ordenadas = [...g.items].sort((a, b) =>
        (b.weeksImpact ?? 0) - (a.weeksImpact ?? 0) ||
        Number(!!b.sourceQuote) - Number(!!a.sourceQuote) ||
        especificidad(b.party) - especificidad(a.party) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const keep = ordenadas[0];
      const drop = ordenadas.slice(1);
      const visible = g.items.some((x) => x.visibleExternal);
      const suma = g.items.reduce((a, b) => a + (b.weeksImpact ?? 0), 0);
      const real = keep.weeksImpact ?? 0;

      gruposTotal++; aBorrarTotal += drop.length; semanasRecuperadas += suma - real;
      plan.push({
        timelineId: tl.id,
        keepId: keep.id,
        dropIds: drop.map((d) => d.id),
        dedupeKey: buildDedupeKey(tl.id, keep.kind, fingerprintFromTitle(keep.title)),
        visible,
      });

      console.log(`\n  GRUPO x${g.items.length} — suma ${suma} sem → queda ${real} sem (recupera ${suma - real})`);
      console.log(`    ✓ QUEDA   ${keep.kind}/${keep.party} ${keep.weeksImpact ?? "-"}sem ${keep.sourceQuote ? "«cita»" : "sin-cita"} :: ${keep.title}`);
      for (const d of drop) {
        console.log(`    ✗ se borra ${d.kind}/${d.party} ${d.weeksImpact ?? "-"}sem ${d.sourceQuote ? "«cita»" : "sin-cita"} :: ${d.title}`);
      }
      if (visible && !keep.visibleExternal) console.log(`    → la que queda pasa a VISIBLE (alguna del grupo ya la veía el cliente)`);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`${gruposTotal} grupos duplicados · ${aBorrarTotal} filas a borrar · ${semanasRecuperadas} semanas fantasma`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — no se tocó nada. Revisá el plan y, si estás de acuerdo, corré con --apply.`);
    return;
  }

  for (const p of plan) {
    await prisma.$transaction(async (tx) => {
      await tx.particularidad.update({
        where: { id: p.keepId },
        data: { dedupeKey: p.dedupeKey, visibleExternal: p.visible, occurrences: { increment: p.dropIds.length } },
      });
      await tx.particularidad.deleteMany({ where: { id: { in: p.dropIds } } });
    });
  }
  console.log(`\n✓ APLICADO: ${aBorrarTotal} filas fusionadas en ${gruposTotal} hechos.`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
