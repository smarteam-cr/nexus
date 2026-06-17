/**
 * scripts/seed-test-user.ts
 *
 * Crea un usuario de PRUEBA (info@smarteamcr.com) que ve y opera como un CSE,
 * con la MISMA cartera de clientes que Heiver Gómez — para QA de la vista CSE.
 *
 * Enfoque (no destructivo, reversible, sin tocar la identidad de Heiver):
 *   1. TeamMember propio para info@ (roleEnum=CSE, area=CSE).
 *   2. AppUser INTERNAL para info@ (habilita login con Google; authUserId se
 *      vincula en el primer login).
 *   3. GRANT a info@ de cada cliente que Heiver POSEE (Project.hubspotOwnerEmail).
 *      → info@ ve exactamente los clientes de Heiver.
 *
 * Caveat: info@ es "compartido", no owner. Con el gating (d), editar el handoff/
 * cronograma de esos clientes está reservado al OWNER → info@ podrá VERLOS y operar
 * casi todo, pero NO generar/editar el handoff (eso sí lo puede Heiver). Para QA de
 * visibilidad/scoping es fiel; para editar handoffs habría que hacerlo owner (cambia
 * datos de HubSpot) — fuera de alcance.
 *
 * Reversible: borrar el AppUser + TeamMember de info@ (y sus ClientAssignment).
 * Dry-run por default. Aplicar: npx tsx scripts/seed-test-user.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const TEST_EMAIL = "info@smarteamcr.com";
const MIRROR_EMAIL = "hgomez@smarteamcr.com";
const GRANTED_BY_EMAIL = "egonzalez@smarteamcr.com";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO…\n" : "DRY-RUN (usá --apply para escribir)\n");

  const mirror = await prisma.teamMember.findUnique({
    where: { email: MIRROR_EMAIL },
    select: { id: true, name: true, roleEnum: true },
  });
  if (!mirror) { console.log(`✗ No existe ${MIRROR_EMAIL}`); return; }

  const grantedBy = await prisma.teamMember.findUnique({
    where: { email: GRANTED_BY_EMAIL }, select: { id: true },
  });
  if (!grantedBy) { console.log(`✗ No existe el otorgante ${GRANTED_BY_EMAIL}`); return; }

  const owned = await prisma.project.findMany({
    where: { hubspotOwnerEmail: MIRROR_EMAIL },
    select: { clientId: true, client: { select: { name: true } } },
    distinct: ["clientId"],
  });
  console.log(`Heiver (${mirror.roleEnum}) posee ${owned.length} cliente(s): ${owned.map((o) => o.client?.name).join(", ") || "—"}`);

  const heiverApp = await prisma.appUser.findUnique({ where: { email: MIRROR_EMAIL }, select: { authUserId: true } });
  console.log(`Heiver AppUser: ${heiverApp ? (heiverApp.authUserId ? "existe (ya logueó)" : "existe (sin login aún)") : "no existe"}`);

  // 1. TeamMember de info@
  const existingTm = await prisma.teamMember.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
  console.log(`\n1. TeamMember ${TEST_EMAIL}: ${existingTm ? "ya existe (actualizar a CSE)" : "CREAR (CSE, area=CSE)"}`);
  let infoTm = existingTm;
  if (APPLY) {
    infoTm = await prisma.teamMember.upsert({
      where: { email: TEST_EMAIL },
      update: { roleEnum: "CSE", area: "CSE", deactivatedAt: null },
      create: { email: TEST_EMAIL, name: "Test CSE (vista Heiver)", roleEnum: "CSE", area: "CSE" },
      select: { id: true },
    });
  }

  // 2. AppUser INTERNAL
  const existingApp = await prisma.appUser.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
  console.log(`2. AppUser ${TEST_EMAIL}: ${existingApp ? "ya existe" : "CREAR (INTERNAL, login habilitado)"}`);
  if (APPLY && infoTm) {
    await prisma.appUser.upsert({
      where: { email: TEST_EMAIL },
      update: { kind: "INTERNAL", teamMemberId: infoTm.id },
      create: { email: TEST_EMAIL, kind: "INTERNAL", teamMemberId: infoTm.id },
    });
  }

  // 3. GRANT de los clientes de Heiver
  console.log(`3. Compartir (GRANT) ${owned.length} cliente(s) de Heiver con ${TEST_EMAIL}`);
  if (APPLY && infoTm) {
    for (const o of owned) {
      const exists = await prisma.clientAssignment.findFirst({
        where: { clientId: o.clientId, teamMemberId: infoTm.id, kind: "GRANT" },
        select: { id: true },
      });
      if (!exists) {
        await prisma.clientAssignment.create({
          data: {
            clientId: o.clientId,
            teamMemberId: infoTm.id,
            kind: "GRANT",
            grantedById: grantedBy.id,
            reason: "Usuario de prueba — vista CSE como Heiver",
          },
        });
      }
    }
  }

  console.log(`\n${APPLY ? "✓ Hecho. info@ puede loguear con Google y verá los clientes de Heiver." : "Dry-run done."}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
