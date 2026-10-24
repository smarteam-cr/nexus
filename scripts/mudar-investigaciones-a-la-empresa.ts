/**
 * scripts/mudar-investigaciones-a-la-empresa.ts — las investigaciones que hicieron las preventas pasan a su empresa
 * (R5, primera parte; 2026-10-24).
 *
 * La radiografía de la preventa (casilla `radiografia` de `ExploracionDeVenta.contenido`: resumen, sector, herramientas
 * e hitos con su enlace) se copia a `InvestigacionDeEmpresa`, con origen `preventa` y el enlace a la preventa de la que
 * sale. La fecha es la de la última corrida de esa preventa que terminó bien (la radiografía no guarda la suya); si no
 * hay, la última vez que se tocó la preventa. Vence 6 meses después, como cualquier investigación. La preventa no se
 * toca: sigue leyendo su radiografía hasta el paso 2.
 *
 * Idempotente: una preventa que ya tiene su investigación mudada se salta. SIMULACRO por defecto.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/mudar-investigaciones-a-la-empresa.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/mudar-investigaciones-a-la-empresa.ts --apply
 * Antes: scripts/sql/2026-10-25-datos-de-la-empresa.sql aplicado.
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { venceLaInvestigacion } from "@/lib/clients/investigacion/pedido";

const APPLY = resolverApply({ tablas: ["InvestigacionDeEmpresa"] });

interface Radiografia {
  resumen?: string;
  sector?: string;
  stack?: string[];
  hitos?: { texto: string; fecha?: string; url: string }[];
}

const esRadiografia = (x: unknown): x is Radiografia => typeof x === "object" && x !== null && !Array.isArray(x);

async function main() {
  console.log(APPLY ? "── APPLY: escribe en la base ──" : "── SIMULACRO: no escribe nada ──");
  const preventas = await prisma.exploracionDeVenta.findMany({
    where: { projectId: null },
    select: { id: true, clientId: true, contenido: true, updatedAt: true, client: { select: { name: true } } },
  });
  const yaMudadas = new Set(
    (await prisma.investigacionDeEmpresa.findMany({ where: { exploracionId: { not: null } }, select: { exploracionId: true } })).map((i) => i.exploracionId),
  );

  let mudadas = 0;
  let saltadas = 0;
  for (const p of preventas) {
    const r = (p.contenido as { casillas?: { radiografia?: unknown } } | null)?.casillas?.radiografia;
    if (!esRadiografia(r) || !(r.resumen || r.sector || r.hitos?.length)) continue;
    if (yaMudadas.has(p.id)) {
      saltadas++;
      continue;
    }
    const corrida = await prisma.agentRun.findFirst({
      where: { clientId: p.clientId, agentSlug: "exploracion-de-venta", status: "DONE", filters: { path: ["exploracionId"], equals: p.id } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const hechaAt = corrida?.createdAt ?? p.updatedAt;
    const hitos = (r.hitos ?? []).filter((h) => h && typeof h.url === "string");
    console.log(`  ${p.client.name}: ${hechaAt.toISOString().slice(0, 10)} · ${hitos.length} hitos${r.sector ? ` · ${r.sector}` : ""}`);
    if (APPLY) {
      await prisma.investigacionDeEmpresa.create({
        data: {
          clientId: p.clientId,
          hechaAt,
          venceAt: venceLaInvestigacion(hechaAt),
          origen: "preventa",
          exploracionId: p.id,
          resumen: r.resumen ?? null,
          contenido: { ...(r.sector ? { sector: r.sector } : {}), ...(r.stack?.length ? { stack: r.stack } : {}), ...(hitos.length ? { hitos } : {}) } as Prisma.InputJsonValue,
          fuentes: [...new Set(hitos.map((h) => h.url))].map((url) => ({ url })) as Prisma.InputJsonValue,
          contrataciones: [] as Prisma.InputJsonValue,
        },
      });
    }
    mudadas++;
  }
  console.log(`\nPreventas: ${preventas.length} · con investigación para mudar: ${mudadas} · ya mudadas antes: ${saltadas}`);
  if (!APPLY) console.log("Simulacro: nada se escribió. Con --apply (y ALLOW_PROD_WRITE=1) se muda esto mismo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
