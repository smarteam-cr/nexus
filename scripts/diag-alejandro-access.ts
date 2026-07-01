/**
 * scripts/diag-alejandro-access.ts — READ-ONLY.
 * Diagnostica por qué un miembro recibe /clients?error=no_access:
 * cadena requireUser() → requireAccessToClient(). Muestra AppUser (vínculo a
 * TeamMember), roleEnum, deactivatedAt y qué haría el gate de acceso.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAILS = [
  "arodriguez@smarteamcr.com",
  "asalas@smarteamcr.com",
  "bsalas@smarteamcr.com",
  "egonzalez@smarteamcr.com", // control: super admin (Elías) — debería estar sano
];

const SEE_ALL = new Set(["VENTAS", "DEV", "CSL", "MARKETING", "SUPER_ADMIN"]);

async function main() {
  for (const email of EMAILS) {
    const lc = email.toLowerCase();
    const tm = await prisma.teamMember.findUnique({
      where: { email },
      select: { id: true, name: true, roleEnum: true, area: true, deactivatedAt: true },
    });
    const appUser = await prisma.appUser.findUnique({
      where: { email: lc },
      select: { id: true, kind: true, teamMemberId: true, clientId: true, authUserId: true },
    });

    console.log(`\n=== ${email} ===`);
    console.log(`  TeamMember: ${tm ? `id=${tm.id.slice(0, 8)} roleEnum=${tm.roleEnum} area=${tm.area ?? "—"} deactivatedAt=${tm.deactivatedAt ?? "—"}` : "❌ NO EXISTE"}`);
    console.log(`  AppUser:    ${appUser ? `id=${appUser.id.slice(0, 8)} kind=${appUser.kind} teamMemberId=${appUser.teamMemberId ? appUser.teamMemberId.slice(0, 8) : "❌ NULL"} authUserId=${appUser.authUserId ? "sí" : "❌ NULL"}` : "❌ NO EXISTE (login daría ForbiddenError 'sin AppUser')"}`);

    // Diagnóstico del gate
    let verdict = "";
    if (!appUser) verdict = "🔴 no_access: NO tiene AppUser (requireUser lanza 'sin AppUser'). Falta correr seed-app-users para su email.";
    else if (appUser.kind !== "INTERNAL") verdict = `🔴 no_access: AppUser.kind=${appUser.kind} (no INTERNAL).`;
    else if (!appUser.teamMemberId) verdict = "🔴 no_access: AppUser existe pero teamMemberId=NULL (no vinculado). requireAccessToClient lanza 'Usuario interno sin TeamMember vinculado'.";
    else if (tm && appUser.teamMemberId !== tm.id) verdict = `🔴 AppUser.teamMemberId (${appUser.teamMemberId.slice(0, 8)}) ≠ TeamMember por email (${tm.id.slice(0, 8)}) — vínculo cruzado.`;
    else if (tm?.deactivatedAt) verdict = "🔴 no_access: TeamMember DESACTIVADO.";
    else if (tm && SEE_ALL.has(tm.roleEnum)) verdict = `🟢 rol ${tm.roleEnum} → ve TODOS los clientes. NO debería dar no_access (si lo da con este rol y ya desplegaste, es otra cosa).`;
    else if (tm) verdict = `🟡 rol ${tm.roleEnum} (scoped): solo ve clientes donde es owner en HubSpot o le compartieron → abrir un cliente ajeno da no_access. ¿Ya se asignó DEV?`;
    console.log(`  → ${verdict}`);
  }

  // ¿Cuántos AppUser INTERNAL sin teamMember? (síntoma general del gap de onboarding)
  const unlinked = await prisma.appUser.count({ where: { kind: "INTERNAL", teamMemberId: null } });
  console.log(`\nAppUser INTERNAL sin teamMember vinculado (global): ${unlinked}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
