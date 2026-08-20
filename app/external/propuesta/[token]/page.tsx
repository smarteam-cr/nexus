/**
 * /external/propuesta/[token] — la propuesta SIN contraseña (el modo por defecto).
 *
 * Sin login y sin contraseña: la URL ES el secreto (token de 256 bits). Mismo modelo que
 * /external/doc/[token] (documentos de Roles), y el que Ventas pidió para bajar la
 * fricción del envío de propuestas.
 *
 * Toda la seguridad vive en `resolveBusinessCaseAccess` (chokepoint fail-closed): re-chequea
 * token, revocación, publicación y caducidad en CADA render. `force-dynamic` no es
 * decoración: sin él Next cachea el segmento dinámico y **revocar el link no surtiría efecto**.
 *
 * ⚠ `referrer: "no-referrer"` es OBLIGATORIO acá y no lo es en la página de verify. El verify
 * se defiende quedándose sin recursos externos; esta página, en cambio, pinta el landing
 * completo, y el logo del cliente sale de Supabase Storage (otro origen) — sin la meta, el
 * header `Referer` de esa imagen se llevaría el token puesto a un tercero.
 *
 * `noindex` porque la URL circula por correo y no tiene otra puerta que la proteja.
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BusinessCaseLanding from "@/components/external/BusinessCaseLanding";
import PropuestaCaducada from "@/components/external/PropuestaCaducada";
import ExternalShell from "@/components/external/ExternalShell";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { resolveBusinessCaseAccess } from "@/lib/external/business-case-view";
import { bcVerifyPath } from "@/lib/business-cases/access-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título genérico A PROPÓSITO: el título de la pestaña viaja en historiales y capturas —
  // que no diga de qué empresa es la propuesta ni cuánto sale.
  title: "Smarteam",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PropuestaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [state, brandLogos] = await Promise.all([
    resolveBusinessCaseAccess(token),
    getBrandLogos(),
  ]);

  // Un 404 neutro: no distingue token inválido de revocado ni de no publicado.
  if (state.kind === "denied") notFound();

  if (state.kind === "expired") {
    return (
      <ExternalShell smarteamLogoUrl={brandLogos.smarteam}>
        <PropuestaCaducada contactEmail={state.contactEmail} />
      </ExternalShell>
    );
  }

  // El CSE encendió el check de contraseña: esta puerta deja de servir y manda a la otra.
  // `redirect()` temporal, NUNCA `permanentRedirect()`: un 308 se cachea en el navegador
  // para siempre y sobreviviría a volver a abrir la propuesta.
  if (state.requiresPassword) redirect(bcVerifyPath(token));

  return (
    <BusinessCaseLanding
      data={state.data}
      approval={state.approval}
      approveToken={token}
      brandLogos={brandLogos}
    />
  );
}
