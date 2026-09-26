/**
 * POST /api/projects/[projectId]/timeline/borrador/aplicar
 *
 * Aplica la propuesta del cronograma que el CSE revisó en la barra de arriba del Gantt: cambios de
 * fases y, desde E2a, las tareas nuevas y las que se van de «Regenerar todo» / «Generar cronograma».
 * Resuelve la propuesta ENTERA: lo marcado se escribe, y lo desmarcado y lo que choca con una
 * edición posterior se descartan con ella.
 *
 *   { token: string | null,   ← `pendingProposalRunId` de la propuesta que el CSE tiene enfrente (obligatorio)
 *     sin: string[],          ← las claves que desmarcó (viven en la memoria de la pantalla)
 *     huella: string,         ← la del plan que vio (`planDeAplicacion`, lib/timeline/borrador.ts)
 *     foto?: { ancla, fases }, ← la foto contra la que la pantalla convirtió el formato viejo
 *     version?: number | null, ← la versión del borrador que vio: obligatoria con un v1 (sin ella, la
 *                                pestaña tiene otro formato en pantalla → 409 y trae el nuevo)
 *     forzar?: string[] }     ← E2c: las fases desfasadas que aplica sin recalcular («Aplicar de todos modos»)
 *
 * ⭐ El que decide es el servidor: dentro de UNA transacción (lib/timeline/escribir-estructura.ts)
 * escribe primero el token condicionado, lee lo vivo (fases y tareas), recalcula el plan con la MISMA
 * función que la pantalla y, si la huella no es la que vio el CSE, no escribe nada (409 PLAN_CAMBIO).
 * Si la propuesta guardada ya no es esa —otra corrida u otra versión—, 409 PROPUESTA_CAMBIO. Tocar
 * tareas pide la misma vara que generarlas (403 SIN_PERMISO). La auditoría, el evento del arranque y
 * el desenlace de la corrida van DESPUÉS, fuera de la transacción. E3: lo que dictó el chat pide la vara
 * de esta ruta (no la de la IA), y sus eventos del watchdog se emiten acá, al aplicar, como los emite
 * el PUT cuando el chat escribe directo (lib/timeline/eventos-de-la-propuesta.ts).
 *
 * Reemplaza a `proposal/apply-items` (que queda como lápida con un 409 «Nexus se actualizó») y, para
 * «Regenerar todo», a `detail/apply-all` (desde E2b, también una lápida 409 hasta E4).
 * Guarded con guardTimelineEdit (interno/CSE).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit, guardIaDelCronograma } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  deDondeViene,
  esBorradorV1,
  leerFoto,
  nombresEnTexto,
  traeCambiosDeTareas,
  versionDelBorrador,
  type DeDondeViene,
} from "@/lib/timeline/borrador";
import { leerEstadoDeLasTareas, MENSAJE_TAREAS_EN_CURSO } from "@/lib/timeline/borrador-del-detalle";
import {
  aplicarBorradorEnTx,
  ErrorAlAplicar,
  MENSAJE_PROPUESTA_CAMBIO,
  SELECT_DE_FASE,
  type ResultadoDeAplicar,
} from "@/lib/timeline/escribir-estructura";
import { projectedEnd, describeEndShift } from "@/lib/timeline/weeks";
import { emitTimelineEventsSafe } from "@/lib/cs/timeline-events";
import { aplicadosDelChat, eventosDelChatAplicado } from "@/lib/timeline/eventos-de-la-propuesta";

/** El comienzo de la razón de la auditoría, según de dónde viene la propuesta. */
function razonDeDonde(d: DeDondeViene): string {
  switch (d.de) {
    case "regenerar-todo":
      return "Propuesta de «Regenerar todo»";
    case "generar":
      return "Propuesta de «Generar cronograma»";
    case "regenerar-fase":
      return d.fase ? `Propuesta de «Regenerar» en «${d.fase}»` : "Propuesta de «Regenerar» de una fase";
    case "reuniones":
      return "Propuesta de fases de las reuniones y notas elegidas";
    case "handoff":
      return "Propuesta de fases del handoff";
    default: {
      // Un origen nuevo sin su razón no compila.
      const _: never = d;
      return _;
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as Record<string, unknown>;
  /* ⛔ El token es OBLIGATORIO (plan §3.3): sin él no se sabe qué propuesta vio el CSE, y aplicar
     «la que haya» es exactamente cómo se aplicaba el contenido de otra. */
  if (!("token" in body) || !(body.token === null || typeof body.token === "string")) {
    return NextResponse.json({ error: "Falta el token de la propuesta que estás revisando." }, { status: 400 });
  }
  if (typeof body.huella !== "string" || !body.huella) {
    return NextResponse.json({ error: "Falta la huella de lo que revisaste." }, { status: 400 });
  }
  if (!Array.isArray(body.sin) || !body.sin.every((k) => typeof k === "string")) {
    return NextResponse.json({ error: "`sin` tiene que ser la lista de lo que desmarcaste." }, { status: 400 });
  }
  const foto = body.foto === undefined || body.foto === null ? null : leerFoto(body.foto);
  if (body.foto !== undefined && body.foto !== null && !foto) {
    return NextResponse.json({ error: "La foto del cronograma no tiene forma válida." }, { status: 400 });
  }
  /* La versión del borrador que vio el CSE (E2a). Desde E2a toda pantalla la manda con un v1; si falta,
     la valla de abajo responde 409 (E4 P1). */
  if (
    body.version !== undefined &&
    body.version !== null &&
    (typeof body.version !== "number" || !Number.isInteger(body.version))
  ) {
    return NextResponse.json({ error: "`version` tiene que ser la versión de la propuesta que revisaste." }, { status: 400 });
  }
  /* E2c: las fases desfasadas que el CSE fuerza («Aplicar de todos modos»), con techo. Ausente (una
     pestaña de antes) = ninguna. */
  const forzarValido =
    body.forzar === undefined ||
    (Array.isArray(body.forzar) &&
      body.forzar.length <= 200 &&
      body.forzar.every((f) => typeof f === "string" && f.length >= 1 && f.length <= 200));
  if (!forzarValido) {
    return NextResponse.json({ error: "`forzar` tiene que ser la lista de fases que aplicas sin recalcular." }, { status: 400 });
  }
  const token = body.token === "" ? null : (body.token as string | null);
  const sin = body.sin as string[];
  const huella = body.huella;
  const version = typeof body.version === "number" ? body.version : null;
  const forzar = (body.forzar ?? []) as string[];

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, pendingProposal: true, pendingProposalRunId: true },
  });
  if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });
  /* Atajo legible antes de abrir la transacción: la que se revisó ya no es la guardada. Con un
     borrador-v1, también si el CSE vio otra VERSIÓN (se le fusionaron las tareas, o se le volvieron a
     pedir): aplicar esa versión vieja es otra lista que la que tiene enfrente, y el 409 trae la nueva
     (sin esto, la pantalla se quedaba con la vieja y cada «Aplicar» era otro 409 de PLAN_CAMBIO).
     E4 P1 · la valla: con un v1 que tiene versión, un pedido SIN versión también es otra lista. Es una
     pestaña que muestra el formato viejo mientras se convierte (manda `version: null`): sin la valla
     caía en PLAN_CAMBIO, cuya rama hace `load()` y no trae la propuesta, y quedaba en un bucle de 409. */
  const guardada = versionDelBorrador(tl.pendingProposal);
  const otraVersion =
    esBorradorV1(tl.pendingProposal) && guardada !== null && (version === null || guardada !== version);
  if (tl.pendingProposal === null || (tl.pendingProposalRunId ?? null) !== token || otraVersion) {
    return NextResponse.json({ error: "PROPUESTA_CAMBIO", message: MENSAJE_PROPUESTA_CAMBIO }, { status: 409 });
  }

  /* ANTES de la transacción (leen la base y no escriben): el estado de las tareas —se deduce de su
     corrida; mientras se arman, el plan se bloquea— y si quien aplica puede tocarlas. La vara es la
     de generarlas con IA (`guardIaDelCronograma`): el que no podía pedirlas tampoco las escribe.
     Sin tareas en la propuesta, no se pregunta. */
  const estadoDeTareas = await leerEstadoDeLasTareas(tl.pendingProposal);
  /* E2c: forzar mientras el recálculo corre aplicaría tareas armadas para otra forma cuando las
     buenas están por llegar: 409, sin abrir la transacción. */
  if (forzar.length > 0 && estadoDeTareas?.recalculo?.estado === "armando") {
    return NextResponse.json({ error: "TAREAS_EN_CURSO", message: MENSAJE_TAREAS_EN_CURSO }, { status: 409 });
  }
  const puedeTocarTareas = traeCambiosDeTareas(tl.pendingProposal) ? (await guardIaDelCronograma(tl.id)) === null : true;

  const ahora = new Date();
  let r: ResultadoDeAplicar;
  try {
    r = await prisma.$transaction(
      (tx) =>
        aplicarBorradorEnTx(tx, {
          timelineId: tl.id,
          token,
          guardado: tl.pendingProposal,
          foto,
          sin,
          huella,
          ahora,
          tareas: estadoDeTareas?.estado ?? null,
          puedeTocarTareas,
          actorEmail: guard.user.email ?? null,
          forzar,
        }),
      /* El techo de apply-all (el camino que esto reemplaza para «Regenerar todo»): escribe también
         las tareas. Riesgo P2028 en Wherex: se mide con borrador-aplicar.int.test.ts. */
      { maxWait: 20000, timeout: 60000 },
    );
  } catch (e) {
    if (e instanceof ErrorAlAplicar) {
      return NextResponse.json({ error: e.codigo, message: e.message }, { status: e.status });
    }
    throw e;
  }

  const origen = r.borrador.origen;
  const aplicadas = r.plan.marcadas;
  const total = r.plan.total;
  const fuera = total - aplicadas;
  const avisosDeReubicacion = r.avisos;
  const anclaAplicada = r.plan.aplicadas.some((c) => c.tipo === "ancla");
  const tareasTocadas = r.tareasTocadas;
  /* De dónde salió, para la razón: la MISMA clasificación que la barra y los carteles (E2b). Sin ella,
     «Regenerar» de una fase (pedido «regenerar») quedaba auditada como «Regenerar todo». */
  const deDonde = razonDeDonde(deDondeViene(r.borrador));
  const { creadas: tareasNuevas, borradas: tareasQueSeVan } = r.tareas;
  // E3: cuántos de los aplicados dictó el chat.
  const delChat = aplicadosDelChat(r.plan);
  /* E2c: las fases cuyas tareas se aplicaron sin recalcular («Aplicar de todos modos») quedan dichas.
     Defensivo: la auditoría es best-effort y un plan sin la lista no la tiene que tirar. */
  const forzadas = r.plan.forzadas ?? [];
  const sinRecalcular = forzadas.length > 0 ? ` Sin recalcular: ${nombresEnTexto(forzadas.map((f) => f.nombre))}.` : "";
  const nuevasEnTexto = `${tareasNuevas} ${tareasNuevas === 1 ? "tarea nueva" : "tareas nuevas"}`;
  const deTareas =
    tareasNuevas > 0 && tareasQueSeVan > 0
      ? `: ${nuevasEnTexto} y ${tareasQueSeVan} ${tareasQueSeVan === 1 ? "que se va" : "que se van"}`
      : tareasNuevas > 0
        ? `: ${nuevasEnTexto}`
        : tareasQueSeVan > 0
          ? `: ${tareasQueSeVan} ${tareasQueSeVan === 1 ? "tarea que se va" : "tareas que se van"}`
          : "";

  // ── DESPUÉS de la transacción: auditoría y evento del arranque (best-effort) ──────────────────
  try {
    const snapPhases = await prisma.timelinePhase.findMany({
      where: { timelineId: tl.id },
      orderBy: { order: "asc" },
      select: {
        ...SELECT_DE_FASE,
        status: true,
        tasks: {
          orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
          select: { id: true, title: true, weekIndex: true, order: true, status: true },
        },
      },
    });
    const tlRow = await prisma.projectTimeline.findUnique({ where: { id: tl.id }, select: { anchorStartDate: true } });
    const anclaDespues = tlRow?.anchorStartDate?.toISOString() ?? null;
    /* El corrimiento del cierre va en la RAZÓN (Tanda J): quien la lea después —o el watchdog—
       necesita saber si el proyecto se corrió, no solo cuántos cambios se aplicaron. */
    const corrimiento = describeEndShift(projectedEnd(r.anclaAntes, r.fasesAntes), projectedEnd(anclaDespues, snapPhases));
    await prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason:
          `${deDonde} ` +
          `aplicada: ${aplicadas} de ${total} ${total === 1 ? "cambio" : "cambios"}` +
          (delChat > 0 ? ` (${delChat} del chat)` : "") +
          (fuera > 0 ? ` (${fuera} ${fuera === 1 ? "quedó fuera" : "quedaron fuera"})` : "") +
          deTareas +
          "." +
          sinRecalcular +
          (corrimiento ? ` ${corrimiento}` : ""),
        kind: "AI_ASSIST",
        instruction: null,
        changedByEmail: guard.user.email ?? null,
        snapshot: { anchorStartDate: anclaDespues, phases: snapPhases } as unknown as Prisma.InputJsonValue,
      },
    });

    /* Aplicar el arranque mueve TODAS las fechas: el watchdog —el único escritor de CsAlert— tiene
       que enterarse (Tanda J). El cierre viaja en before/after. */
    if (anclaAplicada && (r.anclaAntes ?? null) !== (anclaDespues ?? null)) {
      const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
      if (proj) {
        await emitTimelineEventsSafe(
          prisma,
          { projectId, clientId: proj.clientId, timelineId: tl.id, actorEmail: guard.user.email ?? null, source: "AI_ASSIST_APPLY" },
          [
            {
              entityType: "TIMELINE",
              entityId: tl.id,
              // Solo la del handoff trae arranque: la de las reuniones nunca lo mueve.
              label: "Fecha de arranque (propuesta del handoff aplicada)",
              action: "ANCHOR_CHANGED",
              before: { anchorStartDate: r.anclaAntes, projectedEnd: projectedEnd(r.anclaAntes, r.fasesAntes).label },
              after: { anchorStartDate: anclaDespues, projectedEnd: projectedEnd(anclaDespues, snapPhases).label },
            },
          ],
        );
      }
    }

    /* E3 (D15): lo que dictó el chat emite sus eventos del watchdog al aplicar, con las acciones del
       PUT (el camino que tomaba sin propuesta abierta). Lo de la IA sigue sin eventos por tarea. */
    const delChatEventos = eventosDelChatAplicado(r.plan, r.vivo, r.fasesBorradas, r.fasesCreadas);
    if (delChatEventos.length > 0) {
      const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
      if (proj) {
        await emitTimelineEventsSafe(
          prisma,
          { projectId, clientId: proj.clientId, timelineId: tl.id, actorEmail: guard.user.email ?? null, source: "AI_ASSIST_APPLY" },
          delChatEventos,
        );
      }
    }
  } catch (e) {
    console.error("[borrador/aplicar] auditoría best-effort falló:", e instanceof Error ? e.message : e);
  }

  /* ── EL DESENLACE DE LA PROPUESTA DE LAS REUNIONES (medición, best-effort) ──────────────────
     Solo la de origen «contexto»: `pendingProposalRunId` de la del handoff es la corrida del handoff.
     Lo desmarcado y lo que chocó cuentan como descartado. ⛔ `updatedAt` se escribe con el valor que
     YA tenía: es @updatedAt y el feed de corridas ordena por él (anotar el desenlace no reaviva la
     corrida ni manda otro «Listo»). */
  if (origen === "contexto" && token) {
    try {
      const run = await prisma.agentRun.findUnique({ where: { id: token }, select: { output: true, updatedAt: true } });
      let previo: Record<string, unknown> = {};
      try {
        const leido: unknown = JSON.parse(run?.output ?? "");
        if (leido && typeof leido === "object" && !Array.isArray(leido)) previo = leido as Record<string, unknown>;
      } catch {
        /* salida vacía o no-JSON: se arranca de cero */
      }
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      await prisma.agentRun.update({
        where: { id: token },
        data: {
          output: JSON.stringify({
            ...previo,
            aceptadas: n(previo.aceptadas) + aplicadas,
            descartadas: n(previo.descartadas) + fuera,
            desenlace: "resuelta",
            resueltaEn: ahora.toISOString(),
            resueltaPor: guard.user.email ?? null,
          }),
          ...(run ? { updatedAt: run.updatedAt } : {}),
        },
      });
    } catch (e) {
      console.error(
        "[borrador/aplicar] no se pudo registrar el desenlace de la propuesta:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({
    aplicadas,
    total,
    fuera,
    /* La propuesta se resolvió entera: 0 pendientes. Con «contexto», la pantalla sigue sola con las
       tareas (paso 2 de «Regenerar todo»). */
    pendientes: 0,
    origen,
    /* ⚠ Solo cuando hubo algo que correr: una clave siempre presente y casi siempre vacía es una que
       la pantalla aprende a ignorar. */
    ...(avisosDeReubicacion.length > 0 ? { avisos: avisosDeReubicacion } : {}),
    /* Tareas creadas + borradas: con > 0, la pantalla encadena el re-chequeo del avance (el borrador
       de avance se invalidó en la transacción). */
    tareasTocadas,
  });
}
