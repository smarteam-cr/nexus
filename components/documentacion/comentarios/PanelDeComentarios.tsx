"use client";

/**
 * components/documentacion/comentarios/PanelDeComentarios.tsx — todos los hilos de la página.
 *
 * Abiertos y resueltos por separado. Cada hilo se despliega en el lugar (así se ven también los
 * que quedaron «sin ubicar», cuyo texto ya no está en la página) y, si está en la página, «Ir al
 * texto» lleva hasta él y abre su globo.
 */
import { useState } from "react";
import { Drawer, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haceCuanto, type HiloVisto } from "@/lib/documentacion/comentarios";
import { useComentarios } from "./ContextoDeComentarios";
import HiloContenido, { CitaDelHilo } from "./HiloContenido";

export default function PanelDeComentarios() {
  const { panel, cerrarPanel } = useComentarios();
  return (
    <Drawer
      open={panel.abierto}
      onClose={cerrarPanel}
      title="Comentarios"
      description="Lo que el equipo marcó en esta página."
      size="sm"
    >
      {/* Remontar con el hilo pedido: arranca en su pestaña y desplegado. */}
      <ContenidoDelPanel key={panel.hiloId ?? "todos"} inicial={panel.hiloId} />
    </Drawer>
  );
}

function ContenidoDelPanel({ inicial }: { inicial: string | null }) {
  const { hilos, abiertos, sinUbicar, irAlTexto } = useComentarios();
  const resueltos = hilos.filter((h) => h.resueltoAt);
  const [pestana, setPestana] = useState<"abiertos" | "resueltos">(() =>
    hilos.find((h) => h.id === inicial)?.resueltoAt ? "resueltos" : "abiertos",
  );
  const [desplegado, setDesplegado] = useState<string | null>(inicial);
  const lista: HiloVisto[] = pestana === "abiertos" ? [...abiertos].reverse() : [...resueltos].reverse();

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-surface-muted p-1 text-xs" role="tablist">
        {(
          [
            ["abiertos", `Abiertos · ${abiertos.length}`],
            ["resueltos", `Resueltos · ${resueltos.length}`],
          ] as const
        ).map(([clave, rotulo]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={pestana === clave}
            onClick={() => setPestana(clave)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 font-medium transition-colors",
              pestana === clave ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          title={pestana === "abiertos" ? "No hay comentarios abiertos" : "Todavía no hay nada resuelto"}
          description={
            pestana === "abiertos" ? "Marca un texto de la página, o pasa el mouse por un bloque, para comentar." : undefined
          }
          variant="dashed"
        />
      ) : (
        <ul className="space-y-2">
          {lista.map((h) => {
            const primero = h.comentarios[0];
            const respuestas = h.comentarios.length - 1;
            const perdido = sinUbicar.has(h.id);
            const abierto = desplegado === h.id;
            return (
              <li key={h.id} className="rounded-lg border border-line bg-surface p-3">
                <CitaDelHilo cita={h.cita} />
                {perdido && (
                  <p className="mt-1.5 text-2xs text-warn-ink">Ese texto ya no está en la página.</p>
                )}
                {primero && !abierto && (
                  <p className="mt-2 line-clamp-2 text-sm text-fg">
                    <span className="font-semibold">{primero.autor.nombre}:</span> {primero.cuerpo}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
                  <span>{haceCuanto(h.createdAt)}</span>
                  {respuestas > 0 && <span>{respuestas === 1 ? "1 respuesta" : `${respuestas} respuestas`}</span>}
                  <button
                    type="button"
                    className="font-medium text-fg-secondary hover:text-fg"
                    onClick={() => setDesplegado(abierto ? null : h.id)}
                  >
                    {abierto ? "Cerrar hilo" : "Ver hilo"}
                  </button>
                  {!perdido && (
                    <button type="button" className="font-medium text-brand hover:underline" onClick={() => irAlTexto(h.id)}>
                      Ir al texto
                    </button>
                  )}
                </div>
                {abierto && (
                  <div className="mt-3 border-t border-line pt-3">
                    <HiloContenido hilo={h} conCita={false} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
