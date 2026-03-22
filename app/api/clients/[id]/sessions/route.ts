import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

export interface SessionItem {
  id: string;
  title: string;
  date: number;       // ms timestamp
  duration: number;   // minutes
  participants: string[];
  organizerEmail: string | null;
  firefliesUrl: string;
}

type RawTranscript = {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
};

// ── HubSpot: dominio + contactos de una empresa ───────────────────────────────

interface HubspotCompanyData {
  domain: string | null;
  contactEmails: Set<string>;
}

async function fetchHubspotCompanyData(
  hubspotCompanyId: string,
  hubspotAccountId?: string
): Promise<HubspotCompanyData> {
  const result: HubspotCompanyData = { domain: null, contactEmails: new Set() };
  try {
    const hsClient = hubspotAccountId
      ? await getHubspotClient(hubspotAccountId)
      : await getSystemHubspotClient();

    // Fetch company domain + associated contacts in parallel
    const [companyRes, assocRes] = await Promise.all([
      hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${hubspotCompanyId}?properties=domain,website`,
      }),
      hsClient.apiRequest({
        method: "GET",
        path: `/crm/v3/objects/companies/${hubspotCompanyId}/associations/contacts?limit=100`,
      }),
    ]);

    const companyData = (await companyRes.json()) as {
      properties?: { domain?: string | null; website?: string | null };
    };
    const rawDomain = companyData.properties?.domain;
    const rawWebsite = companyData.properties?.website;
    if (rawDomain) {
      result.domain = rawDomain.toLowerCase().trim();
    } else if (rawWebsite) {
      try {
        const url = rawWebsite.startsWith("http") ? rawWebsite : `https://${rawWebsite}`;
        result.domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      } catch { /* website inválido */ }
    }

    const assocData = (await assocRes.json()) as { results?: { id: string }[] };
    const contactIds = (assocData.results ?? []).map((r) => r.id);
    if (contactIds.length > 0) {
      const contactRes = await hsClient.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/contacts/batch/read",
        body: { inputs: contactIds.slice(0, 100).map((id) => ({ id })), properties: ["email"] },
      });
      const contactData = (await contactRes.json()) as {
        results?: { properties?: { email?: string | null } }[];
      };
      for (const c of contactData.results ?? []) {
        if (c.properties?.email) result.contactEmails.add(c.properties.email.toLowerCase());
      }
    }
  } catch { /* no fatal */ }
  return result;
}

// ── HubSpot: buscar contactos por dominio de email ────────────────────────────

async function fetchContactEmailsByDomain(
  domain: string,
  hubspotAccountId?: string
): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    const hsClient = hubspotAccountId
      ? await getHubspotClient(hubspotAccountId)
      : await getSystemHubspotClient();

    const res = await hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/contacts/search",
      body: {
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "CONTAINS_TOKEN",
            value: `@${domain}`,
          }],
        }],
        properties: ["email"],
        limit: 100,
      },
    });
    const data = (await res.json()) as {
      results?: { properties?: { email?: string | null } }[];
    };
    for (const c of data.results ?? []) {
      if (c.properties?.email) result.add(c.properties.email.toLowerCase());
    }
  } catch { /* no fatal */ }
  return result;
}

// ── Fireflies: obtener una página de transcripts ──────────────────────────────

