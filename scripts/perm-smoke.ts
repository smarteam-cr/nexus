/**
 * scripts/perm-smoke.ts — matriz de humo del sistema de permisos. READ-ONLY.
 *
 * Para cada rol, resuelve el mapa EFECTIVO vía el engine real (DEFAULT_MATRIX
 * ← RolePermission en DB ← overrides) y muestra:
 *   1. Cuántas plantillas hay sembradas en RolePermission.
 *   2. La matriz efectiva por rol, con DIFF contra el DEFAULT de código
 *      (tabla vacía → cero diffs = paridad exacta; tras el seed de F3 el único
 *      diff esperado es DEV a solo-lectura en los artefactos).
 *   3. Prueba de overrides EN MEMORIA (sin escribir DB): un CSE con
 *      cronograma.regenerate pineado debe pasar; sin el override, no.
 *   4. Las capabilities legacy derivadas de cada mapa efectivo.
 *
 * Correr: npx tsx scripts/perm-smoke.ts
 */
import "dotenv/config";
import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import { capabilitiesFromPermissions } from "@/lib/auth/permissions/compat";
import { getEffectivePermissions, can } from "@/lib/auth/permissions/engine";

const ROLES: TeamRole[] = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"];

async function main() {
  const templates = await prisma.rolePermission.findMany({ select: { role: true, updatedAt: true } });
  console.log(`Plantillas en RolePermission: ${templates.length}`,
    templates.length ? `(${templates.map((t) => t.role).join(", ")})` : "(tabla vacía → default puro)");

  let totalDiffs = 0;
  for (const role of ROLES) {
    const eff = await getEffectivePermissions({ roleEnum: role, permissionOverrides: null });
    const granted: string[] = [];
    const diffs: string[] = [];
    for (const s of PERMISSION_SECTIONS) {
      for (const a of s.actions) {
        const v = eff.sections[s.key]?.[a.key] === true;
        if (v) granted.push(`${s.key}.${a.key}`);
        const dflt = DEFAULT_MATRIX[role]?.sections[s.key]?.[a.key] === true;
        if (v !== dflt) diffs.push(`${s.key}.${a.key}: default=${dflt} → efectivo=${v}`);
      }
    }
    totalDiffs += diffs.length;
    console.log(`\n── ${role} ── (${granted.length} concedidas)`);
    console.log(`  ${granted.join(" · ") || "(ninguna)"}`);
    if (diffs.length) console.log(`  DIFF vs default:\n    ${diffs.join("\n    ")}`);
    console.log(`  capabilities legacy: [${capabilitiesFromPermissions(eff).join(", ")}]`);
  }
  console.log(`\nDiffs efectivo-vs-default totales: ${totalDiffs}`);

  // Overrides EN MEMORIA (el engine lee permissionOverrides del subject; no se escribe DB)
  const sinOverride = await can({ roleEnum: "CSE", permissionOverrides: null }, "cronograma", "regenerate");
  const conOverride = await can(
    { roleEnum: "CSE", permissionOverrides: { v: 1, sections: { cronograma: { regenerate: true } } } },
    "cronograma",
    "regenerate",
  );
  const saRecortado = await can(
    { roleEnum: "SUPER_ADMIN", permissionOverrides: { v: 1, sections: { equipo: { manage: false } } } },
    "equipo",
    "manage",
  );
  console.log(`\nOverride en memoria — CSE cronograma.regenerate: sin=${sinOverride} con=${conOverride} (esperado false/true)`);
  console.log(`Anti-lockout — SA con override malicioso equipo.manage=false: ${saRecortado} (esperado true)`);
  if (sinOverride || !conOverride || !saRecortado) {
    console.error("❌ FALLÓ la prueba de overrides");
    process.exitCode = 1;
  } else {
    console.log("✅ Overrides y anti-lockout OK");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
