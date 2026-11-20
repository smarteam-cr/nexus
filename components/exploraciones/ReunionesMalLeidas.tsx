"use client";

/**
 * ReunionesMalLeidas — «Esta reunión no se pudo leer bien» (18 nov, Elías tras el diagnóstico de Cemaco). Al armar el
 * Resumen de la escala, una reunión a la que se le cortó un pedazo del medio, o donde la empresa dijo menos del 28 % de
 * lo dicho (la del 16 nov de Cemaco: casi toda la presentó Smarteam), queda en `ResumenGuardado.malLeidas`. Se avisa en La
 * escala (arriba del Resumen, todas) y en la sesión de esa reunión (solo la suya), con «Volver a leer».
 *
 * Volver a leer trae la transcripción de nuevo y la vuelve a leer el agente de la exploración; el Resumen se rehace aparte
 * («Rehacer con IA»). Si la reunión de verdad fue casi toda nuestra, el aviso se queda: lo dice para que no sorprenda.
 */
import { Alert } from "@/components/ui";
import { BotonBlanco } from "@/components/ui/sistema";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { MOTIVO_DE_MAL_LEIDA, type ReunionMalLeida } from "@/lib/external/pagina-del-resumen";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

/** Por qué no se pudo leer bien, en una frase, con los números de esa reunión. */
export function porQueNoSeLeyo(m: ReunionMalLeida): string {
  return m.motivos
    .map((x) => (x === "recortada" ? `${MOTIVO_DE_MAL_LEIDA.recortada} (se leyó el ${m.leido} %)` : `${MOTIVO_DE_MAL_LEIDA["poco-del-cliente"]} (el ${m.delCliente} % de lo dicho)`))
    .join("; ");
}

export default function ReunionesMalLeidas({ reuniones, sola = false }: { reuniones: readonly ReunionMalLeida[]; sola?: boolean }) {
  const { puedeEditar } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  if (!reuniones.length) return null;
  const titulo = sola || reuniones.length === 1 ? "Esta reunión no se pudo leer bien" : `${reuniones.length} reuniones no se pudieron leer bien`;
  return (
    <Alert variant="warning" title={titulo}>
      <ul className="mt-1 flex flex-col gap-1.5">
        {reuniones.map((m) => (
          <li key={m.reunion} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1">
              {!sola && (
                <b className="font-semibold">
                  {m.titulo ? `«${m.titulo}»` : "Reunión"} · {diaCorto(m.fecha)}:{" "}
                </b>
              )}
              {porQueNoSeLeyo(m)}.
            </span>
            {/* Volver a leer solo sirve si faltaba la voz de la empresa (una transcripción que llegó a medias). Una reunión
                cortada por larga vuelve a salir cortada: el largo y el tope son los mismos (revisión del 18 nov). */}
            {puedeEditar && m.motivos.includes("poco-del-cliente") && (
              <BotonBlanco disabled={lanzando || corriendo} onClick={() => void lanzar("leer", { sesionId: m.reunion })}>
                Volver a leer
              </BotonBlanco>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5">
        Lo que no se leyó no llega al Resumen. Si la empresa habló poco, vuelve a leerla y después rehaz el Resumen con IA; si
        de verdad casi todo lo dijimos nosotros, el aviso se queda y lo nuestro solo entra como cifra por confirmar. Una
        reunión cortada por larga no se arregla volviendo a leerla.
      </p>
    </Alert>
  );
}
