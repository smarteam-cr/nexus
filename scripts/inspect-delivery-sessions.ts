/**
 * scripts/inspect-delivery-sessions.ts  (read-only)
 *
 * Sanity-check del cálculo de "sesiones de entrega reales" por fase del cronograma.
 * Sin arg: lista proyectos con cronograma + anchorStartDate (candidatos a probar).
 * Con arg (término del nombre del proyecto): imprime, por fase, la ventana de fechas,
 * el estimado guardado y las sesiones de entrega contadas (CSE/dev + cliente).
 *
 * Uso:
 *   npx tsx scripts/inspect-delivery-sessions.ts
 *   npx tsx scripts/inspect-delivery-sessions.ts "wherex"
 */
import { Pool } from "pg";
import "dotenv/config";
import { computePhaseRanges, addWeeks, currentWeekIndex, fmtPhaseRange } from "@/lib/timeline/weeks";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const TERM = process.argv[2] ?? "";

async function main() {
  if (!TERM) {
    const r = await pool.query(
      `SELECT p.name, t."anchorStartDate", COUNT(ph.id) AS phases
       FROM "ProjectTimeline" t
       JOIN "Project" p ON p.id = t."projectId"
       LEFT JOIN "TimelinePhase" ph ON ph."timelineId" = t.id
       WHERE t."anchorStartDate" IS NOT NULL
       GROUP BY p.name, t."anchorStartDate"
       ORDER BY t."anchorStartDate" DESC LIMIT 25`);
    console.log("Proyectos con cronograma + anchor (candidatos):");
    r.rows.forEach((x) => console.log(`  · ${x.name}  | anchor ${new Date(x.anchorStartDate).toISOString().slice(0, 10)} | ${x.phases} fases`));
    console.log("\nCorré de nuevo con un término: npx tsx scripts/inspect-delivery-sessions.ts \"<nombre>\"");
    return;
  }

  const proj = await pool.query(
    `SELECT p.id, p.name, p."clientId", t.id AS "timelineId", t."anchorStartDate"
     FROM "Project" p JOIN "ProjectTimeline" t ON t."projectId" = p.id
     WHERE p.name ILIKE $1 ORDER BY t."anchorStartDate" DESC NULLS LAST LIMIT 1`,
    [`%${TERM}%`]);
  if (proj.rows.length === 0) { console.log("Sin proyecto con cronograma para ese término."); return; }
  const { id: projectId, name, clientId, timelineId, anchorStartDate } = proj.rows[0];
  console.log(`Proyecto: ${name}  | anchor: ${anchorStartDate ? new Date(anchorStartDate).toISOString().slice(0,10) : "NULL"}`);
  if (!anchorStartDate) { console.log("Sin anchorStartDate → no se calculan sesiones reales (cae al estimado)."); return; }

  const phasesRes = await pool.query(
    `SELECT id, name, "order", "durationWeeks", "sessionCount" FROM "TimelinePhase"
     WHERE "timelineId" = $1 ORDER BY "order" ASC`, [timelineId]);
  const phases = phasesRes.rows;

  // Sesiones ligadas al proyecto que pertenecen al cliente (mirror del chokepoint).
  const sessRes = await pool.query(
    `SELECT f.id, f.date, f.participants, f."organizerEmail", f."resolvedClientId", f."manualClientId"
     FROM "SessionProject" sp JOIN "FirefliesSession" f ON f.id = sp."sessionId"
     WHERE sp."projectId" = $1`, [projectId]);
  const sessions = sessRes.rows
    .filter((s) => (s.manualClientId ?? s.resolvedClientId) === clientId)
    .map((s) => ({
      date: new Date(s.date).getTime(),
      participants: [...new Set([...(s.participants ?? []), ...(s.organizerEmail ? [s.organizerEmail] : [])])].map((e: string) => e.toLowerCase()),
    }));

  const team = await pool.query(`SELECT email, area, "roleEnum" FROM "TeamMember"`);
  const { deliveryEmails, internalEmails } = classifyTeamEmailsByArea(team.rows);

  const delivery = sessions.filter(
    (s) => s.participants.some((e) => deliveryEmails.has(e)) && s.participants.some((e) => !internalEmails.has(e)),
  );

  const anchorIso = new Date(anchorStartDate).toISOString();
  const ranges = computePhaseRanges(phases);
  const curWeek = currentWeekIndex(anchorIso)!;
  console.log(`Semana actual: ${curWeek} · sesiones ligadas: ${sessions.length} · de entrega (CSE/dev+cliente): ${delivery.length}\n`);

  phases.forEach((p, i) => {
    const r = ranges[i];
    const started = r.start <= curWeek;
    const startMs = addWeeks(anchorIso, r.start).getTime();
    const endMs = addWeeks(anchorIso, r.end).getTime();
    const real = started ? delivery.filter((d) => d.date >= startMs && d.date < endMs).length : null;
    console.log(
      `  ${started ? "▶" : "·"} ${p.name.padEnd(28)} ${fmtPhaseRange(anchorIso, r).padEnd(20)} ` +
      `estimado=${p.sessionCount ?? "—"}  real=${real === null ? "(futura)" : real}`,
    );
  });
}
main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); }).finally(() => pool.end());
