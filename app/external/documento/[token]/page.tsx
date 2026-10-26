/**
 * /external/documento/[token] — un documento de la EMPRESA, sin proyecto (R3 etapa 3, 2026-10-27): hoy, el diagnóstico de
 * un prospecto. Mismo modelo que la propuesta: la URL es el secreto (256 bits), sin contraseña.
 *
 * Toda la seguridad vive en `documentoDeLaEmpresaParaElToken` (chokepoint fail-closed, re-chequea en CADA render: token,
 * revocado, que el documento sea de la empresa del enlace y que tenga una foto publicada). `force-dynamic` no es
 * decoración: sin él, dejar de compartir no surtiría efecto. El `Referrer-Policy: no-referrer` de `/external/*` vive en
 * next.config.ts (el logo sale de otro origen). `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import DocumentoDeLaEmpresaClientView from "@/components/external/DocumentoDeLaEmpresaClientView";
import { documentoDeLaEmpresaParaElToken } from "@/lib/external/documento-de-la-empresa-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título de la pestaña viaja en historiales y capturas.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function DocumentoDeLaEmpresaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await documentoDeLaEmpresaParaElToken(token);
  // Un 404 neutro: no distingue un token inválido de uno revocado ni de un documento sin publicar.
  if (!data) notFound();
  return (
    <ExternalShell smarteamLogoUrl={data.smarteamLogoUrl ?? undefined}>
      <DocumentoDeLaEmpresaClientView data={data} />
    </ExternalShell>
  );
}
