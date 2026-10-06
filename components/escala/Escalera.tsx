"use client";

/**
 * components/escala/Escalera.tsx — una dimensión a la vez, sus cinco niveles como escalera.
 *
 * Es la vista para LEER e interiorizar: la matriz sirve para comparar, esta para entender una
 * dimensión de punta a punta. Es un lienzo de tres columnas (sistema «Nexus · interfaz interna»,
 * 2026-10-03): a la izquierda las dimensiones del área, al centro la dimensión con sus niveles en
 * tarjetas blancas sobre gris claro y a la derecha el contexto, para no perder el cuadro grande:
 * cómo se ve el área entera en un nivel («Los cinco niveles de un vistazo»), qué se trabaja primero
 * en su capa y dónde se cuenta la evidencia dudosa («Regla de asignación»).
 */
import { useEffect, useState } from "react";
import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { EnlaceDeCriterio } from "@/lib/escala/documento/requeridos";
import type { Letra } from "@/lib/escala/documento/tipos";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeDimension, useEscala } from "./contexto";
import { HerramientasDelCriterio, useHerramientas } from "./herramientas";
import { PUNTO_DE_NIVEL } from "./niveles";
import {
  BLOQUE_DE_RESULTADO,
  BOTON_CLARO,
  BotonComentar,
  Contador,
  EnlacesDelCriterio,
  MARCA,
  MetaDelCriterio,
  NoAplicanEnLaEdicion,
  NombreGeneral,
  ParrafoDeLaEscala,
  ROTULO,
  TextoConPalabras,
} from "./piezas";

interface Props {
  datos: DatosDeLaVista;
  perfil: Perfil;
  dimension: string;
  onElegirDimension: (dimension: string) => void;
  anclaAbierta: string | null;
}

