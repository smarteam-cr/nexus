/**
 * El modelo de comisiones (/finanzas/modelo-de-comisiones). Caparazón: la cabecera y el estado vacío mientras se define el modelo.
 * Server Component: todavía no hay nada interactivo.
 */
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";

export default function ModeloDeComisiones() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="El modelo con el que Smarteam calcula las comisiones: qué porcentaje corresponde, cuándo aplica y hasta cuánto puede llegar."
      />
      <EmptyState
        variant="dashed"
        icon={
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 5L5 19M7.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm9 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
          </svg>
        }
        title="Todavía no hay un modelo de comisiones"
        description="Aquí vas a definir los porcentajes, cuándo aplica cada uno y el máximo que puede pagarse. Lo que se le paga a cada vendedor sigue en Comisiones de vendedor."
        action={
          <Link href="/finanzas/costos/comisiones-vendedor" className="text-[13px] font-semibold text-brand hover:text-brand-light">
            Ver Comisiones de vendedor →
          </Link>
        }
      />
    </div>
  );
}
