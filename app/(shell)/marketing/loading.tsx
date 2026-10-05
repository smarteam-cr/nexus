/**
 * Loading skeleton de la sección Marketing — UNO a nivel de sección.
 *
 * FORMA REAL: el contenedor lo pone marketing/layout.tsx y PERSISTE; cada página abre con su PageHeader (título +
 * descripción, y en casi todas una acción a la derecha) y debajo su contenido. Un solo loading cubre las 8
 * sub-rutas, así que se pinta el DENOMINADOR COMÚN: encabezado con acción + una fila de pestañas + la lista. Las
 * pantallas sin pestañas (Fuentes, Voz, Generación) saltan solo esa fila de 40 px.
 */
import { ListSkeleton, PageHeaderSkeleton, SkeletonTabs } from "@/components/ui";

export default function MarketingLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[32rem] max-w-full" action />
      <SkeletonTabs count={4} />
      <ListSkeleton rows={5} lines={2} />
    </div>
  );
}
