/**
 * /external/ciclos/[acceso] — la RUTA DEL SERVICIO de UN proyecto recurrente: el que nombra la dirección
 * (SmartLoop, docs/smartloop-plan.md, etapa 7).
 *
 * Server component. De los proyectos que este navegador tiene abiertos (lib/external/accesos-del-navegador.ts) toma el
 * que nombra la dirección y pasa por el chokepoint `getCiclosForToken`, que re-chequea el acceso —y que sea ESE acceso—
 * y exige `ciclosPublishedAt != null` en CADA render. Sirve la foto congelada al «Subir al cliente».
 *
 * Read-only. `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import type { Metadata } from "next";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import RutaDelServicioLanding from "@/components/external/RutaDelServicioLanding";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getCiclosForToken } from "@/lib/external/ciclos-view";
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
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "ciclos"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalCiclosPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getCiclosForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "ciclos") }
          : undefined
      }
    >
      {data ? (
        <RutaDelServicioLanding
          clientName={data.clientName}
          clientLogoUrl={data.clientLogoUrl}
          clientLogoScale={data.clientLogoScale}
          ruta={data.ruta}
        />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "ciclos") ? "/external/ciclos" : undefined} />
      )}
    </ExternalShell>
  );
}
