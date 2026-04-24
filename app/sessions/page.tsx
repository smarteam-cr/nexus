import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import SessionsClient from "./SessionsClient";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const [sessions, clients, teamMembers] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { date: { lt: new Date() }, transcript: { not: null } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        date: true,
        duration: true,
        participants: true,
        source: true,
        summary: true,
        enrichedAt: true,
        manualClientId: true,
        // No cargamos el transcript aquí (lazy load en detalle) — solo filtramos por not null arriba
      },
    }),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, company: true, emailDomains: true },
    }),
    prisma.teamMember.findMany({
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  function normalize(s: string) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // Índice email → member para lookup O(1)
  const memberByEmail = new Map(teamMembers.map((m) => [m.email.toLowerCase(), m]));

  const sessionsWithMeta = sessions.map((s) => {
    // Palabras del título como Set para matching exacto por palabra (evita falsos positivos
    // por substrings como "del" dentro de "modelo" o "ice" dentro de "service")
    const titleWords = new Set(
      normalize(s.title).split(/[\s|&,.()\[\]!?*\-_]+/).filter(Boolean)
    );

    // Dominios de los participantes de esta sesión
    const participantDomains = new Set(
      s.participants
        .map((e) => e.split("@")[1]?.toLowerCase())
        .filter(Boolean) as string[]
    );

    // Matching de cliente — prioridad: manual > dominio > título
    let matchedClient = s.manualClientId
      ? clients.find((c) => c.id === s.manualClientId)
      : undefined;

    if (!matchedClient) {
      matchedClient = clients.find((c) => {
        // 1. Email domain matching (más confiable)
        if (c.emailDomains.length > 0) {
          if (c.emailDomains.some((d) => participantDomains.has(d.toLowerCase()))) return true;
        }
        // 2. Title matching — palabras de 4+ chars para evitar palabras comunes ("del",
        //    "los", "con", "por"…). La empresa se divide también por "." para que
        //    "kolbi.cr" dé la palabra "kolbi" en vez de "kolbi.cr".
        //    Usamos Set para matching exacto de palabra, no substring.
        const nameParts = normalize(c.name).split(/\s+/).filter((p) => p.length >= 4);
        const compParts = c.company
          ? normalize(c.company).split(/[\s.\-_]+/).filter((p) => p.length >= 4)
          : [];
        return (
          nameParts.some((p) => titleWords.has(p)) ||
          compParts.some((p) => titleWords.has(p))
        );
      });
    }

    // Matching de equipo por emails de participantes
    const matchedMembers = s.participants
      .map((email) => memberByEmail.get(email.toLowerCase()))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    // Roles únicos presentes en la sesión
    const roles = [...new Set(matchedMembers.map((m) => m.role).filter(Boolean))] as string[];

    return {
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      duration: s.duration,
      participants: s.participants,
      source: s.source,
      hasTranscript: true, // filtrado por transcript not null en la query
      summary: s.summary as { keywords?: string[]; overview?: string; action_items?: string[] } | null,
      enrichedAt: s.enrichedAt?.toISOString() ?? null,
      clientId: matchedClient?.id ?? null,
      manualClientId: s.manualClientId,
      teamMembers: matchedMembers.map((m) => ({ name: m.name, email: m.email, role: m.role })),
      teamRoles: roles,
    };
  });

  return (
    <AppShell>
      <SessionsClient sessions={sessionsWithMeta} clients={clients} />
    </AppShell>
  );
}
