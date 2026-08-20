/**
 * POST /api/projects/[projectId]/timeline/assist
 *
 * Actualización ASISTIDA POR IA del cronograma, EN el cronograma (D.1):
 * el CSE escribe una instrucción en lenguaje natural ("atrasá Setup una
 * semana", "agregá tareas de migración de datos en configuración") y la IA
 * devuelve el cronograma COMPLETO resultante en el MISMO shape del PUT.
 *
 * NO persiste nada: responde una PROPUESTA validada. El front la muestra como
 * preview (Gantt + resumen de diff) y "Aplicar" la manda al PUT existente —
 * que es quien diffea (create/update/delete por id), flipea AGENT→MODIFIED y
 * limpia needsValidation al tocar contenido. Los ESTADOS de las tareas se
 * preservan solos: el PUT no toca status.
 *
 * Saneo anti-alucinación antes de responder:
 *   - ids de fase/tarea que no existen en DB → se les quita el id (pasan a
 *     CREATE) + warning. Una tarea con id bajo OTRA fase → mismo tratamiento.
 *   - anchorStartDate: si la IA no lo incluye, se completa con el actual —
 *     aplicar jamás borra la fecha de arranque por omisión.
 *   - tasks ausente en una fase → [] (la propuesta es reemplazo completo;
 *     "no tocar" no existe en este flujo).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit, guardCapability, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { validateTimelinePayload, type PutBody } from "@/lib/timeline/validate";
import { repararPropuesta } from "@/lib/timeline/reparar-propuesta";
import { rescatarProgreso } from "@/lib/timeline/rescate-progreso";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { cargarContextoDelAssist } from "@/lib/contexto/cargar";
import { renderFuentes } from "@/lib/contexto/tipos";
import { REGLA_DE_FRONTERA_DEL_ASSIST } from "@/lib/contexto/asistente-cronograma";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { ID_ASSIST_CRONOGRAMA, PROMPT_ASSIST_CRONOGRAMA } from "@/lib/agents/timeline-assist";

/**
 * El slug con el que este agente aparece en el libro de gasto (`LlmCall.agentSlug`) y en el feed
 * de corridas — y, desde el 2026-08-18, también el id de su fila en la tabla `Agent`.
 *
 * ⚠ Hasta el 2026-08-18 este camino no creaba corrida NI envolvía el contexto de gasto: sus
 * llamadas a Claude quedaban en `LlmCall` con `agentSlug`, `clientId` y `triggeredByEmail` en
 * null. Era imposible responder «¿cuántas veces se usa el modificador?» y «¿qué proporción se
 * aplica?» — que son las dos preguntas que deciden si vale la pena construirle un chat encima.
 */
export const SLUG_ASSIST_CRONOGRAMA = ID_ASSIST_CRONOGRAMA;

/**
 * El prompt CANÓNICO vive en la tabla `Agent` — así se calibra sin deploy, igual que el que crea
 * las fases (handoff) y el que las detalla. Esta función lo lee y solo cae al texto de
 * `lib/agents/timeline-assist.ts` si la fila todavía no existe o está en DRAFT: el deploy llega
 * antes que el seed, y un modificador que responde 500 durante esa ventana sería una regresión
 * de la que nadie tiene la culpa.
 *
 * ⚠ El respaldo NO es una segunda copia del texto: es el MISMO módulo que el seed escribe en la
 * tabla. Dos copias divergen calladas y después nadie sabe cuál corrió.
 */
async function resolverAgenteDelAssist(): Promise<{ agentId: string | null; systemPrompt: string }> {
  const fila = await prisma.agent
    .findUnique({
      where: { id: ID_ASSIST_CRONOGRAMA },
      select: { id: true, systemPrompt: true, status: true },
    })
    .catch(() => null);
  if (fila && fila.status === "ACTIVE" && fila.systemPrompt.trim().length > 0) {
    return { agentId: fila.id, systemPrompt: fila.systemPrompt };
  }
  return { agentId: null, systemPrompt: PROMPT_ASSIST_CRONOGRAMA };
}

