/**
 * Loading skeleton del WORKSPACE del cliente (/clients/[id]).
 *
 * Llena el slot `{children}` del layout (el header del cliente ya lo pinta el layout,
 * que queda montado durante la carga) mientras el server resuelve client + projects +
 * hubspotAccount + ensureStrategyProject.
 *
 * Pinta la MISMA pieza (`WorkspaceSkeleton`) que el gate client-side de
 * ProjectCanvasPanel: los dos se ven uno tras otro, así que hablar vocabularios
 * distintos hacía que la pantalla cambiara de forma dos veces antes de mostrar nada.
 * Sin `max-w-*`: el panel real es de ancho completo (antes también saltaba en ancho).
 */
import { SkeletonTabs } from "@/components/ui";
import { WorkspaceSkeleton } from "@/components/clients/skeletons";

export default function ClientWorkspaceLoading() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      <div className="flex-1 overflow-y-auto">
        <SkeletonTabs count={3} className="px-6" />
        <WorkspaceSkeleton />
      </div>
    </div>
  );
}
