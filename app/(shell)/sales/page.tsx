import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { cargarOportunidadesDetectadas } from "@/lib/ventas/cargar-oportunidades";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import SalesClient from "./SalesClient";
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";

export const dynamic = "force-dynamic";

const SALES_REPS = [
  { key: "msalas", email: "msalas@smarteamcr.com", name: "M. Salas" },
  { key: "apinzon", email: "apinzon@smarteamcr.com", name: "A. Pinzón" },
] as const;

const SALES_EMAILS = SALES_REPS.map((r) => r.email);
const INTERNAL_DOMAIN = DOMINIO_PROPIO;

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
  let ctx: Awaited<ReturnType<typeof requireInternalUser>> | null = null;
  try {
    ctx = await requireInternalUser();
  } catch {
    redirect("/");
  }
  if (!ctx) redirect("/");

  /* D-11 (2026-09-04): «Oportunidades detectadas» se carga SOLO con la celda `ventas.read`. La
     página en sí sigue abierta a todo interno (como siempre); lo que se gatea es el dato, que es
     lo más interno del handoff. Sin la celda viaja null y el bloque no se pinta. */
  const oportunidades = (await can(ctx.teamMember, "ventas", "read")) ? await cargarOportunidadesDetectadas() : null;

  // C-10 (2026-09-04): `transcript` es el blob más pesado de la tabla y acá solo se usaba para
  // saber si EXISTE. Traerlo entero para todas las reuniones de Ventas era cargar megabytes en
  // cada visita. Mismo patrón que /sessions: la lista sin el blob + los ids que tienen transcript.
  // ⚠ `""` no cuenta como transcript (antes era `!!s.transcript`): el filtro lo excluye igual, así
  // que el conteo de analizables es el mismo de antes.
  const [sessions, conTranscript] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { participants: { hasSome: [...SALES_EMAILS] } },
      orderBy: { date: "desc" },
      select: { id: true, title: true, date: true, participants: true, duration: true },
    }),
    prisma.firefliesSession.findMany({
      where: { participants: { hasSome: [...SALES_EMAILS] }, transcript: { not: null }, NOT: { transcript: "" } },
      select: { id: true },
    }),
  ]);
  const idsConTranscript = new Set(conTranscript.map((s) => s.id));

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
    const hasTranscript = idsConTranscript.has(s.id);
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
    <SalesClient prospects={prospects} oportunidades={oportunidades} />
  );
}
