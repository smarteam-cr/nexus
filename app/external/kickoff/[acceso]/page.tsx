/**
 * /external/kickoff/[acceso] — el Kickoff publicado de UN proyecto: el que nombra la dirección.
 *
 * Server component. De los proyectos que este navegador tiene abiertos
 * (lib/external/accesos-del-navegador.ts) toma el que nombra la dirección y pasa por el chokepoint
 * (getPublishedKickoffForToken), que re-chequea el acceso —y que sea ESE acceso— más
 * kickoffPublishedAt en CADA render, y devuelve solo bloques CONFIRMED en shape limpio. Si algo no
 * aplica → mensaje neutro (no se revela por qué). La credencial por sí sola NO otorga acceso.
 *
 * ESCRITURA: la única que puede hacer el cliente es asignarse una franja horaria (`../actions.ts`,
 * server action). Se le pasa ATADA a este acceso con `.bind(null, acceso)`: una pestaña de este
 * proyecto escribe en este proyecto o no escribe. Antes resolvía «la cookie que hubiera».
 *
 * MOTOR DE RENDER: el motor `LandingView` (mismo que Business Cases; tolerante: pinta la data
 * tipada nueva Y el markdown viejo por fallback).
 *
 * `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import type { Metadata } from "next";
import KickoffClientView from "@/components/external/KickoffClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getPublishedKickoffForToken } from "@/lib/external/kickoff-view";
import {
  elegirAcceso,
  hayProyectosAbiertos,
  otrosProyectosDelMismoCliente,
  rotuloDelProyecto,
  tituloDeLaPestana,
} from "@/lib/external/selector-de-proyectos";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { assignHorarioAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ acceso: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { acceso } = await params;
  return {
    // Nombra el proyecto solo si ESTE navegador lo tiene abierto: pestaña, favorito e historial.
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "kickoff"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalKickoffPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getPublishedKickoffForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "kickoff") }
          : undefined
      }
    >
      {data ? (
        <KickoffClientView data={data} assignAction={assignHorarioAction.bind(null, acceso)} />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "kickoff") ? "/external/kickoff" : undefined} />
      )}
    </ExternalShell>
  );
}
