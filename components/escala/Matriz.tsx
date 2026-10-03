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
 *
 * La forma es la del sistema «Nexus · interfaz interna» (2026-10-03): el encabezado y las capas en
 * gris claro con rótulos grises, cada nivel con su punto y su nombre, Funcional marcado «La base»
 * con un chip blanco (sin teñir la columna: el verde es «confirmado» y no se usa de adorno) y el
 * resultado de cada nivel en un bloque neutro.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import type { Dimension, Nivel } from "@/lib/escala/documento/tipos";
import { ordenDeDependencias, relacionadosCon, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeCelda, useEscala } from "./contexto";
import { HerramientasDelCriterio, useHerramientas } from "./herramientas";
import { PUNTO_DE_NIVEL } from "./niveles";
import { BLOQUE_DE_RESULTADO, Contador, MARCA, MetaDelCriterio, NoAplicanEnLaEdicion, NombreGeneral, ROTULO, TextoConPalabras } from "./piezas";

const COLUMNAS = "grid-cols-[minmax(230px,1.15fr)_repeat(5,minmax(180px,1fr))]";

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
      <div className="min-w-[1180px]">
        <div className={cn("sticky top-0 z-20 grid border-b border-line bg-surface-muted", COLUMNAS)}>
          <div className={cn("sticky left-0 z-10 flex items-center bg-surface-muted px-4 py-2.5", ROTULO)}>Dimensión</div>
          {niveles.map((n) => (
            <div
              key={n.letra}
              // Cómo se ve el área entera en ese nivel («Los cinco niveles de un vistazo»), al pasar el cursor.
              title={area.panoramica[n.letra] ? `Así se ve ${area.nombre} en ${n.nombre}: ${area.panoramica[n.letra]}` : undefined}
              className="flex items-center gap-1.5 border-l border-line px-3 py-2.5"
            >
              <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[n.letra])} aria-hidden />
              <span className="text-[13px] font-medium text-fg">{n.nombre}</span>
              {n.letra === "F" && <span className={cn(MARCA, "font-medium")}>La base</span>}
            </div>
          ))}
        </div>

        {capas.map((capa) => (
          <section key={capa.clave} aria-label={capa.nombre}>
            <div className="flex border-b border-line bg-surface-muted">
              <div className="sticky left-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5">
                <h3 className={ROTULO}>{capa.nombre}</h3>
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
      <div className="sticky left-0 z-10 flex flex-col gap-2 border-r border-line bg-surface p-4">
        <button
          type="button"
          onClick={() => abrirComentarios(d.id)}
          title="Ver y dejar comentarios sobre la dimensión"
          className={cn(
            "-mx-1.5 -my-1 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface-hover",
            anclaAbierta === d.id && "bg-info-surface",
          )}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs tabular-nums text-fg-muted">{d.id}</span>
            <span className="text-[15px] font-semibold leading-snug text-fg">{d.nombre}</span>
          </span>
          <NombreGeneral nombre={d.nombreGeneral} className="mt-0.5" />
          <span className="mt-1.5 block text-[13px] leading-normal text-fg-secondary">{d.pregunta}</span>
        </button>
        {d.descripcion && (
          <p className="text-xs leading-normal text-fg-muted">
            <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
          </p>
        )}
        <p className="text-xs leading-normal text-fg-secondary">
          <span className="font-semibold text-warn-ink">Costo de quedarse · </span>
          {d.costoDeQuedarse}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Contador conteo={conteoDe(conteos, d.id)} />
          <button type="button" onClick={() => onLeerDimension(d.id)} className="text-xs font-semibold text-brand hover:underline">
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
  const { atenuado } = useHerramientas();
  const visibles = n.criterios.filter((c) => aplica(c, perfil));
  const ocultos = n.criterios.length - visibles.length;
  const tieneEnlaces = (id: string) => !!(datos.requeridos.requiere[id]?.length || datos.requeridos.loRequieren[id]?.length);
  return (
    <div className="flex min-w-0 flex-col gap-2 border-l border-line p-3">
      <button
        type="button"
        onClick={() => abrirComentarios(n.id)}
        title="Ver y dejar comentarios sobre el nivel"
        className={cn(
          "-mx-1 rounded-lg px-1 py-0.5 text-left text-[13px] font-semibold leading-snug text-fg transition-colors hover:bg-surface-hover",
          anclaAbierta === n.id && "bg-info-surface",
        )}
      >
        <TextoConPalabras texto={n.descripcion} palabras={datos.terminos} />
      </button>

      {n.resultado && (
        <div className={BLOQUE_DE_RESULTADO}>
          <span className={ROTULO}>Resultado</span>
          <span className="text-xs leading-normal text-fg-secondary">{n.resultado}</span>
        </div>
      )}

      {visibles.length > 0 && (
        <ul className="-mx-1.5 flex flex-col gap-0.5">
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
                  // Con el teclado se marca al LLEGAR con Tab (la tecla se suelta sobre el criterio al que
                  // se llegó), no con cualquier foco: al cerrar el panel de comentarios el foco vuelve
                  // solo al criterio, y con `onFocus` la marca quedaba puesta sin cursor ni panel.
                  onKeyUp={conEnlaces ? (e) => e.key === "Tab" && relacion.alEntrar(c.id) : undefined}
                  onBlur={conEnlaces ? relacion.alSalir : undefined}
                  // El punteado es «falta» en el sistema: lo relacionado va con borde lleno, azul lo que
                  // requiere lo que se mira y gris lo que lo requiere a él.
                  className={cn(
                    "relative w-full rounded-lg border p-1.5 text-left transition-[background-color,opacity] hover:bg-surface-hover",
                    anclaAbierta === c.id
                      ? "border-info-line bg-info-surface"
                      : requerido
                        ? "border-info-line bg-surface"
                        : dependiente
                          ? "border-line bg-surface-muted"
                          : "border-transparent",
                    // Con herramientas prendidas, lo que ninguna toca queda más claro (al pasar el cursor, entero).
                    atenuado(c.id) && anclaAbierta !== c.id && "opacity-45 hover:opacity-100",
                  )}
                >
                  {/* El rótulo va SOBRE el borde, sin ocupar lugar: como una línea más hacía crecer la
                      celda, la matriz se corría bajo el cursor, el criterio dejaba de estar debajo y el
                      rótulo aparecía y desaparecía varias veces por segundo. */}
                  {(requerido || dependiente) && relacion.foco && (
                    <span
                      className={cn(
                        "pointer-events-none absolute right-1.5 top-0 z-10 -translate-y-1/2 whitespace-nowrap rounded-full border bg-surface px-1.5 text-[11px] font-semibold leading-4",
                        requerido ? "border-info-line text-brand" : "border-line text-fg-secondary",
                      )}
                    >
                      {requerido ? "Lo requiere " : "Requiere a "}
                      <span className="tabular-nums">{relacion.foco}</span>
                    </span>
                  )}
                  <span className="block text-[13px] leading-normal text-fg">
                    <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
                  </span>
                  <span className="mt-1.5 flex items-start justify-between gap-2">
                    <MetaDelCriterio criterio={c} datos={datos} perfil={perfil} />
                    <Contador conteo={conteoDe(conteos, c.id)} />
                  </span>
                  <HerramientasDelCriterio criterio={c} className="mt-1.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="flex flex-col gap-0.5">
          {ocultos > 0 && (
            <span className="text-xs text-fg-muted">
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
      <span className="text-xs text-fg-secondary" title={`Por qué este orden: ${f.porQue}`}>
        · Orden: {f.orden.join(" → ")}
      </span>
    );
  }
  return (
    <span className="cursor-help text-xs text-fg-secondary" title={filas.map((f) => `${f.cuando}: ${f.orden.join(" → ")}`).join("\n")}>
      · Orden: depende de cómo se cierra la venta (elige un perfil)
    </span>
  );
}
