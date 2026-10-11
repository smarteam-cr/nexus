/**
 * scripts/migrar-reuniones-de-los-documentos.ts — lleva lo que cada documento LEÍA a la arquitectura nueva (2026-10-10).
 * DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas» › «La migración (2026-10-10)».
 *
 * Antes de la etapa 7, el diagnóstico, la planificación, la ejecución y la entrega leían en «modo sugerido»: toda
 * reunión del proyecto con el cliente que nadie hubiera sacado. El kickoff y las integraciones leían SOLO el handoff
 * hasta el 2026-10-07 (674d9159). Nadie eligió nunca (0 vínculos en `true`), así que con la regla nueva —solo las
 * elegidas— regenerar un documento lo dejaba sin reuniones. Y las exploraciones de un cliente o un proyecto dejaron de
 * leer lo que el agente leyó antes y no es la reunión de ninguna sesión (etapa A).
 *
 *  A · DOCUMENTOS. Por proyecto activo (`proyectoClasificableWhere`) y por cada uno de los seis documentos que YA tiene
 *      contenido generado: las reuniones que leía con la regla vieja (la membresía del chokepoint, con su piso; con el
 *      cliente, nadie la sacó, ya ocurrida). Se apartan las que no tienen nada que leer (`tieneQueLeer`, la regla del
 *      lector nuevo) y de las demás las `MIGRADAS_POR_DOCUMENTO` más recientes se ELIGEN (`true` en la columna del
 *      documento), solo donde la columna está en null y solo si nadie eligió nada en ese documento. El resto queda como
 *      sugerencia del panel («Reunión con el cliente en este proyecto»). Nunca toca un `false` ni un `true`, ni
 *      `source`, `reviewedAt`, `included` ni otra columna. El kickoff y las integraciones generados ANTES de que leyeran
 *      reuniones (`leiaReunionesAlGenerarse`) no se migran: no llevaban ninguna (`--tambien-los-que-no-leian` los
 *      incluye, si Elías lo decide). ⚠ Un `true` es el candado humano (lib/sessions/session-project-locks.ts) y congela
 *      la REUNIÓN entera para el clasificador: el reporte dice cuántas reuniones dejan de reclasificarse.
 *  B · EXPLORACIONES. En cada exploración viva de un PROYECTO y en cada preventa viva de una empresa que NO es
 *      prospecto (en el prospecto las sesiones entran solas): las reuniones que el agente ya leyó (o que una persona
 *      eligió antes de la etapa A) y no son de ninguna sesión pasan a ser sesiones unidas a su reunión, como
 *      «+ Agregar sesión», sin pasar el tope y en orden por fecha (lib/exploraciones/migracion-de-sesiones.ts). Se
 *      escriben por la mutación de la ruta (`aplicarCambios` › `agregarSesion`, con su control de versión); ante un
 *      conflicto se recalcula sobre la fila nueva. Las de HubSpot no pasan: la foto no dice quién estuvo.
 *
 * UNA VEZ POR DOCUMENTO Y POR EXPLORACIÓN: lo que se migra queda anotado en `CronJobState` («migrar-reuniones-de-los-
 * documentos», `MarcaDeLaMigracion`) y una corrida siguiente no lo vuelve a tocar, aunque una persona lo haya deshecho
 * en el medio (la X sobre una elegida escribe `null`, y «Sacar» de una sesión no deja la reunión en `fuera`).
 *
 * En seco (por defecto) SOLO LEE: cada conexión queda en solo lectura (verificado antes de empezar). No llama a ninguna
 * API. Con --apply guarda antes en backups/<fecha>-migrar-reuniones-de-los-documentos/ las filas que toca (el guard
 * además respalda las tablas con pg_dump, o SIN_RESPALDO=1).
 *
 * Uso (En tu PC, justo después de aplicar los SQL y antes de que alguien regenere un documento):
 *   npx tsx scripts/migrar-reuniones-de-los-documentos.ts
 *   npx tsx scripts/migrar-reuniones-de-los-documentos.ts --proyecto <id>     ← un solo proyecto
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-reuniones-de-los-documentos.ts --apply --firma tu@smarteamcr.com; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { describirDestino, resolverApply } from "./lib/guard";
import { NO_ES_CONTENEDOR_WHERE, proyectoClasificableWhere } from "@/lib/projects/scope";
import { pisoDelProyecto, quedaAntesDelPiso } from "@/lib/sessions/piso-del-proyecto";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { belongsToClient } from "@/lib/sessions/project-sources";
import { isLockedLink } from "@/lib/sessions/session-project-locks";
import { COLUMNA_DEL_DESTINO, DESTINOS_SOLO_ELEGIDAS, type DestinoSoloElegidas } from "@/lib/sessions/destinos-de-contexto";
import { documentoDelDestino, tieneQueLeer } from "@/lib/contexto/documento";
import {
  MARCA_DE_LA_MIGRACION,
  MIGRADAS_POR_DOCUMENTO,
  claveDelDocumento,
  leerMarca,
  leiaReunionesAlGenerarse,
  planDelDocumento,
  reunionesQueSeCongelan,
  sumarALaMarca,
  type MarcaDeLaMigracion,
  type ReunionDeLaReglaVieja,
} from "@/lib/contexto/migracion-de-reuniones";
import { pieceBySlug } from "@/lib/pieces/registry";
import { SUGERIDAS_DE_LA_REGLA_VIEJA } from "@/lib/contexto/sugerencias-del-documento";
import { PRESALES_EMAILS } from "@/lib/handoff/sales-presence";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import type { Escala } from "@/lib/escala/documento/tipos";
import { leerContenido, leerPropuesta } from "@/lib/exploraciones/esquemas";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { nuevoIdDeSesion } from "@/lib/exploraciones/guia";
import { DIAS_ANTES_DEL_ALTA } from "@/lib/exploraciones/lectura";
import { diaDeLaReunion, sesionesQueFaltan, type ReunionYaLeida, type ResultadoDeSesionesQueFaltan } from "@/lib/exploraciones/migracion-de-sesiones";
import type { SesionPlaneada } from "@/lib/exploraciones/guia";
import { aplicarCambios } from "@/lib/exploraciones/servidor";
import type { Operacion } from "@/lib/exploraciones/contenido";

const APPLY = resolverApply({ tablas: ["SessionProject", "ExploracionDeVenta", "CronJobState"] });
const SCRIPT = "migrar-reuniones-de-los-documentos";
const DIA = 86_400_000;
/** La ventana del clasificador (`reclassifyClientSessions`, DEFAULT_SINCE_DAYS): solo ahí una reunión congelada pierde algo. */
const VENTANA_DE_RECLASIFICAR_DIAS = 90;
/** Incluye el kickoff y las integraciones generados antes de que leyeran reuniones (contenido nuevo, no lo que llevaban). */
const TAMBIEN_LOS_QUE_NO_LEIAN = process.argv.includes("--tambien-los-que-no-leian");

