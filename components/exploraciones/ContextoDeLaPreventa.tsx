"use client";

/**
 * ContextoDeLaPreventa — el «Contexto adicional» de la preventa (2026-10-06).
 *
 * Pedido de Elías: en vez de «¿Una sesión que no quedó en Meet?», el mismo bloque del cronograma,
 * arriba de cada pieza (salvo La cuenta, que es la ficha de la empresa). Tres partes:
 *   · Reuniones — las de Google Meet y HubSpot con la empresa, leídas o no. El agente las encuentra
 *     solo (no se eligen: en la preventa no hay otro proyecto con el que confundirlas).
 *   · Fuentes manuales — lo que no quedó en Meet: una llamada de Gong, una minuta (SumarAMano).
 *   · Instrucciones adicionales — lo que el vendedor le pide a la IA. Se guardan en
 *     `contenido.notas` con la clave CLAVE_DE_INSTRUCCIONES (sin SQL) y las leen la preparación, la
 *     lectura de cada reunión, la guía y los casos de uso (bloqueDeInstrucciones). No son evidencia.
 *
 * Con `?sumar=1` (la preventa que se abre «Con una transcripción») arranca abierto y con el
 * formulario de las fuentes manuales a la vista.
 */
import { useState } from "react";
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
  CLAVE_DE_INSTRUCCIONES,
  MAX_NOTA_DE_SESION,
} from "@/lib/exploraciones/notas-de-sesion";
import SumarAMano from "./SumarAMano";
import { useLienzo } from "./contexto";

const DE_DONDE = {
  meet: "Google Meet",
  hubspot: "HubSpot",
  documento: "Sumada a mano",
} as const;

export default function ContextoDeLaPreventa() {
  const { exp, reuniones, documentos, puedeEditar, cambiar } = useLienzo();
  const sumarAlAbrir = useSearchParams().get("sumar") === "1";
  const [abierto, setAbierto] = useState(sumarAlAbrir);

  // Las sumadas a mano ya están en su columna: acá van solo las de Meet y HubSpot, la más nueva arriba.
  const deCalendario = reuniones
    .filter((r) => r.origen !== "documento")
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sinLeer = deCalendario.filter((r) => !r.leida).length;
  const instrucciones =
    exp.estado.contenido.notas[CLAVE_DE_INSTRUCCIONES] ?? "";

  const resumen = [
    `${deCalendario.length} ${deCalendario.length === 1 ? "reunión" : "reuniones"}${sinLeer ? ` (${sinLeer} sin leer)` : ""}`,
    `${documentos.length} ${documentos.length === 1 ? "fuente manual" : "fuentes manuales"}`,
    ...(instrucciones.trim() ? ["instrucciones activas"] : []),
  ].join(" · ");

  return (
    <div data-recorrido="preventa.contexto">
      <ContextoAdicional
        abierto={abierto}
        onAlternar={() => setAbierto((v) => !v)}
        resumen={resumen}
        explicacion={
          <>
            Con esto el agente prepara la preventa, lee cada reunión, arma la
            guía de la próxima sesión y propone los casos de uso. Las reuniones
            de Meet y de HubSpot con la empresa{" "}
            <span className="font-medium text-fg-secondary">
              las encuentra solo
            </span>
            ; suma a mano lo que no quedó ahí.
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
            <ContextColumnList empty="Todavía no hay reuniones con la empresa en Meet ni en HubSpot.">
              {deCalendario.map((r) => (
                <ContextRow
                  key={`${r.origen}:${r.id}`}
                  icon={
                    r.origen === "hubspot" ? CTX_ICONS.hubspot : CTX_ICONS.meet
                  }
                  meta={`${DE_DONDE[r.origen]} · ${diaConAnio(r.fecha)}`}
                  title={r.titulo}
                  badge={
                    r.leida
                      ? { label: "Leída", tone: "green" }
                      : { label: "Sin leer", tone: "amber" }
                  }
                />
              ))}
            </ContextColumnList>
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
        <InstruccionesAdicionales
          guardadas={instrucciones}
          soloLectura={!puedeEditar}
          tope={MAX_NOTA_DE_SESION}
          explicacion="El agente las tiene en cuenta en todo lo que propone en esta preventa: la preparación, lo que saca de cada reunión, la guía y los casos de uso. No cuentan como algo que dijo el cliente."
          ejemplo='Ej.: "Enfócate en el área de Servicio: Ventas ya la resolvieron con otro proveedor."'
          onGuardar={(texto) =>
            cambiar([{ op: "nota", paso: CLAVE_DE_INSTRUCCIONES, texto }])
          }
        />
      </ContextoAdicional>
    </div>
  );
}
