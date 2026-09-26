/**
 * /external/cuestionario/[token] — el cuestionario previo, del lado del cliente.
 *
 * Sin login y sin contraseña: la URL ES el secreto (token de 256 bits), igual que la propuesta.
 * Cada enlace es de UNA persona y muestra solo sus pestañas. Toda la seguridad vive en
 * `lib/cuestionario/externo.ts` (`resolver`), que re-chequea token, revocación y publicación en
 * CADA render y en cada guardado. `force-dynamic` no es decoración: sin él, revocar no surtiría efecto.
 *
 * `Referrer-Policy: no-referrer` para todo /external lo pone `next.config.ts` (el logo del cliente
 * sale de otro origen y el Referer se llevaría el token).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CuestionarioCliente from "@/components/external/CuestionarioCliente";
import ExternalShell from "@/components/external/ExternalShell";
import { resolver } from "@/lib/cuestionario/externo";
import { getBrandLogos } from "@/lib/external/smarteam-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título viaja en historiales y capturas.
  title: "Cuestionario · Smarteam",
  robots: { index: false, follow: false },
};

export default async function CuestionarioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [res, logos] = await Promise.all([resolver(token), getBrandLogos()]);
  // Un 404 neutro: no distingue token inventado de revocado ni de no publicado.
  if (res.kind !== "ok") notFound();

  return (
    <ExternalShell
      smarteamLogoUrl={logos.smarteam}
      proyecto={{ nombre: res.vista.proyecto, cliente: res.vista.cliente, otros: [] }}
    >
      <CuestionarioCliente token={token} inicial={res.vista} />
    </ExternalShell>
  );
}
