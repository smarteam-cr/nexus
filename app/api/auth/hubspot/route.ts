import { NextRequest, NextResponse } from "next/server";

const HUBSPOT_SCOPES = [
  // ── CRM Objects ─────────────────────────────────────────────
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.line_items.read",
  "crm.objects.line_items.write",
  "crm.objects.custom.read",
  "crm.objects.custom.write",
  "crm.objects.owners.read",
  // ── Engagements: timeline de la empresa (notas + llamadas/reuniones de Zoom) ──
  // Permite leer el contenido del registro de empresa para alimentar BC + canvas.
  // Requiere re-autorizar la app una vez (el refresh NO agrega scopes nuevos).
  "crm.objects.notes.read",
  "crm.objects.calls.read",
  "crm.objects.meetings.read",
  // ── CRM Schemas ─────────────────────────────────────────────
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
  "crm.schemas.companies.read",
  "crm.schemas.companies.write",
  "crm.schemas.deals.read",
  "crm.schemas.deals.write",
  "crm.schemas.custom.read",
  // ── Lists ───────────────────────────────────────────────────
  "crm.lists.read",
  "crm.lists.write",
  // ── Tickets ──────────────────────────────────────────────────
  "tickets",
  // ── Marketing ───────────────────────────────────────────────
  "forms",
  // ── Automation ──────────────────────────────────────────────
  "automation",
  "automation.sequences.read",
  "automation.sequences.enrollments.write",
  // ── Projects ────────────────────────────────────────────────
  "crm.objects.projects.read",
  "crm.objects.projects.write", // Fase 5 fundación: crear el record "projects" del handoff
  "crm.schemas.projects.read",
  // ── Settings / Users ────────────────────────────────────────
  "settings.users.read",
].join(" ");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const newClient = searchParams.get("newClient") === "1";
  const isSystem = searchParams.get("system") === "1";

  // Codificar contexto en state para recuperarlo en el callback
  const statePayload = isSystem
    ? { system: true }
    : clientId
    ? { clientId }
    : newClient
    ? { newClient: true }
    : null;

  const state = statePayload
    ? Buffer.from(JSON.stringify(statePayload)).toString("base64")
    : undefined;

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
    scope: HUBSPOT_SCOPES,
    response_type: "code",
    ...(state ? { state } : {}),
  });

  const authUrl = `https://app.hubspot.com/oauth/authorize?${params}`;
  return NextResponse.redirect(authUrl);
}
