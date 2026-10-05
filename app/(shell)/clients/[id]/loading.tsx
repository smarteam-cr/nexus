/**
 * Loading skeleton del WORKSPACE del cliente (/clients/[id]).
 *
 * Llena el slot `{children}` del layout (el header del cliente ya lo pinta el layout,
 * que queda montado durante la carga) mientras el server resuelve client + projects +
 * hubspotAccount + ensureStrategyProject.
 *
 * Las tres columnas de la ficha (rediseño del 2026-10-04): el riel, el centro y el panel. El
 * centro es la MISMA pieza (`WorkspaceSkeleton`) que el gate client-side de ProjectCanvasPanel:
 * los dos se ven uno tras otro, así que hablar vocabularios distintos hacía que la pantalla
 * cambiara de forma dos veces antes de mostrar nada.
 */
import {
  PanelDeLaFichaSkeleton,
  RielDelClienteSkeleton,
  WorkspaceSkeleton,
} from "@/components/clients/skeletons";
import PanelLateral from "@/components/ui/PanelLateral";

export default function ClientWorkspaceLoading() {
  return (
    <div className="min-h-full bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_auto]">
      <aside className="border-b border-line bg-surface px-3 py-4 lg:h-[calc(100vh-57px)] lg:border-b-0 lg:border-r">
        <RielDelClienteSkeleton />
      </aside>
      <main className="min-w-0">
        <WorkspaceSkeleton />
      </main>
      {/* La MISMA columna que WorkspaceClient (cookie `nexus-panel`): cerrada, el skeleton ya la
          pinta cerrada. La tercera columna de la grilla es `auto`: la mide el panel. */}
      <PanelLateral etiqueta="Panel" breakpoint="xl" ancho="xl:w-[18.75rem]" className="py-5" fijas="lg:col-span-2 xl:col-span-1">
        <PanelDeLaFichaSkeleton />
      </PanelLateral>
    </div>
  );
}
