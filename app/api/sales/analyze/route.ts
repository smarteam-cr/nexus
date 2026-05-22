import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";

const INTERNAL_DOMAIN = "smarteamcr.com";

const SALES_SYSTEM_PROMPT = `Eres un analista de ventas experto. Analiza transcripciones de reuniones de ventas con prospectos y extrae inteligencia comercial estructurada.

Devuelve SOLO un JSON válido con este formato exacto:
{
  "cards": [
    { "title": "...", "content": "...", "canvasSection": "..." }
  ]
}

Genera exactamente estas 7 cards con los canvasSection indicados:

1. "Estado actual" (canvasSection: "estado_actual")
   Diagnóstico del momento en la relación comercial. ¿En qué etapa está esta oportunidad?
   Clasifica claramente en una de estas etapas y explica por qué:
   - Exploración inicial: primer contacto, levantando necesidades, sin propuesta aún
   - Propuesta en evaluación: se presentó o está por presentarse una propuesta formal
   - Negociación avanzada: hay interés confirmado, se discuten términos, precios o condiciones
   - En riesgo / estancado: la oportunidad lleva tiempo sin avanzar o hay señales de enfriamiento
   - Cerrado / ganado: se confirmó la venta
   - Cerrado / perdido: el prospecto descartó la opción
   Incluye: señales concretas que justifican la etapa, nivel de urgencia percibido y probabilidad estimada de cierre.

2. "Perfil del prospecto" (canvasSection: "perfil_prospecto")
   Empresa, industria, tamaño estimado, contexto del negocio actual.

3. "Necesidades y dolores" (canvasSection: "necesidades_dolor")
   Problemas principales, frustraciones actuales, qué los motivó a buscar una solución.

4. "Tomadores de decisión" (canvasSection: "tomadores_decision")
   Personas clave identificadas: nombres, roles, quién aprueba la compra, dinámicas internas.

5. "Presupuesto y timing" (canvasSection: "presupuesto_timing")
   Señales de presupuesto (explícitas o inferidas), urgencia, plazos mencionados.

6. "Competencia y alternativas" (canvasSection: "competencia_alternativas")
   Herramientas actuales, competidores considerados, razón para evaluar un cambio.

7. "Próximos pasos y compromisos" (canvasSection: "proximos_pasos")
   Acciones acordadas, compromisos de ambas partes, recomendación de siguiente acción concreta.

Reglas:
- Escribe en español
- Cita frases concretas de los transcripts cuando sea posible
- Usa "- " para listas dentro del content de cada card
- Si una sección no tiene información suficiente, indícalo brevemente en lugar de inventar
- No agregues cards adicionales más allá de las 7 indicadas
- El JSON debe ser parseable directamente (sin markdown, sin bloques de código)
- Si el contexto incluye un marco de referencia (por ejemplo la Escala de Rendimiento Smarteam), úsalo para ubicar al prospecto en niveles y dimensiones cuando el transcript lo permita. La card "Estado actual" puede beneficiarse de esa ubicación.

PENDIENTES (CAMPO ADICIONAL):
Además del array "cards", incluye un array "pendingItems" con las próximas acciones concretas detectadas en la conversación (compromisos, follow-ups, tareas que el vendedor o el prospecto se comprometieron a hacer). Cada item es:
{ "text": "<acción atómica y verificable>", "source": "<contexto breve opcional>" }

Reglas para pendientes:
- Cada "text" debe ser UNA acción concreta, no una descripción ("Enviar propuesta económica revisada con descuento Q1", no "Hay tema de propuesta pendiente").
- Máximo 5 items.
- Si no hay acciones claras, devuelve "pendingItems": [].

FORMATO JSON COMPLETO:
{ "cards": [...], "pendingItems": [...] }`;

