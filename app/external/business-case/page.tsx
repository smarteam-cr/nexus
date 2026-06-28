/**
 * /external/business-case
 *
 * Ruta PÚBLICA donde el prospecto ve el Business Case publicado. Server component:
 * lee la cookie httpOnly `nexus_bc_access` (token, fuera de la URL), pasa por el
 * chokepoint server-side y renderiza read-only con el MOTOR de landing (mismo diseño
 * que el editor interno). Toda la seguridad vive en getPublishedBusinessCaseForToken
 * (re-chequea revokedAt + publishedAt EN CADA render). `force-dynamic`: nunca se cachea.
 */
import { cookies } from "next/headers";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import LandingView from "@/components/landing/LandingView";
import { BUSINESS_CASE_LANDING } from "@/components/landing/configs/business-case";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import {
  BUSINESS_CASE_COOKIE,
  getPublishedBusinessCaseForToken,
} from "@/lib/external/business-case-view";

export const dynamic = "force-dynamic";

export default async function ExternalBusinessCasePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BUSINESS_CASE_COOKIE)?.value ?? "";

  const [data, smarteamLogoUrl] = await Promise.all([
    token ? getPublishedBusinessCaseForToken(token) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {data ? (
        <LandingView
          config={BUSINESS_CASE_LANDING}
          ctx={{ clientName: data.clientName, clientLogoUrl: data.clientLogoUrl }}
          sections={data.sections.map((s) => ({ key: s.key, data: s.blocks[0]?.data ?? null }))}
          mode="read"
        />
      ) : (
        <NoAccess />
      )}
    </ExternalShell>
  );
}
