import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import SalesClient from "./SalesClient";

export const dynamic = "force-dynamic";

const SALES_REPS = [
  { key: "msalas", email: "msalas@smarteamcr.com", name: "M. Salas" },
  { key: "apinzon", email: "apinzon@smarteamcr.com", name: "A. Pinzón" },
] as const;

const SALES_EMAILS = SALES_REPS.map((r) => r.email);
const INTERNAL_DOMAIN = "smarteamcr.com";

export interface ProspectGroup {
  domain: string;
  companyName: string;
  sessionCount: number;
  analyzableCount: number; // sesiones con transcript
  reps: string[];
  lastSessionDate: string;
  sessions: { id: string; title: string; date: string; hasTranscript: boolean }[];
}

export default async function SalesPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const sessions = await prisma.firefliesSession.findMany({
    where: {
      participants: { hasSome: [...SALES_EMAILS] },
    },
    orderBy: { date: "desc" },
    select: { id: true, title: true, date: true, participants: true, duration: true, transcript: true },
  });

  // Agrupar por dominio externo
  const groupMap = new Map<string, ProspectGroup>();

  for (const s of sessions) {
    // Participantes externos: excluir emails del dominio interno
    const externalEmails = s.participants.filter(
      (p) => !p.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`)
    );
    if (externalEmails.length === 0) continue;

    // Dominio primario del prospecto
    const domain = externalEmails[0].split("@")[1]?.toLowerCase() ?? "desconocido";

    // Qué reps participaron en esta sesión
    const repsPresent = SALES_REPS
      .filter((r) => s.participants.some((p) => p.toLowerCase() === r.email))
      .map((r) => r.name);

    if (!groupMap.has(domain)) {
      // Capitalizar primera parte del dominio como nombre de empresa
      const firstPart = domain.split(".")[0] ?? domain;
      const companyName = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);

      groupMap.set(domain, {
        domain,
        companyName,
        sessionCount: 0,
        analyzableCount: 0,
        reps: [],
        lastSessionDate: s.date.toISOString(),
        sessions: [],
      });
    }

    const group = groupMap.get(domain)!;
    const hasTranscript = !!s.transcript;
    group.sessionCount++;
    if (hasTranscript) group.analyzableCount++;
    group.sessions.push({ id: s.id, title: s.title, date: s.date.toISOString(), hasTranscript });

    // Agregar reps únicos
    for (const rep of repsPresent) {
      if (!group.reps.includes(rep)) group.reps.push(rep);
    }

    // Actualizar fecha más reciente
    if (s.date > new Date(group.lastSessionDate)) {
      group.lastSessionDate = s.date.toISOString();
    }
  }

  const prospects = [...groupMap.values()].sort(
    (a, b) => new Date(b.lastSessionDate).getTime() - new Date(a.lastSessionDate).getTime()
  );

  return (
    <SalesClient prospects={prospects} />
  );
}
