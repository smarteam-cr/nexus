/**
 * scripts/backfill-project-pipeline.ts
 *
 * Completa `Project.hubspotPipelineId` y `Project.proyectoInterno` para los proyectos que
 * el tramo SQL de la migración no pudo cubrir — los que tienen `hubspotServiceId` pero
 * nunca resolvieron `hubspotPipelineName` (típicamente stubs "Proyecto {id}" de portales
 * de cliente).
 *
 * DRY-RUN por defecto. Con `--apply` escribe.
 *
 * ── LO QUE ESTE SCRIPT NO HACE ───────────────────────────────────────────────
 * No adivina. Si un proyecto no se puede leer de HubSpot —porque vive en el portal de un
 * cliente al que ya no tenemos acceso, o porque lo borraron— se deja en NULL y se reporta.
 * NULL degrada al comportamiento legacy, así que quedarse sin resolver es inocuo; inventarle
 * un pipeline sería lo peligroso.
 *
 * ── POR QUÉ HAY QUE ELEGIR EL PORTAL ─────────────────────────────────────────
 * Un cliente puede tener su propia cuenta de HubSpot (Caso A) o vivir en el portal de
 * Smarteam (Caso B), igual que en `syncProjectsForClient`. Un proyecto del portal de un
 * cliente NO existe en el portal del sistema: buscarlo ahí devuelve 404 y confundiría "no
 * existe" con "no tengo acceso".
 *
 * Uso:
 *   npx tsx scripts/backfill-project-pipeline.ts
 *   npx tsx scripts/backfill-project-pipeline.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient } from "@/lib/hubspot/client";
import { resolvePipeline } from "@/lib/projects/kind";
import { resolverHermanos } from "@/lib/hubspot/sync-projects";

/* ⚠ Este script NO usa `createScriptDb`, y es a propósito.
   La regla de la casa —scripts nuevos con pool acotado (max: 2)— existe para no comerse el
   presupuesto de ~15 slots que el pooler de Supabase comparte entre producción, las dos PCs
   de dev y cualquier script suelto. Pero acá el script importa `resolverHermanos` de
   lib/hubspot/sync-projects, que arrastra `lib/db/prisma` — y ese módulo crea su pool al
   cargarse. Con `createScriptDb` habría DOS pools abiertos (2 + 4 = 6 conexiones) en vez de
   uno: la regla se cumpliría al pie de la letra y el resultado sería peor. Se usa el pool de
   la app, que ya tiene su propio techo por entorno. Mismo criterio que check-invariants.ts. */
const close = () => prisma.$disconnect();

const APLICAR = resolverApply();
const LOTE = 100; // techo de la API de batch/read de HubSpot

type ClienteHubspot = Awaited<ReturnType<typeof getHubspotClient>>;

/**
 * El cliente de la cuenta, con su `apiRequest` por el transporte de lib/hubspot/client.ts (renueva el token ante un
 * 401 y espera ante un 429). null si la cuenta no existe o no se pudo refrescar su token.
 */
async function clienteDeCuenta(accountId: string): Promise<ClienteHubspot | null> {
  try {
    return await getHubspotClient(accountId);
  } catch {
    return null;
  }
}

interface Leido {
  pipelineId: string | null;
  interno: boolean;
}

