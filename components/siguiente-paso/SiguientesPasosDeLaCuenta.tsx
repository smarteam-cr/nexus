"use client";

/**
 * components/siguiente-paso/SiguientesPasosDeLaCuenta.tsx — el siguiente paso de cada equipo en la cuenta, juntos
 * (2026-10-15, etapa 2 de docs/mi-dia-plan.md): el de la cuenta entera, el de cada negocio abierto y el de cada proyecto.
 * Va en el panel de la derecha de «Información del cliente». Quien escribe el de su equipo lo cambia con un clic.
 */
import { useCallback, useEffect, useState } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fetchJson } from "@/lib/api/fetch-json";
import { NOMBRE_DEL_OBJETO, type PasosDeLaCuenta } from "@/lib/siguiente-paso/reglas";
import DialogoDelSiguientePaso, { type ObjetoParaElPaso } from "./DialogoDelSiguientePaso";
import { LineaDelPaso } from "./LineaDelPaso";
import { hoyEnCostaRica, usePersonasDelPaso } from "./personas";

/** Cuántos objetos se ven sin abrir «Ver todos». */
const A_LA_VISTA = 5;

export default function SiguientesPasosDeLaCuenta({ clientId }: { clientId: string }) {
  const [datos, setDatos] = useState<PasosDeLaCuenta | null>(null);
  const [todos, setTodos] = useState(false);
  const [abierto, setAbierto] = useState<ObjetoParaElPaso | null>(null);
  const personas = usePersonasDelPaso();
  const hoy = hoyEnCostaRica();

  const cargar = useCallback(() => {
    fetchJson<PasosDeLaCuenta>(`/api/clients/${clientId}/siguientes-pasos`)
      .then(setDatos)
      .catch(() => setDatos(null));
  }, [clientId]);
  useEffect(cargar, [cargar]);

  if (!datos || !datos.disponible) return null;
  const escribe = (personas?.equipos.length ?? 0) > 0;
  const objetos = todos ? datos.objetos : datos.objetos.slice(0, A_LA_VISTA);

  return (
    <section data-recorrido="info.siguientes-pasos" className="flex flex-col gap-2.5">
      <span className={ROTULO_DEL_SISTEMA}>Siguientes pasos</span>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-3">
        {objetos.map((o) => {
          const pasos = datos.pasos.filter((p) => p.objeto === o.objeto && p.objetoId === o.objetoId);
          return (
            <li key={`${o.objeto}:${o.objetoId}`} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg" title={o.nombre}>
                  {o.objeto === "empresa" ? NOMBRE_DEL_OBJETO.empresa : o.nombre}
                </span>
                {escribe && (
                  <button
                    type="button"
                    onClick={() => setAbierto({ ...o, pasos })}
                    className="flex-none text-[11px] text-brand hover:text-brand-light"
                  >
                    {pasos.length ? "Cambiar" : "Definir"}
                  </button>
                )}
              </div>
              {o.objeto !== "empresa" && <span className="text-[11px] text-fg-muted">{o.objeto === "negocio" ? (o.detalle ?? "Negocio") : "Proyecto"}</span>}
              {pasos.length ? (
                pasos.map((p) => <LineaDelPaso key={p.id} paso={p} hoyISO={hoy} conEquipo className="line-clamp-2" />)
              ) : (
                <LineaDelPaso paso={null} hoyISO={hoy} sugerencia={o.sugerencia} />
              )}
              {!pasos.length && !o.sugerencia && <span className="text-xs text-fg-muted">Sin siguiente paso.</span>}
            </li>
          );
        })}
      </ul>
      {datos.objetos.length > A_LA_VISTA && (
        <button type="button" onClick={() => setTodos((t) => !t)} className="self-start text-[11px] text-brand hover:text-brand-light">
          {todos ? "Ver menos" : `Ver los ${datos.objetos.length}`}
        </button>
      )}
      <span className="text-[11px] text-fg-muted">Se guardan en Nexus y en HubSpot, en la empresa, el negocio o el proyecto.</span>

      {abierto && (
        <DialogoDelSiguientePaso
          objeto={abierto}
          equipoInicial={personas?.equipos[0] ?? null}
          onCerrar={(cambio) => {
            setAbierto(null);
            if (cambio) cargar();
          }}
        />
      )}
    </section>
  );
}
