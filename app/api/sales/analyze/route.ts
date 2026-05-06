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

Genera exactamente estas 6 cards con los canvasSection indicados:

1. "Perfil del prospecto" (canvasSection: "perfil_prospecto")
   Empresa, industria, tamaño estimado, contexto del negocio actual.

2. "Necesidades y dolores" (canvasSection: "necesidades_dolor")
   Problemas principales, frustraciones actuales, qué los motivó a buscar una solución.

3. "Tomadores de decisión" (canvasSection: "tomadores_decision")
   Personas clave identificadas: nombres, roles, quién aprueba la compra, dinámicas internas.

4. "Presupuesto y timing" (canvasSection: "presupuesto_timing")
   Señales de presupuesto (explícitas o inferidas), urgencia, plazos mencionados.

5. "Competencia y alternativas" (canvasSection: "competencia_alternativas")
   Herramientas actuales, competidores considerados, razón para evaluar un cambio.

6. "Próximos pasos y compromisos" (canvasSection: "proximos_pasos")
   Acciones acordadas, compromisos de ambas partes, recomendación de siguiente acción concreta.

Reglas:
- Escribe en español
- Cita frases concretas de los transcripts cuando sea posible
- Usa "- " para listas dentro del content de cada card
- Si una sección no tiene información suficiente, indícalo brevemente en lugar de inventar
- No agregues cards adicionales más allá de las 6 indicadas
- El JSON debe ser parseable directamente (sin markdown, sin bloques de código)`;

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

  // 1. Find-or-create el agente "Análisis de ventas"
  let agent = await prisma.agent.findFirst({ where: { name: "Análisis de ventas" } });
  if (!agent) {
    agent = await prisma.agent.create({
      data: {
        name: "Análisis de ventas",
        description: "Analiza transcripciones de reuniones de ventas y extrae inteligencia comercial estructurada: perfil, dolores, decisores, presupuesto, competencia y próximos pasos.",
        systemPrompt: SALES_SYSTEM_PROMPT,
        status: "ACTIVE",
        outputType: "CARDS",
        scope: "GLOBAL",
        agentType: "SECTION",
        associatedStages: [],
      },
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

  // 3. Construir userMessage
  const transcriptBlocks = sessions.map((s, i) => {
    const externalParticipants = s.participants
      .filter((p) => !p.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`))
      .join(", ") || "sin información";

    const dateStr = s.date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const content = s.transcript?.trim().slice(0, 4000) ?? "";

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
    "Analiza las siguientes sesiones de ventas y genera las 6 cards de análisis:",
    "",
    ...transcriptBlocks,
  ].join("\n\n");

  // 4. Llamar a Claude
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

  // 5. Parsear JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Respuesta de Claude no contiene JSON válido" }, { status: 500 });
  }

  let parsed: { cards: { title: string; content: string; canvasSection?: string }[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "Error al parsear respuesta de Claude" }, { status: 500 });
  }

  if (!parsed?.cards?.length) {
    return NextResponse.json({ error: "El análisis no produjo cards" }, { status: 500 });
  }

  return NextResponse.json({ cards: parsed.cards });
}
