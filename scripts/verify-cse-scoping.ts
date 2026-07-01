/**
 * scripts/verify-cse-scoping.ts — SOLO LECTURA (verificación del gate de seguridad)
 *
 * Replica la lógica de lib/auth/access.ts (accessibleClientWhere / requireAccessToClient)
 * contra los datos REALES, sin necesidad de un login OAuth:
 *   - CSE: ve solo clientes que posee (Project.hubspotOwnerEmail) + compartidos
 *     (GRANT a él o a rol CSE), menos REVOKE.
 *   - Roles seeAllClients (VENTAS/CSL/MARKETING/SUPER_ADMIN): ven todo.
 *
 * Uso: npx tsx scripts/verify-cse-scoping.ts
 */
import { PrismaClient, type TeamRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SEE_ALL: TeamRole[] = ["VENTAS", "DEV", "CSL", "MARKETING", "SUPER_ADMIN"];

async function accessibleIds(email: string, role: TeamRole): Promise<Set<string> | "ALL"> {
  if (SEE_ALL.includes(role)) return "ALL";
  // CSE (scoped)
  const [owned, grants, revokes] = await Promise.all([
    prisma.project.findMany({ where: { hubspotOwnerEmail: email }, select: { clientId: true } }),
    prisma.clientAssignment.findMany({
      where: { kind: "GRANT", OR: [{ teamMember: { email } }, { targetRole: role }] },
      select: { clientId: true },
    }),
    prisma.clientAssignment.findMany({
      where: { kind: "REVOKE", OR: [{ teamMember: { email } }, { targetRole: role }] },
      select: { clientId: true },
    }),
  ]);
  const ids = new Set<string>([...owned, ...grants].map((x) => x.clientId));
  for (const r of revokes) ids.delete(r.clientId);
  return ids;
}

async function main() {
  const total = await prisma.client.count();
  const allClients = await prisma.client.findMany({ select: { id: true, name: true } });
  console.log(`Total de clientes en el sistema: ${total}\n`);

  // Elegir un CSE activo que sea owner de al menos 1 cliente (para un caso con datos)
  const cses = await prisma.teamMember.findMany({
    where: { roleEnum: "CSE", deactivatedAt: null },
    select: { name: true, email: true },
  });
  for (const cse of cses) {
    const ids = await accessibleIds(cse.email, "CSE");
    const n = ids === "ALL" ? total : ids.size;
    const blocked = ids === "ALL" ? null : allClients.find((c) => !ids.has(c.id));
    console.log(
      `CSE ${cse.name.padEnd(22)} ve ${String(n).padStart(3)}/${total} clientes` +
        (blocked ? `  · ejemplo BLOQUEADO: "${blocked.name}" (no es suyo → 403 por URL directa)` : ""),
    );
  }

  // Un rol con visibilidad total debe ver todos
  const sa = await prisma.teamMember.findFirst({
    where: { roleEnum: "SUPER_ADMIN", deactivatedAt: null },
    select: { name: true, email: true },
  });
  if (sa) {
    const ids = await accessibleIds(sa.email, "SUPER_ADMIN");
    console.log(`\nSUPER_ADMIN ${sa.name}: ve ${ids === "ALL" ? `TODOS (${total})` : ids.size} ✓`);
  }

  // Veredicto del gate
  const anyCseScoped = (
    await Promise.all(cses.map((c) => accessibleIds(c.email, "CSE")))
  ).some((ids) => ids !== "ALL" && ids.size < total);
  console.log(
    `\n${anyCseScoped ? "✓ GATE OK" : "⚠"}: al menos un CSE ve un SUBCONJUNTO de clientes (scoping efectivo).`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
