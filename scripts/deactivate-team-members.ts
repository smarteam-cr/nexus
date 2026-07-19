/**
 * scripts/deactivate-team-members.ts
 *
 * Desactiva (soft) a los miembros que ya no están en el equipo. NO borra:
 * setea deactivatedAt para preservar el histórico (sesiones/handoffs/runs siguen
 * apuntando a ellos), pero pierden acceso (login bloqueado) y desaparecen de los
 * listados de personas (selectores de owner, /team, sugerencias).
 *
 * Dry-run por default. Aplicar con: npx tsx scripts/deactivate-team-members.ts --apply
 */
import { createScriptDb } from "./lib/db";

const APPLY = process.argv.includes("--apply");

const TO_DEACTIVATE: { email: string; reason: string }[] = [
  { email: "bcenteno@smarteamcr.com", reason: "Ya no forma parte del equipo" },
  { email: "rzuniga@smarteamcr.com", reason: "Ya no forma parte del equipo" },
  { email: "jarauz@smarteamcr.com", reason: "Ya no forma parte del equipo" },
  { email: "denriquez@smarteamcr.com", reason: "Ya no forma parte del equipo" },
  { email: "asepulveda@smarteamcr.com", reason: "Ya no forma parte del equipo — cartera reasignada a Lorena Osorio" },
];

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

async function main() {
  console.log(APPLY ? "APLICANDO desactivaciones…\n" : "DRY-RUN (usá --apply para escribir)\n");

  for (const { email, reason } of TO_DEACTIVATE) {
    const m = await prisma.teamMember.findUnique({
      where: { email },
      select: { id: true, name: true, deactivatedAt: true },
    });
    if (!m) {
      console.log(`⚠ No existe: ${email}`);
      continue;
    }
    if (m.deactivatedAt) {
      console.log(`• Ya desactivado: ${m.name} <${email}>`);
      continue;
    }
    console.log(`✗ Desactivar: ${m.name} <${email}> — ${reason}`);
    if (APPLY) {
      await prisma.teamMember.update({
        where: { id: m.id },
        data: { deactivatedAt: new Date(), deactivatedReason: reason },
      });
    }
  }

  const active = await prisma.teamMember.count({ where: { deactivatedAt: null } });
  const inactive = await prisma.teamMember.count({ where: { deactivatedAt: { not: null } } });
  console.log(`\nResumen: ${active} activos, ${inactive} desactivados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
