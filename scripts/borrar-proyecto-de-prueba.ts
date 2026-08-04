/**
 * scripts/borrar-proyecto-de-prueba.ts — one-off: borrar UN proyecto por id, igual que la
 * "Zona de peligro" de la ficha del cliente.
 *
 * Replica app/api/clients/[id]/projects/[projectId]/route.ts, con UNA diferencia: el endpoint
 * hace el push a la denylist y el delete como dos awaits sueltos, así que si el delete falla
 * después del push queda un proyecto VIVO que el sync saltea para siempre — nunca más actualiza
 * etapa, estado ni dueño, y sigue comportándose como Customer Success sin que nada avise.
 * Acá van en UNA transacción.
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { createScriptDb } from "./lib/db";

const APPLY = process.argv.includes("--apply");
const ID = process.argv.find((a) => a.startsWith("--id="))?.slice("--id=".length);

(async () => {
  if (!ID) throw new Error("Falta --id=<projectId>");
  if (APPLY) assertProdWriteAllowed();
  const { prisma, close } = createScriptDb();

  const p = await prisma.project.findUnique({
    where: { id: ID },
    select: { id: true, name: true, clientId: true, hubspotServiceId: true, status: true },
  });
  if (!p) throw new Error(`No existe el proyecto ${ID}`);

  const [canvases, sesiones, tareas, servicios] = await Promise.all([
    prisma.projectCanvas.count({ where: { projectId: ID } }),
    prisma.sessionProject.count({ where: { projectId: ID } }),
    prisma.actionItem.count({ where: { projectId: ID, done: false, deletedAt: null } }),
    prisma.servicioContratado.count({ where: { projectId: ID } }),
  ]);

  console.log(`\n=== ${APPLY ? "APPLY (borra)" : "DRY-RUN (no escribe)"} ===`);
  console.log(`proyecto:   ${p.name}`);
  console.log(`estado:     ${p.status} · hubspotServiceId: ${p.hubspotServiceId ?? "(ninguno)"}`);
  console.log(`se borran:  ${canvases} canvas · ${sesiones} vínculo(s) a sesión`);
  console.log(`quedan sin proyecto: ${tareas} tarea(s) viva(s)`);
  console.log(`servicios cobrables: ${servicios}`);

  if (servicios > 0) throw new Error("ABORTA: tiene servicios cobrables. Esto es plata, se revisa a mano.");
  if (tareas > 0 && !process.argv.includes("--igual-con-tareas")) {
    throw new Error(
      `ABORTA: ${tareas} tarea(s) viva(s) quedarían sin proyecto y desaparecen de las pantallas. ` +
        `Movelas primero, o pasá --igual-con-tareas si de verdad se descartan.`,
    );
  }

  if (!APPLY) {
    console.log("\nPara aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/borrar-proyecto-de-prueba.ts --id=" + ID + " --apply");
    await close();
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (p.hubspotServiceId) {
      /* La denylist es POR CLIENTE y va ANTES del delete: sin esto, el sync de HubSpot puede
         volver a crear el proyecto y el borrado se deshace solo. */
      await tx.client.update({
        where: { id: p.clientId },
        data: { ignoredHubspotServiceIds: { push: p.hubspotServiceId } },
      });
    }
    await tx.project.delete({ where: { id: ID } });
  });

  console.log(`\n✓ Borrado. ${p.hubspotServiceId ? `El sync ya no lo va a recrear (${p.hubspotServiceId} en la lista de ignorados del cliente).` : ""}`);
  console.log(`  Para revertir la supresión: npx tsx scripts/unignore-hubspot-service.ts`);
  await close();
})();
