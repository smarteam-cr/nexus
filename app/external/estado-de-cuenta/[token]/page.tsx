/**
 * /external/estado-de-cuenta/[token] — el ESTADO DE CUENTA de una cuenta de Cobranza, EN VIVO, para la persona de
 * finanzas del cliente (pedido 17, 2026-11-13). Lo facturado, lo pagado, lo pendiente y lo vencido, por moneda, y sus
 * facturas. Mismo modelo que la escala y el documento de la empresa: la URL es el secreto (256 bits), sin contraseña;
 * además CADUCA y se revoca desde la cuenta (lib/cobranza/estado-de-cuenta-compartir.ts).
 *
 * Toda la seguridad vive en `estadoDeCuentaParaElToken` (chokepoint fail-closed, re-chequea en CADA render).
 * `force-dynamic` no es decoración: sin él, la página no estaría al día y revocar no surtiría efecto. El
 * `Referrer-Policy: no-referrer` de `/external/*` vive en next.config.ts. `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import EstadoDeCuentaClientView, { EstadoDeCuentaVencido } from "@/components/external/EstadoDeCuentaClientView";
import { estadoDeCuentaParaElToken } from "@/lib/external/estado-de-cuenta-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título de la pestaña viaja en historiales y capturas.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function EstadoDeCuentaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await estadoDeCuentaParaElToken(token);
  // Un 404 neutro: no distingue un token inválido de uno revocado.
  if (!r) notFound();
  if (r.tipo === "vencido") {
    return (
      <ExternalShell smarteamLogoUrl={r.smarteamLogoUrl ?? undefined}>
        <EstadoDeCuentaVencido />
      </ExternalShell>
    );
  }
  return (
    <ExternalShell smarteamLogoUrl={r.data.smarteamLogoUrl ?? undefined}>
      <EstadoDeCuentaClientView data={r.data} />
    </ExternalShell>
  );
}
