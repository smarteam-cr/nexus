/**
 * scripts/propuestas-abiertas.ts — LAS PROPUESTAS DEL CRONOGRAMA QUE ESTÁN ABIERTAS (E2a, E2b, E3, E4).
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
 * (`excluidos`). E4: en cada vieja del handoff, cuántas ediciones posteriores leyó y qué dejaría la
 * conversión. Lo puro (formatos, qué frena, qué deja la vuelta atrás, la conversión) vive en
 * scripts/lib/propuestas-abiertas.ts; lo que lee y escribe la conversión, en
 * scripts/lib/conversion-de-viejas.ts.
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
 * ⭐ Desde E4 P4, este script es el ÚNICO que conoce el formato viejo: la app lee solo `borrador-v1`.
 *
 * Uso:
 *   listar (solo lectura):   npx tsx scripts/propuestas-abiertas.ts
 *   antes del deploy:        npx tsx scripts/propuestas-abiertas.ts --antes-del-deploy
 *                            → termina con código 1 si hay viejas de «contexto», viejas con `tasks`
 *                              o ilegibles (tienen que estar en 0 para desplegar E2b). Los v1 y las
 *                              viejas del handoff no frenan: E2b los lee.
 *   antes de E4 P4:          npx tsx scripts/propuestas-abiertas.ts --antes-de-e4
 *                            → termina con código 1 si queda CUALQUIER formato viejo o algo ilegible:
 *                              desde P4 solo se lee `borrador-v1`. Se corre contra producción justo
 *                              antes de ese deploy.
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
 *   E4 P3 · convertir las viejas del handoff, en seco:
 *                            npx tsx scripts/propuestas-abiertas.ts --convertir-viejas
 *                            → por cada una: cliente › proyecto, token, cuándo se creó, la lista
 *                              numerada como la verá el CSE («aplica», «⚠ …» o «ya está») y si se
 *                              convierte o se limpia. Se convierte contra el cronograma DEL DÍA EN QUE
 *                              SE CREÓ, reconstruido con `TimelineEvent`: lo editado a mano después
 *                              queda con ⚠ y no se aplica. Las viejas de «contexto», con `tasks`,
 *                              ilegibles o sin token o sin su corrida no se tocan («decídela en su
 *                              barra») y el script termina con código 1. Se esperan 0.
 *   E4 P3 · convertirlas de verdad:
 *                            $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --convertir-viejas --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *                            → respalda ProjectTimeline con pg_dump, guarda cada fila (la vieja y lo que
 *                              se escribe) en backups/<fecha>-propuestas-abiertas/viejas-convertidas.<hora>.json
 *                              ANTES de escribir, y escribe fila por fila solo si sigue siendo la vieja
 *                              que se leyó, con su token. Conserva el token (la autoría sigue diciendo
 *                              «desde el handoff del …»). Una que no deja nada por decidir se limpia.
 *   E4 P3 · deshacer la conversión:
 *                            npx tsx scripts/propuestas-abiertas.ts --deshacer-conversion <archivo>        (en seco)
 *                            $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --deshacer-conversion <archivo> --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *                            → con el JSON que dejó la conversión, devuelve cada fila a la vieja, solo si
 *                              sigue siendo lo que escribió la conversión.
 *                            ⚠ VALE SOLO ANTES DEL DEPLOY DE E4 P4: después, lo devuelto sería una
 *                              propuesta que la app ya no sabe leer.
 *
 * ⚠ Solo lee, salvo `--rollback`, `--desde-e3`, `--convertir-viejas` o `--deshacer-conversion` con
 *   `--apply`, de a uno. `--apply` solo no hace nada: se niega.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
  FRENAN_ANTES_DE_E4,
  FRENAN_EL_DEPLOY,
  TIPOS_DE_E3,
  convertirLaVieja,
  detalleDeLaConversion,
  diaYMes,
  esV1SoloDeFases,
  formatoDe,
  leerRespaldoDeViejas,
  lineaDelListado,
  rutaDelRespaldoDeViejas,
  traeAlgoDeE3,
  type ConversionDeLaVieja,
  type EntradaDeLaConversion,
  type Formato,
  type VivoConOrden,
} from "./lib/propuestas-abiertas";
import {
  deshacerLaConversion,
  escribirLaConversion,
  escrituraDeDeshacer,
  eventosPosteriores,
} from "./lib/conversion-de-viejas";

const DIA_MS = 24 * 60 * 60 * 1000;

const fecha = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

async function main() {
  const ROLLBACK = process.argv.includes("--rollback");
  const DESDE_E3 = process.argv.includes("--desde-e3");
  const CONVERTIR = process.argv.includes("--convertir-viejas");
  const iDeshacer = process.argv.indexOf("--deshacer-conversion");
  const DESHACER = iDeshacer >= 0;
  const ANTES_DEL_DEPLOY = process.argv.includes("--antes-del-deploy");
  const ANTES_DE_E4 = process.argv.includes("--antes-de-e4");
  const MODOS_QUE_ESCRIBEN = [ROLLBACK, DESDE_E3, CONVERTIR, DESHACER].filter(Boolean).length;
  if (process.argv.includes("--apply") && MODOS_QUE_ESCRIBEN === 0) {
    console.error(
      "⛔ --apply solo va con --rollback, --desde-e3, --convertir-viejas o --deshacer-conversion: listar las propuestas no escribe nada.",
    );
    process.exit(1);
  }
  if (MODOS_QUE_ESCRIBEN > 1) {
    console.error("⛔ --rollback, --desde-e3, --convertir-viejas y --deshacer-conversion son modos distintos: corre uno solo.");
    process.exit(1);
  }

  // El archivo de --deshacer-conversion se valida antes de todo: uno que no vale no respalda ni escribe.
  const archivo = DESHACER ? process.argv[iDeshacer + 1] : undefined;
  let aDeshacer: EntradaDeLaConversion[] = [];
  if (DESHACER) {
    if (!archivo || archivo.startsWith("--") || !existsSync(archivo)) {
      console.error(
        "⛔ --deshacer-conversion necesita el archivo que dejó --convertir-viejas --apply " +
          "(backups/<fecha>-propuestas-abiertas/viejas-convertidas.<hora>.json).",
      );
      process.exit(1);
    }
    const leido = leerRespaldoDeViejas(readFileSync(archivo, "utf8"));
    if ("error" in leido) {
      console.error(`⛔ ${archivo}: ${leido.error}. No se toca nada.`);
      process.exit(1);
    }
    aDeshacer = leido.entradas;
  }

  // El guard (y el respaldo de ProjectTimeline) corre solo en un modo que escribe, de verdad.
  const APPLY = MODOS_QUE_ESCRIBEN > 0 ? resolverApply({ tablas: ["ProjectTimeline"] }) : false;

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
        // E4 P3: lo de hoy, para convertir las viejas del handoff (el `order`, para desandarlo).
        anchorStartDate: true,
        phases: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            durationWeeks: true,
            startWeek: true,
            sessionCount: true,
            notes: true,
            activityType: true,
          },
        },
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    });
    const nombre = (f: (typeof filas)[number]) =>
      `${f.project?.client?.name ?? "(sin cliente)"} › ${f.project?.name ?? "(sin proyecto)"}`;

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

    /* E4 P3: cada vieja del handoff, convertida contra el cronograma del día en que se creó (la
       creación de la corrida del token: es anterior a la escritura de la propuesta, así que es
       conservador). Solo lectura: se calcula UNA vez y es lo mismo que escribe `--convertir-viejas`. */
    const conversiones = new Map<string, { r: ConversionDeLaVieja; ediciones: number; creada: Date | null; vivoHoy: VivoConOrden }>();
    for (const f of filas) {
      if (formatoDe(f.pendingProposal) !== "viejo-handoff") continue;
      const creada = f.pendingProposalRunId ? corridas.get(f.pendingProposalRunId)?.createdAt ?? null : null;
      const eventos = creada ? await eventosPosteriores(prisma, f.projectId, creada) : [];
      const vivoHoy: VivoConOrden = { ancla: f.anchorStartDate?.toISOString() ?? null, fases: f.phases };
      const r = convertirLaVieja({ json: f.pendingProposal, vivoHoy, creada, eventos });
      conversiones.set(f.id, { r, ediciones: eventos.length, creada, vivoHoy });
    }

    const cuenta: Record<Formato, number> = { v1: 0, "viejo-con-tasks": 0, "viejo-contexto": 0, "viejo-handoff": 0, ilegible: 0 };
    const v1s: typeof filas = [];
    for (const f of filas) {
      const formato = formatoDe(f.pendingProposal);
      cuenta[formato]++;
      const token = f.pendingProposalRunId ? corridas.get(f.pendingProposalRunId) ?? null : null;
      const b = borradores.get(f.id) ?? null;
      const origen = b ? b.origen : origenDePropuesta(f.pendingProposal as { origen?: unknown } | null);

      console.log(`\n── ${nombre(f)}  [${f.projectId}]`);
      console.log(`   formato: ${formato} · origen: ${origen} · token: ${f.pendingProposalRunId ?? "—"}`);
      if (token) {
        const dias = Math.floor((ahora.getTime() - token.createdAt.getTime()) / DIA_MS);
        // Sin email no se sabe quién la abrió: se dice solo cuándo (no «el sistema»).
        const cuando = `${fecha(token.createdAt)} UTC · ${dias} día${dias === 1 ? "" : "s"} abierta`;
        console.log(token.triggeredByEmail ? `   la abrió: ${token.triggeredByEmail} · ${cuando}` : `   abierta el ${cuando}`);
      } else {
        console.log(`   la abrió: ? (${f.pendingProposalRunId ? "la corrida del token ya no está" : "sin token"}) · días abierta: ?`);
      }
      const conversion = conversiones.get(f.id);
      if (conversion) {
        if (conversion.creada) console.log(`   ediciones posteriores leídas: ${conversion.ediciones}`);
        console.log(`   ${lineaDelListado(conversion.r)}`);
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

    if (ANTES_DE_E4) {
      // E4 P4: desde ese deploy solo se lee `borrador-v1`. Todo lo demás tiene que estar en 0.
      const frenanE4 = FRENAN_ANTES_DE_E4.filter((k) => cuenta[k] > 0);
      if (frenanE4.length > 0) {
        console.error(
          `\n⛔ Antes del deploy de E4 P4 tienen que estar en 0: ${frenanE4.map((k) => `${k} (${cuenta[k]})`).join(", ")}. ` +
            "Convierte las del handoff con --convertir-viejas, decide las demás en su cronograma y vuelve a correr esto.",
        );
        process.exitCode = 1;
      } else {
        console.log("\n✓ Nada en el formato viejo: se puede desplegar E4 P4.");
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

    if (CONVERTIR) {
      /* E4 P3: solo las viejas del handoff con fecha de creación. Las demás viejas (de «contexto», con
         `tasks`, ilegibles) y las del handoff sin token o sin su corrida no se tocan: se deciden en su
         barra, y el script termina con código 1. Se esperan 0. */
      const quedanFuera = filas.filter((f) => {
        const k = formatoDe(f.pendingProposal);
        return k !== "v1" && (k !== "viejo-handoff" || conversiones.get(f.id)?.r.tipo === "sin-fecha");
      });
      const aConvertir = filas.filter((f) => {
        const c = conversiones.get(f.id);
        return !!c && c.r.tipo !== "sin-fecha" && !!f.pendingProposalRunId;
      });
      console.log(
        `\n── Convertir las viejas del handoff: ${aConvertir.length} ${APPLY ? "a convertir o limpiar" : "que se convertirían o limpiarían (en seco)"}`,
      );
      for (const f of quedanFuera) {
        console.log(`   ⛔ ${nombre(f)}  [${f.projectId}] · ${formatoDe(f.pendingProposal)}: no se toca. Decídela en su barra.`);
      }
      const entradas: EntradaDeLaConversion[] = [];
      for (const f of aConvertir) {
        const c = conversiones.get(f.id)!;
        const creada = c.creada ? ` · creada el ${diaYMes(c.creada)}` : "";
        console.log(`\n   ${nombre(f)}  [${f.projectId}] · token ${f.pendingProposalRunId}${creada}`);
        for (const linea of detalleDeLaConversion(c.vivoHoy, c.r)) console.log(`     ${linea}`);
        entradas.push({
          projectId: f.projectId,
          timelineId: f.id,
          token: f.pendingProposalRunId!,
          original: f.pendingProposal,
          convertida: c.r.tipo === "convertida" ? c.r.borrador : null,
        });
      }
      if (APPLY) {
        const ruta = rutaDelRespaldoDeViejas(new Date());
        // ⛔ El respaldo JSON se escribe ANTES de la primera escritura (escribirLaConversion lo llama primero).
        const r = await escribirLaConversion(prisma, entradas, (todas) => {
          mkdirSync(dirname(ruta), { recursive: true });
          writeFileSync(ruta, JSON.stringify(todas, null, 2));
          console.log(`\n   respaldo de lo que se escribe: ${ruta}`);
        });
        for (const e of r.cambiaron) console.log(`   = ${e.projectId}: cambió desde que se leyó; no se toca.`);
        console.log(`   ${r.escritas.length} de ${entradas.length} convertidas o limpiadas.`);
        if (r.escritas.length > 0) {
          console.log("   Para deshacerla (SOLO antes del deploy de E4 P4):");
          console.log(
            `   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --deshacer-conversion ${ruta} --apply; Remove-Item Env:ALLOW_PROD_WRITE`,
          );
        }
      } else if (entradas.length > 0) {
        console.log("\n   DRY-RUN. Para convertirlas (respalda ProjectTimeline y guarda cada fila antes de escribir):");
        console.log(
          '   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --convertir-viejas --apply; Remove-Item Env:ALLOW_PROD_WRITE',
        );
      }
      if (quedanFuera.length > 0) process.exitCode = 1;
    }

    if (DESHACER) {
      console.log(
        `\n── Deshacer la conversión: ${aDeshacer.length} fila${aDeshacer.length === 1 ? "" : "s"} ${APPLY ? "a devolver" : "(en seco)"}`,
      );
      console.log("   ⚠ Solo antes del deploy de E4 P4: después, lo devuelto sería una propuesta que la app ya no sabe leer.");
      if (APPLY) {
        const r = await deshacerLaConversion(prisma, aDeshacer);
        for (const e of r.cambiaron) console.log(`   = ${e.projectId}: cambió desde la conversión; no se toca.`);
        console.log(`   ${r.escritas.length} de ${aDeshacer.length} devueltas a la vieja.`);
      } else {
        for (const e of aDeshacer) {
          const sigue = await prisma.projectTimeline.count({ where: escrituraDeDeshacer(e).where });
          console.log(`   · ${e.projectId}: ${sigue === 1 ? "se devolvería a la vieja" : "cambió desde la conversión; no se tocaría"}`);
        }
        if (aDeshacer.length > 0) {
          console.log("   DRY-RUN. Para devolverlas (respalda ProjectTimeline antes):");
          console.log(
            `   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/propuestas-abiertas.ts --deshacer-conversion ${archivo} --apply; Remove-Item Env:ALLOW_PROD_WRITE`,
          );
        }
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
