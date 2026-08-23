/**
 * Loading skeleton de /sales/sicop (Análisis de licitación).
 *
 * FORMA REAL (page.tsx → SicopClient): `SHELL_DEFAULT` · migas «Ventas › SICOP» arriba del
 * título (por eso la línea fina extra: PageHeaderSkeleton no las dibuja) · encabezado con el
 * contador a la derecha · una `Table` con toolbar (buscador + tabs + 2 selects + los dos
 * botones de análisis) y 9 columnas · y la línea de «mostrando X de Y».
 *
 * La espera real la manda HubSpot —pipeline, búsqueda, notas por lote y owners— más dos
 * queries a la base, así que este skeleton se ve de verdad: no es decorativo.
 *
 * ⚠ Se rehízo el 2026-08-23 con la pantalla: antes prometía un acordeón por etapa que ya no
 * existe, y un skeleton que anuncia otra forma es peor que ninguno.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SicopLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      {/* Las migas del PageHeader real («Ventas › SICOP»), que el skeleton de header no dibuja. */}
      <Skeleton className="h-2.5 w-28 mb-2" />
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96" action />

      {/* 9 columnas: marca · licitación · score · confianza · encaje · ganable · monto ·
          cierre · etapa. Dos acciones: «Analizar» y «A fondo». */}
      <TableSkeleton columns={9} rows={8} toolbar toolbarActions={2} />

      {/* La línea de «mostrando X de Y · N ya cerradas · M descartadas». */}
      <Skeleton className="h-2.5 w-80 mt-4" delay={220} />
    </div>
  );
}
