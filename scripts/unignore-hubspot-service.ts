/**
 * scripts/unignore-hubspot-service.ts
 *
 * Reactivar un proyecto que se borró a mano desde Nexus (quita su hubspotServiceId de
 * Client.ignoredHubspotServiceIds) → el próximo sync lo vuelve a crear desde HubSpot.
 * Es el "re-agregar a mano" de la Zona de peligro del proyecto.
 *
 * Listar los suprimidos de un cliente:
 *   npx tsx scripts/unignore-hubspot-service.ts --client "JUDESUR"
 * Reactivar uno (quitarlo de la lista):
 *   npx tsx scripts/unignore-hubspot-service.ts --client <id|nombre> --service <serviceId> --apply
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const APPLY = process.argv.includes("--apply");
const CLIENT_ARG = argValue("--client");
const SERVICE_ID = argValue("--service");

async function main() {
  if (!CLIENT_ARG) throw new Error("Indicá --client <id|nombre>");
  const client =
    (await prisma.client.findUnique({ where: { id: CLIENT_ARG }, select: { id: true, name: true, ignoredHubspotServiceIds: true } })) ??
    (await prisma.client.findFirst({
      where: { name: { contains: CLIENT_ARG, mode: "insensitive" } },
      select: { id: true, name: true, ignoredHubspotServiceIds: true },
    }));
  if (!client) throw new Error(`Ningún cliente matchea "${CLIENT_ARG}"`);

  const ignored = client.ignoredHubspotServiceIds;
  console.log(`Cliente: ${client.name} (${client.id})`);
  console.log(`Proyectos suprimidos (${ignored.length}): ${ignored.length ? ignored.join(", ") : "(ninguno)"}`);

  if (!SERVICE_ID) {
    console.log("\nPasá --service <serviceId> --apply para reactivar uno.");
    return;
  }
  if (!ignored.includes(SERVICE_ID)) {
    console.log(`\n"${SERVICE_ID}" no está en la lista — nada que hacer.`);
    return;
  }
  const next = ignored.filter((id) => id !== SERVICE_ID);
  if (!APPLY) {
    console.log(`\nDRY-RUN: quitaría ${SERVICE_ID} → quedarían ${next.length}. Re-corré con --apply.`);
    return;
  }
  await prisma.client.update({ where: { id: client.id }, data: { ignoredHubspotServiceIds: next } });
  console.log(`\n✔ Reactivado ${SERVICE_ID}. El próximo sync del cliente lo vuelve a crear.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
