"use client";

/**
 * components/documentacion/comentarios/ComentariosDeLaBase.tsx — los comentarios abiertos de TODA la
 * documentación, agrupados por página. Lo abre el contador de arriba del árbol: es lo que tiene
 * pendiente quien resuelve (Súper admin y CSL), sin tener que entrar página por página.
 *
 * Cada hilo lleva a su página con `?hilo=<id>`, que abre el panel con ese hilo desplegado.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, Modal, SkeletonText, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import { haceCuanto, type HiloAbiertoDeLaBase } from "@/lib/documentacion/comentarios";
import { IconoDePagina } from "../iconos";
import { citaParaMostrar } from "./extension";

export default function ComentariosDeLaBase({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const toast = useToast();
  const [abiertos, setAbiertos] = useState<HiloAbiertoDeLaBase[] | null>(null);

  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    fetchJson<{ abiertos: HiloAbiertoDeLaBase[] }>("/api/documentacion/comentarios")
      .then((r) => vigente && setAbiertos(r.abiertos))
      .catch((e: unknown) => {
        if (vigente) toast.error(e instanceof Error ? e.message : "No se pudieron cargar los comentarios.");
      });
    return () => {
      vigente = false;
    };
  }, [abierta, toast]);

  const porPagina = new Map<string, HiloAbiertoDeLaBase[]>();
  for (const a of abiertos ?? []) porPagina.set(a.pagina.slug, [...(porPagina.get(a.pagina.slug) ?? []), a]);

  return (
    <Modal
      open={abierta}
      onClose={onCerrar}
      title="Comentarios abiertos"
      description="Lo que falta resolver en toda la documentación, por página."
      size="md"
    >
      {abiertos === null ? (
        <SkeletonText lines={4} />
      ) : abiertos.length === 0 ? (
        <EmptyState title="No hay comentarios abiertos" variant="dashed" />
      ) : (
        <div className="space-y-4">
          {[...porPagina.values()].map((grupo) => {
            const { pagina } = grupo[0];
            return (
              <section key={pagina.slug}>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <IconoDePagina icono={pagina.icono} className="h-3.5 w-3.5" tamanoEmoji="text-xs" />
                  {pagina.titulo}
                  <span className="text-2xs font-normal text-fg-muted">· {grupo.length}</span>
                </h3>
                <ul className="space-y-1.5">
                  {grupo.map(({ hilo }) => {
                    const primero = hilo.comentarios[0];
                    return (
                      <li key={hilo.id}>
                        <Link
                          href={`/documentacion/${pagina.slug}?hilo=${hilo.id}`}
                          onClick={onCerrar}
                          className="block rounded-lg border border-line px-3 py-2 transition-colors hover:bg-surface-hover"
                        >
                          <p className="line-clamp-1 text-xs text-fg-secondary">
                            {hilo.cita ? `«${citaParaMostrar(hilo.cita)}»` : "Todo el bloque"}
                          </p>
                          {primero && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-fg">
                              <span className="font-semibold">{primero.autor.nombre}:</span> {primero.cuerpo}
                            </p>
                          )}
                          <p className="mt-0.5 text-2xs text-fg-muted">
                            {haceCuanto(hilo.createdAt)}
                            {hilo.comentarios.length > 1 ? ` · ${hilo.comentarios.length - 1} respuestas` : ""}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
