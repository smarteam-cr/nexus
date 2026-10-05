/**
 * Loading skeleton de /clients — cubre SOLO la ventana pre-auth (~100ms).
 *
 * La page es un shell rápido (auth + rol + count) con dos zonas suspendidas: la tabla a la
 * izquierda y el panel «Qué sigue / Necesitan atención» a la derecha (rediseño del 2026-10-04,
 * dos columnas como el listado de la preventa). Apenas resuelve el rol, page.tsx monta el
 * fallback CORRECTO por rol (con «De quién es» para CSE, sin él para SUPER_ADMIN) — algo que este
 * archivo no puede hacer (un loading.tsx es un fallback estático: no lee cookies ni conoce el rol).
 *
 * Acá se pinta la variante mayoritaria (CSE) reutilizando LAS MISMAS piezas que los fallbacks
 * (`ClientsTableZoneSkeleton` y `PanelDeLaCarteraSkeleton`): el traspaso loading→fallback es
 * skeleton→skeleton.
 */
import { PageHeaderSkeleton } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { ClientsTableZoneSkeleton, PanelDeLaCarteraSkeleton } from "./ClientsTable";

export default function ClientsLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <div className={cn(SHELL_DEFAULT, "min-w-0 flex-1 pb-12")}>
        <PageHeaderSkeleton titleWidth="w-24" descWidth="w-[28rem]" action />
        <ClientsTableZoneSkeleton showPills />
      </div>
      {/* La MISMA columna que page.tsx: con el panel cerrado (cookie `nexus-panel`), el skeleton
          ya lo pinta cerrado en vez de abrirlo 340 px y cerrarlo de un salto al cargar. */}
      <PanelLateral etiqueta="Cartera" ancho="lg:w-[340px]">
        <PanelDeLaCarteraSkeleton />
      </PanelLateral>
    </div>
  );
}
