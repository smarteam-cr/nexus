/**
 * /external/entrega
 *
 * Ruta PÚBLICA donde el CLIENTE lee el documento de cierre de su proyecto. Server component:
 * lee la cookie httpOnly `nexus_ext_access` (el mismo token del proyecto que destraba las
 * otras superficies) y pasa por el chokepoint `getEntregaForToken`, que exige
 * `entregaPublishedAt != null` en CADA render — despublicar corta al instante.
 *
 * Read-only. `force-dynamic`: lee cookies por request.
 */
import { cookies } from "next/headers";
import EntregaClientView from "@/components/external/EntregaClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { getEntregaForToken } from "@/lib/external/entrega-view";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";

export const dynamic = "force-dynamic";

export default async function ExternalEntregaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const [data, smarteamLogoUrl] = await Promise.all([
    token ? getEntregaForToken(token) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {data ? <EntregaClientView data={data} /> : <NoAccess />}
    </ExternalShell>
  );
}
