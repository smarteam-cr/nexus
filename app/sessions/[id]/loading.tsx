/**
 * Loading skeleton del detalle de una sesión (/sessions/[id]).
 *
 * Antes esta pantalla quedaba en blanco 1-2s mientras el server cargaba la
 * sesión + transcript + minuta + acciones + categorización. F1.2.
 */
import { Skeleton, SkeletonText } from "@/components/ui";

export default function SessionDetailLoading() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Volver + título + meta */}
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-2/3" delay={60} />
          <Skeleton className="h-3 w-40" delay={120} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-gray-800 pb-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" delay={50} />
          <Skeleton className="h-4 w-24" delay={100} />
          <Skeleton className="h-4 w-14" delay={150} />
        </div>

        {/* Contenido (transcript) */}
        <SkeletonText lines={10} />
      </div>
    </div>
  );
}