/** Cierra la corrida en ERROR sin poder romper la respuesta que el CSE está esperando. */
async function marcarError(runId: string, motivo: string): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { status: "ERROR", output: JSON.stringify({ error: motivo }) } })
    .catch(() => {});
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let instruction = "";
  let scopePhaseId: string | null = null;
  try {
    const body = await req.json();
    instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    scopePhaseId = typeof body?.scopePhaseId === "string" ? body.scopePhaseId : null;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (instruction.length < 4) {
    return NextResponse.json({ error: "Escribí qué querés cambiar del cronograma." }, { status: 400 });
  }

  // Cronograma actual (con ids) — el contexto que la IA edita.
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
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
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            /* ⚠ Estos DOS campos sí llegan al prompt: `currentJson` serializa `tl.phases`
               entero. Están acá para que el SERVIDOR sepa qué no puede perderse (ver el rescate
               al final), y de paso el modelo los ve — por eso el SYSTEM_PROMPT le dice
               explícitamente qué significan y que no las borre por omisión. */
            select: { id: true, title: true, weekIndex: true, order: true, notes: true, status: true, source: true },
          },
        },
      },
    },
  });
  if (!tl || tl.phases.length === 0) {
    return NextResponse.json(
      { error: "NO_TIMELINE", message: "No hay cronograma para actualizar." },
      { status: 400 },
    );
  }

  // RBAC — cambiar el cronograma CON IA una vez que YA está generado queda para
  // CSL/Super Admin (capacidad regenerateTimeline). El resto (CSE, Ventas, DEV,
  // Marketing) puede armarlo con IA la PRIMERA vez (sin detalle IA aún) y editarlo a
  // mano después (editTimeline), pero no rehacerlo con IA. Señal "ya generado" =
  // tareas source ∈ {AGENT, MODIFIED} (mismo predicado que hasAiDetail / el skip del
  // agente de detalle). Antes de gastar tokens de Claude.
  const aiDetailCount = await prisma.timelineTask.count({
    where: { phase: { timelineId: tl.id }, source: { in: ["AGENT", "MODIFIED"] } },
  });
  if (aiDetailCount > 0) {
    const regen = await guardCapability("regenerateTimeline");
    if (regen instanceof NextResponse) {
      return NextResponse.json(
        {
          error: "TIMELINE_ALREADY_GENERATED",
          message: "El cronograma ya está generado. Cambiarlo con IA queda para CSL o Super Admin — vos podés seguir ajustándolo a mano.",
        },
        { status: 403 },
      );
    }
  } else {
    // Rama VIRGEN (sin detalle IA aún): la primera pasada con IA pide el permiso
    // cronograma.generate (default: todo interno menos el asistente administrativo;
    // editable en /team — la semilla se lo quita a Dev).
    const gen = await guardPermission("cronograma", "generate");
    if (gen instanceof NextResponse) {
      return NextResponse.json(
        { error: "TIMELINE_GENERATION_FORBIDDEN", message: "Tu rol no puede generar el cronograma con IA." },
        { status: 403 },
      );
    }
  }

  const currentJson = JSON.stringify(
    { anchorStartDate: tl.anchorStartDate?.toISOString() ?? null, phases: tl.phases },
    null,
    1,
  );

  // Si el consultor scopeó una fase, constreñimos el cambio a ESA fase y exigimos
  // que el resto vuelva idéntico (el saneo posterior igual protege los ids).
  const scopePhase = scopePhaseId ? tl.phases.find((p) => p.id === scopePhaseId) : null;
  const scopeClause = scopePhase
    ? `\n\n=== ALCANCE ===\nEl consultor está editando SOLO la fase id="${scopePhase.id}" ("${scopePhase.name}"). Modificá ÚNICAMENTE esa fase (y solo lo que pida la instrucción). TODAS las demás fases y sus tareas devolvelas IDÉNTICAS: mismos ids, nombres, duraciones, orden, tipos y tareas — no las reordenes ni las toques.`
    : "";

  /* ── EL CONTEXTO DE NEGOCIO (Tramo 1, 2026-08-18) ──────────────────────────────────────
     Hasta hoy este agente veía SOLO el cronograma crudo: era el huérfano de los tres que
     tocan el cronograma (el handoff lo crea, `agent-timeline-detail` lo detalla y éste lo
     modifica — y los dos primeros sí ven el negocio). Por eso no podía atender bien un
     «agregá las tareas de migración»: no sabía qué se había vendido.

     Entra por `lib/contexto/` y no armando bloques acá: es el mismo embudo que ya usa el
     detalle, con la procedencia adentro del texto y bajo el trinquete de
     `PIEZAS_CON_CONTEXTO_NOMBRADO`. El cronograma se le PASA (no lo recarga): la lectura que
     el modelo ve y la que el servidor protege en el rescate de progreso tienen que ser la
     misma.
     ⛔ `REGLA_DE_FRONTERA_DEL_ASSIST` va SIEMPRE con el contexto: lo de arriba es interno y el
     cronograma lo lee el cliente. Su guarda es el centinela de `asistente-cronograma.test.ts`. */
  const contexto = await cargarContextoDelAssist(projectId, currentJson);
  const bloqueDeContexto = renderFuentes(contexto.fuentes);

  const userMessage =
    `${contexto.instrucciones}${bloqueDeContexto}\n\n${REGLA_DE_FRONTERA_DEL_ASSIST}${scopeClause}` +
    `\n\n=== INSTRUCCIÓN DEL CONSULTOR ===\n${instruction}\n\nDevuelve el cronograma completo actualizado en el formato indicado.`;

  /* El prompt sale de la tabla (calibrable sin deploy) y cae al módulo compartido mientras el
     seed no corrió. `agentId` queda en null en esa ventana — la columna lo admite y es la
     verdad: no hay fila a la cual atribuir la corrida. */
  const agente = await resolverAgenteDelAssist();

  /* La corrida se crea ANTES de llamar al modelo: si Claude falla, queda el registro de que se
     intentó (mismo criterio que `runAccountBrief`). */
  const run = await prisma.agentRun.create({
    data: {
      agentId: agente.agentId,
      clientId: guard.clientId,
      projectId,
      status: "RUNNING",
      stepLabel: "Cambio con IA en el cronograma",
      triggeredByEmail: await triggeredByEmail(),
    },
    select: { id: true },
  });

  const ctxDeGasto = {
    agentSlug: SLUG_ASSIST_CRONOGRAMA,
    agentRunId: run.id,
    clientId: guard.clientId,
    projectId,
    triggeredByEmail: await triggeredByEmail(),
    origen: "timeline/assist",
  };

  let parsedRaw: unknown;
  try {
    // ⚠ El wrap va sobre la llamada, no sobre el handler: es lo que hace que la fila de `LlmCall`
    // salga con agente, cliente y quién apretó el botón en vez de con tres nulls.
    const msg = await conContextoDeIA(ctxDeGasto, () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        temperature: 0,
        system: agente.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    );
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await marcarError(run.id, "respuesta ilegible del modelo");
      return NextResponse.json({ error: "No se pudo interpretar la respuesta de la IA. Probá reformulando el pedido." }, { status: 500 });
    }
    parsedRaw = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[timeline/assist] Claude error:", e instanceof Error ? e.message : e);
    await marcarError(run.id, e instanceof Error ? e.message : "error desconocido");
    return NextResponse.json({ error: "La IA no pudo procesar el pedido. Probá de nuevo en un momento." }, { status: 500 });
  }

  /* ── REPARAR ANTES DE JUZGAR (2026-08-20) ──────────────────────────────────────────────────
     Un `weekIndex` fuera de rango tiene UNA sola corrección sensata, y hasta hoy tiraba la
     propuesta entera: fusionar dos fases de Wherex costó 231 s y $0,29 de modelo, y se perdió
     porque el modelo dejó una tarea de OTRA fase —que la instrucción ni mencionaba— en una
     semana que no existía. `rescate-progreso.ts` ya hacía este recorte, pero corre después de
     la validación, así que acá no llegaba nunca. Lo aritmético se acomoda y SE REPORTA. */
  const reparacion = repararPropuesta(parsedRaw);

  // Validación con el MISMO validador del PUT — la propuesta debe ser aplicable tal cual.
  const validation = validateTimelinePayload(reparacion.propuesta);
  if (!validation.valid || !validation.parsed) {
    console.warn("[timeline/assist] Propuesta inválida:", validation.errors);
    /* ⚠ La corrida se cerraba SOLA en RUNNING por este camino (medido: una fila del 2026-08-20
       colgada). Sin esto, `/settings/gasto-ia` cuenta un intento que nunca termina. */
    await marcarError(run.id, `propuesta inválida: ${(validation.errors ?? []).slice(0, 3).join(" · ")}`);
    return NextResponse.json(
      { error: "assist_invalid_proposal", details: validation.errors },
      { status: 422 },
    );
  }

  // ── Saneo anti-alucinación ────────────────────────────────────────────────────
  const warnings: string[] = [...reparacion.arreglos];
  const knownPhaseIds = new Set(tl.phases.map((p) => p.id));
  const taskPhaseById = new Map<string, string>(); // taskId → phaseId real
  for (const p of tl.phases) for (const t of p.tasks) taskPhaseById.set(t.id, p.id);

  const proposal: PutBody = {
    // Nunca borrar el anchor por omisión: si la IA no lo mandó, se conserva el actual.
    anchorStartDate:
      validation.parsed.anchorStartDate ?? tl.anchorStartDate?.toISOString() ?? null,
    phases: validation.parsed.phases.map((p) => {
      let phaseId = p.id;
      if (phaseId && !knownPhaseIds.has(phaseId)) {
        warnings.push(`La fase "${p.name}" traía un id desconocido — se tratará como fase nueva.`);
        phaseId = undefined;
      }
      const tasks = (p.tasks ?? []).map((t) => {
        let taskId = t.id;
        if (taskId) {
          const realPhase = taskPhaseById.get(taskId);
          if (!realPhase) {
            warnings.push(`La tarea "${t.title}" traía un id desconocido — se creará como nueva.`);
            taskId = undefined;
          } else if (phaseId && realPhase !== phaseId) {
            // Tarea movida de fase: el PUT exige delete+create — quitamos el id acá.
            taskId = undefined;
          }
        }
        return { ...t, id: taskId };
      });
      // Reemplazo completo: tasks siempre definido (el "no tocar" no existe en este flujo).
      return { ...p, id: phaseId, tasks };
    }),
  };

  /* ── RESCATE DE LO QUE TIENE PROGRESO ─────────────────────────────────────
     La regla y sus tres trampas viven en lib/timeline/rescate-progreso.ts (puro y testeado):
     acá solo se le pasan las fases reales y la propuesta ya saneada. */
  const rescate = rescatarProgreso(tl.phases, proposal.phases);
  proposal.phases = rescate.phases;
  warnings.push(...rescate.warnings);

  /* El desenlace se cierra del otro lado: el PUT marca esta corrida como aplicada cuando el CSE
     aprieta "Aplicar" (le llega `assistRunId`). Una corrida que se queda en `propuesta` es una
     propuesta que NO se aplicó — es el denominador de la única métrica que importa acá:
     ¿cuántas de las que la IA propone terminan usándose? */
  await prisma.agentRun
    .update({
      where: { id: run.id },
      data: {
        status: "DONE",
        output: JSON.stringify({
          desenlace: "propuesta",
          instruction,
          scopePhaseId,
          fases: proposal.phases.length,
          tareas: proposal.phases.reduce((n, p) => n + (p.tasks?.length ?? 0), 0),
          warnings,
        }),
      },
    })
    .catch(() => {}); // la trazabilidad no puede tumbar una propuesta ya calculada

  return NextResponse.json({ proposal, warnings, assistRunId: run.id });
}
