/**
 * /external/kickoff
 *
 * Ruta PÚBLICA donde el cliente externo ve el Kickoff publicado de SU proyecto.
 * Server component: lee la cookie httpOnly `nexus_ext_access` (token, fuera de la
 * URL), pasa por el chokepoint server-side y renderiza read-only, envuelto en el
 * chrome de marca Smarteam (ExternalShell: nav + footer — Fase C.2).
 *
 * Toda la seguridad de LECTURA vive en getPublishedKickoffForToken (lib/external/kickoff-view):
 * resuelve token→projectId, re-chequea revokedAt + kickoffPublishedAt EN CADA render,
 * y devuelve solo bloques CONFIRMED en shape limpio. Si algo no aplica → null →
 * mensaje neutro (no se revela por qué). La cookie por sí sola NO otorga acceso.
 *
 * ESCRITURA: la única que puede hacer el cliente es asignarse una franja horaria
 * (`./actions.ts`, server action — la cookie tiene `path:"/external"` y no llegaría a
 * `/api/external/*`). Repite el mismo chokepoint antes de tocar nada.
 *
 * MOTOR DE RENDER (FLIP hecho): por defecto usa el motor `LandingView` (mismo que
 * Business Cases; tolerante: pinta la data tipada nueva Y el markdown viejo por
 * fallback). `?engine=old` = escape al renderer histórico `KickoffLanding` (rollback
 * puntual). Los 133 kickoffs viejos se ven por el fallback; los nuevos, tipados.
 *
 * `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import { cookies } from "next/headers";
import KickoffLanding from "@/components/canvas/KickoffLanding";
import KickoffClientView from "@/components/external/KickoffClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { getPublishedKickoffForToken } from "@/lib/external/kickoff-view";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";
import { assignHorarioAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExternalKickoffPage({
  searchParams,
}: {
  searchParams: Promise<{ engine?: string }>;
}) {
  const [sp, cookieStore] = await Promise.all([searchParams, cookies()]);
  // FLIP: el motor NUEVO (LandingView) es el DEFAULT. `?engine=old` = escape al renderer
  // histórico (rollback puntual). Los kickoffs viejos (markdown) se ven por el fallback
  // tolerante del adaptador; los tipados nuevos, por campos.
  const useNewEngine = sp.engine !== "old";
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const [data, smarteamLogoUrl] = await Promise.all([
    token ? getPublishedKickoffForToken(token) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {data ? (
        useNewEngine
          ? <KickoffClientView data={data} assignAction={assignHorarioAction} />
          : <KickoffLanding data={data} />
      ) : (
        <NoAccess />
      )}
    </ExternalShell>
  );
}
