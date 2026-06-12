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
