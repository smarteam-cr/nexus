/**
 * /external/doc/[token] — un documento de Roles (perfil de puesto o propuesta) PÚBLICO.
 *
 * Sin login y sin contraseña: la URL ES el secreto (token de 256 bits). Sirve los dos
 * tipos — el token dice cuál es y la plantilla sale del `docType`.
 *
 * Toda la seguridad vive en `getPublicRoleDoc` (chokepoint fail-closed): re-chequea el
 * token y `active` en CADA render. `force-dynamic` no es decoración: sin él Next cachea
 * el segmento dinámico y **revocar el link no surtiría efecto**.
 *
 * `noindex` para que no lo levanten los buscadores, y cero recursos de otros orígenes —
 * la URL lleva el token y el header `Referer` lo filtraría (misma regla que /external/verify).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import RoleDocView from "@/components/roles/RoleDocView";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { getPublicRoleDoc } from "@/lib/roles/public-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Título genérico A PROPÓSITO: no se resuelve el token acá. El título de la pestaña
  // viaja en historiales y capturas — que no diga de quién es la propuesta.
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default async function DocumentoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [doc, smarteamLogoUrl] = await Promise.all([getPublicRoleDoc(token), getSmarteamLogoUrl()]);
  // Un 404 neutro: no distingue token inválido de revocado ni de inexistente.
  if (!doc) notFound();

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      <RoleDocView
        docType={doc.docType}
        hero={{ title: doc.title, area: doc.area, summary: doc.summary }}
        content={doc.content}
        framed={false}
      />
    </ExternalShell>
  );
}
