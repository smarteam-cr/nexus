/**
 * scripts/seed-role-permissions.ts — siembra las PLANTILLAS de RolePermission.
 *
 * Contenido = DEFAULT_MATRIX (comportamiento actual exacto) + deltas operativos por rol.
 * Roles mixtos (2026-07-22): DEV ENTREGA servicios (sitios web, integraciones), así que
 * genera handoff/kickoff/procesos/desarrollo/cronograma de punta a punta como parte de la
 * entrega — solo NO BORRA cronograma (`cronograma.delete` off, igual que el CSE). Se le
 * ENCIENDE además `cronograma.regenerate` (que el default no trae) para que itere el
 * cronograma con IA. Sigue viendo todo por clientes.viewAll. SUPER_ADMIN NO se siembra: el
 * engine lo hardcodea all-true (anti-lockout) y el PUT de plantillas lo rechaza.
 *
 * Idempotente (upsert). Imprime el diff por rol contra el DEFAULT de código y,
 * si la fila ya existe, contra lo sembrado antes. La tabla RolePermission es
 * INVISIBLE para el código viejo de prod (no la consulta) — sembrar no cambia
 * el comportamiento hasta que el código nuevo esté desplegado.
 *
 * Dry-run (default):  npx tsx scripts/seed-role-permissions.ts
 * Aplicar:            npx tsx scripts/seed-role-permissions.ts --apply
 */
import "dotenv/config";
import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import { parsePermissionMapLoose } from "@/lib/auth/permissions/schema";

const APPLY = process.argv.includes("--apply");
const SEEDED_BY = "seed-role-permissions.ts";

// Filtro opcional `--role=DEV` (repetible con comas) para sembrar SOLO ciertos roles —
// clave cuando otras filas fueron editadas a mano desde /team y no se quieren pisar.
const roleArg = process.argv.find((a) => a.startsWith("--role="))?.split("=")[1];
const ONLY_ROLES = roleArg ? roleArg.split(",").map((r) => r.trim().toUpperCase()) : null;

// Roles a sembrar (SUPER_ADMIN afuera: hardcodeado all-true en el engine).
const ALL_ROLES: TeamRole[] = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN"];
const ROLES: TeamRole[] = ONLY_ROLES
  ? ALL_ROLES.filter((r) => ONLY_ROLES.includes(r))
  : ALL_ROLES;

/** Celdas que el delta APAGA sobre el default del rol. */
const DELTAS: Partial<Record<TeamRole, Array<[string, string]>>> = {
  // DEV entrega servicios (roles mixtos): conserva el default de generación de artefactos
  // (handoff/kickoff/procesos/desarrollo/cronograma) y solo NO borra cronograma.
  DEV: [
    ["cronograma", "delete"],
  ],
};

/** Celdas que el delta ENCIENDE sobre el default del rol (para superar el default de código). */
const ENABLES: Partial<Record<TeamRole, Array<[string, string]>>> = {
  // DEV itera el cronograma con IA: regenerate no viene en el default (solo CSL/SUPER_ADMIN).
  DEV: [
    ["cronograma", "regenerate"],
  ],
};

function buildTemplate(role: TeamRole): PermissionMap {
  const map = structuredClone(DEFAULT_MATRIX[role]);
  for (const [section, action] of DELTAS[role] ?? []) {
    map.sections[section][action] = false;
  }
  for (const [section, action] of ENABLES[role] ?? []) {
    map.sections[section][action] = true;
  }
  return map;
}

function diffCells(a: PermissionMap | null, b: PermissionMap): string[] {
  const out: string[] = [];
  for (const s of PERMISSION_SECTIONS) {
    for (const ac of s.actions) {
      const va = a?.sections[s.key]?.[ac.key] === true;
      const vb = b.sections[s.key]?.[ac.key] === true;
      if (va !== vb) out.push(`${s.key}.${ac.key}: ${va} → ${vb}`);
    }
  }
  return out;
}

async function main() {
  console.log(APPLY ? "── MODO APPLY (escribe RolePermission) ──\n" : "── DRY-RUN (no escribe; usá --apply) ──\n");

  for (const role of ROLES) {
    const template = buildTemplate(role);
    const existing = await prisma.rolePermission.findUnique({ where: { role } });
    const existingMap = existing ? parsePermissionMapLoose(existing.permissions) : null;

    const vsDefault = diffCells(DEFAULT_MATRIX[role], template);
    const vsExisting = existing ? diffCells(existingMap, template) : null;

    console.log(`${role}:`);
    console.log(`  vs default de código: ${vsDefault.length ? vsDefault.join(" · ") : "(idéntica)"}`);
    if (existing) {
      console.log(`  fila EXISTENTE (${existing.updatedByEmail ?? "?"}, ${existing.updatedAt.toISOString().slice(0, 16)}) — cambios: ${vsExisting!.length ? vsExisting!.join(" · ") : "(ninguno)"}`);
      if (existing.updatedByEmail !== SEEDED_BY && vsExisting!.length) {
        console.log(`  ⚠ editada a mano — el upsert la PISARÍA. Revisar antes de aplicar.`);
      }
    }

    if (APPLY) {
      await prisma.rolePermission.upsert({
        where: { role },
        create: { role, permissions: template, updatedByEmail: SEEDED_BY },
        update: { permissions: template, updatedByEmail: SEEDED_BY },
      });
      console.log(`  ✔ sembrada`);
    }
    console.log("");
  }

  if (!APPLY) console.log("Nada escrito. Revisá el diff y corré con --apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
