"use client";

/**
 * components/escala/Bandeja.tsx — todos los comentarios de la escala, para revisarlos.
 *
 * Todo el equipo la ve (se evita comentar dos veces lo mismo); el responsable de la escala,
 * además, cambia estados y exporta los cambios pendientes con las columnas del manual.
 * «Agrupar por dimensión» muestra lo que se repite en varios casos: lo que más pesa para decidir
 * qué cambia en la escala.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button, EmptyState, Modal, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { haceCuanto } from "@/lib/documentacion/comentarios";
import { coincideBusqueda } from "@/lib/ui/text-search";
import {
  ESTADOS_DE_COMENTARIO,
  TIPOS_DE_COMENTARIO,
  etiquetaDeTipo,
  type Autor,
  type ComentarioVisto,
  type EstadoDeComentario,
} from "@/lib/escala/comentarios/reglas";
import type { ComoCambiaLaEscala } from "@/lib/escala/documento/manual";
import { almacenDeLaApi, type AlmacenDeLaEscala } from "./comentarios/almacen";
import { EtiquetaDeEstado } from "./comentarios/ControlDeEstado";
import TarjetaDeComentario, { type AccionesDeComentario } from "./comentarios/TarjetaDeComentario";
import { ParrafoDeLaEscala, Segmentado } from "./piezas";

/**
 * Lo que el servidor sabe de cada DIMENSIÓN en la versión vigente (la escala general), para agrupar.
 * Lo de cada comentario —qué dice hoy su ancla y cómo se llama, con su edición— viene en él.
 */
export interface AnclaEnLaBandeja {
  /** «Ventas · Tracción del Deal · Funcional», o null si ya no existe. */
  ruta: string | null;
  /** Su texto hoy, o null si ya no existe. */
  texto: string | null;
  /** El slug del área, para el enlace a la escala. */
  area: string | null;
}

type FiltroDeEstado = EstadoDeComentario | "todos";

