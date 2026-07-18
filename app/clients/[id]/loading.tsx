/**
 * Loading skeleton del WORKSPACE del cliente (/clients/[id]).
 *
 * Llena el slot `{children}` del layout (el header del cliente ya lo pinta el
 * layout, que queda montado durante la carga). Antes esta pantalla quedaba en
 * blanco mientras el server resolvía client + projects + hubspotAccount +
 * ensureStrategyProject — la superficie que el CSE más abre. F1.1.
 */
import { Skeleton } from "@/components/ui";

export default function ClientWorkspaceLoading() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      <div className="flex-1 overflow-y-auto">
        {/* Tab bar */}
        <div className="border-b border-line px-6 flex items-center gap-4 h-[45px]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" delay={60} />
          <Skeleton className="h-4 w-16" delay={120} />
          <Skeleton className="h-4 w-28 ml-auto" delay={180} />
        </div>

        {/* Contenido: widget GPS + canvas */}
        <div className="px-6 py-6 space-y-6 max-w-5xl">
          <Skeleton className="h-28 w-full" rounded="xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-72 w-full" rounded="xl" delay={80} />
          </div>
        </div>
      </div>
    </div>
  );
}
