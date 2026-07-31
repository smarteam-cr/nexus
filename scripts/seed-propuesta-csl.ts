/**
 * scripts/seed-propuesta-csl.ts — migra la propuesta del CSL de código a la base.
 *
 * Hasta el 2026-07-30 la propuesta vivía HARDCODEADA (`lib/propuestas/csl.ts`) con dos
 * páginas propias. Ahora es una fila de `RoleProfile` con `docType: PROPUESTA`: se edita
 * in-situ, se comparte y se publica como cualquier otro documento de /roles.
 *
 * Idempotente y NO destructivo: la fila lleva un id EXPLÍCITO (`PROPUESTA_CSL_ID`), así
 * que re-correrlo no duplica. Y si la fila YA existe, no se toca — el contenido de la base
 * es la fuente de verdad desde el momento en que alguien lo edita; pisarlo con la semilla
 * sería exactamente el bug que `seed-roles.ts` documenta (su `update` reemplaza `content`
 * entero).
 *
 * La fila nace YA PUBLICADA (con su `publicToken`) — ver el comentario del `create`.
 *
 *   npx tsx scripts/seed-propuesta-csl.ts            # dry-run
 *   npx tsx scripts/seed-propuesta-csl.ts --apply    # escribe a la DB
 *
 * ⚠ Corre DESPUÉS del deploy: una fila `PROPUESTA` en un PROD que todavía no conoce el
 * `docType` se listaría y renderizaría con la plantilla de perfil de puesto.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PROPUESTA_CSL_ID } from "@/lib/roles/csl-legacy";
import { PROPUESTA_CSL_HERO, PROPUESTA_CSL_CONTENT } from "./data/propuesta-csl-v1";

const APPLY = process.argv.includes("--apply");

/**
 * Firma de la semilla. Va en `createdByEmail` (auditoría) y en `publicPublishedByEmail`,
 * donde además es FUNCIONAL: el puente `/external/propuesta/csl` compara contra este valor
 * exacto para saber si el link publicado sigue siendo el de la migración. Si se cambia acá,
 * hay que cambiarlo allá (son 5 días de vida — no se abstrajo a una constante compartida
 * para que el borrado del 2026-08-04 no deje residuo).
 */
const SEED_EMAIL = "seed:propuesta-csl";

/**
 * `APP_URL` es la URL pública del deploy; en local no está seteada y el link vale igual
 * para abrirlo a mano. Mismo criterio que la route de publicación, que no tiene request acá.
 */
function urlPublica(token: string): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/external/doc/${token}`;
}

async function main() {
  console.log(
    APPLY ? "APLICANDO la propuesta del CSL…\n" : "DRY-RUN de la propuesta del CSL (nada se escribe)…\n",
  );

  const existing = await prisma.roleProfile.findUnique({
    where: { id: PROPUESTA_CSL_ID },
    select: { id: true, title: true, updatedAt: true },
  });

  if (existing) {
    console.log(`= Ya existe (${existing.id}) — NO se toca. Editada por última vez: ${existing.updatedAt.toISOString()}`);
    console.log("  La base manda: re-sembrarla borraría cualquier edición hecha desde Nexus.");
    return;
  }

  console.log(`+ Se crea "${PROPUESTA_CSL_HERO.title}" como PROPUESTA (id ${PROPUESTA_CSL_ID})`);
  console.log(`  Secciones con contenido: ${Object.keys(PROPUESTA_CSL_CONTENT).length}`);
  console.log("  Nace YA PUBLICADA: se le genera su link público en el mismo create.");

  if (!APPLY) {
    console.log("\n(dry-run — corré con --apply para escribir)");
    return;
  }

  // 32 bytes en hex = los mismos 256 bits que genera `app/api/roles/[id]/publico/route.ts`.
  const publicToken = randomBytes(32).toString("hex");

  await prisma.roleProfile.create({
    data: {
      id: PROPUESTA_CSL_ID,
      docType: "PROPUESTA",
      title: PROPUESTA_CSL_HERO.title,
      area: PROPUESTA_CSL_HERO.area,
      summary: PROPUESTA_CSL_HERO.summary,
      content: PROPUESTA_CSL_CONTENT as Prisma.InputJsonObject,
      createdByEmail: SEED_EMAIL,
      // Nace PUBLICADA porque acá no se está publicando nada: se MIGRA un documento que ya
      // era público (la URL vieja no tenía ni token ni contraseña) y cuyo link YA circula —
      // la persona candidata lo tiene. Con el default "sin link", tras el deploy la URL ya
      // enviada quedaría en 404 hasta que alguien entrara a /roles a pulsar "Publicar link":
      // una regresión sobre algo que hoy funciona, y en el peor momento posible. Cerrarla
      // sigue siendo una decisión — se toma desde /roles con "Revocar".
      publicToken,
      publicPublishedAt: new Date(),
      // Este valor es funcional, no decorativo: el puente `/external/propuesta/csl` solo
      // redirige mientras el link publicado sea EL de la migración. Republicar desde el
      // panel lo pisa con el email de quien publica → el puente muere solo, que es lo que
      // se quiere (republicar existe para matar un link filtrado).
      publicPublishedByEmail: SEED_EMAIL,
    },
  });
  console.log("\n✅ Creada y PUBLICADA.");
  console.log(`   Link público: ${urlPublica(publicToken)}`);
  console.log(`   Se revoca desde /roles/${PROPUESTA_CSL_ID} → "Revocar" (el link muere y no vuelve).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
