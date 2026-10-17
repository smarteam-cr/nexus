/**
 * scripts/limpiar-analisis-de-otra-reunion.ts — QUITA LO QUE NEXUS ESCRIBIÓ CON EL TEXTO DE OTRA REUNIÓN.
 *
 * Una sola vez, con el arreglo de lib/google/drive-candidatos.ts + lib/sessions/reanalizar.ts (escrito el 2026-10-05,
 * llevado a la lectura de seguimiento el 2026-10-17). Hasta ese arreglo, una reunión sin documento adjunto se llenaba con
 * el archivo más nuevo de Drive que tuviera las dos primeras palabras de 4+ letras de su título. Eso dejó dos clases de
 * daño:
 *
 *   A. TRANSCRIPCIONES DE OTRA REUNIÓN que siguen guardadas (la reunión nunca recibió su documento): el encabezado de
 *      Gemini nombra otra reunión, el texto no es de una reunión (contratos, briefs) o es idéntico al de otra reunión (la
 *      serie diaria con el texto de otro día). Esas reuniones alimentan handoffs, cronogramas y fichas por el chokepoint
 *      como si fueran del cliente.
 *      → Se borra el texto (transcripción, resumen, temas) y lo intacto de su lectura, se retiran sus hechos pendientes,
 *        su lectura vuelve a `sin_texto` y se vuelve a encolar el enriquecimiento: la búsqueda NUEVA solo trae el archivo
 *        de esa reunión, o nada. Cuando llega el suyo, la cola la lee.
 *
 *   B. MINUTAS ESCRITAS CON EL TEXTO DE OTRA REUNIÓN cuya reunión después recibió el texto correcto («Recurrente - CAV»
 *      con las notas de «FACO Recurrente»; «ICB + Smarteam» con las de Cayalá). La regla de
 *      lib/sessions/texto-de-otra-reunion.ts dice de qué reunión salió cada minuta.
 *      → Se borran la minuta y los pedidos fuera de alcance de esa corrida y se retiran sus hechos pendientes. Las de los
 *        últimos 14 días vuelven a la cola de la lectura con el texto que ya tienen. Las DUDOSAS solo se listan.
 *
 * Solo se informa (no se toca): las corridas de agentes (handoffs) que leyeron los textos de A; las propuestas de Tarea
 * que nadie decidió (las escribe solo lib/tareas: vencen solas a los 14 días, y sus ids quedan en el respaldo); y los
 * compromisos viejos (`ActionItem`, retirado) que quedaron en un cliente que no es el dueño de su reunión. Los
 * compromisos viejos INTACTOS de A y B sí se borran: son lo único que todavía guarda lo que escribió la lectura vieja.
 *
 * Lo que alguien trabajó NO se borra nunca: una minuta revisada, una tarea decidida, un pedido decidido, un hecho usado,
 * un compromiso viejo hecho, en curso, borrado o editado. Se listan para que una persona decida.
 *
 *   npx tsx scripts/limpiar-analisis-de-otra-reunion.ts                        # simulacro
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/limpiar-analisis-de-otra-reunion.ts --apply --ya-desplegado
 *
 * En PowerShell: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/limpiar-analisis-de-otra-reunion.ts --apply --ya-desplegado`.
 * `--solo=<sessionId,...>` limita el simulacro y la escritura a esas reuniones.
 *
 * ⚠ `--apply` exige `--ya-desplegado`: lo que se re-encola lo relee la app, y con la búsqueda VIEJA volvería a leer el
 * mismo archivo ajeno (y a escribir una minuta con él). Primero el deploy. Correrlo dos veces no cambia nada la segunda.
 * Respaldo: el pg_dump del guard y, además, un JSON con las filas que se tocan en
 * `backups/<fecha>-limpiar-analisis-de-otra-reunion/`.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createScriptDb } from "./lib/db";
import { nombreDelScript, planDeRespaldo, resolverApply } from "./lib/guard";
import { mismoTitulo } from "@/lib/google/drive-candidatos";
import { ANALISIS_AUTOMATICO_HASTA_MS, planDeLimpieza, type PlanDeLimpieza } from "@/lib/sessions/analisis-ajeno";
import { cargarAnalisis, limpiarAnalisis, type AnalisisDeLaReunion } from "@/lib/sessions/analisis-ajeno-db";
import {
  copiaDeOtraReunion,
  cuantoExplica,
  indexarTextos,
  laBusquedaViejaLaTomaba,
  palabrasDistintivas,
  procedenciaDelTexto,
  veredictoDeMinuta,
  type ReunionConTexto,
} from "@/lib/sessions/texto-de-otra-reunion";

const TABLAS = ["FirefliesSession", "SessionMinute", "PedidoFueraDeAlcance", "ActionItem", "HechoDeReunion", "LecturaDeReunion"];
const QUIERE_ESCRIBIR = process.argv.includes("--apply");
if (QUIERE_ESCRIBIR && !process.argv.includes("--ya-desplegado")) {
  console.error(
    "⛔ --apply necesita --ya-desplegado: las reuniones se vuelven a encolar y las relee la app. Con la búsqueda\n" +
      "   vieja en producción volverían a leer el mismo archivo ajeno. Primero el deploy, después este script.",
  );
  process.exit(1);
}
const APPLY = resolverApply({ tablas: TABLAS });
const SOLO = new Set(
  (process.argv.find((a) => a.startsWith("--solo="))?.slice("--solo=".length) ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
const DIA_MS = 86_400_000;
/** Las reuniones de alrededor contra las que se compara una minuta (la búsqueda vieja miraba ±3 días). */
const VECINDAD_MS = 4 * DIA_MS;
/** Un compromiso viejo (`ActionItem`) que alguien editó después de crearse (el create y su updatedAt llegan juntos). */
const MARGEN_DE_EDICION_MS = 60_000;
const NOTA_DE_LOS_HECHOS = "El texto de la reunión era de otra reunión: se retiró lo que dejó";

