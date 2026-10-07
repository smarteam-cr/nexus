"use client";

/**
 * ContextoDeLaPreventa — el «Contexto adicional» de la preventa (2026-10-06).
 *
 * Pedido de Elías: en vez de «¿Una sesión que no quedó en Meet?», el mismo bloque del cronograma,
 * arriba de cada pieza (salvo La cuenta, que es la ficha de la empresa). Tres partes:
 *   · Reuniones — las de Google Meet y HubSpot con la empresa, leídas o no. El agente encuentra solo
 *     las recientes; «Buscar una reunión» suma cualquier otra de la empresa o de tu calendario
 *     (2026-10-07), y la que sumaste se quita con su X.
 *   · Fuentes manuales — lo que no quedó en Meet: una llamada de Gong, una minuta (SumarAMano).
 *   · Instrucciones adicionales — lo que el vendedor le pide a la IA, una por pieza desde el
 *     2026-10-07 (`instrucciones:<pieza>` en `contenido.notas`, sin SQL): las de Preparación las lee
 *     la preparación; las de Exploración, la lectura de cada reunión y la guía; las de Casos de uso,
 *     los casos. Las piezas sin agente propio (Resumen, La escala, Propuesta) dicen dónde se escriben.
 *     No son evidencia.
 *
 * Con `?sumar=1` (la preventa que se abre «Con una transcripción») arranca abierto y con el
 * formulario de las fuentes manuales a la vista.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ContextColumn,
  ContextColumnList,
  ContextRow,
  CTX_ICONS,
} from "@/components/clients/context-column";
import ContextoAdicional from "@/components/contexto/ContextoAdicional";
import InstruccionesAdicionales from "@/components/contexto/InstruccionesAdicionales";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import {
  claveDeInstrucciones,
  MAX_NOTA_DE_SESION,
  type PiezaConInstrucciones,
} from "@/lib/exploraciones/notas-de-sesion";
import { useToast } from "@/components/ui";
import BuscarReunionesDeLaPreventa from "./BuscarReunionesDeLaPreventa";
import SumarAMano from "./SumarAMano";
import { useLienzo } from "./contexto";

const DE_DONDE = {
  meet: "Google Meet",
  hubspot: "HubSpot",
  documento: "Sumada a mano",
} as const;

/** El evento con que otra pieza abre el «Contexto adicional» (el «Después» de una sesión sin transcripción). */
const EVENTO_ABRIR = "preventa:abrir-contexto";

/** Abre el «Contexto adicional» y lo trae a la vista, desde cualquier pieza del lienzo. */
export function abrirElContextoAdicional() {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}

/** Qué agente lee las instrucciones de cada pieza (lo dice el bloque). */
const QUIEN_LAS_LEE: Record<PiezaConInstrucciones, string> = {
  preparacion: "la preparación: la radiografía, el «por qué ahora», la hipótesis de valor, cómo conectar y las primeras hipótesis",
  exploracion: "la lectura de cada reunión y la guía de la próxima sesión",
  casos: "los casos de uso que propone",
};

/**
 * El «Contexto adicional» de una pieza. `pieza` dice de quién son las instrucciones: null en las
 * piezas sin agente propio (Resumen, La escala, Propuesta), que muestran dónde escribirlas.
 */
