/**
 * scripts/medir-contexto-de-documentos.ts — SOLO LECTURA. Antes del deploy de la etapa 7 de la memoria de la cuenta
 * (DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas»): cuántas reuniones alimentan HOY cada
 * documento del proyecto y cuántas lo van a alimentar después.
 *
 * Por proyecto de cartera y por cada uno de los seis documentos (kickoff, diagnóstico, planificación, ejecución,
 * integraciones y entrega):
 *   · hoy       — las que lo alimentan con la regla de antes del deploy (sugerida): por sugerencia (sin tocar y con el
 *                 cliente) y elegidas (`true`);
 *   · después   — solo las elegidas (`true`);
 *   · desestimadas (`false`) y cuántas sugeriría Nexus (las sesiones de la exploración en el diagnóstico; las reuniones
 *     con hechos abiertos ruteados al documento, si la tabla `HechoDeReunion` existe — en la app, además, solo con
 *     `SEGUIMIENTO_HECHOS=1`);
 *   · el largo ESTIMADO del bloque de reuniones antes y después (caracteres; un cálculo aproximado con los largos de
 *     la base, no el texto que arma el lector).
 * Al final, el resumen: cuántos documentos ya generados se van a regenerar sin reuniones.
 *
 * No escribe nada, nunca: cada conexión del pool queda en solo lectura (`SET SESSION CHARACTERISTICS AS TRANSACTION
 * READ ONLY`, verificado antes de empezar), sin `--apply` ni `ALLOW_PROD_WRITE`. No llama a ninguna API.
 *
 *   npx tsx scripts/medir-contexto-de-documentos.ts            # el resumen y los documentos generados
 *   npx tsx scripts/medir-contexto-de-documentos.ts --todos    # también los documentos sin generar
 *   npx tsx scripts/medir-contexto-de-documentos.ts --json     # el detalle en JSON (para guardarlo)
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createScriptPool } from "./lib/db";
import { NO_ES_CONTENEDOR_WHERE, proyectoDeCarteraWhere } from "../lib/projects/scope";
import { pisoDelProyecto, quedaAntesDelPiso } from "../lib/sessions/piso-del-proyecto";
import { buildInternalDomainsSet } from "../lib/sessions/categorize";
import { etiquetaDeSala } from "../lib/sessions/etiqueta-de-sala";
import {
  COLUMNA_DEL_DESTINO,
  DESTINOS_SOLO_ELEGIDAS,
  linkFeedsDocumento,
  linkFeedsExploracion,
  type DestinoSoloElegidas,
} from "../lib/sessions/destinos-de-contexto";
import {
  MAX_ELEGIDAS_A_LEER,
  MAX_ELEGIDAS_ENTERAS,
  MAX_REUNIONES_DEL_DOCUMENTO,
  PISO_POR_ELEGIDA_EN_RESUMEN,
  documentoDelDestino,
  espacioPorElegida,
  espacioPorReunion,
} from "../lib/contexto/documento";
import { sugerenciasDelDocumento, type ReunionDelProyecto } from "../lib/contexto/sugerencias-del-documento";
import { leerContenido } from "../lib/exploraciones/esquemas";
import type { SesionPlaneada } from "../lib/exploraciones/guia";
import { novedadesPorPieza, type HechoParaNovedades } from "../lib/seguimiento/novedades";

const TODOS = process.argv.includes("--todos");
const JSON_SALIDA = process.argv.includes("--json");
/** Lo que el lector de antes sacaba de la transcripción cuando el resumen era pobre (lib/sessions/transcript.ts). */
const TRANSCRIPCION_DE_ANTES = 5_000;
const RESUMEN_POBRE = 1_500;

interface Largos {
  transcripcion: number;
  resumen: number;
  minuta: number;
}

interface Medida {
  cliente: string;
  proyecto: string;
  projectId: string;
  documento: string;
  generado: boolean;
  hoy: { total: number; porSugerencia: number; elegidas: number };
  despues: number;
  desestimadas: number;
  sugeriria: { exploracion: number; hechos: number };
  largo: { antes: number; despues: number };
}

/** Lo que leía el lector de antes de una reunión, aproximado: el resumen y, si era pobre, el comienzo de la transcripción. */
function largoDeAntes(l: Largos | undefined, espacio: number): number {
  if (!l) return 0;
  const resumen = l.resumen + l.minuta;
  const extra = resumen < RESUMEN_POBRE && l.transcripcion > 0 ? Math.min(l.transcripcion, TRANSCRIPCION_DE_ANTES) : 0;
  return Math.min(espacio, resumen + extra);
}

