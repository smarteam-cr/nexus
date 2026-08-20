/**
 * components/external/BusinessCaseLanding.tsx
 *
 * El render de la propuesta publicada, COMPARTIDO por las dos puertas:
 *   · /external/propuesta/{token}   (abierta — la URL es el secreto)
 *   · /external/business-case       (con contraseña — servida por cookie)
 *
 * Vive en un componente y no duplicado en cada página porque el prospecto tiene que ver
 * exactamente lo mismo por cualquiera de las dos; una copia se bifurca el día que alguien
 * toque el chrome de una sola. Server component: no toca DB (el chokepoint ya resolvió),
 * solo compone.
 *
 * La barra de aprobación va DESPUÉS del <LandingView> y FUERA del motor de landing: así no
 * hay que tocar templates ni configs, y —clave— no aparece en el PDF, que se arma por otra
 * ruta (/print/doc/...) desde las mismas secciones.
 */
import LandingView from "@/components/landing/LandingView";
import ExternalShell from "@/components/external/ExternalShell";
import PropuestaAprobacion from "@/components/external/PropuestaAprobacion";
import { configForSnapshot } from "@/components/landing/configs/templates";
import { brandLogoMap, type BrandLogos } from "@/lib/external/smarteam-logo";
import type {
  BusinessCaseApproval,
  BusinessCaseLandingData,
} from "@/lib/external/business-case-view";

export default function BusinessCaseLanding({
  data,
  approval,
  approveToken,
  brandLogos,
}: {
  data: BusinessCaseLandingData;
  approval: BusinessCaseApproval | null;
  /** Token con el que la barra de aprobación se identifica ante el endpoint público. */
  approveToken: string;
  brandLogos: BrandLogos;
}) {
  // Idioma de la propuesta: lo declara el agente en `__lang` del data del hero
  // (viaja congelado en el snapshot) → traduce los rótulos fijos de los componentes.
  const proposalLang =
    ((data.sections.find((s) => s.key === "hero")?.blocks[0]?.data as { __lang?: string } | null)
      ?.__lang) ?? null;

  return (
    <ExternalShell smarteamLogoUrl={brandLogos.smarteam}>
      <LandingView
        config={configForSnapshot(data.templateId, data.sections)}
        ctx={{
          clientName: data.clientName,
          lang: proposalLang,
          clientLogoUrl: data.clientLogoUrl,
          clientLogoDarkUrl: data.clientLogoDarkUrl,
          clientLogoScale: data.clientLogoScale,
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
      <PropuestaAprobacion token={approveToken} approval={approval} lang={proposalLang} />
    </ExternalShell>
  );
}