const { prisma, pool, close } = createScriptDb();

interface Sesion {
  id: string;
  title: string;
  date: Date;
  owner: string | null;
}

/** Un compromiso viejo de la lectura (retirado: solo se lee y se borra lo intacto, nunca se crea). */
interface AccionVieja {
  id: string;
  sessionId: string;
  text: string;
  status: string;
  done: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const accionTocada = (a: AccionVieja) =>
  a.done || a.status !== "PENDING" || a.deletedAt !== null || a.updatedAt.getTime() - a.createdAt.getTime() > MARGEN_DE_EDICION_MS;

const fecha = (d: Date) => d.toISOString().slice(0, 10);
const corto = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function resumenDelPlan(plan: PlanDeLimpieza, viejas: AccionVieja[]): string {
  const partes = [
    `minuta ${plan.minutaABorrar ? "se borra" : plan.minutaRevisada ? "REVISADA, queda" : "—"}`,
    plan.pedidosABorrar.length ? `${plan.pedidosABorrar.length} pedido(s) se borran` : "",
    plan.hechosARetirar.length ? `${plan.hechosARetirar.length} hecho(s) se retiran` : "",
    plan.propuestasSinDecidir.length ? `${plan.propuestasSinDecidir.length} tarea(s) propuesta(s) sin decidir quedan (vencen solas)` : "",
    plan.tareasDecididas.length ? `${plan.tareasDecididas.length} tarea(s) DECIDIDA(S) quedan` : "",
    plan.pedidosDecididos.length ? `${plan.pedidosDecididos.length} pedido(s) DECIDIDO(S) quedan` : "",
    plan.hechosUsados.length ? `${plan.hechosUsados.length} hecho(s) USADO(S) quedan` : "",
    viejas.filter((a) => !accionTocada(a)).length ? `${viejas.filter((a) => !accionTocada(a)).length} compromiso(s) viejo(s) se borran` : "",
    viejas.filter(accionTocada).length ? `${viejas.filter(accionTocada).length} compromiso(s) viejo(s) TRABAJADO(S) quedan` : "",
  ];
  return partes.filter(Boolean).join(", ");
}

async function main() {
  // El destino ya lo imprime createScriptDb.
  console.log(`${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"}${SOLO.size ? ` · solo ${[...SOLO].join(", ")}` : ""}\n`);

  // Nombres de clientes y un índice liviano de TODAS las reuniones (título, fecha y dueño).
  const clientes = new Map(
    (await pool.query<{ id: string; name: string }>(`SELECT id, name FROM "Client"`)).rows.map((c) => [c.id, c.name]),
  );
  const nombre = (id: string | null) => (id ? clientes.get(id) ?? "(cliente borrado)" : "sin dueño");
  const todas: Sesion[] = (
    await pool.query<{ id: string; title: string; date: Date; owner: string | null }>(
      `SELECT id, title, date, coalesce("resolvedClientId", "manualClientId") AS owner FROM "FirefliesSession"`,
    )
  ).rows;
  const porId = new Map(todas.map((s) => [s.id, s]));
  const reunionLlamada = (titulo: string, cerca: Date, excepto: string): Sesion | null => {
    const cand = todas.filter(
      (s) => s.id !== excepto && Math.abs(s.date.getTime() - cerca.getTime()) <= VECINDAD_MS && mismoTitulo(s.title, titulo),
    );
    cand.sort((a, b) => Math.abs(a.date.getTime() - cerca.getTime()) - Math.abs(b.date.getTime() - cerca.getTime()));
    return cand[0] ?? null;
  };
  const accionesViejas = async (ids: string[]): Promise<AccionVieja[]> =>
    ids.length
      ? (
          await pool.query<AccionVieja>(
            `SELECT id, "sessionId", text, status::text AS status, done, "deletedAt", "createdAt", "updatedAt"
               FROM "ActionItem" WHERE "sessionId" = ANY($1) AND source LIKE 'agent:post-session%'`,
            [ids],
          )
        ).rows
      : [];

  // ── A. Transcripciones de otra reunión que siguen guardadas ────────────────────────────────
  const deDrive = (
    await pool.query<{ id: string; title: string; date: Date; owner: string | null; l1: string; h: string }>(
      `SELECT id, title, date, coalesce("resolvedClientId", "manualClientId") AS owner,
              left(transcript, 400) AS l1, md5(transcript) AS h
         FROM "FirefliesSession"
        WHERE source = 'google_meet' AND "googleDocId" IS NULL AND transcript IS NOT NULL`,
    )
  ).rows.filter((s) => !SOLO.size || SOLO.has(s.id));
  const copias = new Map<string, ReunionConTexto[]>();
  for (const r of (
    await pool.query<{ h: string; id: string; title: string; date: Date; con_doc: boolean }>(
      `SELECT md5(transcript) AS h, id, title, date, "googleDocId" IS NOT NULL AS con_doc
         FROM "FirefliesSession"
        WHERE transcript IS NOT NULL AND md5(transcript) IN (
          SELECT md5(transcript) FROM "FirefliesSession" WHERE transcript IS NOT NULL GROUP BY 1 HAVING count(*) > 1)`,
    )
  ).rows) {
    const g = copias.get(r.h) ?? [];
    g.push({ id: r.id, title: r.title, date: r.date, conDoc: r.con_doc });
    copias.set(r.h, g);
  }

  type Ajena = Sesion & { motivo: string; origen: Sesion | null; otroCliente: boolean };
  const ajenas: Ajena[] = [];
  for (const s of deDrive) {
    const p = procedenciaDelTexto(s.title, s.l1);
    const duena = copiaDeOtraReunion({ id: s.id, title: s.title, date: s.date, conDoc: false }, copias.get(s.h) ?? []);
    let motivo: string | null = null;
    let origen: Sesion | null = null;
    if (p.tipo === "otra-reunion") {
      origen = reunionLlamada(p.encabezado, s.date, s.id);
      motivo = `el texto es de «${corto(p.encabezado, 60)}»`;
    } else if (p.tipo === "no-es-una-reunion") {
      motivo = p.primeraLinea ? `no es una reunión: «${corto(p.primeraLinea, 50)}»` : "no es una reunión (sin encabezado)";
    } else if (duena) {
      origen = porId.get(duena.id) ?? null;
      motivo = `el mismo texto que «${corto(duena.title, 50)}» del ${fecha(duena.date)}${duena.conDoc ? " (que lo tiene adjunto)" : ""}`;
    }
    if (!motivo) continue;
    const otroCliente = !!origen?.owner && !!s.owner && origen.owner !== s.owner;
    ajenas.push({ id: s.id, title: s.title, date: s.date, owner: s.owner, motivo, origen, otroCliente });
  }
  const idsAjenas = new Set(ajenas.map((a) => a.id));
  const analisisA = new Map<string, AnalisisDeLaReunion>();
  for (const a of ajenas) analisisA.set(a.id, await cargarAnalisis(prisma, a.id));
  const viejasA = await accionesViejas([...idsAjenas]);

  console.log(`══ A. Transcripciones de OTRA reunión que siguen guardadas: ${ajenas.length} (de ${deDrive.length} que se llenaron desde Drive)`);
  console.log(`   de otro cliente: ${ajenas.filter((a) => a.otroCliente).length} · con minuta: ${[...analisisA.values()].filter((x) => x.minuta).length}`);
  for (const a of ajenas.sort((x, y) => y.date.getTime() - x.date.getTime())) {
    const plan = planDeLimpieza(analisisA.get(a.id)!);
    const origenTxt = a.origen ? ` ← ${fecha(a.origen.date)}, ${nombre(a.origen.owner)}` : "";
    const detalle = resumenDelPlan(plan, viejasA.filter((x) => x.sessionId === a.id));
    console.log(`   ${a.otroCliente ? "⚠" : "·"} ${fecha(a.date)} «${corto(a.title, 55)}» (${nombre(a.owner)}): ${a.motivo}${origenTxt}${detalle ? ` · ${detalle}` : ""}`);
  }

  // ── B. Minutas escritas con el texto de otra reunión ───────────────────────────────────────
  const candidatas = (
    await pool.query<{
      id: string; title: string; date: Date; owner: string | null;
      msum: string; magr: string | null; mdec: string | null; mrisk: string | null; mtop: string | null;
    }>(
      `SELECT s.id, s.title, s.date, coalesce(s."resolvedClientId", s."manualClientId") AS owner,
              m.summary AS msum, m.agreements::text AS magr, m.decisions::text AS mdec, m.risks::text AS mrisk, m.topics::text AS mtop
         FROM "SessionMinute" m
         JOIN "FirefliesSession" s ON s.id = m."sessionId"
         LEFT JOIN "AgentRun" ar ON ar.id = m."generatedByAgentRunId"
        WHERE s."enrichedAt" IS NOT NULL
          AND coalesce(ar."createdAt", m."createdAt") < s."enrichedAt" - interval '2 minutes'
        ORDER BY s.date DESC`,
    )
  ).rows.filter((c) => !idsAjenas.has(c.id) && (!SOLO.size || SOLO.has(c.id)));

  type Veredicto = { c: (typeof candidatas)[number]; propia: number; mejor: Sesion | null; mejorExplica: number; v: string };
  const veredictos: Veredicto[] = [];
  if (candidatas.length > 0) {
    const desde = new Date(Math.min(...candidatas.map((c) => c.date.getTime())) - VECINDAD_MS);
    const hasta = new Date(Math.max(...candidatas.map((c) => c.date.getTime())) + VECINDAD_MS);
    // El texto de cada reunión de esos días: su resumen y el comienzo y el final de la transcripción.
    const textos = (
      await pool.query<{ id: string; texto: string }>(
        `SELECT id, coalesce(summary::text, '') || ' ' || coalesce(left(transcript, 20000), '') || ' ' || coalesce(right(transcript, 6000), '') AS texto
           FROM "FirefliesSession"
          WHERE date BETWEEN $1 AND $2 AND (transcript IS NOT NULL OR summary IS NOT NULL)`,
        [desde, hasta],
      )
    ).rows;
    const indice = indexarTextos(textos);
    // Lo que escribió la lectura además de la minuta: los compromisos viejos y, desde la etapa 2, las tareas propuestas.
    const ids = candidatas.map((c) => c.id);
    const extras = [
      ...(await accionesViejas(ids)).map((a) => ({ sessionId: a.sessionId, text: a.text })),
      ...(
        await pool.query<{ sessionId: string; text: string }>(
          `SELECT "sessionId", titulo AS text FROM "Tarea" WHERE "sessionId" = ANY($1) AND "origenId" LIKE 'l:%'`,
          [ids],
        )
      ).rows,
    ];
    for (const c of candidatas) {
      const minuta = [c.msum, c.magr, c.mdec, c.mrisk, c.mtop, ...extras.filter((a) => a.sessionId === c.id).map((a) => a.text)]
        .filter(Boolean)
        .join(" ");
      const palabras = palabrasDistintivas(minuta);
      const propia = cuantoExplica(indice, palabras, c.id);
      let mejor: Sesion | null = null;
      let mejorExplica = 0;
      for (const t of textos) {
        const s = porId.get(t.id);
        if (!s || s.id === c.id || Math.abs(s.date.getTime() - c.date.getTime()) > VECINDAD_MS) continue;
        const e = cuantoExplica(indice, palabras, s.id);
        if (e > mejorExplica) {
          mejorExplica = e;
          mejor = s;
        }
      }
      const v = veredictoDeMinuta(
        propia,
        mejor ? { explica: mejorExplica, laBusquedaViejaLaTomaba: laBusquedaViejaLaTomaba(c.title, mejor.title) } : null,
      );
      veredictos.push({ c, propia, mejor, mejorExplica, v });
    }
  }
  const deOtra = veredictos.filter((x) => x.v === "otra-reunion");
  const dudosas = veredictos.filter((x) => x.v === "dudosa");
  const analisisB = new Map<string, AnalisisDeLaReunion>();
  for (const x of deOtra) analisisB.set(x.c.id, await cargarAnalisis(prisma, x.c.id));
  const viejasB = await accionesViejas(deOtra.map((x) => x.c.id));
  const ahora = Date.now();
  const reciente = (d: Date) => ahora - d.getTime() <= ANALISIS_AUTOMATICO_HASTA_MS;

  console.log(
    `\n══ B. Minutas escritas antes del último cambio de texto de su reunión: ${veredictos.length}` +
      ` → de OTRA reunión ${deOtra.length} · dudosas ${dudosas.length} · de la misma reunión ${veredictos.length - deOtra.length - dudosas.length}`,
  );
  for (const x of deOtra) {
    const plan = planDeLimpieza(analisisB.get(x.c.id)!);
    const otroCliente = !!x.mejor?.owner && !!x.c.owner && x.mejor.owner !== x.c.owner;
    console.log(
      `   ${otroCliente ? "⚠" : "·"} ${fecha(x.c.date)} «${corto(x.c.title, 50)}» (${nombre(x.c.owner)}) ← «${corto(x.mejor!.title, 45)}» ` +
        `${fecha(x.mejor!.date)}, ${nombre(x.mejor!.owner)} [la explica ${x.mejorExplica.toFixed(2)} contra ${x.propia.toFixed(2)} la propia]` +
        ` · ${resumenDelPlan(plan, viejasB.filter((a) => a.sessionId === x.c.id))}` +
        (reciente(x.c.date) ? " · se vuelve a leer" : " · se rehace a mano («Leer esta reunión»)"),
    );
  }
  if (dudosas.length) {
    console.log(`   Dudosas (no se tocan: la propia reunión la explica poco y ninguna otra la explica claramente mejor):`);
    for (const x of dudosas) {
      console.log(
        `     ? ${fecha(x.c.date)} «${corto(x.c.title, 55)}» (${nombre(x.c.owner)}) [propia ${x.propia.toFixed(2)}` +
          (x.mejor ? `, «${corto(x.mejor.title, 35)}» ${x.mejorExplica.toFixed(2)}` : "") +
          `] — «${corto(x.c.msum.replace(/\s+/g, " "), 90)}»`,
      );
    }
  }

  // ── C. Corridas de agentes que leyeron los textos de A o B (solo informe: los handoffs a regenerar) ─────────────
  const idsLeidos = [...idsAjenas, ...deOtra.map((x) => x.c.id)];
  if (idsLeidos.length) {
    const corridas = (
      await pool.query<{ agente: string; agent_id: string | null; client_id: string | null; proyecto: string | null; creada: Date; leidas: string[] }>(
        `SELECT coalesce(a.name, r."agentSlug", r."agentId", '?') AS agente, r."agentId" AS agent_id, r."clientId" AS client_id,
                p.name AS proyecto, r."createdAt" AS creada,
                ARRAY(SELECT x FROM unnest(r."sourceSessionIds") x WHERE x = ANY($1)) AS leidas
           FROM "AgentRun" r LEFT JOIN "Agent" a ON a.id = r."agentId" LEFT JOIN "Project" p ON p.id = r."projectId"
          WHERE r."sourceSessionIds" && $1::text[]
          ORDER BY r."createdAt" DESC`,
        [idsLeidos],
      )
    ).rows;
    const porAgente = new Map<string, number>();
    for (const r of corridas) porAgente.set(r.agente, (porAgente.get(r.agente) ?? 0) + 1);
    console.log(
      `\n══ C. Corridas de agentes que leyeron esos textos (solo informe): ${corridas.length}` +
        (corridas.length ? ` — ${[...porAgente].map(([a, n]) => `${a}: ${n}`).join(", ")}` : ""),
    );
    // El clasificador solo eligió proyecto dentro del mismo cliente: no escribió contenido. El resto sí.
    const motivoDe = new Map<string, string>([...ajenas.map((a) => [a.id, a.motivo] as const), ...deOtra.map((x) => [x.c.id, "minuta de otra reunión"] as const)]);
    for (const r of corridas.filter((x) => x.agent_id !== "agent-session-project-classifier")) {
      console.log(
        `   · ${fecha(r.creada)} ${r.agente} · ${nombre(r.client_id)}${r.proyecto ? ` · «${corto(r.proyecto, 40)}»` : ""} — leyó ` +
          r.leidas.map((id) => `«${corto(porId.get(id)?.title ?? id, 35)}» (${motivoDe.get(id) ?? "?"})`).join("; "),
      );
    }
  }

  // ── D. Compromisos viejos en un cliente que no es el dueño de su reunión (solo informe; las tareas las muestra INV42) ──
  const fueraDeDuenio = (
    await pool.query<{ id: string; title: string; date: Date; accion_cliente: string; owner: string | null; n: number }>(
      `SELECT s.id, s.title, s.date, a."clientId" AS accion_cliente, coalesce(s."resolvedClientId", s."manualClientId") AS owner, count(*)::int AS n
         FROM "ActionItem" a JOIN "FirefliesSession" s ON s.id = a."sessionId"
        WHERE a.source LIKE 'agent:post-session%'
          AND NOT (a."clientId" = s."resolvedClientId" OR a."clientId" IS NOT DISTINCT FROM s."manualClientId")
        GROUP BY 1, 2, 3, 4, 5 ORDER BY s.date DESC`,
    )
  ).rows.filter((r) => !idsAjenas.has(r.id) && !deOtra.some((x) => x.c.id === r.id) && (!SOLO.size || SOLO.has(r.id)));
  console.log(
    `\n══ D. Compromisos viejos guardados en un cliente que no es el dueño de su reunión (solo informe): ` +
      `${fueraDeDuenio.reduce((s, r) => s + r.n, 0)} en ${fueraDeDuenio.length} reuniones`,
  );
  for (const r of fueraDeDuenio.slice(0, 15)) {
    console.log(`   · ${fecha(r.date)} «${corto(r.title, 55)}»: ${r.n} en ${nombre(r.accion_cliente)} · dueño hoy ${nombre(r.owner)}`);
  }
  if (fueraDeDuenio.length > 15) console.log(`   … y ${fueraDeDuenio.length - 15} más`);

  // ── Resumen y escritura ────────────────────────────────────────────────────────────────────
  const cuenta = (ps: PlanDeLimpieza[], viejas: AccionVieja[]) => ({
    minutas: ps.filter((p) => p.minutaABorrar).length,
    pedidos: ps.reduce((s, p) => s + p.pedidosABorrar.length, 0),
    hechos: ps.reduce((s, p) => s + p.hechosARetirar.length, 0),
    propuestas: ps.reduce((s, p) => s + p.propuestasSinDecidir.length, 0),
    viejas: viejas.filter((a) => !accionTocada(a)).length,
    quedan:
      ps.reduce((s, p) => s + p.tareasDecididas.length + p.pedidosDecididos.length + p.hechosUsados.length + (p.minutaRevisada ? 1 : 0), 0) +
      viejas.filter(accionTocada).length,
  });
  const ca = cuenta([...analisisA.values()].map(planDeLimpieza), viejasA);
  const cb = cuenta([...analisisB.values()].map(planDeLimpieza), viejasB);
  const linea = (c: ReturnType<typeof cuenta>) =>
    `se borran ${c.minutas} minuta(s), ${c.pedidos} pedido(s) y ${c.viejas} compromiso(s) viejo(s); se retiran ${c.hechos} hecho(s)` +
    (c.propuestas ? `; ${c.propuestas} tarea(s) propuesta(s) sin decidir quedan (vencen solas)` : "") +
    (c.quedan ? `; quedan ${c.quedan} cosa(s) que alguien trabajó` : "");
  console.log(`\n══ Con --apply:`);
  console.log(`   A: se vacía el texto de ${ajenas.length} reunión(es), su lectura vuelve a «sin texto» y se re-encola el enriquecimiento; ${linea(ca)}.`);
  console.log(
    `   B: ${linea(cb)}; ${deOtra.filter((x) => reciente(x.c.date)).length} reunión(es) de los últimos 14 días vuelven a la cola de la lectura.`,
  );
  console.log(`   C y D no se tocan. Las corridas de C son los handoffs que hay que volver a generar.`);

  if (!APPLY) {
    console.log(`\nSimulacro: nada se escribió. Después del deploy: --apply --ya-desplegado (con ALLOW_PROD_WRITE=1).`);
    return;
  }

  const ids = [...idsAjenas, ...deOtra.map((x) => x.c.id)];
  const respaldo = {
    sesiones: await prisma.firefliesSession.findMany({
      where: { id: { in: [...idsAjenas] } },
      select: { id: true, title: true, transcript: true, summary: true, detectedTopics: true, enrichedAt: true, enrichAttempts: true, enrichError: true },
    }),
    reencoladas: deOtra.filter((x) => reciente(x.c.date)).map((x) => x.c.id),
    minutas: await prisma.sessionMinute.findMany({ where: { sessionId: { in: ids } } }),
    pedidos: await prisma.pedidoFueraDeAlcance.findMany({ where: { sessionId: { in: ids } } }),
    compromisosViejos: [...viejasA, ...viejasB],
    propuestasSinDecidir: [...analisisA.values(), ...analisisB.values()].flatMap((a) => planDeLimpieza(a).propuestasSinDecidir.map((t) => t.id)),
    lecturas: (await pool.query(`SELECT * FROM "LecturaDeReunion" WHERE "sessionId" = ANY($1)`, [ids])).rows,
  };
  const { dir } = planDeRespaldo(TABLAS, { script: nombreDelScript(), ahora: new Date() });
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, `respaldo.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(ruta, JSON.stringify(respaldo, null, 2), "utf8");
  console.log(`\nRespaldo de las filas: ${ruta}`);

  const { retirarHechos } = await import("@/lib/seguimiento/hechos-server");
  const { marcarParaReleer, reencolarPorTextoNuevo } = await import("@/lib/lecturas/cola");
  const borrarViejas = async (viejas: AccionVieja[], sessionId: string) => {
    const intactas = viejas.filter((a) => a.sessionId === sessionId && !accionTocada(a)).map((a) => a.id);
    if (!intactas.length) return;
    // Las condiciones repiten la regla: lo que alguien tocó desde la lectura de arriba no se borra.
    await pool.query(
      `DELETE FROM "ActionItem" WHERE id = ANY($1) AND status = 'PENDING' AND done = false AND "deletedAt" IS NULL
          AND "updatedAt" - "createdAt" <= interval '60 seconds'`,
      [intactas],
    );
  };

  let hechas = 0;
  for (const a of ajenas) {
    const plan = await limpiarAnalisis(prisma, a.id, { vaciarTexto: true, reencolarEnriquecimiento: true });
    if (plan.hechosARetirar.length) await retirarHechos(plan.hechosARetirar, NOTA_DE_LOS_HECHOS).catch(() => 0);
    await borrarViejas(viejasA, a.id);
    await marcarParaReleer(a.id);
    hechas++;
  }
  for (const x of deOtra) {
    const plan = await limpiarAnalisis(prisma, x.c.id);
    if (plan.hechosARetirar.length) await retirarHechos(plan.hechosARetirar, NOTA_DE_LOS_HECHOS).catch(() => 0);
    await borrarViejas(viejasB, x.c.id);
    if (reciente(x.c.date)) await reencolarPorTextoNuevo(x.c.id);
    hechas++;
  }
  console.log(`✓ Aplicado en ${hechas} reunión(es). Correrlo de nuevo no cambia nada.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(close);
