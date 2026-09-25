/**
 * scripts/propuestas-abiertas.ts — LAS PROPUESTAS DEL CRONOGRAMA QUE ESTÁN ABIERTAS (E2a).
 *
 * Por qué existe: desde E2a, «Regenerar todo» deja UN borrador (`borrador-v1`) con fases y tareas en
 * `ProjectTimeline.pendingProposal`, y el handoff sigue dejando el formato viejo (solo fases) hasta
 * E2b. Antes de desplegar hay que saber qué quedó abierto a mitad de un camino que el deploy cambia,
 * y si hay que volver atrás, limpiar los v1 que la versión anterior no sabe leer (plan §3.1).
 *
 * Por cada propuesta abierta muestra el cliente, el proyecto, el `projectId`, el formato, el origen,
 * el token (`pendingProposalRunId`), quién y cuándo la abrió (de la corrida del token), los días que
 * lleva abierta y, en los v1, el estado de las tareas y los cambios por tipo (la medida de Wherex).
 *
 * Formatos (cada propuesta cae en UNO):
 *   · v1               — `borrador-v1` (E1/E2a).
 *   · viejo-con-tasks  — formato viejo con `tasks` en alguna fase (la vista previa del modificador):
 *                        el borrador no la lee.
 *   · viejo-contexto   — formato viejo de las reuniones y notas (`origen: "contexto"`): espera el
 *                        paso 2 de la cadena vieja.
 *   · viejo-handoff    — formato viejo del handoff (solo fases).
 *   · ilegible         — ni lo uno ni lo otro (sin `phases`): se lista para mirarlo a mano.
 *
 * Uso:
 *   listar (solo lectura):   npx tsx scripts/propuestas-abiertas.ts
 *   antes del deploy:        npx tsx scripts/propuestas-abiertas.ts --antes-del-deploy
 *                            → termina con código 1 si hay viejas de «contexto», viejas con `tasks`,
 *                              v1 o ilegibles (tienen que estar en 0 para desplegar E2a).
 *   vuelta atrás, en seco:   npx tsx scripts/propuestas-abiertas.ts --rollback
 *   vuelta atrás, de verdad: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --rollback --apply
 *                            → respalda ProjectTimeline con pg_dump (scripts/lib/guard.ts) y deja
 *                              cada v1 en null (`pendingProposal` y `pendingProposalRunId`), solo si
 *                              sigue siendo el mismo que se leyó.
 *
 * ⚠ Solo lee, salvo `--rollback --apply`. `--apply` sin `--rollback` no hace nada: se niega.
 */
import { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import {
  FORMATO_BORRADOR,
  esBorradorGuardado,
  esBorradorV1,
  estadoDeLasTareas,
  leerBorrador,
} from "../lib/timeline/borrador";
import { origenDePropuesta } from "../lib/timeline/proposal-deltas";

type Formato = "v1" | "viejo-con-tasks" | "viejo-contexto" | "viejo-handoff" | "ilegible";
const FORMATOS: readonly Formato[] = ["viejo-contexto", "viejo-handoff", "viejo-con-tasks", "v1", "ilegible"];
/** Los que frenan el deploy de E2a (§9.8 de la especificación): solo el viejo del handoff puede quedar. */
const FRENAN_EL_DEPLOY: readonly Formato[] = ["viejo-contexto", "viejo-con-tasks", "v1", "ilegible"];

const DIA_MS = 24 * 60 * 60 * 1000;

/** En qué formato está lo guardado. Puro. */
function formatoDe(json: unknown): Formato {
  if (esBorradorV1(json)) return "v1";
  const fases = (json as { phases?: unknown } | null)?.phases;
  if (!Array.isArray(fases)) return "ilegible";
  if (!esBorradorGuardado(json)) return "viejo-con-tasks";
  return origenDePropuesta(json as { origen?: unknown }) === "contexto" ? "viejo-contexto" : "viejo-handoff";
}

const fecha = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

async function main() {
  const ROLLBACK = process.argv.includes("--rollback");
  const ANTES_DEL_DEPLOY = process.argv.includes("--antes-del-deploy");
  if (process.argv.includes("--apply") && !ROLLBACK) {
    console.error("⛔ --apply solo va con --rollback: listar las propuestas no escribe nada.");
    process.exit(1);
  }
  // El guard (y el respaldo de ProjectTimeline) corre solo en la vuelta atrás de verdad.
  const APPLY = ROLLBACK ? resolverApply({ tablas: ["ProjectTimeline"] }) : false;

  const { prisma, close } = createScriptDb();
  try {
    const ahora = new Date();
    const filas = await prisma.projectTimeline.findMany({
      where: { pendingProposal: { not: Prisma.DbNull } },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        projectId: true,
        pendingProposal: true,
        pendingProposalRunId: true,
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    });

    // Las corridas del token (quién y cuándo) y las de las tareas de los v1 (su estado), en una lectura.
    const borradores = new Map(
      filas.map((f) => [f.id, esBorradorV1(f.pendingProposal) ? leerBorrador(f.pendingProposal, { ancla: null, fases: [] }) : null]),
    );
    const ids = new Set<string>();
    for (const f of filas) {
      if (f.pendingProposalRunId) ids.add(f.pendingProposalRunId);
      const corrida = borradores.get(f.id)?.tareas?.corrida;
      if (corrida) ids.add(corrida);
    }
    const corridas = new Map(
      (
        await prisma.agentRun.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, status: true, updatedAt: true, createdAt: true, triggeredByEmail: true, currentPhase: true },
        })
      ).map((r) => [r.id, r]),
    );

    const cuenta: Record<Formato, number> = { v1: 0, "viejo-con-tasks": 0, "viejo-contexto": 0, "viejo-handoff": 0, ilegible: 0 };
    const v1s: typeof filas = [];
    for (const f of filas) {
      const formato = formatoDe(f.pendingProposal);
      cuenta[formato]++;
      const token = f.pendingProposalRunId ? corridas.get(f.pendingProposalRunId) ?? null : null;
      const b = borradores.get(f.id) ?? null;
      const origen = b ? b.origen : origenDePropuesta(f.pendingProposal as { origen?: unknown } | null);

      console.log(`\n── ${f.project?.client?.name ?? "(sin cliente)"} › ${f.project?.name ?? "(sin proyecto)"}  [${f.projectId}]`);
      console.log(`   formato: ${formato} · origen: ${origen} · token: ${f.pendingProposalRunId ?? "—"}`);
      if (token) {
        const dias = Math.floor((ahora.getTime() - token.createdAt.getTime()) / DIA_MS);
        console.log(
          `   la abrió: ${token.triggeredByEmail ?? "(el sistema)"} · ${fecha(token.createdAt)} UTC · ` +
            `${dias} día${dias === 1 ? "" : "s"} abierta`,
        );
      } else {
        console.log(`   la abrió: ? (${f.pendingProposalRunId ? "la corrida del token ya no está" : "sin token"}) · días abierta: ?`);
      }
      if (formato === "v1") {
        v1s.push(f);
        if (!b) {
          console.log("   ⚠ v1 ilegible");
          continue;
        }
        const corrida = b.tareas?.corrida ? corridas.get(b.tareas.corrida) ?? null : null;
        const estado = estadoDeLasTareas(b.tareas, corrida, ahora);
        const porTipo = b.cambios.reduce<Record<string, number>>((acc, c) => {
          acc[c.tipo] = (acc[c.tipo] ?? 0) + 1;
          return acc;
        }, {});
        const tipos = Object.entries(porTipo).map(([t, n]) => `${t}:${n}`).join("  ") || "—";
        console.log(
          `   versión: ${b.version} · pedido: ${b.pedido ?? "—"} · tareas: ${estado ?? "no espera tareas"}` +
            (b.tareas?.corrida ? ` (corrida ${b.tareas.corrida}: ${corrida ? corrida.status : "sin fila"})` : ""),
        );
        console.log(`   cambios: ${b.cambios.length} (${tipos})${b.desconocidos ? ` · ⚠ desconocidos: ${b.desconocidos}` : ""}`);
      }
    }

    console.log(`\n══ Resumen: ${filas.length} propuesta${filas.length === 1 ? "" : "s"} abierta${filas.length === 1 ? "" : "s"}`);
    for (const k of FORMATOS) if (k !== "ilegible" || cuenta[k] > 0) console.log(`   ${k}: ${cuenta[k]}`);

    if (ANTES_DEL_DEPLOY) {
      const frenan = FRENAN_EL_DEPLOY.filter((k) => cuenta[k] > 0);
      if (frenan.length > 0) {
        console.error(
          `\n⛔ Antes del deploy tienen que estar en 0: ${frenan.map((k) => `${k} (${cuenta[k]})`).join(", ")}. ` +
            "Decídelas en su cronograma (aplicar o descartar) y vuelve a correr esto.",
        );
        process.exitCode = 1;
      } else {
        console.log("\n✓ Nada abierto que frene el deploy.");
      }
    }

    if (ROLLBACK) {
      console.log(`\n── Vuelta atrás: ${v1s.length} v1 ${APPLY ? "a limpiar" : "que se limpiarían (en seco)"}`);
      let limpiados = 0;
      for (const f of v1s) {
        if (!APPLY) continue;
        // Condicionada a lo que se leyó: si en el medio entró otra propuesta, no se pisa.
        const r = await prisma.projectTimeline.updateMany({
          where: {
            id: f.id,
            pendingProposalRunId: f.pendingProposalRunId,
            pendingProposal: { path: ["formato"], equals: FORMATO_BORRADOR },
          },
          data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
        });
        if (r.count === 1) limpiados++;
        else console.log(`   = ${f.projectId}: cambió desde que se leyó; no se toca.`);
      }
      if (APPLY) console.log(`   ${limpiados} de ${v1s.length} limpiados.`);
      else if (v1s.length > 0) {
        console.log("   DRY-RUN. Para limpiarlos (respalda ProjectTimeline antes):");
        console.log('   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --rollback --apply');
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
