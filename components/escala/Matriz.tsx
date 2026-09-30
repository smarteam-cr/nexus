"use client";

/**
 * components/escala/Matriz.tsx — un área de la escala como matriz: sus dimensiones, agrupadas en
 * base operativa y producción, frente a los cinco niveles.
 *
 * Cada dimensión muestra su pregunta y su costo de quedarse; cada nivel, su descripción y, desde
 * Funcional, su línea de resultado; cada criterio, primero su texto y en chico su identificador,
 * cómo se verifica y sus marcas. Todo es clickeable: abre los comentarios de ESE identificador.
 *
 * Un criterio puede requerir otros, de otra dimensión o de un nivel anterior. Al pasar el cursor por
 * uno (o con sus comentarios abiertos) se marcan en toda la matriz los que requiere y los que lo
 * requieren a él.
 *
 * La matriz tiene su propio scroll (alto de la ventana) para que el encabezado de los niveles y la
 * columna de las dimensiones queden fijos en los dos sentidos.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Dimension, Nivel } from "@/lib/escala/documento/tipos";
import { ordenDeDependencias, relacionadosCon, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeCelda, useEscala } from "./contexto";
import { PUNTO_DE_NIVEL } from "./niveles";
import { Contador, MetaDelCriterio, NoAplicanEnLaEdicion, NombreGeneral, TextoConPalabras } from "./piezas";

const COLUMNAS = "grid-cols-[minmax(210px,1.15fr)_repeat(5,minmax(170px,1fr))]";

interface Props {
  datos: DatosDeLaVista;
  perfil: Perfil;
  anclaAbierta: string | null;
  onLeerDimension: (dimension: string) => void;
}

/**
 * El criterio que se mira (bajo el cursor o, si no, el que tiene los comentarios abiertos) y los que
 * se relacionan con él: los que requiere y los que lo requieren. Se marcan en toda la matriz.
 */
interface Relacion {
  foco: string | null;
  requiere: Set<string>;
  loRequieren: Set<string>;
  /** Solo los criterios con algún enlace avisan que el cursor está encima: el resto no mueve nada. */
  alEntrar: (id: string) => void;
  alSalir: () => void;
}