async function fetchFirefliesPage(
  apiKey: string,
  skip: number,
  retries = 2
): Promise<RawTranscript[]> {
  try {
    const query = `{ transcripts(limit: 50, skip: ${skip}) { id title date duration participants } }`;
    const res = await fetch(FIREFLIES_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { transcripts?: RawTranscript[] };
      errors?: { code?: string; message?: string }[];
    };

    // Detectar rate-limit (429) de Fireflies (llega como GraphQL error, no HTTP 429)
    const rateLimitErr = data.errors?.find((e) => e.code === "too_many_requests");
    if (rateLimitErr) {
      if (retries <= 0) return [];
      // Extraer el timestamp de retry-after del mensaje
      const match = rateLimitErr.message?.match(/retry after (.+?)\s*\(UTC\)/i);
      let waitMs = 3000; // fallback 3 s
      if (match) {
        const retryAt = new Date(match[1] + " UTC").getTime();
        waitMs = Math.max(500, Math.min(retryAt - Date.now() + 500, 15000));
      }
      console.log(`[sessions] 429 en skip=${skip}, esperando ${waitMs}ms…`);
      await new Promise((r) => setTimeout(r, waitMs));
      return fetchFirefliesPage(apiKey, skip, retries - 1);
    }

    if (data.errors?.length) console.error("[sessions] Fireflies error:", data.errors);
    return data.data?.transcripts ?? [];
  } catch {
    return [];
  }
}

// ── Fireflies: buscar transcripts de un cliente por lotes en paralelo ────────
// Descarga lotes de 3 páginas simultáneas, se detiene cuando hay una página incompleta

