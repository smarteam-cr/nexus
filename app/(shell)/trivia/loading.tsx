/**
 * Esqueleto de /trivia. FORMA REAL (page.tsx): SHELL_DEFAULT · PageHeader con «Nueva trivia» a la derecha · y en un
 * `space-y-6` dos secciones con su h2: «Tus trivias» (tabla de 4 columnas) y «Partidas» (tabla de 7).
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function TituloDeSeccion({ ancho }: { ancho: string }) {
  // h2 text-sm: una línea de 20 px con la barra centrada.
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={`h-3 ${ancho}`} />
    </div>
  );
}

export default function TriviasLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-[36rem] max-w-full" action />
      <div className="space-y-6">
        <section className="space-y-4">
          <TituloDeSeccion ancho="w-24" />
          <TableSkeleton columns={4} rows={3} />
        </section>
        <section className="space-y-4">
          <TituloDeSeccion ancho="w-20" />
          <TableSkeleton columns={7} rows={4} />
        </section>
      </div>
    </div>
  );
}
