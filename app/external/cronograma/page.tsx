/**
 * /external/cronograma
 *
 * Página PÚBLICA propia del cronograma (D.1.5) — la superficie independiente
 * del kickoff. Server component: lee la cookie httpOnly `nexus_ext_access`
 * (el MISMO acceso del proyecto que el kickoff — scope /external), pasa por el
 * chokepoint server-side y renderiza read-only en el chrome de marca.
 *
 * Toda la seguridad vive en getPublishedTimelineForToken (lib/external/
 * timeline-view): resuelve token→proyecto, re-chequea revokedAt +
 * timelinePublishedAt EN CADA render, y devuelve fases + acciones por semana
 * en shape limpio (tareas solo si el detalle está confirmado). Si algo no
 * aplica → null → mensaje neutro. La cookie por sí sola NO otorga acceso.
 *
 * `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import { cookies } from "next/headers";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import TimelineLanding from "@/components/external/TimelineLanding";
import { getPublishedTimelineForToken } from "@/lib/external/timeline-view";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";

export const dynamic = "force-dynamic";

export default async function ExternalCronogramaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const data = token ? await getPublishedTimelineForToken(token) : null;

  return (
    <ExternalShell>
      {data ? (
        <TimelineLanding clientName={data.clientName} timeline={data.timeline} />
      ) : (
        <NoAccess />
      )}
    </ExternalShell>
  );
}
