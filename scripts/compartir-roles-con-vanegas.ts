/**
 * scripts/compartir-roles-con-vanegas.ts
 *
 * Le da a **Alexander Vanegas (CSL)** acceso de LECTURA a todos los documentos de
 * Roles, creando una fila `RoleProfileShare` por documento.
 *
 * Por qué así y no de otra forma: el módulo Roles no tiene permiso delegable por rol
 * —es una decisión explícita del repo (docs/DECISIONS.md §Roles: "una sección de docs
 * de dirección no debe ser delegable por plantilla")—. El acceso es binario:
 * SUPER_ADMIN ve todo, y cualquier otro ve SOLO lo que le compartieron
 * (`lib/roles/access.ts` → `visibleRoleWhere`). Así que los dos caminos alternativos
 * eran peores:
 *   · Hacerlo SUPER_ADMIN → le abre /team, los permisos de todos y el resto de
 *     dirección. Desproporcionado para leer unos documentos.
 *   · Tocar el código para que el rol CSL vea Roles → cambia la regla para CUALQUIER
 *     CSL presente y futuro, y contradice la decisión de arriba.
 * Compartir es lo que el producto ya sabe hacer, es de solo lectura y se revierte
 * borrando la fila.
 *
 * ⚠ ESTO DA ACCESO A SUELDOS. Las 5 propuestas llevan oferta económica (Caro, Valentina,
 * Liliana, Dinia y la del CSL). Alcance confirmado por Elías el 2026-09-23: los 9.
 *
 * Lo que NO cambia: sigue siendo de LECTURA. `canEditRoleDocs` exige SUPER_ADMIN, así que
 * ve `RoleDocView` (read-only) y no el workspace — no puede editar, publicar ni borrar.
 *
 * Uso:
 *   dry-run:   npx tsx scripts/compartir-roles-con-vanegas.ts
 *   aplicar:   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/compartir-roles-con-vanegas.ts --apply
 *   revocar:   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/compartir-roles-con-vanegas.ts --revocar --apply
 *
 * También se hace por pantalla, documento por documento, con el panel «Compartir».
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const EMAIL_DESTINO = "avanegas@smarteamcr.com";
const OTORGA = "egonzalez@smarteamcr.com";

async function main() {
  const APPLY = resolverApply();
  const REVOCAR = process.argv.includes("--revocar");
  const { prisma, close } = createScriptDb();
  try {
    const persona = await prisma.teamMember.findFirst({
      where: { email: EMAIL_DESTINO },
      select: { id: true, name: true, email: true, roleEnum: true, deactivatedAt: true },
    });
    if (!persona) {
      console.error(`⛔ no existe un TeamMember con email ${EMAIL_DESTINO}.`);
      process.exit(1);
    }
    if (persona.roleEnum === "SUPER_ADMIN") {
      console.error(`⛔ ${persona.name} ya es SUPER_ADMIN: ve todo por su rol y compartirle no suma nada.`);
      process.exit(1);
    }
    if (persona.deactivatedAt) {
      console.error(`⛔ ${persona.name} está DADO DE BAJA. No se comparte con una cuenta inactiva.`);
      process.exit(1);
    }

    const docs = await prisma.roleProfile.findMany({
      select: { id: true, docType: true, title: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    const yaTiene = new Set(
      (
        await prisma.roleProfileShare.findMany({
          where: { teamMemberId: persona.id },
          select: { roleId: true },
        })
      ).map((s) => s.roleId),
    );

    console.log(`\n${REVOCAR ? "REVOCAR" : "COMPARTIR"} — ${persona.name} <${persona.email}> (${persona.roleEnum})`);
    console.log(`  documentos en la base: ${docs.length}  ·  ya compartidos con él: ${yaTiene.size}`);

    let cambios = 0;
    for (const d of docs) {
      const tiene = yaTiene.has(d.id);
      const accion = REVOCAR ? (tiene ? "quitar" : "—") : tiene ? "—" : "dar";
      if (accion !== "—") cambios++;
      console.log(`  ${accion === "—" ? "=" : "→"} [${d.docType}] ${d.title}${accion === "—" ? "  (sin cambio)" : ""}`);
    }

    if (cambios === 0) {
      console.log(`\nNada que hacer: ya está como se pide.`);
      return;
    }
    console.log(`\n${cambios} cambio(s) ${APPLY ? "aplicados" : "por aplicar"}.`);

    if (!APPLY) {
      console.log("\nDRY-RUN. Para aplicar:");
      console.log(
        `  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/compartir-roles-con-vanegas.ts${REVOCAR ? " --revocar" : ""} --apply`,
      );
      return;
    }

    if (REVOCAR) {
      const { count } = await prisma.roleProfileShare.deleteMany({ where: { teamMemberId: persona.id } });
      console.log(`\n✓ ${count} acceso(s) revocado(s). Roles desaparece de su menú.`);
      return;
    }

    // `createMany` + skipDuplicates y no un upsert por fila: el @@unique(roleId, teamMemberId)
    // hace el trabajo, y así dos corridas simultáneas no se pisan.
    const { count } = await prisma.roleProfileShare.createMany({
      data: docs.filter((d) => !yaTiene.has(d.id)).map((d) => ({
        roleId: d.id,
        teamMemberId: persona.id,
        grantedByEmail: OTORGA,
      })),
      skipDuplicates: true,
    });
    console.log(`\n✓ ${count} documento(s) compartidos. Ya le aparece «Roles» en el menú, de solo lectura.`);
  } finally {
    await close();
  }
}

main();
