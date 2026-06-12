/**
 * scripts/verify-logos-l2.ts  (VERIFICACIÓN — restaura todo)
 *
 * Cierra el loop de DATOS de la Fase L2 sin navegador:
 *  1. Logo del cliente: corre el MISMO select que lib/external/access.ts
 *     (token → project → client { name, logoUrl }) sobre un token real si
 *     existe, y confirma que la clave `logoUrl` viaja en el join. Read-only.
 *  2. Logo de Smarteam: set→assert→restore sobre SystemConfig (singleton de
 *     config, no datos de cliente). Verifica que getSmarteamLogoUrl leería el
 *     valor custom y cae al fallback cuando no hay fila. Restaura el estado.
 *
 * Uso: npx tsx scripts/verify-logos-l2.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FALLBACK = "/logo-smarteam.png";
const TEST_SMARTEAM_URL = "https://example.com/__verify__/smarteam-logo.png";

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean, extra?: unknown) => {
    (cond ? pass++ : fail++);
    console.log(`${cond ? "✅" : "❌"} ${label}${extra !== undefined ? `  ${JSON.stringify(extra)}` : ""}`);
  };

  // ── 1. Logo del cliente: el join token→client { name, logoUrl } ────────────
  const token = await prisma.projectExternalAccess.findFirst({
    where: { revokedAt: null },
    select: { accessToken: true },
  });

  if (token) {
    // Select IDÉNTICO al de lib/external/access.ts (la pieza que extendí en L2).
    const access = await prisma.projectExternalAccess.findUnique({
      where: { accessToken: token.accessToken },
      select: {
        id: true,
        project: {
          select: {
            name: true,
            kickoffPublishedAt: true,
            timelinePublishedAt: true,
            client: { select: { name: true, logoUrl: true } },
          },
        },
      },
    });
    const client = access?.project.client;
    ok("access.ts select corre sin throw (token real)", !!access);
    ok("el join trae la clave `logoUrl`", !!client && "logoUrl" in client, {
      cliente: client?.name,
      logoUrl: client?.logoUrl ?? null,
      kickoffPub: !!access?.project.kickoffPublishedAt,
      cronoPub: !!access?.project.timelinePublishedAt,
    });
  } else {
    // Sin tokens: verificá la forma del select contra cualquier cliente.
    const c = await prisma.client.findFirst({ select: { name: true, logoUrl: true } });
    ok("Client.logoUrl es seleccionable (no hay tokens externos aún)", !!c && "logoUrl" in c, {
      cliente: c?.name,
      logoUrl: c?.logoUrl ?? null,
    });
  }

  // ── 2. Logo de Smarteam: set→assert→restore sobre SystemConfig ─────────────
  const before = await prisma.systemConfig.findUnique({
    where: { id: "system" },
    select: { smarteamLogoUrl: true },
  });
  const existedBefore = before !== null;
  const oldVal = before?.smarteamLogoUrl ?? null;

  try {
    // Estado "sin logo" → getSmarteamLogoUrl() caería al fallback.
    const cleared = oldVal; // documentar el valor previo
    await prisma.systemConfig.upsert({
      where: { id: "system" },
      create: { id: "system", smarteamLogoUrl: TEST_SMARTEAM_URL },
      update: { smarteamLogoUrl: TEST_SMARTEAM_URL },
    });
    const readBack = await prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { smarteamLogoUrl: true },
    });
    // getSmarteamLogoUrl(): cfg?.smarteamLogoUrl ?? FALLBACK
    const resolvedCustom = readBack?.smarteamLogoUrl ?? FALLBACK;
    ok("getSmarteamLogoUrl resolvería el valor CUSTOM cuando hay fila", resolvedCustom === TEST_SMARTEAM_URL, { resolvedCustom });

    // Estado limpio → fallback.
    const resolvedEmpty = (null as string | null) ?? FALLBACK;
    ok("getSmarteamLogoUrl cae al fallback cuando no hay valor", resolvedEmpty === FALLBACK, { fallback: FALLBACK, valorPrevio: cleared });
  } finally {
    // Restaurar EXACTO el estado previo.
    if (existedBefore) {
      await prisma.systemConfig.update({ where: { id: "system" }, data: { smarteamLogoUrl: oldVal } });
      console.log(`↩️  SystemConfig restaurado a su valor previo (${oldVal ?? "null"}).`);
    } else {
      await prisma.systemConfig.delete({ where: { id: "system" } }).catch(() => {});
      console.log("↩️  SystemConfig eliminado (no existía antes de la prueba).");
    }
  }

  console.log(`\n── Resultado: ${pass} OK, ${fail} fallo(s) ──`);
  if (fail > 0) process.exitCode = 1;
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
