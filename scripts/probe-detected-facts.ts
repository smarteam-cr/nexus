/**
 * scripts/probe-detected-facts.ts  (Fase B — sondeo de distribución)
 *
 * Mide QUÉ detecta el agente de avance (con el prompt corregido de Fase A) para diseñar el router
 * de hechos por DESTINO. Dos partes:
 *   1) BASELINE (0 costo LLM): tabula las particularidades crudas que YA hay en los AgentRun
 *      existentes (prompt VIEJO) por serviceType — línea de base contaminada de contraste.
 *   2) FRESCO: corre el agente REAL (Claude) sobre una muestra de proyectos cruzando serviceType,
 *      captura el output crudo del AgentRun (lo que el MODELO emitió, antes del filtro) y lo tabula.
 *      RESTAURA el borrador de cada proyecto en finally (no deja rastro; espejo de
 *      verify-timeline-progress.ts). Los AgentRun de traza quedan (esperado).
 *
 * NO persiste nada del sondeo. Exporta un JSON + imprime tablas.
 * Uso: npx tsx scripts/probe-detected-facts.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { regenerateTimelineProgress } from "@/lib/timeline/regenerate-progress";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT_ID = "agent-timeline-progress";

// Muestra elegida (elegibilidad = timeline con tareas + sesiones incluidas), cruzando serviceType.
// Incluye Wherex + Spectrum (conocidos-contaminados: confirman el fix sobre el caso que falló).
const SAMPLE: { id: string; name: string; serviceType: string }[] = [
  { id: "cmpc0jut200m0xgijy2p0eo6y", name: "Wherex", serviceType: "proyecto_temporal" },
  { id: "cmp9etg8n000elwijq9xlmfji", name: "AMC (SAP+HubSpot)", serviceType: "proyecto_temporal" },
  { id: "cmpx5t3am0017okij72dt8k54", name: "Almotec CRM", serviceType: "proyecto_temporal" },
  { id: "cmqk3hd340000boijmz1nmaq6", name: "Multiquimica SAP+CRM", serviceType: "proyecto_temporal" },
  { id: "cmq0e9m4h000auoijci4lgyq7", name: "Spectrum", serviceType: "loop_sales" },
  { id: "cmqze5sdu003he4ijlot3fh69", name: "ALFA Mkt+Sales", serviceType: "loop_marketing" },
];

type RawPart = { kind?: string; party?: string; title?: string; weeksImpact?: number | null; occurredAt?: string | null; sourceQuote?: string | null };

function classify(pt: RawPart) {
  const kind = String(pt?.kind ?? "").toUpperCase();
  const party = String(pt?.party ?? "").toUpperCase();
  const title = String(pt?.title ?? "");
  const weeks = typeof pt?.weeksImpact === "number" && pt.weeksImpact > 0 ? Math.round(pt.weeksImpact) : null;
  const pending = /pendiente|se necesit|falta |necesita|entrega de|acceso|proporcionar|confirmar la fecha|criterios de/i.test(title);
  const survives = (kind === "ATRASO" && weeks !== null) || kind === "COMPROMISO";
  return {
    kind, party, title, weeks,
    hasWeeks: weeks !== null,
    pending,
    survives,
    hasOccurredAt: typeof pt?.occurredAt === "string" && !!pt.occurredAt,
    hasQuote: typeof pt?.sourceQuote === "string" && pt.sourceQuote.trim().length > 0,
  };
}

type Cls = ReturnType<typeof classify>;

function tally(items: Cls[]) {
  const by = (f: (c: Cls) => boolean) => items.filter(f).length;
  const kinds: Record<string, number> = {};
  for (const c of items) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  return {
    total: items.length,
    kinds,
    pending: by((c) => c.pending),
    atrasoSinWeeks: by((c) => c.kind === "ATRASO" && !c.hasWeeks),
    survives: by((c) => c.survives),
    conCita: by((c) => c.hasQuote),
    conFecha: by((c) => c.hasOccurredAt),
  };
}

async function main() {
  // ── 1) BASELINE (prompt viejo, lo ya producido) ──
  const projSvc = new Map<string, string | null>();
  for (const pr of await prisma.project.findMany({ select: { id: true, serviceType: true } })) projSvc.set(pr.id, pr.serviceType);
  const oldRuns = await prisma.agentRun.findMany({ where: { agentId: AGENT_ID }, select: { output: true, projectId: true } });
  const baselineBySvc = new Map<string, Cls[]>();
  for (const r of oldRuns) {
    let arr: RawPart[] = [];
    try { const j = JSON.parse(r.output ?? "{}") as { particularidades?: RawPart[] }; arr = Array.isArray(j.particularidades) ? j.particularidades : []; } catch { /* skip */ }
    if (!arr.length) continue;
    const svc = (r.projectId ? projSvc.get(r.projectId) : null) ?? "?";
    if (!baselineBySvc.has(svc)) baselineBySvc.set(svc, []);
    baselineBySvc.get(svc)!.push(...arr.map(classify));
  }

  // ── 2) FRESCO (prompt nuevo, agente real) con restauración por proyecto ──
  const freshBySvc = new Map<string, Cls[]>();
  const perProject: { name: string; serviceType: string; status: string; reason?: string; raw: Cls[] }[] = [];
  for (const s of SAMPLE) {
    const snap = await prisma.projectTimeline.findUnique({
      where: { projectId: s.id },
      select: { pendingProgress: true, pendingProgressRunId: true, pendingParticularidades: true, pendingParticularidadesRunId: true },
    });
    try {
      console.log(`\n[FRESCO] ${s.name} (${s.serviceType})…`);
      const r = await regenerateTimelineProgress(s.id);
      let raw: RawPart[] = [];
      if (r.status === "ok" && r.runId) {
        const run = await prisma.agentRun.findUnique({ where: { id: r.runId }, select: { output: true } });
        try { const j = JSON.parse(run?.output ?? "{}") as { particularidades?: RawPart[] }; raw = Array.isArray(j.particularidades) ? j.particularidades : []; } catch { /* skip */ }
      }
      const cls = raw.map(classify);
      perProject.push({ name: s.name, serviceType: s.serviceType, status: r.status, reason: r.reason, raw: cls });
      if (!freshBySvc.has(s.serviceType)) freshBySvc.set(s.serviceType, []);
      freshBySvc.get(s.serviceType)!.push(...cls);
      console.log(`    status=${r.status}${r.reason ? " (" + r.reason + ")" : ""} · particularidades crudas=${cls.length} · sobreviven=${cls.filter((c) => c.survives).length} · pendientes=${cls.filter((c) => c.pending).length}`);
      for (const c of cls) console.log(`      - ${c.kind}${c.hasWeeks ? "+" + c.weeks + "sem" : ""} [${c.party}]${c.pending ? " ⚠pendiente" : ""}${c.hasQuote ? " «cita»" : ""}: ${c.title}`);
    } finally {
      if (snap) {
        await prisma.projectTimeline.update({
          where: { projectId: s.id },
          data: {
            pendingProgress: (snap.pendingProgress ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
            pendingProgressRunId: snap.pendingProgressRunId,
            pendingParticularidades: (snap.pendingParticularidades ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
            pendingParticularidadesRunId: snap.pendingParticularidadesRunId,
          },
        });
      }
    }
  }

  // ── Reporte ──
  console.log(`\n\n======== BASELINE (prompt VIEJO — lo ya producido) ========`);
  for (const [svc, items] of baselineBySvc) console.log(`\n[${svc}]`, JSON.stringify(tally(items)));
  console.log(`\n\n======== FRESCO (prompt NUEVO — ${SAMPLE.length} pasadas) ========`);
  for (const [svc, items] of freshBySvc) console.log(`\n[${svc}]`, JSON.stringify(tally(items)));

  const out = {
    generatedAt: new Date().toISOString(),
    baseline: Object.fromEntries([...baselineBySvc].map(([k, v]) => [k, { tally: tally(v), items: v }])),
    fresh: Object.fromEntries([...freshBySvc].map(([k, v]) => [k, { tally: tally(v), items: v }])),
    perProject,
  };
  const outPath = process.env.PROBE_OUT ?? join(tmpdir(), "probe-detected-facts.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nArchivo exportado: ${outPath}`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
