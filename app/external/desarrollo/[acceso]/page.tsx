/**
 * /external/desarrollo/[acceso] — el REQUERIMIENTO TÉCNICO de UN proyecto: el que nombra la dirección.
 *
 * Server component. De los proyectos que este navegador tiene abiertos
 * (lib/external/accesos-del-navegador.ts) toma el que nombra la dirección y pasa por el chokepoint
 * `getDesarrolloForToken`, que re-chequea el acceso —y que sea ESE acceso— y exige
 * `desarrolloPublishedAt != null` en CADA render (sin ese flag, quien tiene el acceso del kickoff
 * NO ve esto).
 *
 * Read-only. Envuelto en el chrome de marca Smarteam (ExternalShell). `force-dynamic`: lee cookies
 * por request.
 */
import type { Metadata } from "next";
import DesarrolloClientView from "@/components/external/DesarrolloClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getDesarrolloForToken } from "@/lib/external/desarrollo-view";
import {
  elegirAcceso,
  hayProyectosAbiertos,
  otrosProyectosDelMismoCliente,
  rotuloDelProyecto,
  tituloDeLaPestana,
} from "@/lib/external/selector-de-proyectos";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ acceso: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { acceso } = await params;
  return {
    // Nombra el proyecto solo si ESTE navegador lo tiene abierto: pestaña, favorito e historial.
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "desarrollo"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalDesarrolloPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getDesarrolloForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "desarrollo") }
          : undefined
      }
    >
      {data ? (
        <DesarrolloClientView data={data} />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "desarrollo") ? "/external/desarrollo" : undefined} />
      )}
    </ExternalShell>
  );
}
