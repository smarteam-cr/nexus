/**
 * scripts/proponer-resultados.ts — arma HACIA ATRÁS la lista de resultados que persigue el cliente
 * en las cuentas con servicio activo (Elías, 2026-10-02: «el agente propone y el ejecutivo confirma»).
 *
 * Usa la misma puerta que el handoff (`leerOProponerResultados`): si el handoff tiene escrita la
 * sección de resultados, la lee; si no (los handoffs de antes de que el prompt la pidiera), la IA la
 * propone desde las reuniones del proyecto. Todo queda «sin confirmar» en `Project.handoffResultados`:
 * el CSE lo confirma en la lista del handoff. Lo editado o confirmado por una persona no se pisa.
 *
 * Cuáles: los proyectos de cartera (PROYECTO_DE_CARTERA_WHERE — activos, de Customer Success, no
 * internos) que tienen handoff y todavía NO tienen lista. Una o dos llamadas a Claude por proyecto.
 *
 * Uso (En tu PC):
 *   npx tsx scripts/proponer-resultados.ts                    ← en seco: lista a quién le tocaría
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/proponer-resultados.ts --apply --limit 10; Remove-Item Env:ALLOW_PROD_WRITE
 *   … --proyecto <id>                                         ← uno solo
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { prisma } from "@/lib/db/prisma";
import { PROYECTO_DE_CARTERA_WHERE } from "@/lib/projects/scope";
import { leerResultadosDelHandoff } from "@/lib/handoff/resultados-medibles";
import { leerOProponerResultados } from "@/lib/handoff/proponer-resultados";
import { describirDestino, resolverApply } from "./lib/guard";

const TABLAS = ["Project"];

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const APPLY = resolverApply({ tablas: TABLAS });
  const limite = Number(argumento("--limit") ?? "0") || Infinity;
  const soloUno = argumento("--proyecto");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe ni llama a la IA)"}`);

  const proyectos = await prisma.project.findMany({
    where: soloUno ? { id: soloUno } : { AND: [PROYECTO_DE_CARTERA_WHERE, { handoff: { isNot: null } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, handoffResultados: true, client: { select: { name: true } } },
  });

  const pendientes = proyectos.filter((p) => !leerResultadosDelHandoff(p.handoffResultados)?.resultados.length);
  console.log(`${proyectos.length} proyecto(s) con handoff · ${pendientes.length} todavía sin lista de resultados.`);

  let hechos = 0;
  for (const p of pendientes) {
    if (hechos >= limite) break;
    if (!APPLY) {
      console.log(`  · ${p.client.name} — ${p.name}`);
      continue;
    }
    const r = await leerOProponerResultados(p.id, { origen: "propuesta", triggeredByEmail: null });
    hechos++;
    const detalle =
      r.status === "leidos"
        ? `${r.resultados.length} leído(s) del handoff`
        : r.status === "propuestos"
          ? `${r.resultados.length} propuesto(s) desde las reuniones`
          : r.status === "error"
            ? `ERROR: ${r.error}`
            : "sin fuentes (ni sección escrita ni reuniones con contenido)";
    console.log(`  · ${p.client.name} — ${p.name}: ${detalle}`);
  }
  if (!APPLY) console.log("\nNada escrito. Con --apply se arman las listas (sin confirmar: las confirma el CSE).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
