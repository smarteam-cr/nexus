"use client";

/**
 * ContextoDeLaPreventa — el «Contexto adicional» de las piezas de la preventa que leen algo (2026-10-06;
 * desde el 2026-10-09, sin lista de reuniones).
 *
 * Las reuniones de la exploración son sus SESIONES (etapa A): viven en la página de inicio de
 * Exploración, que también tiene las fuentes manuales y sus instrucciones. Acá queda lo de cada pieza
 * (diseño «Piezas»), y nunca una lista de reuniones: mostrarlas donde ningún agente las lee le hacía
 * creer al vendedor que esa pieza las usaba.
 *   · `preparacion` — la preparación lee las 3 sesiones más recientes de Exploración, las fuentes
 *     manuales (que se suman acá o en Exploración) y sus instrucciones.
 *   · `casos` — los casos de uso no leen reuniones: salen del lienzo. Solo sus instrucciones.
 *   · `sinAgente` — La escala no tiene agente propio: solo la explicación.
 * Las instrucciones son de cada pieza (`instrucciones:<pieza>` en `contenido.notas`, sin SQL) y no son
 * evidencia.
 */
import { useState } from "react";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import ContextoAdicional from "@/components/contexto/ContextoAdicional";
import InstruccionesAdicionales from "@/components/contexto/InstruccionesAdicionales";
import { claveDeInstrucciones, MAX_NOTA_DE_SESION, type PiezaConInstrucciones } from "@/lib/exploraciones/notas-de-sesion";
import SumarAMano from "./SumarAMano";
import { useLienzo } from "./contexto";
import { useSesiones } from "./useSesiones";

/** Qué pieza muestra el bloque: Preparación, Casos de uso o una sin agente propio (La escala). */
export type ModoDelContexto = "preparacion" | "casos" | "sinAgente";

/** Qué agente lee las instrucciones de cada pieza (lo dice el bloque). */
const QUIEN_LAS_LEE: Record<Exclude<PiezaConInstrucciones, "exploracion">, string> = {
  preparacion: "la preparación: la radiografía, el «por qué ahora», la hipótesis de valor, cómo conectar y las primeras hipótesis",
  casos: "los casos de uso que propone",
};

function IconoDeInformacion() {
  return (
    <svg className="mt-0.5 h-4 w-4 flex-none text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}

export default function ContextoDeLaPreventa({ modo }: { modo: ModoDelContexto }) {
  const { exp, marco, documentos, puedeEditar, cambiar, irA, sesion } = useLienzo();
  const { pestanas, estadoDeLaReunion } = useSesiones();
  const enProyecto = marco.clave === "cs";
  const [abierto, setAbierto] = useState(false);

  const leidas = pestanas.filter((p) => estadoDeLaReunion(p) === "leida").length;
  const verLasSesiones = () => {
    irA("exploracion");
    sesion.irAlInicio();
  };
  const pieza: Exclude<PiezaConInstrucciones, "exploracion"> | null = modo === "sinAgente" ? null : modo;
  const instrucciones = pieza ? (exp.estado.contenido.notas[claveDeInstrucciones(pieza)] ?? "") : "";
  const activas = instrucciones.trim() ? " · instrucciones activas" : "";

  const resumen =
    modo === "preparacion"
      ? `lee las 3 sesiones más recientes · ${documentos.length} ${documentos.length === 1 ? "fuente manual" : "fuentes manuales"}${activas}`
      : modo === "casos"
        ? `lee el lienzo · ${leidas} ${leidas === 1 ? "sesión leída" : "sesiones leídas"}${activas}`
        : "sin agente propio";

  return (
    <div data-recorrido="preventa.contexto">
      <ContextoAdicional abierto={abierto} onAlternar={() => setAbierto((v) => !v)} resumen={resumen}>
        {modo === "sinAgente" ? (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-[13px] leading-[19px] text-fg-secondary">
            Esta pieza no lee reuniones ni tiene agente propio: muestra los niveles que propusieron Preparación y la lectura de las sesiones. Las instrucciones para la IA
            van en Preparación, Exploración o Casos de uso.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-muted px-3.5 py-3">
              <IconoDeInformacion />
              <p className="min-w-0 flex-[1_1_420px] text-[13px] leading-[19px] text-fg-secondary">
                {modo === "preparacion"
                  ? "Lee las 3 sesiones más recientes de Exploración y las fuentes manuales."
                  : "Esta pieza no lee reuniones. Los casos salen de lo que quedó en el lienzo después de leer las sesiones: dónde está cada equipo, lo que le falta para Funcional y lo confirmado del Resumen."}
              </p>
              <button type="button" onClick={verLasSesiones} className="flex-none text-[13px] font-semibold text-brand hover:text-brand-light">
                {modo === "preparacion" ? "Ver las sesiones" : "Ver las sesiones en Exploración"}
              </button>
            </div>
            {modo === "preparacion" && (
              <ContextColumn icon={CTX_ICONS.note} color="var(--color-secondary)" title="Fuentes manuales" count={documentos.length}>
                <SumarAMano />
              </ContextColumn>
            )}
            {pieza && (
              <InstruccionesAdicionales
                key={pieza}
                guardadas={instrucciones}
                soloLectura={!puedeEditar}
                tope={MAX_NOTA_DE_SESION}
                explicacion={`Son de esta pieza: las lee solo ${QUIEN_LAS_LEE[pieza]}. No cuentan como algo que dijo el cliente.`}
                ejemplo={
                  enProyecto
                    ? 'Ej.: "Pregunta sobre todo por Servicio: es donde el cliente siente que pierde clientes."'
                    : 'Ej.: "Enfócate en el área de Servicio: Ventas ya la resolvieron con otro proveedor."'
                }
                onGuardar={(texto) => cambiar([{ op: "nota", paso: claveDeInstrucciones(pieza), texto }])}
              />
            )}
          </>
        )}
      </ContextoAdicional>
    </div>
  );
}
