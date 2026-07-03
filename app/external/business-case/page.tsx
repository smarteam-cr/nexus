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
import { configForSnapshot } from "@/components/landing/configs/templates";
import { getBrandLogos, brandLogoMap } from "@/lib/external/smarteam-logo";
import {
  BUSINESS_CASE_COOKIE,
  getPublishedBusinessCaseForToken,
} from "@/lib/external/business-case-view";

export const dynamic = "force-dynamic";

export default async function ExternalBusinessCasePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BUSINESS_CASE_COOKIE)?.value ?? "";

  const [data, brandLogos] = await Promise.all([
    token ? getPublishedBusinessCaseForToken(token) : Promise.resolve(null),
    getBrandLogos(),
  ]);

  // Idioma de la propuesta: lo declara el agente en `__lang` del data del hero
  // (viaja congelado en el snapshot) → traduce los rótulos fijos de los componentes.
  const proposalLang =
    ((data?.sections.find((s) => s.key === "hero")?.blocks[0]?.data as { __lang?: string } | null)
      ?.__lang) ?? null;

  return (
    <ExternalShell smarteamLogoUrl={brandLogos.smarteam}>
      {data ? (
        <LandingView
          config={configForSnapshot(data.templateId, data.sections)}
          ctx={{
            clientName: data.clientName,
            lang: proposalLang,
            clientLogoUrl: data.clientLogoUrl,
            smarteamLogoUrl: brandLogos.smarteam,
            brandLogos: brandLogoMap(brandLogos),
          }}
          sections={data.sections.map((s) => ({
            key: s.key,
            data: s.blocks[0]?.data ?? null,
            titleOverride: s.titleOverride,
            eyebrowOverride: s.eyebrowOverride,
          }))}
          mode="read"
        />
      ) : (
        <NoAccess />
      )}
    </ExternalShell>
  );
}
