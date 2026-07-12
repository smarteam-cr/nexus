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

const SYSTEM_PROMPT = `ROL: Eres el editor del cronograma de un proyecto de implementación de HubSpot (consultora Smarteam). Recibes el cronograma ACTUAL (JSON con ids) y UNA instrucción del consultor. Aplicas SOLO lo pedido (y sus consecuencias directas mínimas) y devuelves el cronograma COMPLETO resultante.

REGLAS DURAS:
- Conserva los ids EXACTOS de las fases y tareas que siguen existiendo (las edites o no). Elementos NUEVOS van sin id. Para BORRAR algo, simplemente omítelo del resultado.
- Si mueves una tarea a OTRA fase: en la fase destino va SIN id (es nueva ahí) y en la fase origen desaparece.
- weekIndex es 0-indexed y RELATIVO a su fase; siempre < durationWeeks de esa fase. order: reasigna secuencial (0,1,2…) dentro de cada semana.
- Puedes cambiar duraciones, nombres, orden de fases, tipos y la fecha de arranque SOLO si la instrucción lo pide o es consecuencia necesaria (p.ej. agregar una semana de tareas a una fase de 1 semana → durationWeeks 2).
- activityType ∈ EXPLORACION|PLANIFICACION|CONFIGURACION|ADOPCION|SEGUIMIENTO o null.
- anchorStartDate: inclúyelo SOLO si la instrucción pide cambiar la fecha de arranque (ISO). Si no, omítelo.
- TODO el texto (títulos y notas de tareas, nombres y notas de fases) es DE CARA AL CLIENTE: claro, profesional, sin nombres del equipo interno de Smarteam, sin instrucciones operativas internas, sin jerga. Los textos existentes que no toques se conservan tal cual.
- ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"): "Transforma", "centraliza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".
- Si la instrucción es ambigua, interpreta lo más razonable y conservador.

FORMATO DE RESPUESTA — JSON EXACTO, sin markdown:
{
  "anchorStartDate": "2026-07-01T00:00:00.000Z",   // SOLO si la instrucción lo pidió; si no, omitir
  "phases": [
    {
      "id": "<id existente o ausente si es nueva>",
      "name": "Setup", "order": 0, "durationWeeks": 2, "sessionCount": 4, "notes": null,
      "activityType": "CONFIGURACION",
      "tasks": [
        { "id": "<id existente o ausente>", "title": "Configurar pipeline de ventas", "weekIndex": 0, "order": 0, "notes": null }
      ]
    }
  ]
}
Incluye TODAS las fases y TODAS las tareas resultantes — es un reemplazo completo del cronograma.`;

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
          sessionCount: true,
          notes: true,
          activityType: true,
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: { id: true, title: true, weekIndex: true, order: true, notes: true },
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

  const userMessage = `=== CRONOGRAMA ACTUAL ===\n${currentJson}${scopeClause}\n\n=== INSTRUCCIÓN DEL CONSULTOR ===\n${instruction}\n\nDevuelve el cronograma completo actualizado en el formato indicado.`;

  let parsedRaw: unknown;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "No se pudo interpretar la respuesta de la IA. Probá reformulando el pedido." }, { status: 500 });
    }
    parsedRaw = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[timeline/assist] Claude error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "La IA no pudo procesar el pedido. Probá de nuevo en un momento." }, { status: 500 });
  }

  // Validación con el MISMO validador del PUT — la propuesta debe ser aplicable tal cual.
  const validation = validateTimelinePayload(parsedRaw);
  if (!validation.valid || !validation.parsed) {
    console.warn("[timeline/assist] Propuesta inválida:", validation.errors);
    return NextResponse.json(
      { error: "assist_invalid_proposal", details: validation.errors },
      { status: 422 },
    );
  }

  // ── Saneo anti-alucinación ────────────────────────────────────────────────────
  const warnings: string[] = [];
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

  return NextResponse.json({ proposal, warnings });
}
