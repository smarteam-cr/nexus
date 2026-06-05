/**
 * scripts/cleanup-handoff-dup-projects.ts
 *
 * Limpia los duplicados causados por el bug del loop F5 <-> sync-projects (antes del fix):
 * F5 creaba un record "projects" (0-970) sin linkearlo al Project del handoff, y
 * sync-projects lo re-importaba como Project nuevo.
 *
 * Detección GENÉRICA por cada Handoff:
 *  - real      = project.hubspotServiceId         (record canónico del project del handoff)
 *  - linkedRec = handoff.hubspotProjectId         (lo que F5 guardó)
 *  - re-import dup = Project del MISMO cliente con hubspotServiceId == linkedRec,
 *    distinto del project del handoff. Se borra SOLO si tiene 0 bloques (sin trabajo);
 *    si tiene bloques, se REPORTA y NO se toca.
 *
 * Caso 1 (linkedRec && real && linkedRec != real): F5 creó un record DUPLICADO.
 *   -> archivar el record HubSpot `linkedRec`, borrar el re-import dup, reconciliar
 *      handoff.hubspotProjectId = real.
 * Caso 2 (linkedRec && !real): el record del handoff es el único rep pero el project
 *   no quedó linkeado -> borrar el re-import dup y setear project.hubspotServiceId = linkedRec
 *   (no se archiva nada en HubSpot).
 *
 * Uso:
 *   npx tsx scripts/cleanup-handoff-dup-projects.ts           # dry-run
 *   npx tsx scripts/cleanup-handoff-dup-projects.ts --apply   # aplica
 */
import "dotenv/config"; // primero: @/lib/db/prisma lee DATABASE_URL al cargar.
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";

const OT = "0-970";

async function blockCount(projectId: string): Promise<number> {
  return prisma.canvasBlock.count({ where: { section: { canvas: { projectId } } } });
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (--apply para ejecutar)"}\n`);

  const handoffs = await prisma.handoff.findMany({
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, hubspotServiceId: true } },
    },
  });

  let deletedNexus = 0;
  let archivedHs = 0;
  let reconciled = 0;
  let linkedFixed = 0;
  let protectedDups = 0;

  const hs = await getSystemHubspotClient();

  for (const h of handoffs) {
    const real = h.project.hubspotServiceId;
    const linkedRec = h.hubspotProjectId;
    const tag = `[${h.client.name}]`;

    const isCase1 = !!linkedRec && !!real && linkedRec !== real;
    const isCase2 = !!linkedRec && !real;
    if (!isCase1 && !isCase2) continue; // ya consistente o sin record

    console.log(`${tag} handoff=${h.id} project.svc=${real ?? "-"} handoff.hubspotProjectId=${linkedRec}`);

    // Re-import dups: otros Project del cliente con hubspotServiceId == linkedRec.
    const reimportDups = await prisma.project.findMany({
      where: { clientId: h.client.id, hubspotServiceId: linkedRec, id: { not: h.project.id } },
      select: { id: true, name: true },
    });
    const dupsToDelete: string[] = [];
    for (const d of reimportDups) {
      const blocks = await blockCount(d.id);
      if (blocks === 0) {
        console.log(`   Nexus: borrar project re-import ${d.id} "${d.name}" (0 bloques)`);
        dupsToDelete.push(d.id);
      } else {
        console.log(`   ⚠ Nexus: project ${d.id} "${d.name}" tiene ${blocks} bloques — NO se toca (revisar manual)`);
        protectedDups++;
      }
    }

    if (isCase1) {
      console.log(`   HubSpot: archivar record duplicado ${linkedRec}`);
      console.log(`   Reconciliar: handoff.hubspotProjectId ${linkedRec} -> ${real}`);
    } else {
      console.log(`   Nexus: linkear project ${h.project.id}.hubspotServiceId -> ${linkedRec} (no se archiva nada en HubSpot)`);
    }

    // Conteo de lo que se haría (visible también en dry-run).
    deletedNexus += dupsToDelete.length;
    if (isCase1) {
      archivedHs++;
      reconciled++;
    } else {
      linkedFixed++;
    }

    if (apply) {
      // 1) Borrar re-import dups sin bloques (cascade canvases/sections/blocks).
      for (const id of dupsToDelete) {
        try {
          await prisma.project.delete({ where: { id } });
        } catch (e) {
          console.log(`   ! no se pudo borrar Nexus project ${id}: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (isCase1) {
        // 2) Archivar el record HubSpot duplicado (papelera, recuperable 90 días).
        try {
          const res = await hs.apiRequest({ method: "DELETE", path: `/crm/v3/objects/${OT}/${linkedRec}` });
          if (!(res.ok || res.status === 204)) console.log(`   ! archive HubSpot falló (${res.status})`);
        } catch (e) {
          console.log(`   ! archive HubSpot error: ${e instanceof Error ? e.message : e}`);
        }
        // 3) Reconciliar el handoff al record real.
        await prisma.handoff.update({
          where: { id: h.id },
          data: { hubspotProjectId: real, hubspotSyncStatus: "synced", hubspotSyncError: null },
        });
      } else {
        // Caso 2: linkear el project del handoff al record (tras borrar el re-import).
        await prisma.project.update({ where: { id: h.project.id }, data: { hubspotServiceId: linkedRec } });
      }
    }
    console.log("");
  }

  console.log(
    `${apply ? "Aplicado" : "Se aplicaría"}: ${deletedNexus} projects Nexus borrados, ${archivedHs} records HubSpot archivados, ` +
      `${reconciled} handoffs reconciliados, ${linkedFixed} projects linkeados, ${protectedDups} dups con bloques PROTEGIDOS (no tocados).`,
  );
  if (!apply) console.log("⚠ Dry-run. Re-correr con --apply.");
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
