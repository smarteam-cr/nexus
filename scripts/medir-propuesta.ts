/**
 * scripts/medir-propuesta.ts — SOLO LECTURA. Mide la propuesta abierta de un proyecto: PASA / NO PASA por condición
 * (M2 P2f, spec del replanteo §3.7, 2026-09-27).
 *
 * No escribe nada, nunca: abre UNA conexión, la deja en solo lectura (`SET SESSION CHARACTERISTICS AS TRANSACTION READ
 * ONLY`) y lee dentro de una transacción de solo lectura que termina en ROLLBACK. No usa `ALLOW_PROD_WRITE` ni `--apply`.
 *
 * La medición de M2 (Elías, después del deploy): 3 «Regenerar todo» en Wherex desde la pantalla, SIN aplicar, y después
 * de cada una:
 *
 *   npx tsx scripts/medir-propuesta.ts Wherex
 *
 * Las 4 condiciones tienen que pasar las 3 veces. El argumento es el id del proyecto o un pedazo de su nombre o del de
 * su cliente; si calza con más de uno, los lista y no mide. Las condiciones (y su porqué) viven en
 * lib/timeline/medicion-de-la-propuesta.ts, probadas contra lo que escribe la fusión de verdad.
 */
import "dotenv/config";
import { createScriptPool } from "./lib/db";
import { esBorradorV1, leerBorrador } from "../lib/timeline/borrador";
import { isRecurrente } from "../lib/tags/catalog";
import {
  avisosDeLaMedicion,
  medirM2,
  renglonDeLaCondicion,
  vivoDeLasFilas,
  type FilaDeFase,
  type FilaDeTarea,
} from "../lib/timeline/medicion-de-la-propuesta";

/** Un instante como lo da `toISOString()` (lo que ve la fusión con Prisma): la columna se guarda en UTC. */
const COMO_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

interface Proyecto {
  id: string;
  name: string;
  cliente: string;
  tags: string[];
  timelineId: string | null;
  ancla: string | null;
  pendingProposal: unknown;
}

async function main(): Promise<number> {
  const buscado = process.argv[2]?.trim();
  if (!buscado) {
    console.log("Uso: npx tsx scripts/medir-propuesta.ts <proyecto o cliente>   (ej.: Wherex)");
    return 1;
  }
  const { pool, close } = createScriptPool();
  const db = await pool.connect();
  try {
    // Solo lectura, en la sesión y en la transacción: ninguna consulta de este script puede escribir.
    await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    await db.query("BEGIN TRANSACTION READ ONLY");

    const { rows: proyectos } = await db.query<Proyecto>(
      `SELECT p.id, p.name, c.name AS cliente, p.tags, t.id AS "timelineId",
              to_char(t."anchorStartDate", ${COMO_ISO}) AS ancla, t."pendingProposal"
         FROM "Project" p
         JOIN "Client" c ON c.id = p."clientId"
         LEFT JOIN "ProjectTimeline" t ON t."projectId" = p.id
        WHERE p.id = $1 OR p.name ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%'
        ORDER BY c.name, p.name`,
      [buscado],
    );
    const conPropuesta = proyectos.filter((p) => p.pendingProposal !== null);
    const elegido = proyectos.length === 1 ? proyectos[0] : conPropuesta.length === 1 ? conPropuesta[0] : null;
    if (!elegido) {
      if (proyectos.length === 0) console.log(`Ningún proyecto calza con «${buscado}».`);
      else {
        console.log(`«${buscado}» calza con ${proyectos.length} proyectos; corre el script con el id del que quieres medir:`);
        for (const p of proyectos) console.log(`  ${p.id}  ${p.cliente} › ${p.name}${p.pendingProposal !== null ? "  (con propuesta abierta)" : ""}`);
      }
      return 1;
    }

    console.log(`\n══ ${elegido.cliente} › ${elegido.name}  [${elegido.id}] ══`);
    if (!elegido.timelineId || elegido.pendingProposal === null) {
      console.log("No hay propuesta abierta: regenera y vuelve a medir.");
      return 1;
    }
    if (!esBorradorV1(elegido.pendingProposal)) {
      console.log("La propuesta abierta no es un borrador-v1: no se puede medir.");
      return 1;
    }
    const borrador = leerBorrador(elegido.pendingProposal);
    if (!borrador) {
      console.log("La propuesta abierta no se deja leer: no se puede medir.");
      return 1;
    }

    const { rows: fases } = await db.query<FilaDeFase>(
      `SELECT id, name, "durationWeeks", "startWeek", "sessionCount", notes, "activityType", status::text AS status
         FROM "TimelinePhase" WHERE "timelineId" = $1 ORDER BY "order"`,
      [elegido.timelineId],
    );
    const { rows: tareas } = await db.query<FilaDeTarea>(
      `SELECT t.id, t."phaseId", t.title, t."weekIndex", t.notes, t.party::text AS party, t.type::text AS type,
              t.status::text AS status, t.source::text AS source, t."needsValidation", t."originFingerprint",
              to_char(t."startDateOverride", 'YYYY-MM-DD') AS "inicioFijado",
              to_char(t."dueDateOverride", 'YYYY-MM-DD') AS "finFijado"
         FROM "TimelineTask" t
        WHERE t."phaseId" = ANY($1::text[])
        ORDER BY t."weekIndex", t."order"`,
      [fases.map((f) => f.id)],
    );
    await db.query("ROLLBACK");

    const vivo = vivoDeLasFilas(elegido.ancla, fases, tareas);
    const hoy = new Date();
    const cuenta = (tipo: string) => borrador.cambios.filter((c) => c.tipo === tipo).length;
    console.log(
      `Propuesta: versión ${borrador.version} · ${borrador.pedido ?? "sin pedido"}${borrador.soloFase ? ` · solo la fase ${borrador.soloFase}` : ""}` +
        ` · ${cuenta("tarea-nueva")} nuevas · ${cuenta("tarea-se-va")} se quitan · ${borrador.observaciones.length} observaciones`,
    );
    console.log(`Medida el ${hoy.toISOString().slice(0, 16).replace("T", " ")} UTC, contra el cronograma de hoy.\n`);
    for (const aviso of avisosDeLaMedicion(borrador)) console.log(`⚠ ${aviso}`);

    const condiciones = medirM2({ vivo, borrador, recurrente: isRecurrente(elegido.tags ?? []), hoy });
    for (const c of condiciones) console.log(renglonDeLaCondicion(c));
    const fallan = condiciones.filter((c) => !c.pasa).length;
    console.log(fallan === 0 ? "\nPASAN las 4." : `\nNO PASAN ${fallan} de ${condiciones.length}.`);
    return fallan === 0 ? 0 : 2;
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    // La conexión quedó en solo lectura: se destruye, no vuelve al pool.
    db.release(true);
    await close();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
