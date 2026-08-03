/**
 * scripts/reapuntar-empresa-fusionada.ts
 *
 * Cuando dos empresas se FUSIONAN en HubSpot, la perdedora deja de existir pero su id sigue
 * respondiendo: `GET /companies/{idViejo}` devuelve 200 con los datos del SOBREVIVIENTE y el
 * campo `id` de la respuesta trae el id nuevo. Todo lo demás sigue funcionando… salvo las
 * ASOCIACIONES, que se mudaron al sobreviviente. Nexus, que guarda el id viejo, pregunta por
 * los proyectos de una lápida y recibe cero.
 *
 * Encontrado el 2026-08-03 en Spectrum: un proyecto creado en HubSpot no aparecía en Nexus,
 * y el mensaje decía "la empresa no tiene proyectos asociados" — cierto, e inútil.
 *
 * Este script busca a TODOS los clientes en esa situación y los reapunta al sobreviviente.
 *
 * DRY-RUN por defecto. Con `--apply` escribe (y contra producción exige `ALLOW_PROD_WRITE=1`).
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────────────
 * No corre solo. Reapuntar un cliente a otra empresa es cambiar de qué compañía cuelga toda su
 * información, y aunque la fusión lo haga obvio, es una decisión con consecuencias (proyectos,
 * cobranza, cartera). El sync DETECTA la fusión y lo dice; corregirla es un acto deliberado.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { detectarFusion } from "@/lib/hubspot/empresa-fusionada";

async function main() {
  const apply = resolverApply();
  const hs = await getSystemHubspotClient();

  const clientes = await prisma.client.findMany({
    where: { hubspotCompanyId: { not: null } },
    select: { id: true, name: true, hubspotCompanyId: true, _count: { select: { projects: true } } },
    orderBy: { name: "asc" },
  });
  console.log(`Revisando ${clientes.length} clientes con empresa en HubSpot…\n`);

  let fusionados = 0;
  let ilegibles = 0;

  for (const c of clientes) {
    const veredicto = await detectarFusion(hs, c.hubspotCompanyId!);
    if (veredicto.estado === "ilegible") {
      ilegibles++;
      continue;
    }
    if (veredicto.estado === "vigente") continue;

    fusionados++;
    console.log(`· ${c.name}`);
    console.log(`    Nexus guarda : ${c.hubspotCompanyId}  (fusionada)`);
    console.log(`    Sobreviviente: ${veredicto.idSobreviviente}`);
    console.log(`    proyectos en Nexus: ${c._count.projects}`);

    /* Antes de mover: que el sobreviviente no esté YA tomado por otro cliente. Dos clientes
       apuntando a la misma empresa se pisarían en el sync — cada corrida traería los proyectos
       del otro. Es el único caso en que reapuntar empeora las cosas. */
    const yaTomado = await prisma.client.findFirst({
      where: { hubspotCompanyId: veredicto.idSobreviviente, id: { not: c.id } },
      select: { id: true, name: true },
    });
    if (yaTomado) {
      console.log(`    ⚠ NO SE TOCA: "${yaTomado.name}" ya apunta al sobreviviente. Los dos clientes`);
      console.log(`      son la misma empresa y hay que unificarlos a mano antes.`);
      console.log();
      continue;
    }

    /* ⚠ El id vive en DOS tablas. `BusinessCase.hubspotCompanyId` es una copia que se estampa
       del cliente al crear el BC, y NADIE la cascadea después. Arreglar solo el Client dejaba
       la lápida ahí, y el efecto es el mismo silencio que esta tanda vino a matar: la línea de
       tiempo de HubSpot de ese BC se lee POR ASOCIACIONES —las que se mudaron—, así que el BC
       se regenera sin notas, llamadas ni reuniones, sin un solo error. */
    const bcs = await prisma.businessCase.count({
      where: { hubspotCompanyId: c.hubspotCompanyId! },
    });
    if (bcs > 0) console.log(`    + ${bcs} business case(s) con el mismo id viejo`);

    if (apply) {
      await prisma.$transaction([
        prisma.client.update({
          where: { id: c.id },
          data: { hubspotCompanyId: veredicto.idSobreviviente },
        }),
        prisma.businessCase.updateMany({
          where: { hubspotCompanyId: c.hubspotCompanyId! },
          data: { hubspotCompanyId: veredicto.idSobreviviente },
        }),
      ]);
      console.log(`    → reapuntado ✓${bcs > 0 ? ` (cliente + ${bcs} BC)` : ""}`);
    } else {
      console.log(`    → se reapuntaría${bcs > 0 ? ` (cliente + ${bcs} BC)` : ""}`);
    }
    console.log();
  }

  console.log(`\nFusionadas: ${fusionados}${ilegibles ? ` · ilegibles: ${ilegibles}` : ""}`);
  if (fusionados && !apply) console.log("(dry-run) Repetí con --apply para escribir.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