export default function Matriz({ datos, perfil, anclaAbierta, onLeerDimension }: Props) {
  const { area, niveles, capas } = datos;
  const [encima, setEncima] = useState<string | null>(null);
  const relacion = useMemo((): Relacion => {
    const foco = encima ?? anclaAbierta;
    return { foco, ...relacionadosCon(foco, datos.requeridos, perfil), alEntrar: setEncima, alSalir: () => setEncima(null) };
  }, [encima, anclaAbierta, datos.requeridos, perfil]);
  return (
    <div
      className="relative overflow-auto rounded-xl border border-line bg-surface"
      style={{ maxHeight: "calc(100vh - 15rem)", minHeight: "26rem" }}
    >
      <div className="min-w-[1090px]">
        <div className={cn("sticky top-0 z-20 grid border-b border-line bg-surface", COLUMNAS)}>
          <div className="sticky left-0 z-10 flex items-end bg-surface px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
            Dimensión
          </div>
          {niveles.map((n) => (
            <div
              key={n.letra}
              // Cómo se ve el área entera en ese nivel («Los cinco niveles de un vistazo»), al pasar el cursor.
              title={area.panoramica[n.letra] ? `Así se ve ${area.nombre} en ${n.nombre}: ${area.panoramica[n.letra]}` : undefined}
              className={cn("border-l border-line px-3 py-2.5", n.letra === "F" ? "bg-success-surface" : "bg-surface")}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 flex-shrink-0 rounded-sm", PUNTO_DE_NIVEL[n.letra])} aria-hidden />
                <span className="text-sm font-semibold text-fg">{n.nombre}</span>
                {n.letra === "F" && (
                  <span className="rounded-full border border-dashed border-success-line px-1.5 text-2xs font-semibold text-success-ink">
                    La base
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {capas.map((capa) => (
          <section key={capa.clave} aria-label={capa.nombre}>
            <div className="flex border-b border-line bg-surface-muted">
              <div className="sticky left-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2">
                <h3 className="text-2xs font-bold uppercase tracking-wide text-info-ink">{capa.nombre}</h3>
                {capa.descripcion && <span className="text-xs text-fg-muted">{capa.descripcion}</span>}
                <OrdenDeLaCapa datos={datos} capa={capa.nombre} perfil={perfil} />
              </div>
            </div>
            {area.dimensiones
              .filter((d) => d.capa === capa.clave)
              .map((d) => (
                <FilaDeDimension
                  key={d.id}
                  d={d}
                  datos={datos}
                  perfil={perfil}
                  anclaAbierta={anclaAbierta}
                  relacion={relacion}
                  onLeerDimension={onLeerDimension}
                />
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function FilaDeDimension({
  d,
  datos,
  perfil,
  anclaAbierta,
  relacion,
  onLeerDimension,
}: {
  d: Dimension;
  datos: DatosDeLaVista;
  perfil: Perfil;
  anclaAbierta: string | null;
  relacion: Relacion;
  onLeerDimension: (dimension: string) => void;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const aplicaAca = dimensionAplica(d, perfil);
  return (
    <div className={cn("grid border-b border-line", COLUMNAS)}>
      <div className="sticky left-0 z-10 flex flex-col gap-2 border-r border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => abrirComentarios(d.id)}
          title="Ver y dejar comentarios sobre la dimensión"
          className={cn(
            "-mx-1.5 -my-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover",
            anclaAbierta === d.id && "bg-info-surface",
          )}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-2xs text-fg-muted">{d.id}</span>
            <span className="text-sm font-semibold leading-tight text-fg">{d.nombre}</span>
          </span>
          <NombreGeneral nombre={d.nombreGeneral} className="mt-0.5" />
          <span className="mt-1 block text-xs leading-snug text-fg-secondary">{d.pregunta}</span>
        </button>
        {d.descripcion && (
          <p className="text-2xs leading-snug text-fg-secondary">
            <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
          </p>
        )}
        <p className="text-2xs leading-snug text-fg-muted">
          <span className="font-semibold text-warn-ink">Costo de quedarse · </span>
          {d.costoDeQuedarse}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Contador conteo={conteoDe(conteos, d.id)} />
          <button type="button" onClick={() => onLeerDimension(d.id)} className="text-2xs font-medium text-info-ink hover:underline">
            Leer la dimensión →
          </button>
        </div>
      </div>

      {aplicaAca ? (
        d.niveles.map((n) => (
          <CeldaDeNivel key={n.id} d={d} n={n} datos={datos} perfil={perfil} anclaAbierta={anclaAbierta} relacion={relacion} />
        ))
      ) : (
        <div className="col-span-5 flex items-center gap-3 bg-surface-muted px-5 py-4 text-sm text-fg-secondary">
          <svg className="h-4 w-4 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="9" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M5.6 5.6l12.8 12.8" />
          </svg>
          <span>
            <strong className="font-semibold text-fg">No aplica a este perfil</strong> ({describirPerfil(perfil)}): se queda sin criterios de
            Funcional que apliquen, así que no entra en el nivel ni en el puntaje de su capa.
          </span>
        </div>
      )}
    </div>
  );
}

function CeldaDeNivel({
  d,
  n,
  datos,
  perfil,
  anclaAbierta,
  relacion,
}: {
  d: Dimension;
  n: Nivel;
  datos: DatosDeLaVista;
  perfil: Perfil;
  anclaAbierta: string | null;
  relacion: Relacion;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const visibles = n.criterios.filter((c) => aplica(c, perfil));
  const ocultos = n.criterios.length - visibles.length;
  const tieneEnlaces = (id: string) => !!(datos.requeridos.requiere[id]?.length || datos.requeridos.loRequieren[id]?.length);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 border-l border-line px-3 py-3", n.letra === "F" && "bg-success-surface/40")}>
      <button
        type="button"
        onClick={() => abrirComentarios(n.id)}
        title="Ver y dejar comentarios sobre el nivel"
        className={cn(
          "-mx-1 rounded-md px-1 py-0.5 text-left text-xs font-semibold leading-snug text-fg transition-colors hover:bg-surface-hover",
          anclaAbierta === n.id && "bg-info-surface",
        )}
      >
        <TextoConPalabras texto={n.descripcion} palabras={datos.terminos} />
      </button>

      {n.resultado && (
        <p className="rounded-md bg-success-surface px-2 py-1.5 text-2xs leading-snug text-success-ink">
          <span className="font-bold">Resultado · </span>
          {n.resultado}
        </p>
      )}

      {visibles.length > 0 && (
        <ul className="-mx-1.5 flex flex-col">
          {visibles.map((c) => {
            // Lo que se mira requiere este criterio, o este criterio requiere lo que se mira.
            const requerido = relacion.requiere.has(c.id);
            const dependiente = relacion.loRequieren.has(c.id);
            const conEnlaces = tieneEnlaces(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => abrirComentarios(c.id)}
                  onMouseEnter={conEnlaces ? () => relacion.alEntrar(c.id) : undefined}
                  onMouseLeave={conEnlaces ? relacion.alSalir : undefined}
                  onFocus={conEnlaces ? () => relacion.alEntrar(c.id) : undefined}
                  onBlur={conEnlaces ? relacion.alSalir : undefined}
                  className={cn(
                    "w-full rounded-md border px-1.5 py-1.5 text-left transition-colors hover:bg-surface-hover",
                    anclaAbierta === c.id
                      ? "border-info-line bg-info-surface"
                      : requerido
                        ? "border-dashed border-info-line bg-info-surface"
                        : dependiente
                          ? "border-dashed border-line bg-surface-hover"
                          : "border-transparent",
                  )}
                >
                  {(requerido || dependiente) && relacion.foco && (
                    <span className={cn("mb-1 block text-2xs font-semibold", requerido ? "text-info-ink" : "text-fg-secondary")}>
                      {requerido ? "Lo requiere " : "Requiere a "}
                      <span className="font-mono">{relacion.foco}</span>
                    </span>
                  )}
                  <span className="block text-xs leading-snug text-fg">
                    <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
                  </span>
                  <span className="mt-1.5 flex items-start justify-between gap-2">
                    <MetaDelCriterio criterio={c} datos={datos} perfil={perfil} />
                    <Contador conteo={conteoDe(conteos, c.id)} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="flex flex-col gap-0.5">
          {ocultos > 0 && (
            <span className="text-2xs text-fg-muted">
              {ocultos} {ocultos === 1 ? "no aplica" : "no aplican"} a este perfil
            </span>
          )}
          <NoAplicanEnLaEdicion nivel={n} />
        </span>
        <Contador conteo={conteoDeCelda(conteos, d.id, n.letra)} conTexto />
      </div>
    </div>
  );
}

/**
 * «Qué se trabaja primero»: el orden de dependencias de la capa en esta área. En la base de Ventas
 * depende de cómo se cierra la venta; sin ese filtro se dice que cambia, con las tres variantes en
 * el tooltip.
 */
function OrdenDeLaCapa({ datos, capa, perfil }: { datos: DatosDeLaVista; capa: string; perfil: Perfil }) {
  const filas = ordenDeDependencias(datos.dependencias, datos.area.nombre, capa, perfil.cierre);
  if (filas.length === 0) return null;
  if (filas.length === 1) {
    const f = filas[0];
    return (
      <span className="text-2xs text-fg-secondary" title={`Por qué este orden: ${f.porQue}`}>
        · <span className="font-semibold">Orden de dependencias:</span> {f.orden.join(" → ")}
      </span>
    );
  }
  return (
    <span
      className="cursor-help text-2xs text-fg-secondary underline decoration-dotted underline-offset-2"
      title={filas.map((f) => `${f.cuando}: ${f.orden.join(" → ")}`).join("\n")}
    >
      · <span className="font-semibold">Orden de dependencias:</span> depende de cómo se cierra la venta (elige un perfil)
    </span>
  );
}
