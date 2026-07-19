/**
 * Loading skeleton de /clients — cubre SOLO la ventana pre-auth (~100ms).
 *
 * La page es un shell rápido (auth + rol + count) con la zona de la tabla suspendida:
 * apenas resuelve el rol, monta el fallback CORRECTO por rol (con pills para CSE, sin
 * pills para SUPER_ADMIN) elegido por page.tsx — algo que este archivo no puede hacer
 * (un loading.tsx es un fallback estático: no lee cookies ni conoce el rol).
 *
 * Acá se pinta la variante mayoritaria (CSE, con pills) reutilizando LA MISMA pieza que
 * el fallback (`ClientsTableZoneSkeleton`): el traspaso loading→fallback es
 * skeleton→skeleton y solo el SA ve desvanecerse las pills, a los ~100ms.
 */
import { PageHeaderSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { ClientsTableZoneSkeleton } from "./ClientsTable";

export default function ClientsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-28" action />
      <ClientsTableZoneSkeleton showPills />
    </div>
  );
}