function argumento(nombre: string): string | null {
  const i = process.argv.findIndex((a) => a === nombre || a.startsWith(`${nombre}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : (process.argv[i + 1] ?? null);
}

type Columna = (typeof COLUMNA_DEL_DESTINO)[DestinoSoloElegidas];

interface Escritura {
  linkId: string;
  sessionId: string;
  projectId: string;
  destino: DestinoSoloElegidas;
  columna: Columna;
}

const miles = (n: number) => n.toLocaleString("es-CR");

async function main(): Promise<void> {
  const firma = argumento("--firma")?.trim().toLowerCase() ?? null;
  const soloProyecto = argumento("--proyecto");
  if (APPLY && !firma?.includes("@")) {
    console.error("⛔ Con --apply hace falta --firma <tu correo>: las sesiones nuevas de las exploraciones quedan a tu nombre.");
    process.exit(1);
  }

  const { prisma, pool, close } = createScriptDb();
  if (!APPLY) {
    // ⛔ En seco, cada conexión nueva del pool queda en solo lectura ANTES de que Prisma la use.
    pool.on("connect", (c) => {
      c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY").catch(() => {});
    });
  }
  try {
    if (!APPLY) {
      const [{ ro }] = await prisma.$queryRaw<{ ro: string }[]>`SELECT current_setting('transaction_read_only') AS ro`;
      if (ro !== "on") throw new Error(`La conexión no quedó en solo lectura (transaction_read_only=${ro}): no se lee nada.`);
    }
    if (APPLY && firma && !(await prisma.teamMember.findFirst({ where: { email: firma }, select: { id: true } }))) {
      throw new Error(`«${firma}» no es nadie del equipo: firma con tu correo de Smarteam.`);
    }
    console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? `APLICAR, a nombre de ${firma}` : "SIMULACRO (solo lee la base)"}\n`);
    const ahora = Date.now();
    const marca = leerMarca((await prisma.cronJobState.findUnique({ where: { id: MARCA_DE_LA_MIGRACION }, select: { lastResult: true } }))?.lastResult);
    const yaDocs = Object.keys(marca.documentos).length;
    const yaExpl = Object.keys(marca.exploraciones).length;
    if (yaDocs || yaExpl) console.log(`Ya se migraron antes ${yaDocs} documentos y ${yaExpl} exploraciones: no se vuelven a tocar.\n`);

    const [categorias, ventasDeLaBase] = await Promise.all([
      prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
      prisma.teamMember.findMany({ where: { area: { in: ["Sales", "Ventas"] } }, select: { email: true } }),
    ]);
    const dominiosPropios = buildInternalDomainsSet(categorias);
    const ventas = new Set([...ventasDeLaBase.map((t) => t.email.toLowerCase()), ...PRESALES_EMAILS]);

    // ══ A · DOCUMENTOS ═══════════════════════════════════════════════════════════════════════════════════════════
    const proyectos = await prisma.project.findMany({
      where: proyectoClasificableWhere(soloProyecto ? { id: soloProyecto } : undefined),
      select: { id: true, name: true, clientId: true, createdAt: true, hubspotCreatedAt: true, client: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const ids = proyectos.map((p) => p.id);
    const clientIds = [...new Set(proyectos.map((p) => p.clientId))];
    const piezas = DESTINOS_SOLO_ELEGIDAS.map((d) => documentoDelDestino(d)!.pieza);

    const [delCliente, vinculos, generados] = ids.length
      ? await Promise.all([
          prisma.project.findMany({ where: { clientId: { in: clientIds }, ...NO_ES_CONTENEDOR_WHERE }, select: { id: true, clientId: true, createdAt: true } }),
          prisma.sessionProject.findMany({
            where: { projectId: { in: ids }, included: true },
            select: {
              id: true,
              projectId: true,
              source: true,
              reviewedAt: true,
              included: true,
              handoffOverride: true,
              timelineOverride: true,
              diagnosisOverride: true,
              planningOverride: true,
              implementationOverride: true,
              kickoffOverride: true,
              explorationOverride: true,
              techRequirementsOverride: true,
              deliveryOverride: true,
              session: { select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true } },
            },
          }),
          // Con contenido = algún bloque escrito por la IA; la última generación = el más nuevo de esos bloques.
          prisma.$queryRaw<{ projectId: string; slug: string; ultima: Date | null }[]>`
            SELECT c."projectId", c."slug", MAX(b."createdAt") AS "ultima"
            FROM "ProjectCanvas" c
            JOIN "CanvasSection" s ON s."canvasId" = c."id"
            JOIN "CanvasBlock" b ON b."sectionId" = s."id"
            WHERE c."projectId" = ANY(${ids}::text[])
              AND c."slug" = ANY(${piezas}::text[])
              AND b."source"::text <> 'HUMAN'
            GROUP BY c."projectId", c."slug"`,
        ])
      : [[], [], []];
    const ultimaGeneracion = new Map(generados.map((g) => [`${g.projectId}:${g.slug}`, g.ultima ? new Date(g.ultima).getTime() : null]));
    const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));

    // Qué deja cada reunión para leer (tres booleanos; el texto nunca viaja): la regla del lector nuevo (`tieneQueLeer`).
    const idsDeReuniones = [...new Set(vinculos.map((v) => v.session.id))];
    const queDeja = new Map<string, { texto: boolean; minuta: boolean; minutaRevisada: boolean }>();
    for (let i = 0; i < idsDeReuniones.length; i += 500) {
      const lote = idsDeReuniones.slice(i, i + 500);
      const filas = await prisma.$queryRaw<{ id: string; texto: boolean; minuta: boolean; minutaRevisada: boolean }[]>`
        SELECT s."id",
          (coalesce(length(s."transcript"), 0) > 0 OR s."summary" IS NOT NULL) AS "texto",
          EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id") AS "minuta",
          EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id" AND m."status" IN ('REVIEWED', 'EDITED')) AS "minutaRevisada"
        FROM "FirefliesSession" s
        WHERE s."id" = ANY(${lote}::text[])`;
      for (const f of filas) queDeja.set(f.id, f);
    }

    const escrituras: Escritura[] = [];
    type Cuenta = { documentos: number; leia: number; migran: number; quedan: number; vacias: number; yaElegidos: number; yaMigrados: number; noLeian: number };
    const porDocumento = new Map<DestinoSoloElegidas, Cuenta>();
    const vacio = (): Cuenta => ({ documentos: 0, leia: 0, migran: 0, quedan: 0, vacias: 0, yaElegidos: 0, yaMigrados: 0, noLeian: 0 });
    let documentosConContenido = 0;
    let actual = "";
    for (const p of proyectos) {
      const anterior = delCliente.some((x) => x.clientId === p.clientId && x.id !== p.id && x.createdAt < p.createdAt);
      const piso = pisoDelProyecto(p, anterior);
      const delProyecto = vinculos.filter((v) => v.projectId === p.id && belongsToClient(v.session, p.clientId));
      const miembros = delProyecto.filter((v) => !quedaAntesDelPiso(v.session.date.getTime(), piso, v.source));
      const conOrganizador = (s: (typeof miembros)[number]["session"]) =>
        s.organizerEmail ? [...new Set([...s.participants, s.organizerEmail])] : s.participants;

      for (const destino of DESTINOS_SOLO_ELEGIDAS) {
        const doc = documentoDelDestino(destino)!;
        const clave = `${p.id}:${doc.pieza}`;
        if (!ultimaGeneracion.has(clave)) continue;
        documentosConContenido++;
        const columna = COLUMNA_DEL_DESTINO[destino];
        const delClienteDoc = pieceBySlug(doc.pieza)?.clientFacing !== false;
        const s = porDocumento.get(destino) ?? vacio();
        s.documentos++;
        porDocumento.set(destino, s);
        const cabeza = `${p.client.name} › ${p.name}`;
        const imprimir = (linea: string) => {
          if (cabeza !== actual) {
            console.log(`\n${cabeza}  [${p.id}]`);
            actual = cabeza;
          }
          console.log(`  ${doc.elDocumento}: ${linea}`);
        };
        const fechaMarca = marca.documentos[claveDelDocumento(p.id, destino)];
        if (fechaMarca) {
          s.yaMigrados++;
          imprimir(`ya se migró el ${fechaMarca.slice(0, 10)}: no se vuelve a tocar.`);
          continue;
        }
        // El kickoff y las integraciones de antes del 2026-10-07 no leían reuniones: sin el flag, nada que migrar.
        const noLeia = !leiaReunionesAlGenerarse(destino, ultimaGeneracion.get(clave) ?? null);
        if (noLeia) s.noLeian++;
        const reuniones: (ReunionDeLaReglaVieja & { linkId: string; titulo: string })[] = miembros.map((v) => ({
          id: v.session.id,
          linkId: v.id,
          titulo: v.session.title,
          fecha: v.session.date.getTime(),
          conElCliente: etiquetaDeSala({ participants: conOrganizador(v.session) }, dominiosPropios) === "CON EL CLIENTE",
          afinado: v[columna],
          tieneQueLeer: tieneQueLeer(queDeja.get(v.session.id) ?? { texto: false, minuta: false, minutaRevisada: false }, { delCliente: delClienteDoc }),
        }));
        // Una elegida de antes del piso también es una decisión de una persona (el lector nuevo la lee).
        const hayElegidasFueraDeLaLista = delProyecto.some((v) => v[columna] === true && !miembros.includes(v));
        const noSeMigra = noLeia && !TAMBIEN_LOS_QUE_NO_LEIAN;
        const plan = planDelDocumento(reuniones, ahora, { hayElegidasFueraDeLaLista, ...(noSeMigra ? { tope: 0 } : {}) });
        s.leia += plan.leia.length;
        s.migran += plan.aElegir.length;
        s.quedan += plan.paraSugerir.length;
        s.vacias += plan.vacias.length;
        if (plan.yaTeniaElegidas) s.yaElegidos++;
        for (const r of plan.aElegir) escrituras.push({ linkId: r.linkId, sessionId: r.id, projectId: p.id, destino, columna });

        if (plan.leia.length === 0 && !plan.yaTeniaElegidas) continue;
        const vacias = plan.vacias.length ? ` · ${plan.vacias.length} sin nada que leer (no ocupan lugar)` : "";
        imprimir(
          plan.yaTeniaElegidas
            ? "ya tiene reuniones elegidas por una persona: no se toca."
            : noSeMigra
              ? `se generó antes de que leyera reuniones: no se migra · quedan para sugerir ${plan.paraSugerir.length}${vacias}`
              : `leía ${plan.leia.length} → se eligen ${plan.aElegir.length} · quedan para sugerir ${plan.paraSugerir.length}${vacias}` +
                (noLeia ? " (se generó antes de que leyera reuniones: es contenido nuevo)" : ""),
        );
      }
    }

    const linksDistintos = [...new Set(escrituras.map((e) => e.linkId))];
    const reunionesDistintas = new Set(escrituras.map((e) => e.sessionId));
    const noBloqueados = linksDistintos.filter((id) => !isLockedLink(vinculoPorId.get(id)!));
    // El candado congela la REUNIÓN: se miran todos sus vínculos, de cualquier proyecto y estado.
    const todosLosVinculos = reunionesDistintas.size
      ? await prisma.sessionProject.findMany({
          where: { sessionId: { in: [...reunionesDistintas] } },
          select: {
            id: true,
            sessionId: true,
            source: true,
            reviewedAt: true,
            included: true,
            handoffOverride: true,
            timelineOverride: true,
            diagnosisOverride: true,
            planningOverride: true,
            implementationOverride: true,
            kickoffOverride: true,
            explorationOverride: true,
            techRequirementsOverride: true,
            deliveryOverride: true,
          },
        })
      : [];
    const congeladas = reunionesQueSeCongelan(
      todosLosVinculos.map((v) => ({ id: v.id, sessionId: v.sessionId, bloqueado: isLockedLink(v) })),
      new Set(linksDistintos),
    );
    const fechaDe = new Map(vinculos.map((v) => [v.session.id, v.session.date.getTime()]));
    const congeladasEnLaVentana = [...congeladas].filter((id) => (fechaDe.get(id) ?? 0) >= ahora - VENTANA_DE_RECLASIFICAR_DIAS * DIA);
    const conVentas = [...reunionesDistintas].filter((sid) => {
      const v = vinculos.find((x) => x.session.id === sid)!;
      const gente = [...v.session.participants, v.session.organizerEmail ?? ""].map((e) => e.toLowerCase());
      return gente.some((e) => ventas.has(e));
    });

    console.log(`\n── A · DOCUMENTOS (${proyectos.length} proyectos activos, ${documentosConContenido} documentos con contenido) ──`);
    for (const destino of DESTINOS_SOLO_ELEGIDAS) {
      const s = porDocumento.get(destino);
      if (!s) continue;
      console.log(
        `  ${documentoDelDestino(destino)!.elDocumento}: ${s.documentos} con contenido · leían ${s.leia} con la regla vieja · se migran ${s.migran}` +
          ` · quedan para sugerir ${s.quedan}` +
          (s.vacias ? ` · ${s.vacias} sin nada que leer (saltadas)` : "") +
          (s.noLeian
            ? ` · ${s.noLeian} generados antes de que leyera reuniones${TAMBIEN_LOS_QUE_NO_LEIAN ? " (se migran igual: contenido nuevo)" : " (no se migran)"}`
            : "") +
          (s.yaElegidos ? ` · ${s.yaElegidos} ya tenían elegidas (no se tocan)` : "") +
          (s.yaMigrados ? ` · ${s.yaMigrados} ya migrados antes (no se tocan)` : ""),
      );
    }
    console.log(`  En total: ${miles(escrituras.length)} elecciones en ${miles(linksDistintos.length)} vínculos, ${miles(reunionesDistintas.size)} reuniones distintas.`);
    console.log(`  · ${miles(noBloqueados.length)} vínculos NO tenían candado y lo tienen desde ahora (un \`true\` es una decisión de una persona).`);
    console.log(
      `  · ${miles(congeladas.size)} reuniones dejan de reclasificarse (todos sus vínculos estaban libres): el clasificador saltea toda reunión ` +
        `con un vínculo con candado, así que ya no llegan solas a un proyecto nuevo del cliente. ${miles(congeladasEnLaVentana.length)} están dentro de ` +
        `su ventana de ${VENTANA_DE_RECLASIFICAR_DIAS} días.`,
    );
    console.log(`  · ${miles(conVentas.length)} de las reuniones migradas tuvieron a alguien de Ventas en la sala (para saberlo: no cambia nada).`);
    console.log(`  · Por documento se eligen como mucho ${MIGRADAS_POR_DOCUMENTO} (las que se leen enteras); el panel sugiere hasta ${SUGERIDAS_DE_LA_REGLA_VIEJA} más.`);

    // ══ B · EXPLORACIONES ════════════════════════════════════════════════════════════════════════════════════════
    const exploraciones = await prisma.exploracionDeVenta.findMany({
      where: {
        archivadaEn: null,
        OR: [{ projectId: { not: null } }, { projectId: null, client: { kind: { not: "PROSPECTO" } } }],
        ...(soloProyecto ? { projectId: soloProyecto } : {}),
      },
      select: {
        id: true,
        clientId: true,
        projectId: true,
        createdAt: true,
        version: true,
        contenido: true,
        propuesta: true,
        areas: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        responsableEmail: true,
        updatedAt: true,
        test: true,
        client: { select: { name: true, kind: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const meetIds = new Set<string>();
    const planes = exploraciones.map((x) => {
      const contenido = leerContenido(x.contenido);
      const propuesta = leerPropuesta(x.propuesta);
      const leido = leerLoLeido(x.test);
      const elegidasAMano = new Set(contenido.reunionesElegidas);
      const deMeet = new Set([
        ...propuesta.leidas.sesiones,
        ...(propuesta.leidas.soloNotas ?? []),
        ...Object.keys(propuesta.lecturas).flatMap((k) => (k.startsWith("meet:") ? [k.slice(5)] : [])),
        ...contenido.reunionesElegidas,
      ]);
      for (const id of deMeet) meetIds.add(id);
      // De HubSpot, solo las reuniones (las lecturas guardan fecha y título; `leidas.hubspot` trae también notas y correos).
      const leidasDeHubspot = new Set(propuesta.leidas.hubspot);
      const deHubspot = new Map<string, { fecha: string | null; titulo: string }>();
      for (const [k, l] of Object.entries(propuesta.lecturas)) {
        if (k.startsWith("hubspot:")) deHubspot.set(k.slice(8), { fecha: l.fecha ?? null, titulo: l.titulo ?? l.etiqueta });
      }
      for (const a of leido.agenda) if (leidasDeHubspot.has(a.id) && !deHubspot.has(a.id)) deHubspot.set(a.id, { fecha: a.inicio, titulo: a.titulo });
      return { x, contenido, deMeet, deHubspot, elegidasAMano };
    });

    const [sesionesDeMeet, membresia] = await Promise.all([
      meetIds.size
        ? prisma.firefliesSession.findMany({
            where: { id: { in: [...meetIds] } },
            select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true, googleEventId: true },
          })
        : Promise.resolve([]),
      prisma.sessionProject.findMany({
        where: { projectId: { in: exploraciones.flatMap((x) => (x.projectId ? [x.projectId] : [])) }, included: true },
        select: { projectId: true, sessionId: true },
      }),
    ]);
    const meetPorId = new Map(sesionesDeMeet.map((s) => [s.id, s]));
    const delProyecto = new Set(membresia.map((m) => `${m.projectId}:${m.sessionId}`));

    const usados = new Set<string>();
    const idNuevo = () => {
      let id = nuevoIdDeSesion();
      while (usados.has(id)) id = nuevoIdDeSesion();
      usados.add(id);
      return id;
    };

    type ContenidoDeSesiones = { sesiones: readonly SesionPlaneada[]; fuera: readonly string[] };
    const aplicables: { x: (typeof exploraciones)[number]; calcular: (c: ContenidoDeSesiones) => ResultadoDeSesionesQueFaltan; nuevas: number }[] = [];
    let totalNuevas = 0;
    let exploracionesYaMigradas = 0;
    console.log(`\n── B · EXPLORACIONES (${exploraciones.length} vivas: de un proyecto o de una empresa que no es prospecto) ──`);
    for (const { x, contenido, deMeet, deHubspot, elegidasAMano } of planes) {
      if (marca.exploraciones[x.id]) {
        exploracionesYaMigradas++;
        continue;
      }
      const leidas: ReunionYaLeida[] = [
        ...[...deMeet].map((id): ReunionYaLeida => {
          const s = meetPorId.get(id);
          if (!s) return { id, origen: "meet", fecha: null, titulo: id, deLaEmpresa: false };
          return {
            id,
            origen: "meet",
            fecha: s.date.toISOString(),
            titulo: s.title,
            deLaEmpresa: belongsToClient(s, x.clientId) && (!x.projectId || delProyecto.has(`${x.projectId}:${id}`)),
            puertasAdentro: esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail }, dominiosPropios),
            eventoId: s.googleEventId,
            elegidaAMano: elegidasAMano.has(id),
          };
        }),
        // Las de HubSpot salen de la foto de ESTA empresa: son suyas. Pero la foto no guarda quién estuvo (podría ser la
        // preparación del equipo): no pasan, y el reporte lo dice.
        ...[...deHubspot].map(
          ([id, h]): ReunionYaLeida => ({ id, origen: "hubspot", fecha: h.fecha, titulo: h.titulo, deLaEmpresa: true, salaDesconocida: true }),
        ),
      ];
      // Se calcula sobre la fila que haya: la de ahora y, ante un conflicto, la nueva (con lo que hizo la persona).
      const calcular = (c: ContenidoDeSesiones) =>
        sesionesQueFaltan({
          sesiones: c.sesiones,
          fuera: c.fuera,
          leidas,
          esDeProyecto: !!x.projectId,
          esProspecto: x.client.kind === "PROSPECTO",
          desde: x.projectId ? 0 : x.createdAt.getTime() - DIAS_ANTES_DEL_ALTA * DIA,
          ahora: new Date(ahora),
          nuevoId: idNuevo,
        });
      const r = calcular(contenido);
      const nombre = `${x.client.name} › ${x.project?.name ?? "preventa"}  [${x.id}]`;
      if (!r.nuevas.length) {
        if (r.saltadas.length) {
          const motivos = new Map<string, number>();
          for (const s of r.saltadas) motivos.set(s.motivo, (motivos.get(s.motivo) ?? 0) + 1);
          console.log(`\n${nombre}: nada pasa a sesión (${[...motivos].map(([m, n]) => `${n} ${m}`).join(" · ")})`);
        }
        continue;
      }
      console.log(`\n${nombre}: ${r.nuevas.length} pasan a sesión (tenía ${contenido.sesiones.length})`);
      for (const reu of r.reuniones) console.log(`  + ${diaDeLaReunion(reu.fecha!)} · ${reu.titulo} (${reu.origen === "meet" ? "Meet" : "HubSpot"})`);
      for (const s of r.saltadas) console.log(`  · no: ${s.titulo} — ${s.motivo}`);
      totalNuevas += r.nuevas.length;
      aplicables.push({ x, calcular, nuevas: r.nuevas.length });
    }
    console.log(
      `\n  En total: ${totalNuevas} sesiones nuevas en ${aplicables.length} exploraciones.` +
        (exploracionesYaMigradas ? ` ${exploracionesYaMigradas} ya se migraron antes (no se tocan).` : ""),
    );

    if (!APPLY) {
      console.log(`\nSolo leyó la base. Nada se escribió. Con --apply --firma <tu correo> (y ALLOW_PROD_WRITE=1) se escribe.`);
      return;
    }
    if (!escrituras.length && !aplicables.length) {
      console.log("\nNo hay nada que escribir.");
      return;
    }

    // ── El respaldo «antes», con las filas que se tocan ──
    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    const dir = join("backups", `${fecha}-${SCRIPT}`);
    mkdirSync(dir, { recursive: true });
    const ruta = join(dir, `antes.${hora}.json`);
    writeFileSync(
      ruta,
      JSON.stringify(
        {
          firma,
          en: new Date().toISOString(),
          sessionProject: linksDistintos.map((id) => {
            const { session, ...v } = vinculoPorId.get(id)!;
            return { ...v, sessionId: session.id, columnas: escrituras.filter((e) => e.linkId === id).map((e) => e.columna) };
          }),
          // La fila entera que reescribe `aplicarCambios` (`datosParaGuardar`): deshacer devuelve todas estas columnas.
          exploracionDeVenta: aplicables.map(({ x }) => ({
            id: x.id,
            version: x.version,
            updatedAt: x.updatedAt,
            contenido: x.contenido,
            propuesta: x.propuesta,
            areas: x.areas,
            edicion: x.edicion,
            perfilCierre: x.perfilCierre,
            perfilDespues: x.perfilDespues,
            responsableEmail: x.responsableEmail,
          })),
          marcaAntes: marca,
        },
        null,
        1,
      ),
    );
    console.log(`\nRespaldo «antes»: ${ruta}`);

    // ── A: por documento, en una transacción; si alguien eligió entretanto, ese documento no se toca ──
    let escritas = 0;
    const porDoc = new Map<string, Escritura[]>();
    for (const e of escrituras) porDoc.set(`${e.projectId}:${e.destino}`, [...(porDoc.get(`${e.projectId}:${e.destino}`) ?? []), e]);
    for (const lista of porDoc.values()) {
      const { projectId, columna } = lista[0];
      escritas += await prisma.$transaction(async (tx) => {
        const yaElegidas = await tx.sessionProject.count({ where: { projectId, included: true, [columna]: true } as Prisma.SessionProjectWhereInput });
        if (yaElegidas > 0) return 0;
        let n = 0;
        for (const e of lista) {
          const r = await tx.sessionProject.updateMany({
            where: { id: e.linkId, included: true, [columna]: null } as Prisma.SessionProjectWhereInput,
            data: { [columna]: true } as Prisma.SessionProjectUpdateManyMutationInput,
          });
          n += r.count;
        }
        // En la misma transacción: si se escribió, el documento queda anotado y no se vuelve a migrar.
        if (n > 0) await anotarEnLaMarca(tx, { documentos: [claveDelDocumento(projectId, lista[0].destino)] });
        return n;
      });
    }
    console.log(`A · ${escritas} de ${escrituras.length} elecciones escritas.`);

    // ── B: por la mutación de la ruta, con su versión; ante un conflicto se recalcula una vez ──
    const general = await escalaPublicada(prisma);
    if (!general) {
      console.log("B · ⚠ La escala no está publicada o no se pudo leer: las exploraciones no se tocaron.");
      return;
    }
    let sesionesEscritas = 0;
    const comoOps = (r: ResultadoDeSesionesQueFaltan): Operacion[] => r.nuevas.map((sesion) => ({ op: "agregarSesion" as const, sesion }));
    for (const a of aplicables) {
      const inicial = leerContenido(a.x.contenido);
      let version = a.x.version;
      let antes = inicial.sesiones.length;
      let ops = comoOps(a.calcular(inicial));
      for (let intento = 0; intento < 2 && ops.length; intento++) {
        const r = await aplicarCambios(a.x.id, version, ops, general, { db: prisma, quienPide: firma });
        if (r.estado === "ok") {
          // Las que de verdad entraron (agregarSesion no repite una que ya es sesión).
          sesionesEscritas += Math.max(0, leerContenido(r.fila.contenido).sesiones.length - antes);
          await prisma.$transaction((tx) => anotarEnLaMarca(tx, { exploraciones: [a.x.id] }));
          break;
        }
        if (r.estado !== "conflicto") {
          console.log(`B · ⚠ ${a.x.client.name} [${a.x.id}]: ${r.estado === "invalido" ? r.error : "ya no existe"}`);
          break;
        }
        // Otra persona cambió la exploración: se recalcula sobre la fila nueva, así lo que sacó a `fuera` o ligó a una
        // sesión no vuelve; si ya no falta nada, no se escribe.
        const nueva = leerContenido(r.fila.contenido);
        version = r.fila.version;
        antes = nueva.sesiones.length;
        ops = comoOps(a.calcular(nueva));
        if (!ops.length) console.log(`B · ${a.x.client.name} [${a.x.id}]: alguien la cambió mientras tanto y ya no falta nada.`);
      }
    }
    console.log(`B · ${sesionesEscritas} de ${totalNuevas} sesiones nuevas escritas.`);
    console.log("\n✓ Aplicado. Lo migrado quedó anotado: una corrida siguiente no lo vuelve a tocar, aunque alguien lo haya deshecho.");
  } finally {
    await prisma.$disconnect().catch(() => {});
    await close().catch(() => {});
  }
}

/**
 * Anota en la marca (`CronJobState` «migrar-reuniones-de-los-documentos») lo que se acaba de migrar, con la fila
 * bloqueada: dos corridas a la vez no se pisan la lista.
 */
async function anotarEnLaMarca(tx: Prisma.TransactionClient, nuevo: { documentos?: string[]; exploraciones?: string[] }): Promise<void> {
  await tx.$executeRaw`INSERT INTO "CronJobState" ("id", "createdAt", "updatedAt") VALUES (${MARCA_DE_LA_MIGRACION}, now(), now()) ON CONFLICT ("id") DO NOTHING`;
  const [fila] = await tx.$queryRaw<{ lastResult: unknown }[]>`SELECT "lastResult" FROM "CronJobState" WHERE "id" = ${MARCA_DE_LA_MIGRACION} FOR UPDATE`;
  const marca: MarcaDeLaMigracion = sumarALaMarca(leerMarca(fila?.lastResult), nuevo, new Date().toISOString());
  await tx.cronJobState.update({
    where: { id: MARCA_DE_LA_MIGRACION },
    data: { lastResult: marca as unknown as Prisma.InputJsonValue, lastRunAt: new Date() },
  });
}

/** La escala publicada más nueva que este código sabe leer (la que valida las operaciones de la exploración). */
async function escalaPublicada(prisma: ReturnType<typeof createScriptDb>["prisma"]): Promise<Escala | null> {
  const publicadas = await prisma.escalaDocumento.findMany({
    where: { documento: "escala" },
    orderBy: { publicadaEn: "desc" },
    select: { texto: true, version: true },
    take: 5,
  });
  for (const p of publicadas) {
    try {
      return parsearEscala(p.texto);
    } catch (e) {
      console.warn(`[escala] la versión ${p.version} no se puede leer con este código:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
