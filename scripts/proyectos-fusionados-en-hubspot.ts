/**
 * scripts/proyectos-fusionados-en-hubspot.ts — los proyectos activos de Nexus cuyo registro de HubSpot se fusionó en otro.
 *
 * Un proyecto fusionado en HubSpot responde con el id y los datos del que sigue (lib/hubspot/proyecto-fusionado.ts).
 * Hasta el 2026-10-19 el espejo no lo veía y la fila quedaba activa con el encargado de antes: en Librería
 * Internacional, Heiver Gómez seguía como CSE aunque en HubSpot estuviera Caroline Bersot. Desde ese día la
 * sincronización de cada cliente lo da de baja sola; este script lo hace ya, para todos, sin esperar a que alguien
 * abra la ficha.
 *
 * Simulacro por defecto (solo lee la base y HubSpot). Con --apply deja esas filas en `status = "inactive"`, lo mismo que
 * hace la reconciliación del espejo; no toca nada más.
 *
 *   npx tsx scripts/proyectos-fusionados-en-hubspot.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/proyectos-fusionados-en-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Deshacer: volver a `status = "active"` los ids que imprime.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { fusionadoEn } from "@/lib/hubspot/proyecto-fusionado";

const APPLY = resolverApply({ tablas: ["Project"] });

async function main() {
  const hs = await getSystemHubspotClient();
  const proyectos = await prisma.project.findMany({
    where: { status: "active", hubspotServiceId: { not: null } },
    select: { id: true, name: true, hubspotServiceId: true, hubspotOwnerName: true, client: { select: { name: true } } },
  });
  const conocidos = new Set(proyectos.map((p) => p.hubspotServiceId));
  console.log(`Proyectos activos con registro en HubSpot: ${proyectos.length}`);

  const fusionados: { id: string; texto: string }[] = [];
  let sinLeer = 0;
  for (const p of proyectos) {
    const res = await hs.apiRequest({ method: "GET", path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${p.hubspotServiceId}?properties=hs_name` }).catch(() => null);
    if (!res || !res.ok) {
      sinLeer++;
      continue;
    }
    const data = (await res.json()) as { id?: string };
    const en = fusionadoEn(p.hubspotServiceId!, data.id);
    if (!en) continue;
    fusionados.push({
      id: p.id,
      texto:
        `${p.client.name} · «${p.name}» (${p.id}) — ${p.hubspotServiceId} se fusionó en ${en}` +
        ` · encargado en Nexus: ${p.hubspotOwnerName ?? "—"} · el que sigue ${conocidos.has(en) ? "ya está en Nexus" : "NO está en Nexus"}`,
    });
  }

  if (sinLeer) console.log(`No se pudieron leer ${sinLeer} (no se toca ninguno de esos).`);
  if (fusionados.length === 0) {
    console.log("Ninguno fusionado. Nada que hacer.");
    return;
  }
  console.log(`\nFusionados en HubSpot y activos en Nexus: ${fusionados.length}`);
  for (const f of fusionados) console.log(`  · ${f.texto}`);

  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Con --apply quedan inactivos (como los deja el espejo).");
    return;
  }
  const r = await prisma.project.updateMany({ where: { id: { in: fusionados.map((f) => f.id) }, status: "active" }, data: { status: "inactive" } });
  console.log(`\n✓ ${r.count} proyecto(s) quedaron inactivos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
