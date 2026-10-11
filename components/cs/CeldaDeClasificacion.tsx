"use client";

/**
 * components/cs/CeldaDeClasificacion.tsx — un dato de la clasificación de una cuenta (tipo de relación,
 * potencial o momento), editable, con lo que propone Nexus (2026-10-07, plan de la cartera, entrega 1).
 *
 * La propuesta se ve UNA vez y en su lugar: sin nada confirmado, la celda la muestra en azul con la chispa y
 * elegirla la confirma (confirmar le quita el azul, no la mueve ni la pinta de verde). Con algo confirmado y
 * una propuesta distinta (la cuenta cambió), lo confirmado queda en la celda y debajo va la línea azul con
 * «Usar» y «✕» (descartar: no vuelve hasta que cambie la razón). El porqué de la propuesta, al pasar el mouse.
 *
 * La usan la pestaña «Cartera» y el panel de la cuenta. Guarda y le pasa a quien la pinta cómo quedó; la
 * propuesta se recalcula ahí con `estadoDelDato`, sin volver a pedir la cartera.
 */
import { useState } from "react";
import { CeldaSelect } from "@/components/ui";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { fmtDia } from "@/lib/cs/formato";
import {
  DATOS_DE_CLASIFICACION,
  VALORES_DE,
  estadoDelDato,
  nombreDelValor,
  type ClasificacionDeLaCuenta,
  type ClasificacionGuardada,
  type DatoDeClasificacion,
  type EstadoDelDato,
  type OperacionDeClasificacion,
} from "@/lib/cs/clasificacion";

/** Guarda una o varias operaciones de una cuenta. Lanza si el servidor no las guardó. */
export async function guardarClasificacion(clientId: string, operaciones: OperacionDeClasificacion[]): Promise<ClasificacionGuardada> {
  const r = await fetchJson<{ guardada: ClasificacionGuardada }>(`/api/cs/clasificacion/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operaciones }),
  });
  return r.guardada;
}

/** La clasificación de una cuenta con lo recién guardado: las propuestas no cambian, lo confirmado sí. */
export function conLoGuardado(cl: ClasificacionDeLaCuenta, g: ClasificacionGuardada): ClasificacionDeLaCuenta {
  return {
    relacion: estadoDelDato("relacion", cl.relacion.propuesta, g),
    potencial: estadoDelDato("potencial", cl.potencial.propuesta, g),
    momento: estadoDelDato("momento", cl.momento.propuesta, g),
  };
}

/** «Usar» en bloque: confirma lo que propone Nexus en cada dato que tiene una propuesta a la vista. */
export function operacionesParaUsarTodo(cl: ClasificacionDeLaCuenta): OperacionDeClasificacion[] {
  return DATOS_DE_CLASIFICACION.filter(({ clave }) => cl[clave].sugerir).map(({ clave }) => ({
    accion: "confirmar" as const,
    dato: clave,
    valor: cl[clave].propuesta.valor,
  }));
}

export const NOMBRE_DEL_DATO: Record<DatoDeClasificacion, string> = Object.fromEntries(
  DATOS_DE_CLASIFICACION.map((d) => [d.clave, d.nombre]),
) as Record<DatoDeClasificacion, string>;

export function CeldaDeClasificacion({
  clientId,
  cuenta,
  dato,
  estado,
  puedeEditar,
  onGuardada,
  hoy,
}: {
  clientId: string;
  /** El nombre de la cuenta, para el `aria-label`. */
  cuenta: string;
  dato: DatoDeClasificacion;
  estado: EstadoDelDato;
  /** false = solo lectura (sin permiso, o sin el SQL de la clasificación). */
  puedeEditar: boolean;
  onGuardada: (guardada: ClasificacionGuardada) => void;
  hoy: string;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);

  async function operar(op: OperacionDeClasificacion) {
    setOcupado(true);
    try {
      onGuardada(await guardarClasificacion(clientId, [op]));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const propuesta = nombreDelValor(dato, estado.propuesta.valor);
  const porQue = `Nexus propone «${propuesta}»: ${estado.propuesta.razon}`;
  const quien = estado.confirmadoPor ? estado.confirmadoPor.split("@")[0] : null;
  const confirmadoPor =
    estado.confirmado && quien ? `Confirmado por ${quien}${estado.confirmadoEn ? ` el ${fmtDia(estado.confirmadoEn.slice(0, 10), hoy)}` : ""}` : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-[13px]" title={estado.confirmado ? confirmadoPor : porQue}>
      <CeldaSelect
        opciones={VALORES_DE[dato].map((v) => ({ value: v.clave, label: v.nombre }))}
        seleccion={estado.confirmado ? [estado.confirmado] : []}
        sugerencia={estado.propuesta.valor}
        vacio="Sin dato"
        puedeEditar={puedeEditar}
        onElegir={async (valor) => {
          onGuardada(await guardarClasificacion(clientId, [{ accion: "confirmar", dato, valor }]));
        }}
        etiqueta={`${NOMBRE_DEL_DATO[dato]} de ${cuenta}`}
      />
      {estado.confirmado && estado.sugerir && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-brand" title={porQue}>
          <IconoDeSugerencia className="h-3 w-3 flex-shrink-0" />
          <span className="min-w-0 cursor-help truncate">Nexus propone: {propuesta}</span>
          {puedeEditar && (
            <>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => operar({ accion: "confirmar", dato, valor: estado.propuesta.valor })}
                className="flex-shrink-0 rounded px-1 font-semibold hover:bg-info-surface disabled:opacity-50"
              >
                Usar
              </button>
              <button
                type="button"
                disabled={ocupado}
                aria-label={`Descartar la propuesta «${propuesta}»`}
                title="Descartar: no vuelve hasta que la cuenta cambie"
                onClick={() => operar({ accion: "descartar", dato, valor: estado.propuesta.valor, huella: estado.propuesta.huella })}
                className="flex-shrink-0 rounded px-1 text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-50"
              >
                ✕
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
