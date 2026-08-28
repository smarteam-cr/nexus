/**
 * Loading de /finanzas/costos/planillas/calendario.
 *
 * ⚠ Tiene forma PROPIA y no hereda la de las hojas de costos: lo que llega es una grilla
 * de 12 meses × 2 quincenas dentro de una fila por persona, y un skeleton de lista
 * prometería una pantalla distinta de la que aparece.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const barra = "rounded bg-surface-muted animate-pulse";

export default function CalendarioPlanillaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="flex gap-2 mb-3">
        <div className={`${barra} h-8 w-24`} />
        <div className={`${barra} h-8 w-16`} />
        <div className={`${barra} h-8 w-16`} />
      </div>

      <div className="mb-5 space-y-2">
        <div className={`${barra} h-7 w-64`} />
        <div className={`${barra} h-4 w-full max-w-2xl`} />
      </div>

      <div className={`${barra} h-12 w-full mb-3`} />

      {/* La primera persona viene abierta: su grilla es lo que más tarda en llegar. */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden mb-2">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`${barra} h-4 w-40`} />
          <div className={`${barra} h-3 w-24`} />
          <div className={`${barra} h-3 w-32 ml-auto`} />
        </div>
        <div className="border-t border-line px-4 py-3 space-y-2">
          <div className={`${barra} h-3 w-72`} />
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[auto_repeat(12,minmax(72px,1fr))] gap-1 min-w-[900px]">
              <div />
              {Array.from({ length: 12 }, (_, i) => (
                <div key={`m${i}`} className={`${barra} h-3 w-8 mx-auto`} />
              ))}
              {Array.from({ length: 2 }, (_, q) => (
                <div key={`q${q}`} className="contents">
                  <div className={`${barra} h-3 w-12`} />
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={`${q}-${i}`} className={`${barra} h-10`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface px-4 py-3 mb-2 flex items-center gap-3">
          <div className={`${barra} h-4 w-40`} />
          <div className={`${barra} h-3 w-24`} />
          <div className={`${barra} h-3 w-32 ml-auto`} />
        </div>
      ))}
    </div>
  );
}
