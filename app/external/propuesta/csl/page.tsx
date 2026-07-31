/**
 * ⚠⚠ BORRAR EL 2026-08-04 (junto con `lib/roles/csl-legacy.ts`) ⚠⚠
 *
 * /external/propuesta/csl — la URL vieja de la propuesta del CSL. Ya se envió, así que
 * sobrevive 5 días como PUENTE al link nuevo, y nada más.
 *
 * Resuelve el token vivo y redirige, pero SOLO mientras el link publicado siga siendo EL
 * ORIGINAL de la migración (`publicPublishedByEmail === "seed:propuesta-csl"`, la firma que
 * escribe `scripts/seed-propuesta-csl.ts`). Republicar desde /roles pisa ese campo con el
 * email de quien publica → el puente deja de redirigir y muere solo. Es exactamente lo que
 * se quiere: republicar ES el mecanismo para matar un link filtrado, y un puente que
 * resolviera el token vivo sin condición volvería a entregar el token NUEVO, anulando la
 * rotación. Revocar ya lo mata por otra vía (el token queda en null).
 *
 * No renderiza el documento: si sirviera contenido propio, revocar el link nuevo no
 * cerraría nada — esta URL seguiría mostrando la oferta salarial.
 *
 * `redirect()` temporal, NUNCA `permanentRedirect()`: un 308 se cachea en el navegador para
 * siempre y sobreviviría a la revocación.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PROPUESTA_CSL_ID } from "@/lib/roles/csl-legacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // La URL circula por correo: que ningún buscador la levante mientras el puente viva.
  robots: { index: false, follow: false },
};

export default async function PropuestaCslLegacyPage() {
  const row = await prisma.roleProfile.findUnique({
    where: { id: PROPUESTA_CSL_ID },
    select: { publicToken: true, publicPublishedByEmail: true, active: true },
  });
  // Sin fila, sin publicar o desactivada → el mismo 404 neutro que el link nuevo.
  if (!row?.publicToken || !row.active) notFound();
  // Republicado desde el panel → el puente se retira (ver el encabezado).
  if (row.publicPublishedByEmail !== "seed:propuesta-csl") notFound();
  redirect(`/external/doc/${row.publicToken}`);
}
