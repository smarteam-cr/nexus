import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import SessionsClient from "./SessionsClient";
import type { SessionGroup } from "@/lib/sessions/categorize";
import { cargarSesionesCategorizadas } from "@/lib/sessions/cargar-sesiones-categorizadas";
import { construirIndice, filasDelGrupo, grupoDeSesion, paramAGrupo } from "@/lib/sessions/indice-de-grupos";

// ISR: re-validamos cada 30s. Mutaciones críticas pueden llamar revalidatePath("/sessions")
// si necesitan reflejarse inmediato.
// Render dinámico — depende de cookies de Supabase Auth (vía AppShell).
// Antes era ISR (revalidate = 30) cuando la sesión no dependía de cookies.
export const dynamic = "force-dynamic";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  // C-20 (2026-09-04): las consultas, la cascada y la cobertura viven en UN cargador que
  // comparten esta página y GET /api/sessions/grupo. Acá solo queda lo que depende de la URL.
  const { sessionsWithMeta, clients, categories, hubspotCompanies, teamMembersLite, cobertura } =
    await cargarSesionesCategorizadas();

  // ── C-19: el índice de la barra + SOLO las filas del grupo elegido ──────────────
  // Antes viajaban las ~16k filas al navegador en cada render — y como el grupo vive en la URL
  // y cada clic hace `router.replace`, eso era en CADA selección. La categorización sigue
  // corriendo entera acá (el índice la necesita); lo que cambia es lo que cruza el cable.
  // El grupo sale de `?g=`; si solo viene `?s=`, del grupo de esa sesión (como hacía el cliente).
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const sesionPedida = uno(sp.s);
  const porSesion = sesionPedida ? sessionsWithMeta.find((s) => s.id === sesionPedida) : undefined;
  const grupoInicial = paramAGrupo(uno(sp.g)) ?? (porSesion ? grupoDeSesion(porSesion.group) : null);
  const indice = construirIndice(sessionsWithMeta);
  const filas = filasDelGrupo(sessionsWithMeta, grupoInicial);

  return (
    <SessionsClient
      sessions={filas}
      indice={indice}
      grupoInicial={grupoInicial}
      clients={clients}
      categories={categories}
      hubspotCompanies={hubspotCompanies}
      teamMembers={teamMembersLite}
      cobertura={cobertura}
    />
  );
}

// Re-export para que SessionsClient pueda tipear sus props
export type { SessionGroup };
