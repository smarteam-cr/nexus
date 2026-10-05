/**
 * /external/diagnostico/[acceso] — el DIAGNÓSTICO de UN proyecto: el que nombra la dirección.
 *
 * Server component. De los proyectos que este navegador tiene abiertos
 * (lib/external/accesos-del-navegador.ts) toma el que nombra la dirección y pasa por el chokepoint
 * `getDiagnosticoForToken`, que re-chequea el acceso —y que sea ESE acceso— y exige
 * `diagnosticoPublishedAt != null` en CADA render — despublicar corta al instante.
 *
 * Lectura, más UNA escritura: el cliente aprueba lo que ve (app/external/diagnostico/actions.ts,
 * 2026-10-04). `force-dynamic`: lee cookies por request.
 */
import type { Metadata } from "next";
import DiagnosticoClientView from "@/components/external/DiagnosticoClientView";
import ExternalShell from "@/components/external/ExternalShell";
import NoAccess from "@/components/external/NoAccess";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { getDiagnosticoForToken } from "@/lib/external/diagnostico-view";
import {
  elegirAcceso,
  hayProyectosAbiertos,
  otrosProyectosDelMismoCliente,
  rotuloDelProyecto,
  tituloDeLaPestana,
} from "@/lib/external/selector-de-proyectos";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";
import { aprobarDiagnosticoAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ acceso: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { acceso } = await params;
  return {
    // Nombra el proyecto solo si ESTE navegador lo tiene abierto: pestaña, favorito e historial.
    title: tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "diagnostico"),
    robots: { index: false, follow: false },
  };
}

export default async function ExternalDiagnosticoPage({ params }: Props) {
  const { acceso } = await params;
  const accesos = await accesosDelNavegador();
  const actual = elegirAcceso(accesos, acceso);

  const [data, smarteamLogoUrl] = await Promise.all([
    actual ? getDiagnosticoForToken(actual.credencial, acceso) : Promise.resolve(null),
    getSmarteamLogoUrl(),
  ]);

  return (
    <ExternalShell
      smarteamLogoUrl={smarteamLogoUrl}
      proyecto={
        data && actual
          ? { ...rotuloDelProyecto(actual), otros: otrosProyectosDelMismoCliente(accesos, actual, "diagnostico") }
          : undefined
      }
    >
      {data ? (
        // La aprobación del cliente (2026-10-04), atada al proyecto de ESTA página y a la versión que
        // está viendo (2026-10-05): si el equipo presenta otra, esta no la aprueba.
        <DiagnosticoClientView data={data} aprobar={aprobarDiagnosticoAction.bind(null, acceso, data.versionPresentada)} />
      ) : (
        // Sin callejón: si el navegador tiene otros proyectos abiertos, se ofrece elegirlos.
        <NoAccess elegirHref={hayProyectosAbiertos(accesos, "diagnostico") ? "/external/diagnostico" : undefined} />
      )}
    </ExternalShell>
  );
}
