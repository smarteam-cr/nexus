"use client";

/**
 * components/escala/Escalera.tsx — una dimensión a la vez, sus cinco niveles como escalera.
 *
 * Es la vista para LEER e interiorizar: la matriz sirve para comparar, esta para entender una
 * dimensión de punta a punta. Al costado, cómo se ve el área entera en el nivel que se mira
 * («Los cinco niveles de un vistazo»), para no perder el cuadro grande.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Letra } from "@/lib/escala/documento/tipos";
import { ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeDimension, useEscala } from "./contexto";
import { PUNTO_DE_NIVEL } from "./niveles";
import { BotonComentar, Contador, MetaDelCriterio, ParrafoDeLaEscala, Segmentado, TextoConPalabras } from "./piezas";

interface Props {
  datos: DatosDeLaVista;
  perfil: Perfil;
  dimension: string;
  onElegirDimension: (dimension: string) => void;
  anclaAbierta: string | null;
}

export default function Escalera({ datos, perfil, dimension, onElegirDimension, anclaAbierta }: Props) {
  const { conteos, abrirComentarios } = useEscala();
  const { area, niveles, capas } = datos;
  const dims = area.dimensiones;
  const i = Math.max(0, dims.findIndex((x) => x.id === dimension));
  const d = dims[i];
  const [enfocado, setEnfocado] = useState<Letra>("F");
  const aplicaAca = dimensionAplica(d, perfil);
  const capa = capas.find((c) => c.clave === d.capa);
  const nivelEnfocado = niveles.find((n) => n.letra === enfocado)!;
  /** «Regla de asignación»: los casos dudosos que tocan a esta dimensión. */
  const reglas = datos.asignacion.filter((r) => r.dimensiones.includes(d.id));
  /** «Qué se trabaja primero»: el orden de su capa en esta área (y el perfil elegido). */
  const ordenes = capa ? ordenDeDependencias(datos.dependencias, area.nombre, capa.nombre, perfil.cierre) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_270px]">
      <nav aria-label="Dimensiones del área" className="self-start rounded-xl border border-line bg-surface py-2 lg:sticky lg:top-4">
        {capas.map((c) => (
          <div key={c.clave} className="pb-1">
            <p className="px-3 pb-1 pt-2 text-2xs font-bold uppercase tracking-wide text-info-ink">{c.nombre}</p>
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
                    onClick={() => onElegirDimension(x.id)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                      activo
                        ? "bg-info-surface font-semibold text-info-ink shadow-[inset_3px_0_0_var(--color-brand)]"
                        : aplicaX
                          ? "text-fg-secondary hover:bg-surface-hover"
                          : "text-fg-muted hover:bg-surface-hover",
                    )}
                  >
                    <span className="w-7 flex-shrink-0 pt-0.5 font-mono text-2xs text-fg-muted">{x.id}</span>
                    <span className="min-w-0 flex-1 leading-snug">{x.nombre}</span>
                    {!aplicaX && <span className="text-2xs font-normal">no aplica</span>}
                    <Contador conteo={conteoDeDimension(conteos, x.id)} />
                  </button>
                );
              })}
          </div>
        ))}
      </nav>

      <article className="min-w-0">
        <header className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">
            {area.nombre} · {capa?.nombre}
            {d.generica && d.generica.nombre !== d.nombre ? ` · ${d.generica.nombre}` : ""}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-base text-fg-muted">{d.id}</span>
            <h2 className="text-2xl font-bold tracking-tight text-fg">{d.nombre}</h2>
          </div>
          <p className="text-lg leading-snug text-fg">{d.pregunta}</p>
          {d.descripcion && (
            <p className="text-sm leading-relaxed text-fg-secondary">
              <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
            </p>
          )}
          <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-sm leading-relaxed text-warn-ink">
            <span className="font-semibold">Costo de quedarse. </span>
            {d.costoDeQuedarse}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BotonComentar
              conteo={conteoDe(conteos, d.id)}
              onClick={() => abrirComentarios(d.id)}
              etiqueta="Comentarios de la dimensión"
              className={cn(anclaAbierta === d.id && "ring-2 ring-brand/40")}
            />
            <span className="text-xs text-fg-muted">Comentar la dimensión entera (su pregunta o su costo)</span>
          </div>
          {!aplicaAca && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg-secondary">
              <strong className="font-semibold text-fg">No aplica a este perfil</strong> ({describirPerfil(perfil)}): se queda sin criterios de
              Funcional que apliquen.
            </p>
          )}
        </header>

        <ol className="mt-6 flex flex-col">
          {d.niveles.map((n, k) => {
            const nivel = niveles.find((x) => x.letra === n.letra)!;
            const visibles = n.criterios.filter((c) => aplica(c, perfil));
            const ocultos = n.criterios.length - visibles.length;
            const ultimo = k === d.niveles.length - 1;
            return (
              <li key={n.id} className="flex gap-4">
                <div className="flex w-8 flex-shrink-0 flex-col items-center" aria-hidden>
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-primary-fg", PUNTO_DE_NIVEL[n.letra])}>
                    {nivel.codigo}
                  </span>
                  {!ultimo && <span className="my-1 w-0.5 flex-1 bg-line" />}
                </div>
                <section
                  aria-label={nivel.nombre}
                  className={cn(
                    "mb-4 flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-surface px-4 py-4",
                    n.letra === "F" ? "border-[1.5px] border-dashed border-success-line" : "border border-line",
                    enfocado === n.letra && "ring-2 ring-brand/25",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-fg">{nivel.nombre}</h3>
                      {n.letra === "F" && (
                        <span className="rounded-full border border-dashed border-success-line px-1.5 text-2xs font-semibold text-success-ink">
                          La base
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEnfocado(n.letra)}
                        className="rounded-md border border-line px-2 py-1 text-2xs text-fg-secondary hover:bg-surface-hover"
                      >
                        Ver el área en este nivel
                      </button>
                      <BotonComentar
                        conteo={conteoDe(conteos, n.id)}
                        onClick={() => abrirComentarios(n.id)}
                        etiqueta={`Comentarios del nivel ${nivel.nombre}`}
                        className={cn(anclaAbierta === n.id && "ring-2 ring-brand/40")}
                      />
                    </div>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-fg">
                    <TextoConPalabras texto={n.descripcion} palabras={datos.terminos} />
                  </p>
                  {n.resultado && (
                    <p className="rounded-lg bg-success-surface px-3 py-2 text-sm leading-relaxed text-success-ink">
                      <span className="font-bold">Resultado · </span>
                      {n.resultado}
                    </p>
                  )}
                  {visibles.length > 0 && (
                    <ul className="flex flex-col gap-3">
                      {visibles.map((c) => (
                        <li key={c.id} className={cn("flex items-start gap-3 rounded-lg px-1 py-0.5", anclaAbierta === c.id && "bg-info-surface")}>
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fg-muted" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-relaxed text-fg">
                              <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
                            </p>
                            <MetaDelCriterio criterio={c} datos={datos} className="mt-1.5" />
                          </div>
                          <BotonComentar conteo={conteoDe(conteos, c.id)} onClick={() => abrirComentarios(c.id)} etiqueta={`Comentarios de ${c.id}`} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {ocultos > 0 && (
                    <p className="text-xs text-fg-muted">
                      {ocultos} {ocultos === 1 ? "criterio no aplica" : "criterios no aplican"} a este perfil y {ocultos === 1 ? "está escondido" : "están escondidos"}.
                    </p>
                  )}
                </section>
              </li>
            );
          })}
        </ol>

        {reglas.length > 0 && (
          <section aria-label="Dónde se cuenta la evidencia" className="mb-5 rounded-xl border border-line bg-surface px-4 py-4">
            <h3 className="text-sm font-bold text-fg">Dónde se cuenta la evidencia</h3>
            <p className="mt-0.5 text-xs text-fg-muted">
              De la regla de asignación: cada evidencia cuenta en una sola dimensión. Los casos dudosos que tocan a esta:
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {reglas.map((r, k) => (
                <li key={k} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-info-ink" aria-hidden />
                  <ParrafoDeLaEscala texto={r.texto} className="text-sm leading-relaxed text-fg-secondary" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => onElegirDimension(dims[i - 1].id)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
          >
            ← {i > 0 ? `${dims[i - 1].id} ${dims[i - 1].nombre}` : "Inicio del área"}
          </button>
          <button
            type="button"
            disabled={i === dims.length - 1}
            onClick={() => onElegirDimension(dims[i + 1].id)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
          >
            {i < dims.length - 1 ? `${dims[i + 1].id} ${dims[i + 1].nombre}` : "Fin del área"} →
          </button>
        </div>
      </article>

      <aside aria-label="El área entera en un nivel" className="hidden self-start rounded-xl border border-line bg-surface p-4 xl:sticky xl:top-4 xl:block">
        <p className="text-2xs font-bold uppercase tracking-wide text-fg-muted">Así se ve {area.nombre} en</p>
        <div className="mt-2 flex items-center gap-2">
          <span className={cn("h-3 w-3 rounded-sm", PUNTO_DE_NIVEL[enfocado])} aria-hidden />
          <span className="text-lg font-bold text-fg">{nivelEnfocado.nombre}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{area.panoramica[enfocado] ?? "—"}</p>
        <Segmentado
          className="mt-3 flex-wrap"
          etiqueta="Nivel del área"
          valor={enfocado}
          onCambio={setEnfocado}
          opciones={niveles.map((x) => ({ clave: x.letra, etiqueta: x.nombre.slice(0, 3), title: x.nombre }))}
        />
        {d.generica?.descripcion && (
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-fg-muted">
            <span className="font-semibold text-fg-secondary">{d.generica.nombre}</span> — {d.generica.descripcion}
          </p>
        )}
        {ordenes.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-2xs font-bold uppercase tracking-wide text-fg-muted">Qué se trabaja primero en {capa?.nombre.toLowerCase()}</p>
            {ordenes.map((o) => (
              <div key={o.cuando} className="mt-2">
                {ordenes.length > 1 && <p className="text-2xs font-semibold text-fg-secondary">{o.cuando}</p>}
                <ol className="mt-1 flex flex-col gap-0.5">
                  {o.orden.map((nombre, k) => (
                    <li
                      key={nombre}
                      className={cn("text-xs", nombre === d.nombre ? "font-bold text-info-ink" : "text-fg-secondary")}
                    >
                      {k + 1}. {nombre}
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-2xs leading-relaxed text-fg-muted">{o.porQue}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
