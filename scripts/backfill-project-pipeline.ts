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
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { resolvePipeline } from "@/lib/projects/kind";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const APLICAR = process.argv.includes("--apply");
const LOTE = 100; // techo de la API de batch/read de HubSpot

async function tokenDeCuenta(accountId: string): Promise<string | null> {
  const acc = await prisma.hubspotAccount.findUnique({ where: { id: accountId } });
  if (!acc) return null;
  if (new Date(acc.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) return acc.accessToken;
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: acc.refreshToken,
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  await prisma.hubspotAccount.update({
    where: { id: acc.id },
    data: {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    },
  });
  return j.access_token;
}

interface Leido {
  pipelineId: string | null;
  interno: boolean;
}

/** Lee un lote de proyectos de UN portal. Devuelve solo los que respondieron. */
async function leerLote(token: string, ids: string[]): Promise<Map<string, Leido>> {
  const out = new Map<string, Leido>();
  for (const slug of ["0-970", "projects", "PROJECT"]) {
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${slug}/batch/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: ids.map((id) => ({ id })),
        properties: ["hs_pipeline", "proyecto_interno"],
      }),
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
  const noResueltos: Array<{ etiqueta: string; motivo: string }> = [];
  for (const p of sinPortal) {
    noResueltos.push({
      etiqueta: `${p.client.name} · ${p.name} (${p.status})`,
      motivo: "el cliente no tiene portal de HubSpot ni hay cuenta del sistema",
    });
  }

  for (const [accountId, lista] of porPortal) {
    const token = await tokenDeCuenta(accountId);
    if (!token) {
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
      const leidos = await leerLote(token, tanda.map((p) => p.hubspotServiceId!));

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
        const def = resolvePipeline(dato.pipelineId);
        console.log(
          `  ${etiqueta}\n      → pipeline ${dato.pipelineId} ` +
            `${def ? `("${def.label}")` : "(NO declarado en el registro → legacy)"}` +
            `${dato.interno ? "  · INTERNO" : ""}`,
        );
        if (APLICAR) {
          await prisma.project.update({
            where: { id: p.id },
            data: { hubspotPipelineId: dato.pipelineId, proyectoInterno: dato.interno },
          });
          escritos++;
        }
      }
    }
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
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
