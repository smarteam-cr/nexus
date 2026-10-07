/**
 * components/cobranza/AvisoProyectoPausado.tsx — el aviso de «proyecto pausado» antes de facturar (2026-10-06).
 *
 * Un solo componente para la cola de cobros, el diálogo de «Marcar facturado», las alertas y el cronograma de la cuenta:
 * el texto es el que pidió Elías, tal cual, y vive en `lib/cobranza/proyecto-pausado.ts`. No frena nada.
 */
import { AVISO_PROYECTO_PAUSADO, type ProyectoPausadoDTO } from "@/lib/cobranza/proyecto-pausado";

export default function AvisoProyectoPausado({
  proyecto,
  compacto = false,
}: {
  proyecto: ProyectoPausadoDTO;
  /** En una fila de lista: una línea. En un diálogo: la caja entera con el proyecto y el CSE. */
  compacto?: boolean;
}) {
  const quien = `Proyecto: ${proyecto.nombre}${proyecto.cse ? ` · CSE: ${proyecto.cse}` : ""}`;
  if (compacto) {
    return (
      <p role="note" title={quien} className="mt-1 text-[11px] text-warn-ink">
        <span aria-hidden className="mr-1">⏸</span>
        {AVISO_PROYECTO_PAUSADO}
      </p>
    );
  }
  return (
    <div role="note" className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2">
      <p className="text-xs font-medium text-warn-ink">
        <span aria-hidden className="mr-1">⏸</span>
        {AVISO_PROYECTO_PAUSADO}
      </p>
      <p className="mt-0.5 text-[11px] text-warn-ink/80">{quien}</p>
    </div>
  );
}