export default function ContextoDeLaPreventa({ pieza }: { pieza: PiezaConInstrucciones | null }) {
  const { exp, reuniones, documentos, puedeEditar, cambiar, recargar } =
    useLienzo();
  const toast = useToast();
  const [buscando, setBuscando] = useState(false);
  const elegidas = new Set(exp.estado.contenido.reunionesElegidas);
  const quitar = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/reuniones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, elegida: false }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(d.error ?? "No se pudo quitar la reunión.");
        return;
      }
      await recargar();
    } catch {
      toast.error("No se pudo quitar la reunión: revisa la conexión.");
    }
  };
  const sumarAlAbrir = useSearchParams().get("sumar") === "1";
  const [abierto, setAbierto] = useState(sumarAlAbrir);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abrir = () => {
      setAbierto(true);
      caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  // Las sumadas a mano ya están en su columna: acá van solo las de Meet y HubSpot, la más nueva arriba.
  const deCalendario = reuniones
    .filter((r) => r.origen !== "documento")
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sinLeer = deCalendario.filter((r) => !r.leida).length;
  const instrucciones = pieza
    ? (exp.estado.contenido.notas[claveDeInstrucciones(pieza)] ?? "")
    : "";

  const resumen = [
    `${deCalendario.length} ${deCalendario.length === 1 ? "reunión" : "reuniones"}${sinLeer ? ` (${sinLeer} sin leer)` : ""}`,
    `${documentos.length} ${documentos.length === 1 ? "fuente manual" : "fuentes manuales"}`,
    ...(instrucciones.trim() ? ["instrucciones activas"] : []),
  ].join(" · ");

  return (
    <div ref={caja} data-recorrido="preventa.contexto">
      <ContextoAdicional
        abierto={abierto}
        onAlternar={() => setAbierto((v) => !v)}
        resumen={resumen}
        explicacion={
          <>
            Con esto el agente prepara la preventa, lee cada reunión, arma la
            guía de la próxima sesión y propone los casos de uso. Las reuniones y
            las fuentes son de la empresa y se ven en todas las piezas; las
            instrucciones, en cambio, son de cada pieza. Las reuniones recientes
            de Meet y de HubSpot con la empresa{" "}
            <span className="font-medium text-fg-secondary">
              las encuentra solo
            </span>
            ; busca cualquier otra de Meet, o suma a mano lo que no quedó ahí.
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ContextColumn
            icon={CTX_ICONS.meet}
            color="#16a34a"
            title="Reuniones"
            count={deCalendario.length}
          >
            <div className="flex flex-1 flex-col gap-2">
              <ContextColumnList empty="Todavía no hay reuniones con la empresa en Meet ni en HubSpot.">
                {deCalendario.map((r) => (
                  <ContextRow
                    key={`${r.origen}:${r.id}`}
                    icon={
                      r.origen === "hubspot"
                        ? CTX_ICONS.hubspot
                        : CTX_ICONS.meet
                    }
                    meta={`${DE_DONDE[r.origen]} · ${diaConAnio(r.fecha)}`}
                    title={r.titulo}
                    badge={
                      r.leida
                        ? { label: "Leída", tone: "green" }
                        : { label: "Sin leer", tone: "amber" }
                    }
                    {...(puedeEditar &&
                    r.origen === "meet" &&
                    elegidas.has(r.id)
                      ? {
                          onRemove: () => void quitar(r.id),
                          removeTitle:
                            "La sumaste con el buscador: quitarla la saca de esta preventa (sigue siendo de la empresa).",
                        }
                      : {})}
                  />
                ))}
              </ContextColumnList>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => setBuscando(true)}
                  className="mt-auto self-start text-[11px] font-semibold text-brand transition-colors hover:text-brand-dark"
                >
                  + Buscar una reunión de Meet
                </button>
              )}
            </div>
          </ContextColumn>
          <ContextColumn
            icon={CTX_ICONS.note}
            color="#7c6df2"
            title="Fuentes manuales"
            count={documentos.length}
          >
            <SumarAMano abiertoAlInicio={sumarAlAbrir} />
          </ContextColumn>
        </div>
        {pieza ? (
          <InstruccionesAdicionales
            key={pieza}
            guardadas={instrucciones}
            soloLectura={!puedeEditar}
            tope={MAX_NOTA_DE_SESION}
            explicacion={`Son de esta pieza: las lee solo ${QUIEN_LAS_LEE[pieza]}. No cuentan como algo que dijo el cliente.`}
            ejemplo='Ej.: "Enfócate en el área de Servicio: Ventas ya la resolvieron con otro proveedor."'
            onGuardar={(texto) =>
              cambiar([
                { op: "nota", paso: claveDeInstrucciones(pieza), texto },
              ])
            }
          />
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs text-fg-muted">
            Esta pieza no tiene agente propio. Las instrucciones para la IA se
            escriben en la pieza de su agente: Preparación, Exploración o Casos
            de uso.
          </p>
        )}
      </ContextoAdicional>
      <BuscarReunionesDeLaPreventa
        abierto={buscando}
        onCerrar={() => setBuscando(false)}
      />
    </div>
  );
}