export default function Bandeja({
  comentarios: iniciales,
  anclas,
  areas,
  version,
  yo,
  esResponsable,
  almacen = almacenDeLaApi,
  // Con la industria del comentario: un criterio propio de una edición no existe en la general.
  hrefDeLaEscala = (slug, ancla, edicion) =>
    `/escala/${slug}?${edicion ? `industria=${encodeURIComponent(edicion)}&` : ""}c=${encodeURIComponent(ancla)}`,
  comoCambia = null,
}: {
  comentarios: ComentarioVisto[];
  anclas: Record<string, AnclaEnLaBandeja>;
  areas: { id: string; nombre: string; slug: string }[];
  version: string;
  yo: Autor;
  esResponsable: boolean;
  almacen?: AlmacenDeLaEscala;
  hrefDeLaEscala?: (slug: string, ancla: string, edicion: string | null) => string;
  /** Cómo cambia la escala y quién decide (del manual publicado). */
  comoCambia?: ComoCambiaLaEscala | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [comentarios, setComentarios] = useState(iniciales);
  const [estado, setEstado] = useState<FiltroDeEstado>(iniciales.some((c) => c.estado === "abierto") ? "abierto" : "todos");
  const [tipo, setTipo] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [cliente, setCliente] = useState<string>("");
  /** "" = todas · "general" = la escala general · o la clave de una edición por industria. */
  const [edicion, setEdicion] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState(true);
  const [elegido, setElegido] = useState<string | null>(iniciales[0]?.id ?? null);
  const [exportando, setExportando] = useState<{ markdown: string; filas: number } | null>(null);

  const recargar = useCallback(async () => {
    setComentarios(await almacen.listar({}));
    router.refresh();
  }, [almacen, router]);

  const hacer = useCallback(
    async (accion: () => Promise<unknown>, exito?: string) => {
      try {
        await accion();
        if (exito) toast.success(exito);
        await recargar();
        return true;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
        return false;
      }
    },
    [recargar, toast],
  );

  const acciones: AccionesDeComentario = {
    responder: (id, cuerpo) => hacer(() => almacen.responder(id, cuerpo)),
    editar: (id, d) => hacer(() => almacen.editar(id, d)),
    borrar: (id) => hacer(() => almacen.borrar(id), "Comentario borrado."),
    editarRespuesta: (id, cuerpo) => hacer(() => almacen.editarRespuesta(id, cuerpo)),
    borrarRespuesta: (id) => hacer(() => almacen.borrarRespuesta(id)),
    cambiarEstado: (id, e) => hacer(() => almacen.cambiarEstado(id, e), "Estado actualizado."),
  };

  const clientes = useMemo(
    () => [...new Set(comentarios.map((c) => c.cliente?.nombre).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "es")),
    [comentarios],
  );

  /** Las ediciones desde las que hay algún comentario (para el filtro: sin ninguna, no se muestra). */
  const ediciones = useMemo(() => {
    const porClave = new Map<string, string>();
    for (const c of comentarios) if (c.edicion) porClave.set(c.edicion.slug, c.edicion.nombre);
    return [...porClave.entries()].sort(([, a], [, b]) => a.localeCompare(b, "es"));
  }, [comentarios]);

  // Un filtro cuya opción desapareció (se borró el último comentario de ese cliente o de esa edición)
  // deja de filtrar: si no, el selector mostraría «Toda industria» y la lista seguiría filtrada por
  // algo que ya no se ve ni se puede quitar.
  const clienteVigente = clientes.includes(cliente) ? cliente : "";
  const edicionVigente = ediciones.length > 0 && (edicion === "general" || ediciones.some(([clave]) => clave === edicion)) ? edicion : "";

  const filtrados = comentarios.filter(
    (c) =>
      (estado === "todos" || c.estado === estado) &&
      (!tipo || c.tipo === tipo) &&
      (!area || c.area === area) &&
      (!clienteVigente || c.cliente?.nombre === clienteVigente) &&
      (!edicionVigente || (edicionVigente === "general" ? !c.edicion : c.edicion?.slug === edicionVigente)) &&
      (!busqueda.trim() ||
        coincideBusqueda(`${c.ancla} ${c.cuerpo} ${c.cliente?.nombre ?? ""} ${c.autor.nombre} ${c.ruta ?? ""} ${c.edicion?.nombre ?? ""}`, busqueda)),
  );

  const grupos = useMemo(() => {
    if (!agrupar) return [{ clave: "todos", titulo: null as string | null, filas: filtrados }];
    const porDim = new Map<string, ComentarioVisto[]>();
    for (const c of filtrados) porDim.set(c.dimension, [...(porDim.get(c.dimension) ?? []), c]);
    return [...porDim.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
      .map(([dim, filas]) => ({ clave: dim, titulo: anclas[dim]?.ruta ?? dim, filas }));
  }, [agrupar, filtrados, anclas]);

  const seleccionado = comentarios.find((c) => c.id === elegido) ?? null;
  /** El slug del área de un comentario (`1` → `ventas`), para el enlace a la escala. */
  const areaDe = (id: string) => areas.find((a) => a.id === id)?.slug ?? null;
  const nPendientes = comentarios.filter((c) => c.estado === "cambio_pendiente").length;

  const exportar = async () => {
    try {
      setExportando(await almacen.exportar());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo exportar.");
    }
  };

  const opcionesDeEstado = [
    { clave: "todos" as const, etiqueta: `Todos · ${comentarios.length}` },
    ...ESTADOS_DE_COMENTARIO.map((e) => ({ clave: e.clave, etiqueta: `${e.etiqueta} · ${comentarios.filter((c) => c.estado === e.clave).length}` })),
  ];

  const selectCls = "rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-fg-muted">
            <Link href="/escala" className="hover:text-fg">
              Escala de Rendimiento
            </Link>{" "}
            / Comentarios
          </p>
          <h1 className="mt-0.5 text-xl font-semibold text-fg">Comentarios de la escala</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Todo el equipo ve todos los comentarios. {esResponsable ? "Tú cambias el estado y decides qué pasa a cambio pendiente." : "El estado lo cambia el responsable de la escala."}
          </p>
          {comoCambia && comoCambia.reglas.length > 0 && (
            <details className="mt-2 max-w-3xl text-xs text-fg-secondary">
              <summary className="cursor-pointer text-fg-muted hover:text-fg">Para qué sirven: {comoCambia.titulo.toLowerCase()}</summary>
              <p className="mt-2 leading-relaxed">{comoCambia.resumen}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {comoCambia.reglas.map((r, i) => (
                  <li key={i}>
                    <ParrafoDeLaEscala texto={r} className="leading-relaxed" />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {esResponsable && (
          <Button variant="primary" size="sm" onClick={() => void exportar()}>
            Exportar cambios pendientes · {nPendientes}
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Segmentado<FiltroDeEstado> etiqueta="Estado" valor={estado} onCambio={setEstado} opciones={opcionesDeEstado} className="flex-wrap" />
        <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectCls}>
          <option value="">Todo tipo</option>
          {TIPOS_DE_COMENTARIO.map((t) => (
            <option key={t.clave} value={t.clave}>
              {t.etiqueta}
            </option>
          ))}
        </select>
        <select aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)} className={selectCls}>
          <option value="">Toda área</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {clientes.length > 0 && (
          <select aria-label="Cliente" value={clienteVigente} onChange={(e) => setCliente(e.target.value)} className={selectCls}>
            <option value="">Todo cliente</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {ediciones.length > 0 && (
          <select
            aria-label="Industria"
            title="Desde qué edición de la escala se hizo el comentario: la general o la de una industria."
            value={edicionVigente}
            onChange={(e) => setEdicion(e.target.value)}
            className={selectCls}
          >
            <option value="">Toda industria</option>
            <option value="general">Escala general</option>
            {ediciones.map(([clave, nombre]) => (
              <option key={clave} value={clave}>
                {nombre}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar en los comentarios"
          className="w-44 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted"
        />
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-secondary">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
          Agrupar por dimensión
        </label>
      </div>

      {comentarios.length === 0 ? (
        <EmptyState variant="dashed" title="Todavía no hay comentarios" description="Se comenta desde la escala: toca un criterio, un nivel o una dimensión." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
            {filtrados.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-muted">Nada con estos filtros.</p>}
            {grupos.map((g) => {
              const nClientes = new Set(g.filas.map((c) => c.cliente?.nombre).filter(Boolean)).size;
              return (
                <section key={g.clave} aria-label={g.titulo ?? "Comentarios"}>
                  {g.titulo && (
                    <div className="flex flex-wrap items-baseline gap-2 border-b border-line bg-surface-muted px-4 py-2">
                      <span className="font-mono text-2xs text-fg-muted">{g.clave}</span>
                      <span className="text-xs font-semibold text-fg">{g.titulo}</span>
                      <span className="text-2xs text-fg-muted">
                        {g.filas.length} {g.filas.length === 1 ? "comentario" : "comentarios"}
                        {nClientes > 0 && ` · ${nClientes} ${nClientes === 1 ? "cliente" : "clientes"}`}
                      </span>
                    </div>
                  )}
                  <ul className="divide-y divide-line">
                    {g.filas.map((c) => {
                      // Contra lo que dice hoy SU ancla, leída con la edición desde la que se comentó.
                      const retirado = c.textoDeHoy === null;
                      const cambio = !retirado && c.textoDeHoy !== c.textoAnclado;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setElegido(c.id)}
                            aria-current={elegido === c.id ? "true" : undefined}
                            className={cn(
                              "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                              elegido === c.id && "bg-info-surface shadow-[inset_3px_0_0_var(--color-brand)]",
                            )}
                          >
                            <span className="w-40 flex-shrink-0">
                              <span className="block font-mono text-xs text-info-ink">{c.ancla}</span>
                              <span className="mt-0.5 block text-2xs leading-snug text-fg-muted">{c.ruta ?? "ya no existe en esta versión"}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5 text-2xs">
                                <span className="font-semibold text-fg-secondary">{etiquetaDeTipo(c.tipo)}</span>
                                {c.edicion && (
                                  <span className="rounded bg-success-surface px-1 text-success-ink" title="Se comentó desde esta edición de la escala">
                                    {c.edicion.nombre}
                                  </span>
                                )}
                                {c.cliente && <span className="text-fg-muted">· {c.cliente.nombre}</span>}
                                {cambio && <span className="rounded bg-warn-surface px-1 text-warn-ink">el texto cambió</span>}
                                {retirado && <span className="rounded bg-surface-hover px-1 text-fg-secondary">ya no existe</span>}
                              </span>
                              <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-fg">{c.cuerpo}</span>
                            </span>
                            <span className="flex w-32 flex-shrink-0 flex-col items-end gap-1">
                              <EtiquetaDeEstado estado={c.estado} />
                              <span className="text-2xs text-fg-muted">{c.autor.nombre}</span>
                              <span className="text-2xs text-fg-muted">
                                {haceCuanto(c.createdAt)} · {c.versionEscala}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="self-start lg:sticky lg:top-4">
            {seleccionado ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-fg-muted">{seleccionado.ruta ?? seleccionado.ancla}</p>
                  {seleccionado.textoDeHoy !== null && areaDe(seleccionado.area) && (
                    <Link
                      href={hrefDeLaEscala(areaDe(seleccionado.area)!, seleccionado.ancla, seleccionado.edicion?.slug ?? null)}
                      className="text-xs font-medium text-info-ink hover:underline"
                    >
                      Ver en la escala →
                    </Link>
                  )}
                </div>
                <TarjetaDeComentario
                  key={seleccionado.id}
                  c={seleccionado}
                  yoEmail={yo.email}
                  esResponsable={esResponsable}
                  textoDeHoy={seleccionado.textoDeHoy}
                  versionVigente={version}
                  acciones={acciones}
                  conAncla
                />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">Elige un comentario.</p>
            )}
          </div>
        </div>
      )}

      <Modal open={!!exportando} onClose={() => setExportando(null)} title="Cambios pendientes, listos para el manual" size="xxl">
        {exportando && (
          <div className="space-y-3">
            <p className="text-sm text-fg-secondary">
              {exportando.filas} {exportando.filas === 1 ? "fila" : "filas"} con las columnas de la tabla «Cambios pendientes» de manual_operacion_escala.md.
            </p>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-muted p-3 font-mono text-xs leading-relaxed text-fg">
              {exportando.markdown}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  window.location.href = "/api/escala/comentarios/exportar?formato=csv";
                }}
              >
                Descargar .csv
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(exportando.markdown);
                  toast.success("Tabla copiada.");
                }}
              >
                Copiar la tabla
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