export default function Escalera({ datos, perfil, dimension, onElegirDimension, anclaAbierta }: Props) {
  const { conteos, darFeedback } = useEscala();
  const { atenuado } = useHerramientas();
  const { area, niveles, capas } = datos;
  const dims = area.dimensiones;
  const i = Math.max(0, dims.findIndex((x) => x.id === dimension));
  const d = dims[i];
  const [enfocado, setEnfocado] = useState<Letra>("F");
  const aplicaAca = dimensionAplica(d, perfil);
  const capa = capas.find((c) => c.clave === d.capa);
  /** «Regla de asignación»: los casos dudosos que tocan a esta dimensión. */
  const reglas = datos.asignacion.filter((r) => r.dimensiones.includes(d.id));
  /** «Qué se trabaja primero»: el orden de su capa en esta área (y el perfil elegido). */
  const ordenes = capa ? ordenDeDependencias(datos.dependencias, area.nombre, capa.nombre, perfil.cierre) : [];

  /**
   * El criterio al que se llegó desde un requerido: suele estar en otra dimensión, así que se cambia
   * de dimensión, se lo trae a la vista y queda marcado hasta que se vaya a otro.
   */
  const [llegada, setLlegada] = useState<string | null>(null);
  const irAlCriterio = (e: EnlaceDeCriterio) => {
    onElegirDimension(e.dimension);
    setLlegada(e.id);
  };
  /**
   * Cambiar de dimensión a mano (el menú, anterior o siguiente) olvida la llegada: si no, al volver
   * a esa dimensión la página bajaría sola hasta el criterio, cada vez.
   */
  const elegirDimension = (id: string) => {
    setLlegada(null);
    onElegirDimension(id);
  };
  useEffect(() => {
    if (!llegada) return;
    document.getElementById(`criterio-${llegada}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [llegada, d.id]);

  return (
    // `overflow-clip` y no `hidden`: recorta las esquinas sin volverse contenedor de scroll, así el
    // menú de las dimensiones y el panel del costado siguen fijos al bajar.
    <div
      className={cn(
        "grid overflow-clip rounded-xl border border-line bg-surface-muted",
        "lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_300px]",
      )}
    >
      <div className="border-b border-line bg-surface lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-b-0 lg:border-r xl:row-span-1">
        <nav aria-label="Dimensiones del área" className="flex flex-col gap-1 px-3 py-4 lg:sticky lg:top-4">
          {capas.map((c) => (
            <div key={c.clave} className="flex flex-col gap-1">
              <p className={cn("px-2 pb-1 pt-2", ROTULO)}>{c.nombre}</p>
              {dims
                .filter((x) => x.capa === c.clave)
                .map((x) => {
                  const activo = x.id === d.id;
                  const aplicaX = dimensionAplica(x, perfil);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-current={activo ? "true" : undefined}
                      onClick={() => elegirDimension(x.id)}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded-lg border px-2 py-[7px] text-left text-[13px] leading-snug transition-colors",
                        activo
                          ? "border-info-line bg-info-surface font-semibold text-brand"
                          : cn("border-transparent hover:bg-surface-hover", aplicaX ? "text-fg-secondary" : "text-fg-muted"),
                      )}
                    >
                      <span className="w-6 flex-shrink-0 text-xs font-normal tabular-nums text-fg-muted">{x.id}</span>
                      <span className="min-w-0 flex-1">{x.nombre}</span>
                      {!aplicaX && <span className="text-xs font-normal text-fg-muted">no aplica</span>}
                      <Contador conteo={conteoDeDimension(conteos, x.id)} />
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
      </div>

      <article className="flex min-w-0 flex-col gap-5 p-6 lg:col-start-2 lg:row-start-1">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs text-fg-muted">
            {area.nombre} · {capa?.nombre}
            {d.generica && d.generica.nombre !== d.nombre ? ` · ${d.generica.nombre}` : ""}
          </p>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[22px] font-bold leading-7 text-fg">
              <span className="font-semibold tabular-nums text-fg-muted">{d.id}</span> {d.nombre}
            </h2>
            <BotonComentar
              conteo={conteoDe(conteos, d.id)}
              onClick={() => darFeedback(d.id)}
              etiqueta="Dar feedback sobre la dimensión entera (su pregunta o su costo)"
              className={cn("mt-1", anclaAbierta === d.id && "border-info-line bg-info-surface text-brand")}
            />
          </div>
          <NombreGeneral nombre={d.nombreGeneral} className="text-xs" />
          <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{d.pregunta}</p>
          {d.descripcion && (
            <p className="text-[13px] leading-normal text-fg-secondary">
              <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
            </p>
          )}
        </header>

        <div role="note" className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5 text-sm leading-normal text-warn-ink">
          <strong className="font-semibold">Costo de quedarse.</strong> {d.costoDeQuedarse}
        </div>

        {!aplicaAca && (
          <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-fg-secondary">
            <strong className="font-semibold text-fg">No aplica a este perfil</strong> ({describirPerfil(perfil)}): se queda sin criterios de Funcional
            que apliquen.
          </p>
        )}

        <ol className="flex flex-col gap-5">
          {d.niveles.map((n) => {
            const nivel = niveles.find((x) => x.letra === n.letra)!;
            const visibles = n.criterios.filter((c) => aplica(c, perfil));
            const ocultos = n.criterios.length - visibles.length;
            return (
              <li key={n.id}>
                <section
                  aria-label={nivel.nombre}
                  className={cn("flex flex-col gap-3 rounded-xl border bg-surface p-5", enfocado === n.letra ? "border-info-line" : "border-line")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[n.letra])} aria-hidden />
                      <h3 className="text-[15px] font-semibold text-fg">{nivel.nombre}</h3>
                      <span className="text-xs text-fg-muted">
                        Nivel {nivel.codigo} de {niveles.length}
                      </span>
                      {n.letra === "F" && <span className={cn(MARCA, "font-medium")}>La base</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-pressed={enfocado === n.letra}
                        onClick={() => setEnfocado(n.letra)}
                        className="text-xs font-semibold text-brand hover:underline"
                      >
                        Ver el área en este nivel
                      </button>
                      <BotonComentar
                        conteo={conteoDe(conteos, n.id)}
                        onClick={() => darFeedback(n.id)}
                        etiqueta={`Dar feedback sobre el nivel ${nivel.nombre}`}
                        className={cn(anclaAbierta === n.id && "border-info-line bg-info-surface text-brand")}
                      />
                    </div>
                  </div>
                  <p className="text-sm font-semibold leading-normal text-fg">
                    <TextoConPalabras texto={n.descripcion} palabras={datos.terminos} />
                  </p>
                  {n.resultado && (
                    <div className={cn(BLOQUE_DE_RESULTADO, "px-3 py-2.5")}>
                      <span className={ROTULO}>Resultado</span>
                      <span className="text-[13px] leading-normal text-fg-secondary">{n.resultado}</span>
                    </div>
                  )}
                  {visibles.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {visibles.map((c) => (
                        <li
                          key={c.id}
                          id={`criterio-${c.id}`}
                          className={cn(
                            "-mx-2 flex items-start gap-3 rounded-lg border px-2 py-1.5 transition-opacity",
                            anclaAbierta === c.id
                              ? "border-transparent bg-info-surface"
                              : llegada === c.id
                                ? "border-info-line bg-info-surface"
                                : "border-transparent",
                            // Con herramientas prendidas, lo que ninguna toca queda más claro.
                            atenuado(c.id) && anclaAbierta !== c.id && "opacity-45 hover:opacity-100",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-normal text-fg">
                              <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
                            </p>
                            <MetaDelCriterio criterio={c} datos={datos} perfil={perfil} className="mt-1.5" />
                            <HerramientasDelCriterio criterio={c} conTexto className="mt-2" />
                            <EnlacesDelCriterio criterio={c} datos={datos} perfil={perfil} onIr={irAlCriterio} className="mt-2" />
                          </div>
                          <BotonComentar conteo={conteoDe(conteos, c.id)} onClick={() => darFeedback(c.id)} etiqueta={`Dar feedback sobre ${c.id}`} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {ocultos > 0 && (
                    <p className="text-xs text-fg-muted">
                      {ocultos} {ocultos === 1 ? "criterio no aplica" : "criterios no aplican"} a este perfil y {ocultos === 1 ? "está escondido" : "están escondidos"}.
                    </p>
                  )}
                  <NoAplicanEnLaEdicion nivel={n} className="text-xs" />
                </section>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap justify-between gap-3">
          <button type="button" disabled={i === 0} onClick={() => elegirDimension(dims[i - 1].id)} className={BOTON_CLARO}>
            ← {i > 0 ? `${dims[i - 1].id} ${dims[i - 1].nombre}` : "Inicio del área"}
          </button>
          <button type="button" disabled={i === dims.length - 1} onClick={() => elegirDimension(dims[i + 1].id)} className={BOTON_CLARO}>
            {i < dims.length - 1 ? `${dims[i + 1].id} ${dims[i + 1].nombre}` : "Fin del área"} →
          </button>
        </div>
      </article>

      <aside
        aria-label="Contexto de la dimensión"
        className="border-t border-line lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:border-l xl:border-t-0"
      >
        <div className="flex flex-col gap-5 p-5 xl:sticky xl:top-4">
          <section className="flex flex-col gap-2">
            <span className={ROTULO}>Así se ve {area.nombre} en</span>
            <Select
              aria-label="Nivel del área"
              value={enfocado}
              onChange={(e) => setEnfocado(e.target.value as Letra)}
              className="bg-surface py-2 text-[13px] leading-tight text-fg"
            >
              {niveles.map((x) => (
                <option key={x.letra} value={x.letra}>
                  {x.nombre}
                </option>
              ))}
            </Select>
            <p className="text-[13px] leading-normal text-fg-secondary">{area.panoramica[enfocado] ?? "—"}</p>
          </section>

          {d.generica?.descripcion && (
            <section className="flex flex-col gap-2">
              <span className={ROTULO}>En las tres áreas</span>
              <p className="text-xs leading-normal text-fg-secondary">
                <span className="font-semibold text-fg">{d.generica.nombre}</span>: {d.generica.descripcion}
              </p>
            </section>
          )}

          {ordenes.length > 0 && (
            <section className="flex flex-col gap-2">
              <span className={ROTULO}>Qué se trabaja primero en {capa?.nombre.toLowerCase()}</span>
              {ordenes.map((o) => {
                const lugar = lugarEnElOrden(o, d);
                return (
                  <div key={o.cuando} className="flex flex-col gap-1">
                    {ordenes.length > 1 && <p className="text-xs font-semibold text-fg-secondary">{o.cuando}</p>}
                    <ol className="flex flex-col gap-1">
                      {o.orden.map((nombre, k) => (
                        <li key={nombre} className={cn("flex text-[13px]", lugar === k + 1 ? "font-semibold text-brand" : "text-fg-secondary")}>
                          <span className="w-[18px] flex-shrink-0 font-normal tabular-nums text-fg-muted">{k + 1}</span>
                          {nombre}
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs leading-normal text-fg-muted">{o.porQue}</p>
                  </div>
                );
              })}
            </section>
          )}

          {reglas.length > 0 && (
            <section aria-label="Dónde se cuenta la evidencia" className="flex flex-col gap-2">
              <span className={ROTULO}>Dónde se cuenta la evidencia</span>
              <p className="text-xs leading-normal text-fg-muted">Cada evidencia cuenta en una sola dimensión. Los casos dudosos que tocan a esta:</p>
              <ul className="flex flex-col gap-2">
                {reglas.map((r, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-fg-muted" aria-hidden />
                    <ParrafoDeLaEscala texto={r.texto} className="text-xs leading-normal text-fg-secondary" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
