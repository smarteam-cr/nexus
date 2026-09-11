/**
 * /external/entrega/[acceso] — el documento de cierre de UN proyecto: el que nombra la dirección.
 *
 * Server component. De los proyectos que este navegador tiene abiertos
 * (lib/external/accesos-del-navegador.ts) toma el que nombra la dirección y pasa por el chokepoint
 * `getEntregaForToken`, que re-chequea el acceso —y que sea ESE acceso— y exige
 * `entregaPublishedAt != null` en CADA render — despublicar corta al instante.
 *
 * Read-only. `force-dynamic`: lee cookies por request.
 */
import type { Metadata } from "next";
import EntregaClientView from "@/components/external/EntregaClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getEntregaForToken } from "@/lib/external/entrega-view";
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
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "entrega"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalEntregaPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getEntregaForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "entrega") }
          : undefined
      }
    >
      {data ? (
        <EntregaClientView data={data} />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "entrega") ? "/external/entrega" : undefined} />
      )}
    </ExternalShell>
  );
}