/** Lee un lote de proyectos de UN portal. Devuelve solo los que respondieron. */
async function leerLote(hs: ClienteHubspot, ids: string[]): Promise<Map<string, Leido>> {
  const out = new Map<string, Leido>();
  for (const slug of ["0-970", "projects", "PROJECT"]) {
    const res = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${slug}/batch/read`,
      body: {
        inputs: ids.map((id) => ({ id })),
        properties: ["hs_pipeline", "proyecto_interno"],
      },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      results?: Array<{ id: string; properties?: Record<string, string | null> }>;
    };
    for (const r of data.results ?? []) {
      out.set(r.id, {
        pipelineId: (r.properties?.hs_pipeline ?? "").trim() || null,
        interno: (r.properties?.proyecto_interno ?? "").trim().toLowerCase() === "true",
      });
    }
    if (out.size) break;
  }
  return out;
}

/**
 * Las asociaciones proyecto↔proyecto de un lote. Mismo endpoint y mismos lotes de 100 que el
 * sync (`leerProyectosAsociados`), replicado acá porque el script pide por `apiRequest` y no
 * por el sync.
 */
async function leerAsociaciones(hs: ClienteHubspot, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const tanda = ids.slice(i, i + LOTE);
    try {
      const res = await hs.apiRequest({
        method: "POST",
        path: "/crm/v4/associations/0-970/0-970/batch/read",
        body: { inputs: tanda.map((id) => ({ id })) },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: number | string }> }>;
      };
      for (const r of data.results ?? []) {
        const desde = r.from?.id;
        if (!desde) continue;
        const hacia = (r.to ?? [])
          .map((x) => (x.toObjectId === undefined ? null : String(x.toObjectId)))
          .filter((v): v is string => !!v);
        if (hacia.length) out.set(desde, hacia);
      }
    } catch {
      /* sin asociaciones → todos quedan "aparte", que es el default seguro */
    }
  }
  return out;
}

async function main() {
  const pendientes = await prisma.project.findMany({
    where: { hubspotServiceId: { not: null }, hubspotPipelineId: null },
    select: {
      id: true,
      name: true,
      status: true,
      hubspotServiceId: true,
      clientId: true,
      client: { select: { name: true, hubspotCompanyId: true } },
    },
  });

  console.log(
    `${APLICAR ? "APLICAR" : "DRY-RUN"} · ${pendientes.length} proyectos con hubspotServiceId y sin pipeline resuelto\n`,
  );
  if (!pendientes.length) {
    console.log("Nada que hacer — el tramo SQL de la migración cubrió todo.");
    return;
  }

  // Agrupar por PORTAL: cada cliente puede tener el suyo, y un id de proyecto solo existe
  // en el portal donde nació.
  const cuentas = await prisma.hubspotAccount.findMany({
    select: { id: true, clientId: true, isSystem: true },
  });
  const cuentaPorCliente = new Map(
    cuentas.filter((c) => c.clientId).map((c) => [c.clientId!, c.id]),
  );
  const cuentaSistema = cuentas.find((c) => c.isSystem)?.id ?? null;

  const porPortal = new Map<string, typeof pendientes>();
  const sinPortal: typeof pendientes = [];
  for (const p of pendientes) {
    const accountId = cuentaPorCliente.get(p.clientId) ?? cuentaSistema;
    if (!accountId) {
      sinPortal.push(p);
      continue;
    }
    const lista = porPortal.get(accountId) ?? [];
    lista.push(p);
    porPortal.set(accountId, lista);
  }

  let resueltos = 0;
  let escritos = 0;
  const clientesTocados = new Set<string>();
  const noResueltos: Array<{ etiqueta: string; motivo: string }> = [];
  for (const p of sinPortal) {
    noResueltos.push({
      etiqueta: `${p.client.name} · ${p.name} (${p.status})`,
      motivo: "el cliente no tiene portal de HubSpot ni hay cuenta del sistema",
    });
  }

  for (const [accountId, lista] of porPortal) {
    const hs = await clienteDeCuenta(accountId);
    if (!hs) {
      for (const p of lista) {
        noResueltos.push({
          etiqueta: `${p.client.name} · ${p.name} (${p.status})`,
          motivo: `no se pudo refrescar el token de la cuenta ${accountId}`,
        });
      }
      continue;
    }

    for (let i = 0; i < lista.length; i += LOTE) {
      const tanda = lista.slice(i, i + LOTE);
      const hsIds = tanda.map((p) => p.hubspotServiceId!);
      const [leidos, asociaciones] = await Promise.all([
        leerLote(hs, hsIds),
        leerAsociaciones(hs, hsIds),
      ]);

      for (const p of tanda) {
        const dato = leidos.get(p.hubspotServiceId!);
        const etiqueta = `${p.client.name} · ${p.name} (${p.status})`;
        if (!dato) {
          noResueltos.push({ etiqueta, motivo: "no está en ese portal (borrado o sin acceso)" });
          continue;
        }
        if (!dato.pipelineId) {
          noResueltos.push({ etiqueta, motivo: "el proyecto existe pero no tiene pipeline" });
          continue;
        }
        resueltos++;
        const rel = asociaciones.get(p.hubspotServiceId!) ?? [];
        const def = resolvePipeline(dato.pipelineId);
        console.log(
          `  ${etiqueta}\n      → pipeline ${dato.pipelineId} ` +
            `${def ? `("${def.label}")` : "(NO declarado en el registro → legacy)"}` +
            `${dato.interno ? "  · INTERNO" : ""}` +
            `${rel.length ? `  · ${rel.length} proyecto(s) asociado(s)` : ""}`,
        );
        if (APLICAR) {
          await prisma.project.update({
            where: { id: p.id },
            data: {
              hubspotPipelineId: dato.pipelineId,
              proyectoInterno: dato.interno,
              hubspotRelatedProjectIds: rel,
            },
          });
          escritos++;
          clientesTocados.add(p.clientId);
        }
      }
    }
  }

  /* ── Resolver los HERMANOS de los clientes tocados ─────────────────────────
     Sin esto quedaría una ventana —desde que el backfill escribe el pipeline hasta que
     alguien abra la ficha del cliente y dispare el sync— en la que un desarrollo que SÍ
     cuelga de una implementación se ve como "aparte" y por lo tanto FACTURABLE. Con 21
     proyectos cargados a mano, esa ventana serían varios proyectos apareciendo en cobranza
     por una razón que no existe. Se cierra acá, en la misma corrida. */
  if (APLICAR && clientesTocados.size > 0) {
    console.log(`\n── Resolviendo hermanos en ${clientesTocados.size} cliente(s) ──`);
    let vinculos = 0;
    for (const clientId of clientesTocados) {
      vinculos += await resolverHermanos(clientId, (m) => console.log(`  ${m}`));
    }
    console.log(`  ${vinculos} vínculo(s) actualizado(s).`);
  } else if (!APLICAR) {
    console.log(
      `\n  (en --apply también se resuelven los hermanos de los clientes tocados, para que` +
        ` ningún desarrollo hermano aparezca en cobranza mientras espera el próximo sync)`,
    );
  }

  console.log(`\n── Resumen ──`);
  console.log(`  resueltos: ${resueltos}${APLICAR ? `  ·  escritos: ${escritos}` : " (dry-run, no se escribió nada)"}`);
  console.log(`  sin resolver: ${noResueltos.length}  (se quedan en NULL → comportamiento legacy)`);
  const porMotivo = new Map<string, number>();
  for (const n of noResueltos) porMotivo.set(n.motivo, (porMotivo.get(n.motivo) ?? 0) + 1);
  for (const [motivo, n] of porMotivo) console.log(`     ${n} × ${motivo}`);
  if (noResueltos.length && noResueltos.length <= 30) {
    for (const n of noResueltos) console.log(`       · ${n.etiqueta}`);
  }
  if (!APLICAR && resueltos > 0) console.log(`\n  Para escribir: npx tsx scripts/backfill-project-pipeline.ts --apply`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(close);
