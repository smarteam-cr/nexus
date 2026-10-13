"use client";

/**
 * components/casos-de-uso/EnLaEscala.tsx — la vista «En la escala» del catálogo (tablero «EnLaEscala»).
 *
 * Una casilla por dimensión de la escala (base operativa y producción, por área) con cuántos casos la suben. Al
 * elegir una, abajo van esos casos con su salto en una escalera de cinco niveles: el círculo vacío es el nivel de
 * partida y el lleno el de llegada. Las dimensiones sin ningún caso se dicen arriba: son los huecos del catálogo.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { COLOR_DE_NIVEL } from "@/components/escala/niveles";
import { Alert, Segmentado } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { CATALOGO_DE_CASOS } from "@/lib/casos-de-uso/catalogo";
import {
  casosQueSuben,
  cuantosCasos,
  NOMBRE_DEL_TIPO,
  nombreDelNivel,
  usaLaHerramienta,
  type EscalaDelCatalogo,
  type FiltroDeHerramienta,
} from "@/lib/casos-de-uso/vista";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";

type Herr = FiltroDeHerramienta | "todas";

const DIMENSION_POR_DEFECTO = "1.7";

export function EnLaEscala({
  escala,
  niveles,
  dimensionInicial,
  onProponer,
}: {
  escala: EscalaDelCatalogo | null;
  niveles: EscalaDelCatalogo["niveles"];
  dimensionInicial: string | null;
  onProponer: (() => void) | null;
}) {
  const [herramienta, setHerramienta] = useState<Herr>("todas");
  const dimensiones = useMemo(() => escala?.areas.flatMap((a) => a.dimensiones.map((d) => ({ ...d, area: a.id, nombreDelArea: a.nombre }))) ?? [], [escala]);
  const valida = (id: string | null) => (id && dimensiones.some((d) => d.id === id) ? id : null);
  const [elegida, setElegida] = useState<string>(valida(dimensionInicial) ?? valida(DIMENSION_POR_DEFECTO) ?? dimensiones[0]?.id ?? "");

  if (!escala) {
    return (
      <Alert variant="warning" title="No se pudo leer la escala publicada">
        Sin la escala no se puede dibujar esta vista. Los casos se siguen viendo en «Por tipo».
      </Alert>
    );
  }

  const filtro = herramienta === "todas" ? "" : herramienta;
  const casos = filtro ? CATALOGO_DE_CASOS.filter((c) => usaLaHerramienta(c, filtro)) : CATALOGO_DE_CASOS;
  const cuantos = (dim: string) => casosQueSuben(casos, dim).length;
  const huecos = dimensiones.filter((d) => cuantos(d.id) === 0);
  const sel = dimensiones.find((d) => d.id === elegida) ?? dimensiones[0];
  const enLaDimension = sel ? casosQueSuben(casos, sel.id) : [];
  const nombre = (l: Letra) => nombreDelNivel({ niveles }, l);

  const elegir = (id: string) => {
    setElegida(id);
    const url = new URL(window.location.href);
    url.searchParams.set("dimension", id);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[640px] text-[13px] text-fg-muted">
          Cada casilla es una dimensión de la escala. El número dice cuántos casos la suben. Elige una para ver cuáles y hasta qué nivel.
        </p>
        <Segmentado<Herr>
          etiqueta="Herramienta"
          valor={herramienta}
          onCambio={setHerramienta}
          opciones={[
            { clave: "todas", etiqueta: "Todas" },
            { clave: "hubspot", etiqueta: "HubSpot" },
            { clave: "insider", etiqueta: "Insider" },
            { clave: "solo-smarteam", etiqueta: "Sin licencia" },
          ]}
        />
      </div>

      {huecos.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-warn-line bg-warn-surface px-3.5 py-2.5 text-[13px] text-warn-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <span>
            <b className="font-semibold">{huecos.length === 1 ? "1 dimensión sin ningún caso:" : `${huecos.length} dimensiones sin ningún caso:`}</b>{" "}
            {huecos.map((d) => `${d.id} ${d.nombre} (${d.nombreDelArea})`).join(" · ")}.
          </span>
        </div>
      )}

      <section className="flex flex-col gap-2.5 overflow-x-auto rounded-xl border border-line bg-surface p-5">
        <div className="flex min-w-[980px] gap-4">
          <div className="w-24 flex-none" />
          <div className={cn("flex-1", ROTULO_DEL_SISTEMA)}>Base operativa</div>
          <div className={cn("flex-1", ROTULO_DEL_SISTEMA)}>Producción</div>
        </div>
        {escala.areas.map((a) => {
          const total = casos.filter((c) => c.mueve.some((m) => m.dimension.split(".")[0] === a.id)).length;
          const bloques = [a.dimensiones.filter((d) => d.capa === "base"), a.dimensiones.filter((d) => d.capa === "produccion")];
          return (
            <div key={a.id} className="flex min-w-[980px] items-stretch gap-4">
              <div className="flex w-24 flex-none flex-col justify-center gap-0.5">
                <span className="text-sm font-semibold text-fg">{a.nombre}</span>
                <span className="text-xs text-fg-muted">{cuantosCasos(total)}</span>
              </div>
              {bloques.map((celdas, i) => (
                <div key={i} className="grid flex-1 grid-cols-4 gap-1.5">
                  {celdas.map((d) => {
                    const n = cuantos(d.id);
                    const on = sel?.id === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => elegir(d.id)}
                        className={cn(
                          "flex min-h-[84px] flex-col gap-0.5 rounded-lg text-left transition-colors",
                          on
                            ? "border-2 border-brand bg-info-surface p-[9px]"
                            : n === 0
                              ? "border border-dashed border-line bg-surface-muted p-2.5 hover:border-fg-muted"
                              : "border border-line bg-surface p-2.5 hover:border-fg-muted",
                        )}
                      >
                        <span className="text-[11px] tabular-nums text-fg-muted">{d.id}</span>
                        <span className="text-[13px] font-medium leading-[17px] text-fg">{d.nombre}</span>
                        <span className={cn("mt-auto text-xs", n === 0 ? "text-fg-muted" : "font-semibold text-fg")}>
                          {n === 0 ? "Ningún caso" : cuantosCasos(n)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </section>

      {sel && (
        <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-col gap-0.5">
            <span className={ROTULO_DEL_SISTEMA}>
              {sel.nombreDelArea} · {sel.id}
            </span>
            <h2 className="text-lg font-semibold leading-[26px] text-fg">{sel.nombre}</h2>
            {enLaDimension.length > 0 && (
              <p className="text-[13px] text-fg-muted">
                {enLaDimension.length === 1 ? "1 caso la sube." : `${enLaDimension.length} casos la suben.`} El círculo vacío es el nivel de partida; el lleno, el de
                llegada.
              </p>
            )}
          </div>

          {enLaDimension.length > 0 ? (
            <div className="flex flex-col overflow-x-auto">
              <div className="grid min-w-[820px] grid-cols-[minmax(280px,1fr)_520px] items-end gap-4 border-b border-line px-2 pb-2">
                <span className={ROTULO_DEL_SISTEMA}>Caso</span>
                <div className="grid grid-cols-5">
                  {LETRAS.map((l) => (
                    <div key={l} className="flex flex-col items-center gap-1">
                      {l === "F" && (
                        <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-medium text-fg-secondary">La base</span>
                      )}
                      <span className="inline-flex items-center gap-[5px] text-xs font-medium text-fg-secondary">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: COLOR_DE_NIVEL[l] }} />
                        {nombre(l)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {enLaDimension.map(({ caso, movimiento }) => (
                <Link
                  key={caso.id}
                  href={`/sales/use-cases/${caso.id}`}
                  className="grid min-w-[820px] grid-cols-[minmax(280px,1fr)_520px] items-center gap-4 border-b border-line px-2 py-2.5 text-fg transition-colors hover:bg-surface-muted"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{caso.titulo}</span>
                    <span className="text-xs text-fg-muted">
                      {NOMBRE_DEL_TIPO[caso.tipo]} · de {nombre(movimiento.desde)} a {nombre(movimiento.hasta)}
                    </span>
                  </div>
                  <Escalera desde={movimiento.desde} hasta={movimiento.hasta} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line bg-surface-muted p-6 text-center">
              <p className="text-sm font-semibold text-fg">Ningún caso sube esta dimensión</p>
              <p className="text-[13px] text-fg-muted">Es un hueco del catálogo. Si conoces un caso que la mueva, propónlo.</p>
              {onProponer && (
                <button type="button" onClick={onProponer} className="text-[13px] font-semibold text-brand hover:text-brand-light">
                  Proponer un caso nuevo
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** Cinco columnas, una por nivel: la línea va del nivel de partida (círculo vacío) al de llegada (lleno). */
function Escalera({ desde, hasta }: { desde: Letra; hasta: Letra }) {
  const d = LETRAS.indexOf(desde);
  const h = LETRAS.indexOf(hasta);
  return (
    <div className="grid h-6 grid-cols-5" aria-label={`De ${desde} a ${hasta}`}>
      {LETRAS.map((l, i) => (
        <div key={l} className="relative h-6">
          {i >= d && i <= h && (
            <span
              aria-hidden="true"
              className={cn("absolute top-[11px] h-0.5 bg-fg-muted/60", i === d ? "left-1/2 right-0" : i === h ? "left-0 right-1/2" : "left-0 right-0")}
            />
          )}
          {(i === d || i === h) && (
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-[5px] -ml-[7px] h-3.5 w-3.5 rounded-full border-2"
              style={i === d ? { background: "var(--color-surface)", borderColor: COLOR_DE_NIVEL[l] } : { background: COLOR_DE_NIVEL[l], borderColor: "var(--color-surface)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
