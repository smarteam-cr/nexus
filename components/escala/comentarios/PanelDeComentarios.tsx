"use client";

/**
 * components/escala/comentarios/PanelDeComentarios.tsx — los comentarios de UN identificador de la
 * escala (dimensión, nivel o criterio), en el panel lateral.
 *
 * Arriba, qué se está comentando, con su texto de hoy (y, en un criterio de riesgo, el mensaje que
 * ve el cliente). Después los comentarios —abiertos primero— y al final el formulario. Cada cambio
 * vuelve a pedir la lista y avisa arriba para que los contadores se actualicen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer, EmptyState, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/fetch-json";
import { estaEnLaCelda, resolverAncla } from "@/lib/escala/documento/anclas";
import type { Perfil } from "@/lib/escala/documento/perfil";
import type { ComentarioVisto } from "@/lib/escala/comentarios/reglas";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { useEscala } from "../contexto";
import { MetaDelCriterio, TextoConPalabras } from "../piezas";
import CompositorDeComentario from "./CompositorDeComentario";
import TarjetaDeComentario, { type AccionesDeComentario } from "./TarjetaDeComentario";

const ORDEN: Record<string, number> = { abierto: 0, respondido: 1, cambio_pendiente: 2, descartado: 3 };

const ETIQUETA_DE_ANCLA = { dimension: "Dimensión", nivel: "Nivel", criterio: "Criterio" } as const;

export default function PanelDeComentarios({
  ancla,
  datos,
  perfil,
  onCerrar,
  onCambio,
}: {
  ancla: string | null;
  datos: DatosDeLaVista;
  perfil: Perfil;
  onCerrar: () => void;
  /** Algo cambió: refrescar los contadores de la pantalla. */
  onCambio: () => void;
}) {
  const { yo, esResponsable, almacen, comentariosDisponibles } = useEscala();
  const toast = useToast();
  // La lista se guarda CON el ancla que la pidió: al cambiar de ancla, la vieja deja de valer sola
  // (sin vaciar el estado dentro de un efecto).
  const [lista, setLista] = useState<{ ancla: string; items: ComentarioVisto[] } | null>(null);
  const [error, setError] = useState<{ ancla: string; mensaje: string } | null>(null);

  const escalaDelArea = useMemo(() => ({ areas: [datos.area], niveles: datos.niveles }), [datos.area, datos.niveles]);
  const resuelta = ancla ? resolverAncla(escalaDelArea, ancla) : null;

  /**
   * Qué se pide. Un NIVEL trae además los comentarios de sus criterios que ya no existen en esta
   * versión (retirados): en la matriz no tienen fila, y la evidencia no puede quedar invisible.
   */
  const pedir = useCallback(
    async (a: string): Promise<ComentarioVisto[]> => {
      const r = resolverAncla(escalaDelArea, a);
      if (r?.tipo !== "nivel" || !r.nivel) return almacen.listar({ ancla: a });
      const delArea = await almacen.listar({ area: r.area.id });
      return delArea.filter(
        (c) => c.ancla === a || (estaEnLaCelda(c.ancla, r.dimension.id, r.nivel!.letra) && !resolverAncla(escalaDelArea, c.ancla)),
      );
    },
    [almacen, escalaDelArea],
  );

  /** Después de un cambio: la lista de nuevo (el error lo avisa quien corrió el cambio). */
  const cargar = useCallback(async () => {
    if (!ancla || !comentariosDisponibles) return;
    setLista({ ancla, items: await pedir(ancla) });
  }, [ancla, pedir, comentariosDisponibles]);

  /* La carga al abrir un ancla. El estado se escribe cuando llega la respuesta, no en el cuerpo
     del efecto (mismo patrón que los comentarios de Documentación). */
  useEffect(() => {
    if (!ancla || !comentariosDisponibles) return;
    let vigente = true;
    pedir(ancla)
      .then((items) => {
        if (!vigente) return;
        setLista({ ancla, items });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        setError({ ancla, mensaje: e instanceof ApiError ? e.message : "No pude traer los comentarios." });
      });
    return () => {
      vigente = false;
    };
  }, [ancla, pedir, comentariosDisponibles]);

  const comentarios = lista && lista.ancla === ancla ? lista.items : null;
  const mensajeDeError = error && error.ancla === ancla ? error.mensaje : null;

  /** Envuelve una escritura: avisa si falla, recarga y refresca los contadores si sale bien. */
  const hacer = useCallback(
    async (accion: () => Promise<unknown>, exito?: string): Promise<boolean> => {
      try {
        await accion();
        if (exito) toast.success(exito);
        await cargar();
        onCambio();
        return true;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
        return false;
      }
    },
    [cargar, onCambio, toast],
  );

  const acciones: AccionesDeComentario = {
    responder: (id, cuerpo) => hacer(() => almacen.responder(id, cuerpo)),
    editar: (id, d) => hacer(() => almacen.editar(id, d)),
    borrar: (id) => hacer(() => almacen.borrar(id), "Comentario borrado."),
    editarRespuesta: (id, cuerpo) => hacer(() => almacen.editarRespuesta(id, cuerpo)),
    borrarRespuesta: (id) => hacer(() => almacen.borrarRespuesta(id)),
    cambiarEstado: (id, estado) => hacer(() => almacen.cambiarEstado(id, estado), "Estado actualizado."),
  };

  const ordenados = (comentarios ?? []).slice().sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.createdAt.localeCompare(a.createdAt));

  return (
    <Drawer open={!!ancla} onClose={onCerrar} size="lg" title={resuelta ? resuelta.ruta : "Comentarios"} description={resuelta ? ETIQUETA_DE_ANCLA[resuelta.tipo] : undefined}>
      {!resuelta ? (
        <EmptyState title="Ese identificador no existe en esta versión" description={`«${ancla}» no está en la ${datos.version}.`} variant="dashed" />
      ) : (
        <div className="space-y-4">
          <section aria-label="Lo que se comenta" className="space-y-2 rounded-xl border border-line bg-surface-muted px-3.5 py-3">
            <span className="rounded bg-info-surface px-1.5 py-0.5 font-mono text-xs text-info-ink">{resuelta.id}</span>
            {resuelta.tipo === "criterio" && resuelta.criterio ? (
              <>
                <p className="text-sm leading-relaxed text-fg">
                  <TextoConPalabras texto={resuelta.criterio.texto} palabras={datos.terminos} />
                </p>
                <MetaDelCriterio criterio={resuelta.criterio} datos={datos} />
                {resuelta.criterio.riesgo && datos.riesgos[resuelta.id] && (
                  <p className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-1.5 text-xs text-warn-ink">
                    <span className="font-semibold">Si no se cumple, el cliente ve: </span>
                    {datos.riesgos[resuelta.id]}
                  </p>
                )}
              </>
            ) : resuelta.tipo === "nivel" && resuelta.nivel ? (
              <>
                <p className="text-sm font-medium leading-relaxed text-fg">{resuelta.nivel.descripcion}</p>
                {resuelta.nivel.resultado && (
                  <p className="text-xs leading-relaxed text-success-ink">
                    <span className="font-semibold">Resultado · </span>
                    {resuelta.nivel.resultado}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-fg">{resuelta.dimension.pregunta}</p>
                {resuelta.dimension.descripcion && (
                  <p className="text-xs leading-relaxed text-fg-secondary">
                    <TextoConPalabras texto={resuelta.dimension.descripcion} palabras={datos.terminos} />
                  </p>
                )}
                <p className="text-xs leading-relaxed text-warn-ink">
                  <span className="font-semibold">Costo de quedarse · </span>
                  {resuelta.dimension.costoDeQuedarse}
                </p>
              </>
            )}
          </section>

          {!comentariosDisponibles ? (
            <EmptyState
              title="Los comentarios todavía no están disponibles"
              description="La escala se puede leer, pero falta aplicar el SQL de los comentarios."
              variant="dashed"
            />
          ) : mensajeDeError ? (
            <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger-ink">{mensajeDeError}</p>
          ) : comentarios === null ? (
            <p className="text-sm text-fg-muted">Cargando…</p>
          ) : ordenados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">Nadie ha comentado aquí todavía.</p>
          ) : (
            <div className="space-y-3">
              {ordenados.map((c) => (
                <TarjetaDeComentario
                  key={c.id}
                  c={c}
                  yoEmail={yo.email}
                  esResponsable={esResponsable}
                  // Lo que dice hoy su ancla leída con la edición desde la que se comentó: lo manda el
                  // servidor. Comparar contra lo que se ve ACÁ marcaría como «cambió» un comentario
                  // hecho desde otra edición, que solo lee el mismo criterio con otras palabras.
                  textoDeHoy={c.textoDeHoy}
                  versionVigente={datos.version}
                  acciones={acciones}
                  conAncla={c.ancla !== resuelta.id}
                />
              ))}
            </div>
          )}

          {comentariosDisponibles && (
            <div className="border-t border-line pt-4">
              <CompositorDeComentario
                key={ancla}
                ancla={resuelta.id}
                version={datos.version}
                edicion={datos.edicion ? { slug: datos.edicion.slug, nombre: datos.edicion.nombre } : null}
                perfilDeLaPantalla={perfil}
                cargarClientes={() => almacen.clientes()}
                onEnviar={(nuevo) => hacer(() => almacen.crear(nuevo), "Comentario guardado.")}
              />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
