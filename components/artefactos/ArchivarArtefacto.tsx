"use client";

/**
 * components/artefactos/ArchivarArtefacto.tsx — archivar un artefacto del proyecto, con su confirmación y su «Deshacer»
 * (Elías, 12 nov: se archiva todo menos el Resumen, también el documento de siempre y el cronograma). Lo usan la barra de
 * un documento («Más › Archivar») y el título del cronograma y de los Cuestionarios, que no tienen barra.
 *
 * Archivar es el DELETE de /artefactos/[canvasId] (lib/artefactos/copias-server.ts › archivarArtefacto); recuperarlo, el
 * PATCH con `archivado: false`, desde el aviso. Los Cuestionarios de siempre no tienen documento: primero toman uno
 * (`crear`), como cuando se les cambia el nombre, y ese es el que se archiva.
 *
 * UI interna: primitivas de components/ui, tokens semánticos y tuteo.
 */
import { useState, type ReactNode } from "react";
import { ConfirmDialog, Menu } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

export interface PedidoDeArchivar {
  nombre: string;
  /** El documento a archivar; sin él, `crear` lo arma primero (los Cuestionarios de siempre). */
  canvasId?: string | null;
  crear?: () => Promise<string | null>;
  /** El cronograma: archivar su documento no toca sus fechas ni lo que el cliente ya ve. */
  esCronograma?: boolean;
  /** Un entregable: si el cliente lo ve en su portal, deja de verlo. */
  loVeElCliente?: boolean;
}

/**
 * El texto de la confirmación: el mismo de las copias, y un entregable avisa que sale del portal del cliente. El del
 * cronograma dice lo que cambia (sus instrucciones viven en el documento) y lo que NO: sus fechas viven en el proyecto
 * (`ProjectTimeline`), y de ahí las leen el cobro, las alertas, los agentes y la vista del cliente.
 */
export function textoDeLaConfirmacion(p: Pick<PedidoDeArchivar, "esCronograma" | "loVeElCliente">): string {
  if (p.esCronograma) {
    return "Sale de la lista y sus «Instrucciones adicionales» dejan de aplicarse. Nada se borra y sus fechas siguen mandando: el cobro, las alertas y lo que el cliente ya ve no cambian.";
  }
  const base = "Sale de la lista y los agentes dejan de leerlo. Nada se borra, pero si tiene enlace deja de abrir y, al recuperarlo, hay que crear uno nuevo.";
  return p.loVeElCliente ? `${base} Si el cliente lo ve en su portal, deja de verlo.` : base;
}

export function useArchivarArtefacto({
  projectId,
  onArchivada,
  onRecuperada,
}: {
  projectId: string;
  /** Ya archivado: el panel vuelve a leer la lista y sale del documento. */
  onArchivada: () => void;
  /** Volvió con «Deshacer». */
  onRecuperada: () => void | Promise<unknown>;
}): { pedir: (p: PedidoDeArchivar) => void; dialogo: ReactNode } {
  const [pedido, setPedido] = useState<PedidoDeArchivar | null>(null);
  const toast = useToast();

  const recuperar = async (canvasId: string, nombre: string) => {
    const r = await fetch(`/api/projects/${projectId}/artefactos/${canvasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archivado: false }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string; comoCopia?: boolean } | null;
    if (!r?.ok) return toast.error(j?.error ?? "No se pudo recuperar.");
    toast.success(`«${nombre}» volvió a la lista.`);
    await onRecuperada();
  };

  const archivar = async (p: PedidoDeArchivar) => {
    setPedido(null);
    try {
      const canvasId = p.canvasId ?? (await p.crear?.()) ?? null;
      if (!canvasId) return toast.error("No se pudo archivar.");
      const r = await fetch(`/api/projects/${projectId}/artefactos/${canvasId}`, { method: "DELETE" }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      if (!r?.ok) return toast.error(j?.error ?? "No se pudo archivar.");
      toast.success(p.esCronograma ? `«${p.nombre}» quedó archivado: ya no está en la lista.` : `«${p.nombre}» quedó archivado: ya no está en la lista ni lo leen los agentes.`, {
        action: { label: "Deshacer", onClick: () => void recuperar(canvasId, p.nombre) },
      });
      onArchivada();
    } catch {
      toast.error("Error de conexión.");
    }
  };

  const dialogo = (
    <ConfirmDialog
      open={pedido !== null}
      title={pedido ? `¿Archivar «${pedido.nombre}»?` : ""}
      description={pedido ? textoDeLaConfirmacion(pedido) : ""}
      confirmLabel="Archivar"
      onCancel={() => setPedido(null)}
      onConfirm={() => {
        if (pedido) void archivar(pedido);
      }}
    />
  );
  return { pedir: setPedido, dialogo };
}

/** «Más › Archivar», para los artefactos sin barra (el cronograma y los Cuestionarios). */
export function MenuDeArchivar({ onArchivar }: { onArchivar: () => void }) {
  return (
    <Menu
      align="end"
      triggerTitle="Más"
      trigger={
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-hover px-2.5 py-1 text-xs text-fg-secondary hover:text-fg">
          Más
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      }
      items={[{ key: "archivar", label: "Archivar", danger: true, onSelect: onArchivar }]}
    />
  );
}
