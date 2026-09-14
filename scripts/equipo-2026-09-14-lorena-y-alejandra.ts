/**
 * scripts/equipo-2026-09-14-lorena-y-alejandra.ts
 *
 * Dos correcciones del equipo que pidió Elías (2026-09-14) al ver el directorio de Documentación,
 * que se arma solo con las personas activas de Nexus:
 *   · Lorena Osorio ya no está en Smarteam (baja el 2026-08-15, ver `corregir-nomina-agosto-2026.ts`)
 *     y seguía activa. Se DESACTIVA (soft, como `DELETE /api/team/[id]`): pierde el acceso y sale de
 *     los listados; sus sesiones, handoffs y corridas siguen apuntando a ella.
 *   · Alejandra Ortega es de Marketing, pero su área decía «PM» (salía en «Gestión de proyectos»).
 * Caroline Bersot ya está en Customer Success (área CSE): no se toca.
 *
 * Imprime las dos fichas ANTES de escribir, para guardarlas como respaldo.
 *
 * Dry-run por defecto. Aplicar:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/equipo-2026-09-14-lorena-y-alejandra.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const APPLY = resolverApply({ tablas: ["TeamMember"] });

const { prisma, pool } = createScriptDb();

const CAMPOS = {
  id: true,
  name: true,
  email: true,
  area: true,
  roleEnum: true,
  deactivatedAt: true,
  deactivatedReason: true,
} as const;

async function main() {
  console.log(APPLY ? "APLICANDO…\n" : "DRY-RUN (usá --apply para escribir)\n");

  const lorena = await prisma.teamMember.findUnique({ where: { email: "losorio@smarteamcr.com" }, select: CAMPOS });
  const alejandra = await prisma.teamMember.findUnique({ where: { email: "aortega@smarteamcr.com" }, select: CAMPOS });
  console.log("ANTES =", JSON.stringify({ lorena, alejandra }, null, 2), "\n");

  if (!lorena) {
    console.log("⚠ No existe losorio@smarteamcr.com");
  } else if (lorena.deactivatedAt) {
    console.log(`• ${lorena.name} ya estaba desactivada`);
  } else {
    console.log(`✗ Desactivar: ${lorena.name} <${lorena.email}> (${lorena.roleEnum})`);
    if (APPLY) {
      await prisma.teamMember.update({
        where: { id: lorena.id },
        data: { deactivatedAt: new Date(), deactivatedReason: "Ya no forma parte del equipo — baja el 2026-08-15" },
      });
    }
  }

  if (!alejandra) {
    console.log("⚠ No existe aortega@smarteamcr.com");
  } else if (alejandra.area === "Marketing") {
    console.log(`• ${alejandra.name} ya está en Marketing`);
  } else {
    console.log(`↻ ${alejandra.name}: área «${alejandra.area ?? "—"}» → «Marketing»`);
    if (APPLY) {
      await prisma.teamMember.update({ where: { id: alejandra.id }, data: { area: "Marketing" } });
    }
  }

  const areas = await prisma.teamMember.groupBy({
    by: ["area"],
    where: { deactivatedAt: null },
    _count: { _all: true },
  });
  console.log(
    "\nActivos por área:",
    areas.map((a) => `${a.area ?? "—"} ${a._count._all}`).join(" · "),
    APPLY ? "" : "(antes de aplicar)",
  );
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
