/**
 * /external/documento/[token] — el ENLACE PROPIO de un documento. Mismo modelo que la propuesta: la URL es el secreto
 * (256 bits), sin contraseña. Dos clases de documento, con su chokepoint cada una, en este orden:
 *   1. uno de la EMPRESA, sin proyecto (R3 etapa 3, 2026-10-27; hoy, el diagnóstico de un prospecto): su FOTO publicada,
 *      como siempre (`documentoDeLaEmpresaParaElToken`);
 *   2. uno de un PROYECTO (etapa V4 de docs/artefactos-plan.md, 2026-10-29): cada copia de un artefacto y el documento de
 *      siempre de su tipo, VIVO, para compartir pantalla (`artefactoParaElToken`).
 *
 * Toda la seguridad vive en los dos chokepoints (fail-closed, re-chequean en CADA render: token, revocado, que el
 * documento sea de la empresa del enlace y lo demás de cada uno). Un documento no puede caer en los dos: el de la empresa
 * no tiene proyecto y el otro sí. `force-dynamic` no es
 * decoración: sin él, dejar de compartir no surtiría efecto. El `Referrer-Policy: no-referrer` de `/external/*` vive en
 * next.config.ts (el logo sale de otro origen). `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import DocumentoDeLaEmpresaClientView from "@/components/external/DocumentoDeLaEmpresaClientView";
import { documentoDeLaEmpresaParaElToken } from "@/lib/external/documento-de-la-empresa-view";
import ArtefactoClientView from "@/components/external/ArtefactoClientView";
import { artefactoParaElToken } from "@/lib/external/artefacto-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título de la pestaña viaja en historiales y capturas.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function DocumentoDeLaEmpresaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await documentoDeLaEmpresaParaElToken(token);
  if (data) {
    return (
      <ExternalShell smarteamLogoUrl={data.smarteamLogoUrl ?? undefined}>
        <DocumentoDeLaEmpresaClientView data={data} />
      </ExternalShell>
    );
  }
  const artefacto = await artefactoParaElToken(token);
  // Un 404 neutro: no distingue un token inválido de uno revocado, de un documento sin publicar ni de uno archivado.
  if (!artefacto) notFound();
  return (
    <ExternalShell smarteamLogoUrl={artefacto.smarteamLogoUrl ?? undefined}>
      <ArtefactoClientView data={artefacto} />
    </ExternalShell>
  );
}
