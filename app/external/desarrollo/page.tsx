/**
 * /external/desarrollo
 *
 * Ruta PÚBLICA donde un DEV externo ve el REQUERIMIENTO TÉCNICO (canvas Desarrollo)
 * de un proyecto. Server component: lee la cookie httpOnly `nexus_ext_access` (mismo
 * token de acceso externo del proyecto, compartido con las demás superficies) y pasa
 * por el chokepoint `getDesarrolloForToken`, que exige `desarrolloPublishedAt != null`
 * en CADA render (sin ese flag el cliente con el token del kickoff NO ve esto).
 *
 * Read-only (sin write path, a diferencia del kickoff que asigna horarios). Envuelto en
 * el chrome de marca Smarteam (ExternalShell). `force-dynamic`: lee cookies por request.
 */
import { cookies } from "next/headers";
import DesarrolloClientView from "@/components/external/DesarrolloClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { getDesarrolloForToken } from "@/lib/external/desarrollo-view";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";

export const dynamic = "force-dynamic";

export default async function ExternalDesarrolloPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const [data, smarteamLogoUrl] = await Promise.all([
    token ? getDesarrolloForToken(token) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {data ? <DesarrolloClientView data={data} /> : <NoAccess />}
    </ExternalShell>
  );
}
