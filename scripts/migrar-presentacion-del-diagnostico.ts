/**
 * scripts/migrar-presentacion-del-diagnostico.ts — LO QUE QUEDÓ EN `Project.diagnosticoPresentacion`, A LA TABLA NUEVA.
 *
 * Del 2026-10-07 al 2026-10-14 la fecha de presentación del diagnóstico vivía en un Json del proyecto, con la última
 * respuesta. Desde el 2026-10-14 cada respuesta es una fila de `PresentacionDeDocumento` (lib/presentaciones) y el Json
 * queda sin lectores (DEPRECATED). Este script pasa lo que haya a filas, con quién y cuándo, para que no se pierda.
 *
 * Solo toca proyectos con el Json lleno y SIN filas del diagnóstico en la tabla nueva: correrlo dos veces no duplica. No
 * borra ni cambia el Json (se borra con la columna, después del 2026-11-15).
 *
 *   npx tsx scripts/migrar-presentacion-del-diagnostico.ts                         # simulacro: qué filas se crearían
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/migrar-presentacion-del-diagnostico.ts --apply
 *
 * En PowerShell: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-presentacion-del-diagnostico.ts --apply`. Con
 * `--apply` se respalda antes `PresentacionDeDocumento` (pg_dump; sin pg_dump, el guard frena o `SIN_RESPALDO=1`).
 * Va DESPUÉS del SQL 2026-10-14-presentaciones-de-documentos.sql y del deploy (el código de antes sigue escribiendo el Json).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { Prisma } from "@prisma/client";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { filasDesdeLoViejo } from "@/lib/presentaciones/desde-lo-viejo";

const APPLY = resolverApply({ tablas: ["PresentacionDeDocumento"] });

async function main() {
  imprimirDestino();
  console.log(`${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"}\n`);

  const proyectos = await prisma.project.findMany({
    where: { diagnosticoPresentacion: { not: Prisma.DbNull } },
    select: { id: true, name: true, updatedAt: true, diagnosticoPresentacion: true, client: { select: { name: true } } },
  });
  console.log(`Proyectos con el Json viejo: ${proyectos.length}`);
  if (proyectos.length === 0) return;

  const yaMigrados = new Set(
    (
      await prisma.presentacionDeDocumento.findMany({
        where: { projectId: { in: proyectos.map((p) => p.id) }, documento: "diagnostico" },
        distinct: ["projectId"],
        select: { projectId: true },
      })
    ).map((f) => f.projectId),
  );
  const emails = new Set<string>();
  const planes = proyectos
    .filter((p) => !yaMigrados.has(p.id))
    .map((p) => {
      const filas = filasDesdeLoViejo(p.diagnosticoPresentacion, p.updatedAt);
      for (const f of filas) if (f.porEmail) emails.add(f.porEmail);
      return { p, filas };
    })
    .filter((x) => x.filas.length > 0);
  const roles = new Map(
    (await prisma.teamMember.findMany({ where: { email: { in: [...emails] } }, select: { email: true, roleEnum: true } })).map((m) => [
      m.email.toLowerCase(),
      m.roleEnum as string,
    ]),
  );

  console.log(`Ya migrados (tienen filas del diagnóstico): ${yaMigrados.size}`);
  console.log(`Por migrar: ${planes.length}\n`);
  for (const { p, filas } of planes) {
    console.log(`  ${p.client.name} · ${p.name}`);
    for (const f of filas) console.log(`    ${f.createdAt.toISOString()}  ${f.evento}${f.fecha ? ` ${f.fecha}` : ""}  ${f.porEmail ?? "Nexus"}`);
  }
  if (!APPLY || planes.length === 0) return;

  let creadas = 0;
  for (const { p, filas } of planes) {
    await prisma.presentacionDeDocumento.createMany({
      data: filas.map((f) => ({
        projectId: p.id,
        proyectoNombre: p.name,
        clientNombre: p.client.name,
        documento: "diagnostico",
        evento: f.evento,
        fecha: f.fecha,
        porEmail: f.porEmail,
        rol: f.porEmail ? (roles.get(f.porEmail) ?? null) : null,
        motivo: null,
        sessionId: f.sessionId,
        detalle: f.detalle ? (f.detalle as Prisma.InputJsonValue) : Prisma.DbNull,
        createdAt: f.createdAt,
      })),
    });
    creadas += filas.length;
  }
  console.log(`\n✓ ${creadas} filas creadas en ${planes.length} proyectos. Correrlo de nuevo no cambia nada.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
