/**
 * lib/external/smarteam-logo.ts
 *
 * Resuelve el logo de marca Smarteam para el chrome externo (ExternalShell).
 * Lee la config GLOBAL (SystemConfig singleton id="system") y cae al asset
 * self-hosted `/logo-smarteam.png` si no hay uno cargado. Server-side only
 * (toca Prisma) — lo invocan las páginas /external/* y pasan el resultado por
 * prop a ExternalShell (que deja de hardcodear el asset).
 */
import { prisma } from "@/lib/db/prisma";

/** Asset por defecto (en /public) si no se cargó un logo en la config global. */
export const SMARTEAM_LOGO_FALLBACK = "/logo-smarteam.png";

export async function getSmarteamLogoUrl(): Promise<string> {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { smarteamLogoUrl: true },
    });
    return cfg?.smarteamLogoUrl ?? SMARTEAM_LOGO_FALLBACK;
  } catch {
    return SMARTEAM_LOGO_FALLBACK;
  }
}

// ── Logos de PLATAFORMA (config global): HubSpot / Insider One ────────────────
// Se muestran en la brand-row de los business cases y en el hero de los kickoffs.
// Sin logo cargado → null (el BC cae al badge de texto; el kickoff no lo pinta).

export interface BrandLogos {
  smarteam: string;
  hubspot: string | null;
  insider: string | null;
}

export async function getBrandLogos(): Promise<BrandLogos> {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { smarteamLogoUrl: true, hubspotLogoUrl: true, insiderLogoUrl: true },
    });
    return {
      smarteam: cfg?.smarteamLogoUrl ?? SMARTEAM_LOGO_FALLBACK,
      hubspot: cfg?.hubspotLogoUrl ?? null,
      insider: cfg?.insiderLogoUrl ?? null,
    };
  } catch {
    return { smarteam: SMARTEAM_LOGO_FALLBACK, hubspot: null, insider: null };
  }
}

/** Mapa nombre-de-marca (lowercase) → logo, para la brand-row del hero: una brand
 *  de TEXTO cuyo nombre matchee se pinta como imagen. Incluye aliases comunes. */
export function brandLogoMap(logos: BrandLogos): Record<string, string> {
  const map: Record<string, string> = { smarteam: logos.smarteam };
  if (logos.hubspot) map["hubspot"] = logos.hubspot;
  if (logos.insider) {
    map["insider"] = logos.insider;
    map["insider one"] = logos.insider;
  }
  return map;
}

/** Logos de plataforma a mostrar en el hero del KICKOFF según los tags del proyecto:
 *  HubSpot por default (el kickoff arranca implementaciones HubSpot), salvo proyecto
 *  puramente Insider; Insider One cuando el proyecto lleva su tag. Sin logo cargado
 *  en la config, la plataforma simplemente no se pinta. */
export function platformLogosFor(tags: string[], logos: BrandLogos): string[] {
  const out: string[] = [];
  const isInsider = tags.includes("insider_one");
  const hasHubTag = tags.some((t) => t.endsWith("_hub"));
  if (logos.hubspot && !(isInsider && !hasHubTag)) out.push(logos.hubspot);
  if (logos.insider && isInsider) out.push(logos.insider);
  return out;
}