async function fetchMatchingTranscripts(
  apiKey: string,
  matchFn: (t: RawTranscript) => boolean,
  maxPages = 5
): Promise<RawTranscript[]> {
  const BATCH = 3; // 3 páginas en paralelo — menos agresivo con el rate limit
  const INTER_BATCH_DELAY = 400; // ms entre batches para evitar burst 429
  const seen = new Set<string>();
  const matched: RawTranscript[] = [];

  for (let start = 0; start < maxPages; start += BATCH) {
    // Pequeña pausa entre batches para no saturar Fireflies
    if (start > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));

    const count = Math.min(BATCH, maxPages - start);
    const pages = await Promise.all(
      Array.from({ length: count }, (_, i) => fetchFirefliesPage(apiKey, (start + i) * 50))
    );

    for (const page of pages) {
      for (const t of page) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          if (matchFn(t)) matched.push(t);
        }
      }
    }

    // Si la última página del lote vino incompleta, no hay más datos
    if ((pages[pages.length - 1]?.length ?? 0) < 50) break;
  }

  return matched;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sessions: [], participants: [], error: "no_key" }, { status: 503 });
  }

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const participantFilter = searchParams.get("participant")?.toLowerCase() ?? null;

  // ── Cargar cliente ────────────────────────────────────────────────────────
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: { select: { id: true } } },
  });

  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Extrae tokens significativos de un nombre/empresa eliminando sufijos legales y palabras cortas
  const LEGAL_SUFFIXES = new Set([
    // Formas legales
    "sa", "s.a", "s.a.", "sas", "s.a.s", "corp", "inc", "ltd", "ltda",
    "co", "llc", "grupo", "group",
    // Stopwords
    "de", "del", "la", "el", "los", "las", "and", "y", "the",
    // TLDs comunes (para evitar que "hogaresunion.com" → ["hogaresunion","com"])
    "com", "net", "org", "edu", "gov", "io", "app",
    "cr", "mx", "pa", "pe", "ar", "cl", "ve", "co", "gt", "hn", "ni", "sv",
  ]);
  function extractTitleTerms(raw: string): string[] {
    return normalize(raw)
      .split(/[\s,.|&+()\-/\\]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !LEGAL_SUFFIXES.has(t));
  }

  // titleTerms: SOLO del nombre del cliente.
  // El dominio/empresa NO se usa para título — ya tiene su propio criterio (byDomain).
  // Agregar términos del dominio genera falsos positivos ("hogaresunion" o "com" en títulos).
  const titleTerms: string[] = client?.name ? extractTitleTerms(client.name) : [];

  // ── Determinar dominio y obtener emails de contactos ──────────────────────
  let domainFilter: string | null = null;
  let contactEmails = new Set<string>();
  const hubspotAccountId = client?.hubspotAccount?.id;

  // Extraer dominio desde client.company (soporta URL completa o dominio bare)
  if (client?.company) {
    const raw = client.company.trim();
    try {
      if (/^https?:\/\//i.test(raw)) {
        // URL completa: "https://www.panafoto.com/" → "panafoto.com"
        domainFilter = new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
      } else {
        // Dominio bare: "uci.ac.cr" → "uci.ac.cr"
        const cleaned = raw.toLowerCase().replace(/^www\./, "");
        if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) domainFilter = cleaned;
      }
    } catch { /* URL inválida, ignorar */ }
  }

  // ── Lanzar llamados en paralelo: HubSpot + equipo interno ────────────────
  // - Datos de empresa (dominio + contactos asociados)
  // - Búsqueda de contactos por dominio (si ya conocemos el dominio)
  // - Emails del equipo interno (para encontrar sesiones de ventas del cliente)
  const initialDomainFilter = domainFilter; // guardar el dominio original para evitar doble búsqueda
  const [hsData, earlyDomainContacts, teamEmails] = await Promise.all([
    client?.hubspotCompanyId
      ? fetchHubspotCompanyData(client.hubspotCompanyId, hubspotAccountId)
      : Promise.resolve<HubspotCompanyData | null>(null),
    domainFilter
      ? fetchContactEmailsByDomain(domainFilter, hubspotAccountId)
      : Promise.resolve(new Set<string>()),
    prisma.teamMember
      .findMany({ select: { email: true } })
      .then((ms) => new Set(ms.map((m) => normalize(m.email)))),
  ]);

  // Aplicar datos de HubSpot (puede sobrescribir el dominio extraído de client.company)
  if (hsData?.domain) domainFilter = hsData.domain;

  // Contactos: preferir los de asociaciones de empresa, luego los del dominio
  if ((hsData?.contactEmails.size ?? 0) > 0) {
    contactEmails = hsData!.contactEmails;
  } else if (earlyDomainContacts.size > 0) {
    contactEmails = earlyDomainContacts;
  } else if (domainFilter && domainFilter !== initialDomainFilter) {
    // HubSpot dio un dominio DISTINTO al que ya buscamos en paralelo; buscar ahora
    contactEmails = await fetchContactEmailsByDomain(domainFilter, hubspotAccountId);
  }

  // ── Extractor de email de un string de participante ───────────────────────
  const extractEmail = (p: string): string => {
    const angleMatch = p.match(/<([^>]+@[^>]+)>/);
    if (angleMatch) return angleMatch[1].toLowerCase().trim();
    const emailMatch = p.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
    if (emailMatch) return emailMatch[0].toLowerCase().trim();
    return p.toLowerCase().trim();
  };

  // Excluir emails del equipo interno de contactEmails para evitar falsos positivos
  // (si HubSpot tiene un miembro del equipo como contacto, no debe usarse como criterio de cliente)
  for (const te of teamEmails) contactEmails.delete(te);

  // ── Tokenizador de títulos ────────────────────────────────────────────────
  // Convierte un título en un Set de tokens para word-boundary matching.
  // Evita el clásico bug: titleTerms=["union"] matcheando "Reunión" por substring
  // porque normalize("reunión") = "reunion" y "reunion".includes("union") = true.
  function tokenizeTitle(raw: string): Set<string> {
    return new Set(
      normalize(raw)
        .split(/[\s,.|&+()\-_/\\[\]{}:;!?¿¡"']+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    );
  }

  // ── Predicado de relevancia ────────────────────────────────────────────────
  //
  // Señales FUERTES (se usan siempre):
  //   (a) byTitle  — el título del transcript contiene TODOS los tokens del nombre
  //                  ⚠️  Word-token matching (NO substring): "union" NO matchea "reunion"
  //                  Para nombres de 1 token (UCI, Panafoto): every() == some().
  //   (b) byDomain — un participante externo tiene email @dominio-del-cliente
  //
  // Señal DÉBIL (solo como fallback):
  //   (c) byContact — un participante es contacto HubSpot del cliente
  //       Solo se activa cuando el cliente NO tiene dominio conocido.
  //
  const matchesClient = (t: RawTranscript): boolean => {
    if (titleTerms.length === 0 && !domainFilter && contactEmails.size === 0) return true;

    // Tokenizar el título para comparación exacta por palabra.
    // TODOS los tokens del nombre deben estar presentes (AND, no OR):
    //   "Hogares Union" → ["hogares","union"] → ambos deben aparecer en el título
    //   Evita: "hogares" solo matcheando "Hogares Protegidos" (otro cliente)
    //   Evita: "union" solo matcheando "Unión Comercial..." o cualquier "Reunión"
    //   Para nombres de 1 token (UCI, Panafoto): every() == some(), sin regresión.
    const titleTokens = tokenizeTitle(t.title ?? "");
    const byTitle = titleTerms.length > 0 && titleTerms.every((term) => titleTokens.has(term));

    // Solo evaluar participantes externos (excluir equipo Dinterweb)
    const externalParticipants = t.participants.filter(
      (p) => !teamEmails.has(normalize(extractEmail(p)))
    );

    const byDomain = domainFilter
      ? externalParticipants.some((p) => extractEmail(p).endsWith(`@${domainFilter}`))
      : false;

    // byContact: fallback solo cuando no hay dominio disponible.
    // Con dominio, los contactos corporativos están cubiertos por byDomain;
    // activar byContact adicional causaría matches en sesiones de otros clientes
    // donde el mismo contacto (personal/Gmail) participe.
    const byContact = (!domainFilter && contactEmails.size > 0)
      ? externalParticipants.some((p) => contactEmails.has(extractEmail(p)))
      : false;

    return byTitle || byDomain || byContact;
  };

  // ── Intentar leer de la caché DB primero ──────────────────────────────────
  let clientSessions: RawTranscript[];

  const allDbSessions = await prisma.firefliesSession.findMany({
    orderBy: { date: "desc" },
  });

  if (allDbSessions.length > 0) {
    // Convertir el formato DB al formato RawTranscript (date como ms timestamp)
    const dbAsRaw: RawTranscript[] = allDbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      duration: s.duration,
      participants: s.participants,
    }));

    clientSessions = dbAsRaw.filter(matchesClient);
    console.log(`[sessions] DB cache hit: ${allDbSessions.length} total, ${clientSessions.length} matched for "${client?.name}"`);
  } else {
    // Fallback: llamar a Fireflies directamente si la tabla está vacía
    const maxPages = (domainFilter || contactEmails.size > 0 || teamEmails.size > 0) ? 40 : 1;

    console.log(`[sessions] DB empty — falling back to Fireflies API. client="${client?.name}" titleTerms=${JSON.stringify(titleTerms)} domain="${domainFilter}" contacts=${contactEmails.size} team=${teamEmails.size} maxPages=${maxPages}`);

    clientSessions = await fetchMatchingTranscripts(apiKey, matchesClient, maxPages);
    console.log(`[sessions] Fireflies API: Found ${clientSessions.length} sessions for "${client?.name}" (titleTerms=${JSON.stringify(titleTerms)}, domain=${domainFilter})`);
  }

  // ── Filtrar por participante específico ───────────────────────────────────
  const filtered = participantFilter
    ? clientSessions.filter((t) =>
        t.participants.some((p) => extractEmail(p) === participantFilter)
      )
    : clientSessions;

  // ── Participantes únicos ──────────────────────────────────────────────────
  const allParticipants = new Set<string>();
  clientSessions.forEach((t) =>
    t.participants.forEach((p) => allParticipants.add(extractEmail(p)))
  );

  // ── Formatear y ordenar por fecha descendente ─────────────────────────────
  const sessions: SessionItem[] = filtered
    .map((t) => ({
      id: t.id,
      title: t.title || "Sesión sin título",
      date: t.date,
      duration: t.duration,
      participants: t.participants,
      organizerEmail: null,
      firefliesUrl: `https://app.fireflies.ai/view/${t.id}`,
    }))
    .sort((a, b) => b.date - a.date);

  return NextResponse.json(
    { sessions, participants: Array.from(allParticipants).sort() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
