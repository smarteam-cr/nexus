/**
 * /external/cronograma/[acceso] — el cronograma de UN proyecto: el que nombra la dirección.
 *
 * Página PÚBLICA propia del cronograma (D.1.5). Server component: de los proyectos que este
 * navegador tiene abiertos (lib/external/accesos-del-navegador.ts) toma el que nombra la
 * dirección, y pasa por el chokepoint, que re-chequea el acceso —y que sea ESE acceso— más
 * timelinePublishedAt en CADA render. Si algo no aplica → mensaje neutro. La credencial por sí
 * sola NO otorga acceso.
 *
 * El encabezado dice de qué proyecto es y ofrece los otros del mismo cliente que este navegador
 * ya abrió; la pestaña también lo nombra (2026-09-10: antes la dirección no nombraba el proyecto y
 * un navegador con dos accesos mostraba el último que había abierto).
 *
 * `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import type { Metadata } from "next";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import TimelineLanding from "@/components/external/TimelineLanding";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import {
  elegirAcceso,
  hayProyectosAbiertos,
  otrosProyectosDelMismoCliente,
  rotuloDelProyecto,
  tituloDeLaPestana,
} from "@/lib/external/selector-de-proyectos";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { getPublishedTimelineForToken } from "@/lib/external/timeline-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ acceso: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { acceso } = await params;
  return {
    // Nombra el proyecto solo si ESTE navegador lo tiene abierto: pestaña, favorito e historial.
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "cronograma"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalCronogramaPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getPublishedTimelineForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "cronograma") }
          : undefined
      }
    >
      {data ? (
        <TimelineLanding
          clientName={data.clientName}
          clientLogoUrl={data.clientLogoUrl}
          clientLogoScale={data.clientLogoScale}
          timeline={data.timeline}
        />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "cronograma") ? "/external/cronograma" : undefined} />
      )}
    </ExternalShell>
  );
}
