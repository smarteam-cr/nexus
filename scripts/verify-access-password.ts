/**
 * scripts/verify-access-password.ts  (VERIFICACIÓN — crea y BORRA un acceso de prueba)
 *
 * Verifica el flujo de la contraseña visible del acceso externo, sin navegador:
 *   1. Crea un acceso de prueba en un proyecto que HOY no tiene acceso (para no
 *      tocar credenciales reales) — simula POST: guarda accessPassword (plano) + hash.
 *   2. Lee de vuelta: accessPassword == plano, bcrypt(plano) matchea el hash.
 *   3. Simula PATCH custom: cambia a una contraseña propia (plano + hash nuevos).
 *   4. Pega al endpoint PÚBLICO real /api/external/verify-access con la custom →
 *      ok:true (el hash sigue validando de punta a punta); con una mala → 401.
 *   5. Borra el acceso de prueba (restaura el estado "sin acceso").
 *
 * Uso: npx tsx scripts/verify-access-password.ts  (dev server en :3004)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "http://localhost:3004";
const BCRYPT_ROUNDS = 12;

async function main() {
  let pass = 0, fail = 0;
  const ok = (label: string, cond: boolean, extra?: unknown) => {
    cond ? pass++ : fail++;
    console.log(`${cond ? "✅" : "❌"} ${label}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ""}`);
  };

  // Proyecto SIN acceso externo (para no pisar credenciales reales).
  const project = await prisma.project.findFirst({
    where: { externalAccess: null },
    select: { id: true, name: true },
  });
  if (!project) {
    console.log("No hay ningún proyecto sin acceso externo — abortando para no tocar credenciales reales.");
    return;
  }
  console.log(`▸ Proyecto de prueba: ${project.name} [${project.id}]\n`);

  const token = randomBytes(32).toString("hex");
  const autoPw = "Auto" + randomBytes(4).toString("hex"); // simula la autogenerada
  const customPw = "MiClaveSegura2026";
  let created = false;

  try {
    // 1. POST simulado: plano + hash.
    await prisma.projectExternalAccess.create({
      data: {
        projectId: project.id,
        accessToken: token,
        passwordHash: await bcrypt.hash(autoPw, BCRYPT_ROUNDS),
        accessPassword: autoPw,
      },
    });
    created = true;

    // 2. Read-back de la autogenerada.
    const a1 = await prisma.projectExternalAccess.findUnique({
      where: { projectId: project.id },
      select: { accessPassword: true, passwordHash: true },
    });
    ok("accessPassword (plano) se guardó y se lee", a1?.accessPassword === autoPw, { leido: a1?.accessPassword });
    ok("bcrypt(plano autogenerada) matchea el hash", await bcrypt.compare(autoPw, a1!.passwordHash));

    // 3. PATCH simulado: contraseña custom (plano + hash nuevos).
    await prisma.projectExternalAccess.update({
      where: { projectId: project.id },
      data: { accessPassword: customPw, passwordHash: await bcrypt.hash(customPw, BCRYPT_ROUNDS) },
    });
    const a2 = await prisma.projectExternalAccess.findUnique({
      where: { projectId: project.id },
      select: { accessPassword: true, passwordHash: true },
    });
    ok("custom se guardó en plano", a2?.accessPassword === customPw, { leido: a2?.accessPassword });
    ok("bcrypt(custom) matchea el hash nuevo", await bcrypt.compare(customPw, a2!.passwordHash));
    ok("la autogenerada vieja YA NO valida", !(await bcrypt.compare(autoPw, a2!.passwordHash)));

    // 4. Endpoint PÚBLICO real: verify-access con la custom → ok; con mala → 401.
    const good = await fetch(`${BASE}/api/external/verify-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: customPw }),
    });
    const goodJson = await good.json().catch(() => ({}));
    ok("verify-access acepta la custom (HTTP real)", good.status === 200 && goodJson?.ok === true, { status: good.status });

    const bad = await fetch(`${BASE}/api/external/verify-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "claveIncorrecta" }),
    });
    ok("verify-access rechaza la incorrecta (401)", bad.status === 401, { status: bad.status });
  } finally {
    // 5. Restaurar: borrar el acceso de prueba (volvía a "sin acceso").
    if (created) {
      await prisma.projectExternalAccess.delete({ where: { projectId: project.id } }).catch(() => {});
      console.log("\n↩️  Acceso de prueba borrado (proyecto vuelve a 'sin acceso').");
    }
  }

  console.log(`\n── Resultado: ${pass} OK, ${fail} fallo(s) ──`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