/** Lo que lee el lector nuevo de una elegida entera (minuta + lo que se dijo) o en resumen (2.000). */
function largoDeDespues(l: Largos | undefined, espacio: number, entera: boolean): number {
  if (!l) return 0;
  if (!entera) return Math.min(PISO_POR_ELEGIDA_EN_RESUMEN, l.resumen + l.minuta || l.transcripcion);
  return Math.min(espacio, l.transcripcion > 0 ? l.minuta + l.transcripcion : l.resumen + l.minuta);
}

const recientes = <T extends { fecha: number; id: string }>(xs: readonly T[], n: number) =>
  [...xs].sort((a, b) => b.fecha - a.fecha || a.id.localeCompare(b.id)).slice(0, n);

const miles = (n: number) => n.toLocaleString("es-CR");

/** Un hecho abierto con su cliente (un hecho de la cuenta vale para todos los proyectos del cliente). */
type HechoConCliente = HechoParaNovedades & { clientId: string };

async function main(): Promise<void> {
  const { pool, close } = createScriptPool();
  // ⛔ Cada conexión nueva del pool queda en solo lectura ANTES de que Prisma la use (la consulta se encola primero).
  pool.on("connect", (c) => {
    c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY").catch(() => {});
  });
  const prisma = new PrismaClient<Prisma.PrismaClientOptions>({ adapter: new PrismaPg(pool) });
  try {
    const [{ ro }] = await prisma.$queryRaw<{ ro: string }[]>`SELECT current_setting('transaction_read_only') AS ro`;
    if (ro !== "on") throw new Error(`La conexión no quedó en solo lectura (transaction_read_only=${ro}): no se mide nada.`);

    const ahora = Date.now();
    const proyectos = await prisma.project.findMany({
      where: proyectoDeCarteraWhere(),
      select: { id: true, name: true, clientId: true, createdAt: true, hubspotCreatedAt: true, client: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    if (!proyectos.length) {
      console.log("No hay proyectos de cartera.");
      return;
    }
    const ids = proyectos.map((p) => p.id);
    const clientIds = [...new Set(proyectos.map((p) => p.clientId))];

    const [delCliente, vinculos, categorias, generados] = await Promise.all([
      prisma.project.findMany({ where: { clientId: { in: clientIds }, ...NO_ES_CONTENEDOR_WHERE }, select: { id: true, clientId: true, createdAt: true } }),
      prisma.sessionProject.findMany({
        where: { projectId: { in: ids }, included: true },
        select: {
          projectId: true,
          source: true,
          diagnosisOverride: true,
          planningOverride: true,
          implementationOverride: true,
          kickoffOverride: true,
          techRequirementsOverride: true,
          deliveryOverride: true,
          session: { select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true } },
        },
      }),
      prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
      prisma.$queryRaw<{ projectId: string; slug: string }[]>`
        SELECT c."projectId", c."slug"
        FROM "ProjectCanvas" c
        WHERE c."projectId" = ANY(${ids}::text[])
          AND c."slug" = ANY(${DESTINOS_SOLO_ELEGIDAS.map((d) => documentoDelDestino(d)!.pieza)}::text[])
          AND EXISTS (
            SELECT 1 FROM "CanvasSection" s JOIN "CanvasBlock" b ON b."sectionId" = s."id"
            WHERE s."canvasId" = c."id" AND b."source"::text <> 'HUMAN'
          )`,
    ]);
    const dominiosPropios = buildInternalDomainsSet(categorias);
    const generado = new Set(generados.map((g) => `${g.projectId}:${g.slug}`));

    // Los largos de cada reunión (sin traer los textos).
    const sessionIds = [...new Set(vinculos.map((v) => v.session.id))];
    const largos = new Map<string, Largos>();
    if (sessionIds.length) {
      const filas = await prisma.$queryRaw<{ id: string; transcripcion: number; resumen: number; minuta: number }[]>`
        SELECT s."id",
          coalesce(length(s."transcript"), 0)::int AS "transcripcion",
          coalesce(length(s."summary"::text), 0)::int AS "resumen",
          coalesce(length(m."summary"), 0)::int + coalesce(length(m."agreements"::text), 0)::int
            + coalesce(length(m."decisions"::text), 0)::int + coalesce(length(m."risks"::text), 0)::int AS "minuta"
        FROM "FirefliesSession" s
        LEFT JOIN "SessionMinute" m ON m."sessionId" = s."id"
        WHERE s."id" = ANY(${sessionIds}::text[])`;
      for (const f of filas) largos.set(f.id, { transcripcion: f.transcripcion, resumen: f.resumen, minuta: f.minuta });
    }

    // Las exploraciones vivas de los proyectos (las sesiones sugieren en el diagnóstico).
    const sesionesPorProyecto = new Map<string, SesionPlaneada[]>();
    try {
      const exploraciones = await prisma.exploracionDeVenta.findMany({ where: { projectId: { in: ids }, archivadaEn: null }, select: { projectId: true, contenido: true } });
      for (const e of exploraciones) if (e.projectId) sesionesPorProyecto.set(e.projectId, leerContenido(e.contenido).sesiones);
    } catch (e) {
      console.warn("⚠ No se pudieron leer las exploraciones (¿falta su SQL?):", e instanceof Error ? e.message : e);
    }

    // Los hechos abiertos (si la tabla existe): los que el registro rutea a cada pieza.
    let hechos: HechoConCliente[] = [];
    const [{ existe }] = await prisma.$queryRaw<{ existe: boolean }[]>`SELECT to_regclass('public."HechoDeReunion"') IS NOT NULL AS existe`;
    if (existe) {
      const filas = await prisma.hechoDeReunion.findMany({
        where: { estado: "pendiente", OR: [{ projectId: { in: ids } }, { projectId: null, clientId: { in: clientIds } }] },
        select: {
          id: true, tipo: true, tema: true, frase: true, cita: true, huella: true, estado: true, createdAt: true,
          fechaDeLaReunion: true, destinos: true, projectId: true, sessionId: true, citaFuente: true, clientId: true,
          session: { select: { title: true } },
        },
      });
      hechos = filas.map(({ session, ...f }) => ({ ...f, reunionTitulo: session?.title ?? null }));
    }
    const hechosDe = (projectId: string, clientId: string) =>
      hechos.filter((h) => h.projectId === projectId || (h.projectId === null && h.clientId === clientId));

    const medidas: Medida[] = [];
    for (const p of proyectos) {
      // La membresía, como el chokepoint (getProjectMemberSessions): del cliente y desde el piso.
      const anterior = delCliente.some((x) => x.clientId === p.clientId && x.id !== p.id && x.createdAt < p.createdAt);
      const piso = pisoDelProyecto(p, anterior);
      const miembros = vinculos.filter(
        (v) =>
          v.projectId === p.id &&
          (v.session.resolvedClientId === p.clientId || v.session.manualClientId === p.clientId) &&
          !quedaAntesDelPiso(v.session.date.getTime(), piso, v.source),
      );
      const conOrganizador = (s: (typeof miembros)[number]["session"]) =>
        s.organizerEmail ? [...new Set([...s.participants, s.organizerEmail])] : s.participants;

      for (const destino of DESTINOS_SOLO_ELEGIDAS as readonly DestinoSoloElegidas[]) {
        const doc = documentoDelDestino(destino)!;
        const esGenerado = generado.has(`${p.id}:${doc.pieza}`);
        const columna = COLUMNA_DEL_DESTINO[destino];
        const reuniones: (ReunionDelProyecto & { conElCliente: boolean })[] = miembros.map((v) => {
          const participantes = conOrganizador(v.session);
          return {
            id: v.session.id,
            titulo: v.session.title,
            fecha: v.session.date.getTime(),
            participantes,
            afinado: v[columna],
            conElCliente: etiquetaDeSala({ participants: participantes }, dominiosPropios) === "CON EL CLIENTE",
          };
        });
        const ocurridas = reuniones.filter((r) => r.fecha <= ahora);

        const hoy = ocurridas.filter((r) => linkFeedsExploracion({ included: true, override: r.afinado }, r.conElCliente));
        const despues = ocurridas.filter((r) => linkFeedsDocumento({ included: true, override: r.afinado }));

        // El largo de antes: las más recientes de hoy, cada una con su espacio repartido.
        const aLeerAntes = recientes(hoy, MAX_REUNIONES_DEL_DOCUMENTO);
        const espacioAntes = espacioPorReunion(aLeerAntes.length);
        const largoAntes = aLeerAntes.reduce((n, r) => n + largoDeAntes(largos.get(r.id), espacioAntes), 0);
        // El de después: las elegidas, las más recientes enteras y las siguientes en resumen.
        const aLeerDespues = recientes(despues, MAX_ELEGIDAS_A_LEER);
        const enteras = aLeerDespues.slice(0, MAX_ELEGIDAS_ENTERAS);
        const enResumen = aLeerDespues.slice(MAX_ELEGIDAS_ENTERAS);
        const espacio = espacioPorElegida(enteras.length, enResumen.length);
        const largoDespues =
          enteras.reduce((n, r) => n + largoDeDespues(largos.get(r.id), espacio, true), 0) +
          enResumen.reduce((n, r) => n + largoDeDespues(largos.get(r.id), espacio, false), 0);

        const novedades = hechos.length ? novedadesPorPieza(hechosDe(p.id, p.clientId), [doc.pieza], new Date(ahora)) : {};
        const sugeridas = sugerenciasDelDocumento(destino, {
          reuniones,
          sesionesDeLaExploracion: sesionesPorProyecto.get(p.id) ?? [],
          dominiosPropios,
          hechos: (novedades[doc.pieza]?.items ?? []).map((i) => ({ sessionId: i.reunion.id, frase: i.frase })),
          ahora,
        });

        medidas.push({
          cliente: p.client.name,
          proyecto: p.name,
          projectId: p.id,
          documento: doc.elDocumento,
          generado: esGenerado,
          hoy: {
            total: hoy.length,
            porSugerencia: hoy.filter((r) => r.afinado === null).length,
            elegidas: hoy.filter((r) => r.afinado === true).length,
          },
          despues: despues.length,
          desestimadas: reuniones.filter((r) => r.afinado === false).length,
          sugeriria: {
            exploracion: sugeridas.filter((s) => s.fuente === "exploracion").length,
            hechos: sugeridas.filter((s) => s.fuente === "hecho").length,
          },
          largo: { antes: largoAntes, despues: largoDespues },
        });
      }
    }

    if (JSON_SALIDA) {
      console.log(JSON.stringify({ medidoEn: new Date(ahora).toISOString(), hechosEnLaBase: existe, medidas }, null, 2));
      return;
    }

    console.log(`\n══ Contexto de los documentos · ${proyectos.length} proyectos de cartera · medido ${new Date(ahora).toISOString().slice(0, 16).replace("T", " ")} UTC ══`);
    console.log(existe ? "Hechos: la tabla existe (en la app sugieren solo con SEGUIMIENTO_HECHOS=1)." : "Hechos: la tabla HechoDeReunion no existe todavía: solo se cuentan las sesiones de la exploración.");
    const aMostrar = medidas.filter((m) => TODOS || m.generado);
    let actual = "";
    for (const m of aMostrar) {
      const cabeza = `${m.cliente} › ${m.proyecto}`;
      if (cabeza !== actual) {
        console.log(`\n${cabeza}  [${m.projectId}]`);
        actual = cabeza;
      }
      const sug = m.sugeriria.exploracion + m.sugeriria.hechos;
      console.log(
        `  ${m.documento}${m.generado ? "" : " (sin generar)"}: hoy ${m.hoy.total} (${m.hoy.porSugerencia} por sugerencia, ${m.hoy.elegidas} elegidas)` +
          ` → después ${m.despues} · desestimadas ${m.desestimadas} · sugeriría ${sug}` +
          (sug ? ` (${m.sugeriria.exploracion} de la exploración, ${m.sugeriria.hechos} de hechos)` : "") +
          ` · ~${miles(m.largo.antes)} → ~${miles(m.largo.despues)} caracteres`,
      );
    }

    const generadosM = medidas.filter((m) => m.generado);
    const conReunionesHoy = generadosM.filter((m) => m.hoy.total > 0);
    const quedanSin = conReunionesHoy.filter((m) => m.despues === 0);
    const conSugerencias = quedanSin.filter((m) => m.sugeriria.exploracion + m.sugeriria.hechos > 0);
    const suma = (xs: Medida[], f: (m: Medida) => number) => xs.reduce((n, m) => n + f(m), 0);
    console.log(`\n── RESUMEN ──`);
    console.log(`Documentos generados: ${generadosM.length} (de ${medidas.length} posibles en ${proyectos.length} proyectos).`);
    console.log(`  · hoy los alimentan ${suma(generadosM, (m) => m.hoy.total)} reuniones: ${suma(generadosM, (m) => m.hoy.porSugerencia)} por sugerencia y ${suma(generadosM, (m) => m.hoy.elegidas)} elegidas.`);
    console.log(`  · ${conReunionesHoy.length} tienen reuniones hoy; ${quedanSin.length} se van a regenerar SIN reuniones (nadie eligió ninguna): con la memoria del proyecto.`);
    console.log(`  · de esos ${quedanSin.length}, ${conSugerencias.length} tendrían sugerencias de Nexus para usar con un clic.`);
    console.log(`  · desestimadas: ${suma(generadosM, (m) => m.desestimadas)} · sugeriría: ${suma(generadosM, (m) => m.sugeriria.exploracion)} de la exploración y ${suma(generadosM, (m) => m.sugeriria.hechos)} de hechos.`);
    console.log(`  · largo estimado del bloque de reuniones: ~${miles(suma(generadosM, (m) => m.largo.antes))} → ~${miles(suma(generadosM, (m) => m.largo.despues))} caracteres en total.`);
    console.log(`\nSolo leyó la base. Nada se escribió.`);
  } finally {
    await prisma.$disconnect().catch(() => {});
    await close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
