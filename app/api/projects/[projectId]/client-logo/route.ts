/**
 * /api/projects/[projectId]/client-logo  (GET)
 *
 * Alimenta el `ctx` del hero del Kickoff, que usa las MISMAS piezas que el hero del
 * Business Case (`components/landing/hero-parts.tsx`):
 *   - `logoUrl`         → logo del cliente (imagen de la brand-row)
 *   - `platformLogos`   → HubSpot / Insider One según los tags (chip legacy)
 *   - `smarteamLogoUrl` → logo de Smarteam (config global)
 *   - `brandLogos`      → mapa nombre→logo para pintar marcas de texto como imagen
 *   - `clientId` / `clientName` → subir el logo (`POST /api/clients/[id]/logo`) y
 *     derivar los defaults de la brand-row.
 *
 * Guarded con guardAccessToProject.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getBrandLogos, platformLogosFor } from "@/lib/external/smarteam-logo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const [client, project, brandLogos] = await Promise.all([
    prisma.client.findUnique({
      where: { id: guard.clientId },
      select: { logoUrl: true, logoDarkUrl: true, logoScale: true, name: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } }),
    getBrandLogos(),
  ]);
  return NextResponse.json({
    clientId: guard.clientId,
    clientName: client?.name ?? "",
    logoUrl: client?.logoUrl ?? null,
    // Variante para fondo oscuro + tamaño base. Viajan con el logo porque son una sola
    // unidad visual: congelar uno y leer otro vivo garantiza el desajuste.
    logoDarkUrl: client?.logoDarkUrl ?? null,
    logoScale: client?.logoScale ?? null,
    platformLogos: platformLogosFor(project?.tags ?? [], brandLogos),
    smarteamLogoUrl: brandLogos.smarteam ?? null,
    brandLogos,
  });
}
