import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import type {
  LifecycleSnapshot,
  AuditInsights,
  AuditInsight,
  InsightWidgetKey,
  InsightSeverity,
  AuditEnrichment,
  OwnerAssignmentStats,
} from "@/lib/hubspot/portal-analyzer";
import { fetchAuditEnrichment, getFreshToken } from "@/lib/hubspot/portal-analyzer";


type Params = { params: Promise<{ id: string }> };

// ─── Helpers de formato ───────────────────────────────────────────────────────

function pct(count: number, total: number): string {
  return total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%";
}

function fmt(n: number): string {
  return n.toLocaleString("es-ES");
}

function formatBreakdown(
  items: { label: string; count: number }[],
  total: number,
  topN = 6
): string {
  const sorted = [...items].sort((a, b) => b.count - a.count).slice(0, topN);
  if (sorted.length === 0) return "  (sin datos)";
  return sorted
    .map((s) => `  - ${s.label}: ${fmt(s.count)} (${pct(s.count, total)})`)
    .join("\n");
}

// ─── Formatea datos de owner assignment para el prompt ────────────────────────
function formatOwnerSection(ownerStats: OwnerAssignmentStats, contactsTotal: number): string {
  const { owners, unassigned, totalAssigned, monthlyAssignments, monthlyCreated } = ownerStats;

  const totalCreated12 = (monthlyCreated ?? []).reduce((s, m) => s + m.count, 0);
  const totalAssigned12 = monthlyAssignments.reduce((s, m) => s + m.count, 0);
  const coverage =
    totalCreated12 > 0
      ? ((totalAssigned12 / totalCreated12) * 100).toFixed(1) + "%"
      : "—";

  const topOwners = owners
    .slice(0, 5)
    .map((o) => `  - ${o.ownerName}: ${fmt(o.contactCount)} (${pct(o.contactCount, contactsTotal)})`)
    .join("\n");

  return `ASIGNACIÓN DE PROPIETARIOS — CONTACTOS (total: ${fmt(contactsTotal)}):
  - Contactos asignados a un propietario: ${fmt(totalAssigned)} (${pct(totalAssigned, contactsTotal)})
  - Sin propietario asignado: ${fmt(unassigned)} (${pct(unassigned, contactsTotal)})
  - Propietarios activos (con ≥1 contacto): ${owners.length}
  - Cobertura de asignación últimos 12 meses: ${coverage} (de ${fmt(totalCreated12)} creados, ${fmt(totalAssigned12)} se asignaron)

TOP 5 PROPIETARIOS POR CONTACTOS ASIGNADOS:
${topOwners || "  (sin datos)"}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const POST = withAuth(async (_req, { params }: Params) => {
  try {
    const { id } = await params;

    // 1. Carga la auditoría
    const audit = await prisma.audit.findUnique({ where: { id } });
    if (!audit) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });

    const snapshot = audit.data as LifecycleSnapshot | null;
    if (!snapshot?.lifecycleStats) {
      return NextResponse.json({ error: "La auditoría no tiene datos de ciclo de vida" }, { status: 422 });
    }

    // 2. Carga los conocimientos (todos los del workspace)
    const knowledgeEntries = await prisma.knowledge.findMany({
      orderBy: { category: "asc" },
    });

    // 3. Obtiene datos de enriquecimiento en tiempo real desde HubSpot
    // Usa la cuenta del audit si tiene accountId, o la primera disponible
    let enrichment: AuditEnrichment | null = null;
    try {
      const accountId = audit.accountId ?? (await prisma.hubspotAccount.findFirst())?.id;
      if (accountId) {
        const token = await getFreshToken(accountId);
        enrichment = await fetchAuditEnrichment(token);
      }
    } catch (err) {
      console.warn("[insights] No se pudo obtener enrichment:", err);
      // No es fatal — el prompt funcionará sin enrichment
    }

    const stats = snapshot.lifecycleStats;
    const ownerStats: OwnerAssignmentStats | undefined = snapshot.ownerStats;

    // 4. Calcula totales y distribución del snapshot
    const contactsTotal = stats.totalContacts;
    const companiesTotal = stats.totalCompanies;
    const contactsWithStage = stats.contacts.reduce((s, c) => s + c.count, 0);
    const companiesWithStage = stats.companies.reduce((s, c) => s + c.count, 0);
    const contactsWithoutStage = Math.max(0, contactsTotal - contactsWithStage);
    const companiesWithoutStage = Math.max(0, companiesTotal - companiesWithStage);
    const dealsToContactsRatio =
      contactsTotal > 0 ? ((stats.totalDeals / contactsTotal) * 100).toFixed(1) : "0";

    const formatStages = (
      stages: { label: string; count: number }[],
      total: number,
      withoutStage: number
    ) => {
      const lines = stages
        .sort((a, b) => b.count - a.count)
        .map((s) => `  - ${s.label}: ${fmt(s.count)} (${pct(s.count, total)})`);
      if (withoutStage > 0) {
        lines.push(`  - Sin etapa asignada: ${fmt(withoutStage)} (${pct(withoutStage, total)})`);
      }
      return lines.join("\n") || "  (sin datos)";
    };

    // 5. Sección de conocimientos
    const categoryLabels: Record<string, string> = {
      general:   "General",
      lifecycle: "Ciclo de vida",
      workflows: "Workflows",
      contacts:  "Contactos",
      companies: "Empresas",
      deals:     "Negocios",
    };
    const knowledgeSection =
      knowledgeEntries.length > 0
        ? knowledgeEntries
            .map(
              (k, i) =>
                `${i + 1}. ${categoryLabels[k.category] ?? k.category} — ${k.title}\n   ${k.content}`
            )
            .join("\n\n")
        : "(Sin conocimientos configurados — aplica criterio experto estándar de HubSpot RevOps)";

    // 6. Sección de enriquecimiento
    const enrichmentSection = enrichment
      ? `
═══ DATOS DE ENRIQUECIMIENTO (propiedades adicionales capturadas en tiempo real) ═══

HIGIENE Y ACTIVIDAD — CONTACTOS (total: ${fmt(contactsTotal)}):
  - Sin propietario asignado: ${fmt(enrichment.contacts.orphans)} (${pct(enrichment.contacts.orphans, contactsTotal)})
  - Sin actividad registrada nunca: ${fmt(enrichment.contacts.neverContacted)} (${pct(enrichment.contacts.neverContacted, contactsTotal)}) ← datos potencialmente fantasma
  - Con actividad últimos 30 días: ${fmt(enrichment.contacts.active30d)} (${pct(enrichment.contacts.active30d, contactsTotal)})
  - Con conversión de formulario: ${fmt(enrichment.contacts.withConversions)} (${pct(enrichment.contacts.withConversions, contactsTotal)})
  - Con lead status asignado: ${fmt(enrichment.contacts.withLeadStatus)} (${pct(enrichment.contacts.withLeadStatus, contactsTotal)}) — sin estado: ${pct(contactsTotal - enrichment.contacts.withLeadStatus, contactsTotal)}

DISTRIBUCIÓN DE LEAD STATUS (contactos):
${formatBreakdown(enrichment.contacts.byLeadStatus, enrichment.contacts.withLeadStatus)}

FUENTE DE ORIGEN — CONTACTOS:
${formatBreakdown(enrichment.contacts.byOriginalSource, contactsTotal)}

HIGIENE Y ACTIVIDAD — EMPRESAS (total: ${fmt(companiesTotal)}):
  - Sin propietario asignado: ${fmt(enrichment.companies.orphans)} (${pct(enrichment.companies.orphans, companiesTotal)})
  - Con al menos 1 negocio asociado: ${fmt(enrichment.companies.withDeals)} (${pct(enrichment.companies.withDeals, companiesTotal)}) ← señal de conversión
  - Sin ningún negocio (nunca convertidas): ${fmt(companiesTotal - enrichment.companies.withDeals)} (${pct(companiesTotal - enrichment.companies.withDeals, companiesTotal)})
  - Han convertido a cliente (fecha registrada): ${fmt(enrichment.companies.withCustomerDate)} (${pct(enrichment.companies.withCustomerDate, companiesTotal)})
  - Con actividad últimos 30 días: ${fmt(enrichment.companies.active30d)} (${pct(enrichment.companies.active30d, companiesTotal)})

FUENTE DE ORIGEN — EMPRESAS:
${formatBreakdown(enrichment.companies.byOriginalSource, companiesTotal)}

DISTRIBUCIÓN POR INDUSTRIA (empresas):
${formatBreakdown(enrichment.companies.byIndustry, companiesTotal)}`
      : "\n(Datos de enriquecimiento no disponibles — analiza solo con los datos del snapshot)";

    // 7. Sección de propietarios (solo si la auditoría los tiene)
    const ownerSection = ownerStats
      ? `\n═══ DATOS DE ASIGNACIÓN DE PROPIETARIOS ═══\n\n${formatOwnerSection(ownerStats, contactsTotal)}`
      : "\n(Datos de asignación de propietarios no disponibles — auditoría creada antes de incluir este widget)";

    // 8. Widget de owner_assignment: solo pedirlo si hay datos
    const ownerWidgetEntry = ownerStats
      ? `,
  {
    "widgetKey": "owner_assignment",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  }`
      : "";

    // 9. Obtiene el system prompt del agente de auditoría
    const auditAgent = await prisma.agent.findUnique({
      where: { id: "agent-audit-portal" },
      select: { systemPrompt: true },
    });

    const systemPrompt =
      auditAgent?.systemPrompt ??
      // Fallback en caso de que el agente no exista en la BD
      `Eres un consultor senior de RevOps especializado en implementaciones HubSpot CRM con más de 10 años de experiencia en empresas B2B. Tu misión es analizar con rigor los datos de esta auditoría de portal HubSpot y generar insights profundos, específicos y accionables que un equipo de RevOps pueda implementar hoy.`;

    // 10. Construye el mensaje del usuario (knowledge + datos + plantilla JSON)
    const userMessage = `═══ REGLAS DE INTERPRETACIÓN (BASE DE CONOCIMIENTOS DE LA EMPRESA) ═══
Estas reglas son criterios propietarios del equipo. APLÍCALOS cuando los datos los activen:

${knowledgeSection}

═══ DATOS DEL SNAPSHOT (capturados al crear la auditoría) ═══
Fecha de captura: ${new Date(snapshot.capturedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}

VOLUMEN GENERAL:
  - Contactos: ${fmt(contactsTotal)}
  - Empresas: ${fmt(companiesTotal)}
  - Negocios: ${fmt(stats.totalDeals)}
  - Tickets: ${fmt(stats.totalTickets)}
  - Ratio negocios/contactos: ${dealsToContactsRatio}%

CONTACTOS POR ETAPA DE CICLO DE VIDA (total: ${fmt(contactsTotal)}):
${formatStages(stats.contacts, contactsTotal, contactsWithoutStage)}

EMPRESAS POR ETAPA DE CICLO DE VIDA (total: ${fmt(companiesTotal)}):
${formatStages(stats.companies, companiesTotal, companiesWithoutStage)}

WORKFLOWS ACTIVOS RELACIONADOS CON CICLO DE VIDA (${stats.lifecycleWorkflows.length} detectados):
${stats.lifecycleWorkflows.length > 0 ? stats.lifecycleWorkflows.map((w) => `  - ${w}`).join("\n") : "  - Ninguno detectado"}
${enrichmentSection}
${ownerSection}

Responde ÚNICAMENTE con el JSON (sin texto previo, sin markdown, sin bloques de código):
[
  {
    "widgetKey": "stats",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  },
  {
    "widgetKey": "contacts_lifecycle",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  },
  {
    "widgetKey": "companies_lifecycle",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  },
  {
    "widgetKey": "lifecycle_workflows",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  },
  {
    "widgetKey": "contacts_funnel",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  },
  {
    "widgetKey": "companies_funnel",
    "title": "...",
    "comment": "...",
    "severity": "positive|info|warning|critical",
    "recommendations": ["...", "..."]
  }${ownerWidgetEntry}
]`;

    // 11. Llama a Claude con system prompt separado
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    // 12. Parsea y valida la respuesta JSON
    let parsedInsights: AuditInsight[];
    try {
      // Extrae el bloque [...] de la respuesta (tolerante a texto previo o markdown)
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No se encontró array JSON en la respuesta");

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("La respuesta no es un array JSON");

      parsedInsights = parsed as AuditInsight[];

      const validWidgetKeys: InsightWidgetKey[] = [
        "stats",
        "contacts_lifecycle",
        "companies_lifecycle",
        "lifecycle_workflows",
        "contacts_funnel",
        "companies_funnel",
        "owner_assignment",
      ];
      const validSeverities: InsightSeverity[] = ["positive", "info", "warning", "critical"];

      parsedInsights = parsedInsights
        .filter(
          (i) =>
            validWidgetKeys.includes(i.widgetKey as InsightWidgetKey) &&
            validSeverities.includes(i.severity as InsightSeverity) &&
            typeof i.comment === "string" &&
            Array.isArray(i.recommendations)
        )
        .map((i) => ({
          widgetKey: i.widgetKey,
          title: typeof i.title === "string" ? i.title : "",
          comment: i.comment,
          severity: i.severity,
          recommendations: i.recommendations.filter((r) => typeof r === "string"),
        }));
    } catch (parseErr) {
      console.error("[insights] Parse error:", parseErr);
      console.error("[insights] Raw Claude response:", rawText.slice(0, 500));
      return NextResponse.json(
        { error: "Claude devolvió una respuesta con formato inválido" },
        { status: 500 }
      );
    }

    // 13. Guarda los insights en el audit.data
    const insights: AuditInsights = {
      generatedAt: new Date().toISOString(),
      insights: parsedInsights,
    };

    const updatedData = { ...snapshot, insights };
    await prisma.audit.update({
      where: { id },
      data: { data: updatedData as object },
    });

    return NextResponse.json(insights);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
