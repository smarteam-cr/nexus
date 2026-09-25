/**
 * scripts/propuestas-abiertas.ts — LAS PROPUESTAS DEL CRONOGRAMA QUE ESTÁN ABIERTAS (E2a, E2b, E3).
 *
 * Por qué existe: desde E2a, «Regenerar todo» deja UN borrador (`borrador-v1`) con fases y tareas en
 * `ProjectTimeline.pendingProposal`. Desde E2b también lo dejan el handoff (solo fases, sin tareas) y
 * «Regenerar» de una fase (`soloFase`). Antes de desplegar hay que saber qué quedó abierto a mitad de
 * un camino que el deploy cambia, y si hay que volver atrás, limpiar los v1 que la versión anterior
 * no sabe leer (plan §3.1).
 *
 * Por cada propuesta abierta muestra el cliente, el proyecto, el `projectId`, el formato, el origen,
 * el token (`pendingProposalRunId`), quién y cuándo la abrió (de la corrida del token), los días que
 * lleva abierta y, en los v1, `soloFase`, el estado de las tareas y los cambios por tipo (la medida
 * de Wherex). E3: también cuántos dictó el chat (`porChat`) y cuántas casillas desmarcadas guarda
 * (`excluidos`). Lo puro (formatos, qué frena, qué deja la vuelta atrás) vive en
 * scripts/lib/propuestas-abiertas.ts.
 *
 * Formatos (cada propuesta cae en UNO):
 *   · v1               — `borrador-v1` (E1, E2a, E2b).
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
 *                            → termina con código 1 si hay viejas de «contexto», viejas con `tasks`
 *                              o ilegibles (tienen que estar en 0 para desplegar E2b). Los v1 y las
 *                              viejas del handoff no frenan: E2b los lee.
 *   vuelta atrás, en seco:   npx tsx scripts/propuestas-abiertas.ts --rollback
 *   vuelta atrás, de verdad: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --rollback --apply
 *                            → respalda ProjectTimeline con pg_dump (scripts/lib/guard.ts) y deja
 *                              en null (`pendingProposal` y `pendingProposalRunId`) cada v1 que no es
 *                              «solo de fases», solo si sigue siendo el mismo que se leyó. Los v1 solo
 *                              de fases (sin tareas y sin ningún `tarea-*`, los del handoff) se
 *                              quedan: E1 los lee bien.
 *   vuelta atrás a E2c, en seco:   npx tsx scripts/propuestas-abiertas.ts --desde-e3
 *   vuelta atrás a E2c, de verdad: $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --desde-e3 --apply
 *                            → cuenta (y con --apply respalda ProjectTimeline y deja en null) cada v1
 *                              que trae algo de E3: un `tarea-cambia` o `fase-se-va`, casillas
 *                              guardadas (`excluidos`) o algo dictado por el chat (`porChat`). E2c
 *                              bloquea lo primero e ignora lo demás en silencio. Condicionada a lo leído.
 *
 * ⚠ Solo lee, salvo `--rollback --apply` y `--desde-e3 --apply`. `--apply` solo no hace nada: se niega.
 */
import { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import {
  FORMATO_BORRADOR,
  esBorradorV1,
  estadoDeLasTareas,
  leerBorrador,
} from "../lib/timeline/borrador";
import { origenDePropuesta } from "../lib/timeline/proposal-deltas";
import {
  FORMATOS,
  FRENAN_EL_DEPLOY,
  TIPOS_DE_E3,
  esV1SoloDeFases,
  formatoDe,
  traeAlgoDeE3,
  type Formato,
} from "./lib/propuestas-abiertas";

const DIA_MS = 24 * 60 * 60 * 1000;

const fecha = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

async function main() {
  const ROLLBACK = process.argv.includes("--rollback");
  const DESDE_E3 = process.argv.includes("--desde-e3");
  const ANTES_DEL_DEPLOY = process.argv.includes("--antes-del-deploy");
  if (process.argv.includes("--apply") && !ROLLBACK && !DESDE_E3) {
    console.error("⛔ --apply solo va con --rollback o --desde-e3: listar las propuestas no escribe nada.");
    process.exit(1);
  }
  if (ROLLBACK && DESDE_E3) {
    console.error("⛔ --rollback y --desde-e3 son dos vueltas atrás distintas: corre una sola.");
    process.exit(1);
  }
  // El guard (y el respaldo de ProjectTimeline) corre solo en una vuelta atrás de verdad.
  const APPLY = ROLLBACK || DESDE_E3 ? resolverApply({ tablas: ["ProjectTimeline"] }) : false;

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
        // «Regenerar» de una fase (E2b): su id, y su nombre cuando ya se armaron sus tareas.
        const nombreDeLaFase = b.soloFase ? b.tareasArmadasPara[b.soloFase]?.nombre : undefined;
        const soloFase = b.soloFase ? `${b.soloFase}${nombreDeLaFase ? ` («${nombreDeLaFase}»)` : ""}` : "—";
        console.log(
          `   versión: ${b.version} · pedido: ${b.pedido ?? "—"} · soloFase: ${soloFase} · tareas: ${estado ?? "no espera tareas"}` +
            (b.tareas?.corrida ? ` (corrida ${b.tareas.corrida}: ${corrida ? corrida.status : "sin fila"})` : ""),
        );
        console.log(`   cambios: ${b.cambios.length} (${tipos})${b.desconocidos ? ` · ⚠ desconocidos: ${b.desconocidos}` : ""}`);
        // E3: lo que dictó el chat y las casillas guardadas en el servidor.
        const delChat = b.cambios.filter((c) => c.porChat).length;
        console.log(`   del chat: ${delChat} · desmarcados guardados: ${b.excluidos?.length ?? 0}`);
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
      // Los v1 solo de fases (los del handoff) se quedan: E1 los lee bien (E2b, P8).
      const aLimpiar = v1s.filter((f) => !esV1SoloDeFases(f.pendingProposal));
      const quedan = v1s.length - aLimpiar.length;
      console.log(`\n── Vuelta atrás: ${aLimpiar.length} v1 ${APPLY ? "a limpiar" : "que se limpiarían (en seco)"}`);
      if (quedan > 0) console.log(`   ${quedan} v1 solo de fases se quedan: E1 los lee bien.`);
      let limpiados = 0;
      for (const f of aLimpiar) {
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
      if (APPLY) console.log(`   ${limpiados} de ${aLimpiar.length} limpiados.`);
      else if (aLimpiar.length > 0) {
        console.log("   DRY-RUN. Para limpiarlos (respalda ProjectTimeline antes):");
        console.log('   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --rollback --apply');
      }
    }

    if (DESDE_E3) {
      /* La vuelta atrás a E2c: los v1 con algo de E3. E2c lee los tipos de E3 como desconocidos (y
         bloquea), e ignora `excluidos` y `porChat` en silencio. */
      const deE3 = v1s.filter((f) => traeAlgoDeE3(f.pendingProposal));
      console.log(`\n── Vuelta atrás a E2c: ${deE3.length} v1 con algo de E3 ${APPLY ? "a limpiar" : "que se limpiarían (en seco)"}`);
      for (const f of deE3) {
        const b = borradores.get(f.id);
        const crudos = (f.pendingProposal as { cambios?: unknown[] } | null)?.cambios ?? [];
        const deTipoE3 = crudos.filter((c) => TIPOS_DE_E3.includes(String((c as { tipo?: unknown } | null)?.tipo))).length;
        console.log(
          `   · ${f.projectId}: ${deTipoE3} de tipo E3 · ${b?.cambios.filter((c) => c.porChat).length ?? 0} del chat · ` +
            `${b?.excluidos?.length ?? 0} desmarcados guardados`,
        );
      }
      let limpios = 0;
      for (const f of deE3) {
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
        if (r.count === 1) limpios++;
        else console.log(`   = ${f.projectId}: cambió desde que se leyó; no se toca.`);
      }
      if (APPLY) console.log(`   ${limpios} de ${deE3.length} limpiados.`);
      else if (deE3.length > 0) {
        console.log("   DRY-RUN. Para limpiarlos (respalda ProjectTimeline antes):");
        console.log('   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --desde-e3 --apply');
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
