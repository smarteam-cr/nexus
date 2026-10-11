"use client";

/**
 * components/tareas/InicioDeTareas.tsx — el inicio de Tareas en cuatro pasos (R1). Se ve la primera vez que alguien
 * entra y desde «Cómo funciona». El texto vive en lib/tareas/inicio.ts.
 */
import { BotonAzul, BotonBlanco, BotonTexto, PasosNumerados } from "@/components/ui/sistema";
import { useRecorridos } from "@/components/recorridos/contexto";
import { LINEA_DEL_INICIO, PASOS_DEL_INICIO, PIE_DEL_INICIO, TITULAR_DEL_INICIO } from "@/lib/tareas/inicio";

export function InicioDeTareas({ onEmpezar, onLeer }: { onEmpezar: () => void; onLeer: () => void }) {
  const recorridos = useRecorridos();
  return (
    <section aria-label="Cómo funciona Tareas" data-recorrido="tareas.inicio" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-7">
      <div className="max-w-[720px] space-y-1">
        <h2 className="text-lg font-semibold leading-[26px] text-fg">{TITULAR_DEL_INICIO}</h2>
        <p className="text-sm text-fg-secondary">{LINEA_DEL_INICIO}</p>
      </div>
      <PasosNumerados columnas={4} pasos={PASOS_DEL_INICIO.map((p) => ({ titulo: p.titulo, texto: p.texto }))} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{PIE_DEL_INICIO}</p>
        {recorridos && (
          <BotonTexto
            onClick={() => {
              onEmpezar();
              recorridos.iniciar("tareas");
            }}
          >
            Ver el recorrido
          </BotonTexto>
        )}
        <BotonBlanco onClick={onLeer}>Leer una reunión</BotonBlanco>
        <BotonAzul onClick={onEmpezar}>Empezar</BotonAzul>
      </div>
    </section>
  );
}
