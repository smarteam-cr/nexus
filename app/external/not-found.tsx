/**
 * app/external/not-found.tsx — el 404 de la superficie del cliente (2026-10-06).
 *
 * Lo pintan un enlace externo que no existe (app/external/[...ruta]) y las páginas de un documento suelto
 * que llaman a `notFound()` (una propuesta o un documento de Roles revocado, un cuestionario que ya no está publicado).
 * Antes salía el 404 de Next, en inglés.
 *
 * Con el marco de siempre (ExternalShell, solo el logo) y, si este navegador tiene algún proyecto
 * abierto, el mismo «Ver los proyectos abiertos» de NoAccess: un enlace roto no deja un callejón.
 * Nada de lo que lee puede romper la página: sin logo cae al de siempre y sin accesos no ofrece elegir.
 */
import ExternalShell from "@/components/external/ExternalShell";
import PaginaNoEncontradaExterna from "@/components/external/PaginaNoEncontradaExterna";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { hayProyectosAbiertos } from "@/lib/external/selector-de-proyectos";
import { PUBLISH_SURFACES } from "@/lib/projects/publish-surfaces";

export default async function NoEncontradaExterna() {
  const [accesos, smarteamLogoUrl] = await Promise.all([
    accesosDelNavegador().catch(() => []),
    getSmarteamLogoUrl().catch(() => undefined),
  ]);
  const superficie = PUBLISH_SURFACES.find((s) => hayProyectosAbiertos(accesos, s.key));

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      <PaginaNoEncontradaExterna elegirHref={superficie ? `/external/${superficie.key}` : undefined} />
    </ExternalShell>
  );
}
