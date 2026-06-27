/**
 * /external/business-case
 *
 * Ruta PÚBLICA donde el prospecto ve el Business Case publicado. Server
 * component: lee la cookie httpOnly `nexus_bc_access` (token, fuera de la URL),
 * pasa por el chokepoint server-side y renderiza read-only dentro del chrome de
 * marca Smarteam. Toda la seguridad vive en getPublishedBusinessCaseForToken
 * (re-chequea revokedAt + publishedAt EN CADA render). `force-dynamic`: nunca
 * se cachea.
 */
import { cookies } from "next/headers";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import BusinessCaseLanding from "@/components/business-cases/BusinessCaseLanding";
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
      {data ? <BusinessCaseLanding data={data} /> : <NoAccess />}
    </ExternalShell>
  );
}