export async function POST(req: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let sessionIds: string[];
  try {
    const body = await req.json() as { sessionIds?: string[] };
    sessionIds = body.sessionIds ?? [];
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!sessionIds.length) {
    return NextResponse.json({ error: "sessionIds requerido" }, { status: 400 });
  }

  // 1. Find-or-create (y actualizar prompt) del agente "Análisis de ventas"
  let agent = await prisma.agent.findFirst({ where: { name: "Análisis de ventas" } });
  if (!agent) {
    agent = await prisma.agent.create({
      data: {
        name: "Análisis de ventas",
        description: "Analiza transcripciones de reuniones de ventas y extrae inteligencia comercial estructurada: estado actual, perfil, dolores, decisores, presupuesto, competencia y próximos pasos.",
        systemPrompt: SALES_SYSTEM_PROMPT,
        status: "ACTIVE",
        outputType: "CARDS",
        scope: "GLOBAL",
        agentType: "SECTION",
        associatedStages: [],
      },
    });
  } else {
    // Mantener el prompt sincronizado con el código sin recrear el agente
    agent = await prisma.agent.update({
      where: { id: agent.id },
      data: { systemPrompt: SALES_SYSTEM_PROMPT },
    });
  }

  // 2. Cargar transcripts
  const sessions = await prisma.firefliesSession.findMany({
    where: { id: { in: sessionIds }, transcript: { not: null } },
    select: { id: true, title: true, date: true, participants: true, transcript: true },
    orderBy: { date: "asc" },
  });

  if (!sessions.length) {
    return NextResponse.json({ error: "No se encontraron sesiones con transcript" }, { status: 404 });
  }

  // 3. Cargar knowledge pineado al agente (sin truncar)
  let knowledgeBlock = "";
  const pinnedIds = agent.pinnedKnowledgeIds ?? [];
  if (pinnedIds.length > 0) {
    const pinned = await prisma.knowledgeDocument.findMany({
      where: { id: { in: pinnedIds }, status: "PUBLISHED" },
      select: { type: true, title: true, summary: true, content: true },
    });
    if (pinned.length > 0) {
      knowledgeBlock = pinned.map(doc => {
        const parts = [`### [REFERENCIA — ${doc.type}] ${doc.title}`];
        if (doc.summary?.trim()) parts.push(`**Resumen:** ${doc.summary.trim()}`);
        parts.push(doc.content.trim()); // sin truncar
        return parts.join("\n");
      }).join("\n\n---\n\n");
    }
  }

  // 4. Construir userMessage
  const transcriptBlocks = sessions.map((s, i) => {
    const externalParticipants = s.participants
      .filter((p) => !p.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`))
      .join(", ") || "sin información";

    const dateStr = s.date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const content = s.transcript?.trim().slice(0, 12000) ?? "";

    return [
      `---`,
      `[Sesión ${i + 1}] ${s.title}`,
      `Fecha: ${dateStr}`,
      `Participantes externos: ${externalParticipants}`,
      ``,
      `Transcript:`,
      content,
    ].join("\n");
  });

  const userMessage = [
    ...(knowledgeBlock ? [
      "## Marco de referencia",
      "Usa el siguiente conocimiento como marco para tu análisis cuando aplique (por ejemplo: ubicar al prospecto en niveles o dimensiones de la escala, identificar arquetipos de perfil, etc):",
      "",
      knowledgeBlock,
      "",
      "---",
      "",
    ] : []),
    "Analiza las siguientes sesiones de ventas y genera las 7 cards de análisis:",
    "",
    ...transcriptBlocks,
  ].join("\n\n");

  // 5. Llamar a Claude
  let rawText: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: agent.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    rawText = (msg.content[0] as { type: string; text: string }).text.trim();
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("credit") || msg.includes("billing")) {
      return NextResponse.json({ error: "Sin créditos en la API de Anthropic" }, { status: 402 });
    }
    return NextResponse.json({ error: "Error al llamar a Claude: " + msg }, { status: 500 });
  }

  // 6. Parsear JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Respuesta de Claude no contiene JSON válido" }, { status: 500 });
  }

  let parsed: {
    cards: { title: string; content: string; canvasSection?: string }[];
    pendingItems?: { text?: string; source?: string }[];
  };
  try {
    parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "Error al parsear respuesta de Claude" }, { status: 500 });
  }

  if (!parsed?.cards?.length) {
    return NextResponse.json({ error: "El análisis no produjo cards" }, { status: 500 });
  }

  // Normalizar pendingItems: filtrar vacíos, cortar a 5 máximo
  const pendingItems = (parsed.pendingItems ?? [])
    .map((it) => ({ text: (it?.text ?? "").trim(), source: it?.source?.trim() || undefined }))
    .filter((it) => it.text.length > 0)
    .slice(0, 5);

  return NextResponse.json({ cards: parsed.cards, pendingItems });
}
