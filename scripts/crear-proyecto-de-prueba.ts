/**
 * scripts/crear-proyecto-de-prueba.ts — CREA UN PROYECTO DE PRUEBA a partir de un proyecto real
 * (docs/smartloop-plan.md, etapa 0).
 *
 * Para probar un módulo nuevo con datos reales del cliente (el primero: SmartLoop con FACO) sin tocar
 * el proyecto real. El proyecto de prueba:
 *   - cuelga del MISMO cliente, así que lee su ficha, sus procesos, su memoria y sus diagnósticos;
 *   - copia las reuniones del real (vínculos `SessionProject` con `source = "prueba"`, que el
 *     clasificador no borra ni cuenta como candado);
 *   - no existe en HubSpot y queda fuera de la cartera, Cobranza, el vigía, «Para ti», el clasificador
 *     y la vista del cliente (átomo NO_ES_PRUEBA de lib/projects/scope.ts);
 *   - lleva la fecha de inicio del real, para que el piso de reuniones sea el mismo.
 *
 * Correrlo de nuevo NO crea otro: reusa el que ya existe y le suma las reuniones nuevas del real.
 *
 *   npx tsx scripts/crear-proyecto-de-prueba.ts --de <projectId>                          # simulacro
 *   npx tsx scripts/crear-proyecto-de-prueba.ts --de <projectId> --nombre "FACO · SmartLoop (prueba)"
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/crear-proyecto-de-prueba.ts --de <projectId> --apply
 *
 * Con `--apply` se respaldan antes `Project` y `SessionProject` (pg_dump; sin pg_dump, el guard frena;
 * `SIN_RESPALDO=1` lo salta a sabiendas). Para borrarlo: `DELETE FROM "Project" WHERE id = '<id>' AND
 * "esPrueba"` (los vínculos y sus documentos se van en cascada; el real no se toca).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { belongsToClient } from "@/lib/sessions/project-sources";

const APPLY = resolverApply({ tablas: ["Project", "SessionProject"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

async function main() {
  imprimirDestino();
  const de = arg("--de");
  if (!de) {
    console.error("Falta --de <projectId>: el proyecto real del que sale la prueba.");
    process.exit(1);
  }
  const real = await prisma.project.findUnique({
    where: { id: de },
    select: {
      id: true, name: true, clientId: true, esPrueba: true, status: true, tags: true, serviceType: true,
      createdAt: true, hubspotCreatedAt: true, hubspotOwnerEmail: true, hubspotOwnerName: true,
      client: { select: { name: true } },
    },
  });
  if (!real) {
    console.error(`No existe el proyecto ${de}.`);
    process.exit(1);
  }
  if (real.esPrueba) {
    console.error("Ese proyecto ya es de prueba: pasa el id del proyecto real.");
    process.exit(1);
  }
  const nombre = arg("--nombre") ?? `${real.name} · prueba`;

  const yaExiste = await prisma.project.findFirst({
    where: { esPrueba: true, pruebaDeProjectId: real.id },
    select: { id: true, name: true },
  });

  const vinculos = await prisma.sessionProject.findMany({
    where: { projectId: real.id, included: true },
    select: {
      sessionId: true, isPrimary: true,
      session: { select: { title: true, date: true, resolvedClientId: true, manualClientId: true } },
    },
  });
  // Solo las reuniones que siguen siendo del cliente (la misma defensa que el chokepoint).
  const delCliente = vinculos.filter((v) => belongsToClient(v.session, real.clientId));
  const yaCopiadas = yaExiste
    ? new Set(
        (await prisma.sessionProject.findMany({ where: { projectId: yaExiste.id }, select: { sessionId: true } })).map(
          (l) => l.sessionId,
        ),
      )
    : new Set<string>();
  const aCopiar = delCliente.filter((v) => !yaCopiadas.has(v.sessionId));

  console.log(`${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"}\n`);
  console.log(`Cliente:        ${real.client.name}`);
  console.log(`Proyecto real:  ${real.name} (${real.id}, ${real.status})`);
  console.log(
    yaExiste
      ? `Prueba:         ya existe «${yaExiste.name}» (${yaExiste.id}): se le suman las reuniones nuevas.`
      : `Prueba:         se crea «${nombre}», con la fecha de inicio del real.`,
  );
  console.log(`Reuniones:      ${aCopiar.length} por copiar (de ${delCliente.length} del real; ${yaCopiadas.size} ya estaban).`);
  for (const v of aCopiar.slice(0, 12)) {
    console.log(`  · ${v.session.date.toISOString().slice(0, 10)}  ${v.session.title ?? "(sin título)"}`);
  }
  if (aCopiar.length > 12) console.log(`  … y ${aCopiar.length - 12} más`);

  if (!APPLY) {
    console.log("\nPara crearlo: el mismo comando con --apply y ALLOW_PROD_WRITE=1.");
    return;
  }

  const prueba = yaExiste ?? (await prisma.$transaction(async (tx) => {
    const creado = await tx.project.create({
      data: {
        clientId: real.clientId,
        name: nombre,
        status: "active",
        esPrueba: true,
        pruebaDeProjectId: real.id,
        tags: real.tags,
        serviceType: real.serviceType,
        // La misma fecha de inicio que el real: el piso de reuniones (piso-del-proyecto.ts) queda igual.
        createdAt: real.createdAt,
        hubspotCreatedAt: real.hubspotCreatedAt,
        hubspotOwnerEmail: real.hubspotOwnerEmail,
        hubspotOwnerName: real.hubspotOwnerName,
      },
      select: { id: true, name: true },
    });
    await createDefaultCanvases(creado.id, null, tx);
    return creado;
  }));

  if (aCopiar.length > 0) {
    await prisma.sessionProject.createMany({
      data: aCopiar.map((v) => ({
        sessionId: v.sessionId,
        projectId: prueba.id,
        isPrimary: v.isPrimary,
        included: true,
        // Ni "agent"/"legacy" (el clasificador los borraría) ni "manual" (congelaría la reunión real).
        source: "prueba",
        rationale: `Copiada del proyecto real «${real.name}» al crear la prueba.`,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`\n✓ Listo: «${prueba.name}» (${prueba.id}). Se abre desde la ficha de ${real.client.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
