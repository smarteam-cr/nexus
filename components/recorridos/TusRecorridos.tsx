"use client";

/**
 * «Tus recorridos» — el cajón que abre «Recorridos» en el menú del avatar (tablero 3 de
 * «Recorridos · diseño»): todos los de tu rol, agrupados, con qué viste y qué cambió desde que lo
 * viste. «Ver» arranca el recorrido si ya estás en su pantalla; si no, te lleva y arranca al llegar.
 */
import type { TeamRole } from "@prisma/client";
import { Drawer } from "@/components/ui/Drawer";
import { cn } from "@/lib/cn";
import { ROTULO } from "./estilos";
import {
  estadoDe,
  NOMBRE_DEL_GRUPO,
  ORDEN_DE_GRUPOS,
  pasosDelRol,
  type Recorrido,
  type Vistos,
} from "@/lib/recorridos";

export function TusRecorridos({
  abierta,
  onCerrar,
  recorridos,
  rol,
  vistos,
  actual,
  onVer,
  onReiniciar,
}: {
  abierta: boolean;
  onCerrar: () => void;
  recorridos: Recorrido[];
  rol: TeamRole | null;
  vistos: Vistos;
  /** El recorrido de lo que se está mirando (la pieza abierta, o la pantalla). */
  actual: string | null;
  onVer: (id: string) => void;
  onReiniciar: () => void;
}) {
  const total = recorridos.length;
  const vistosAlDia = recorridos.filter((r) => estadoDe(r, vistos) === "visto").length;
  const cambiaron = recorridos.filter((r) => estadoDe(r, vistos) === "cambio").length;

  return (
    <Drawer
      open={abierta}
      onClose={onCerrar}
      title="Tus recorridos"
      description={`Tienes ${total === 1 ? "1 recorrido" : `${total} recorridos`}. Cada uno te lleva a su pantalla y te la muestra paso a paso.`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-fg-muted">Uno nuevo o que cambió te avisa con un punto azul en su pantalla.</span>
          <button
            type="button"
            onClick={onReiniciar}
            className="flex-none rounded py-0.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Volver a mostrar todos
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {total > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="font-semibold text-fg-secondary">
                Viste {vistosAlDia} de {total}
              </span>
              {cambiaron > 0 && (
                <span className="text-fg-muted">
                  {cambiaron === 1 ? "1 cambió desde que lo viste" : `${cambiaron} cambiaron desde que los viste`}
                </span>
              )}
            </div>
            <div aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
              {recorridos.map((r) => (
                <span key={r.id} className={cn("h-1 rounded-full", estadoDe(r, vistos) === "visto" ? "bg-success" : "bg-line")} />
              ))}
            </div>
          </div>
        )}

        {ORDEN_DE_GRUPOS.map((grupo) => {
          const delGrupo = recorridos.filter((r) => r.grupo === grupo);
          if (delGrupo.length === 0) return null;
          return (
            <section key={grupo} className="flex flex-col gap-0.5">
              <h3 className={cn(ROTULO, "px-2 pb-1")}>{NOMBRE_DEL_GRUPO[grupo]}</h3>
              {delGrupo.map((r) => {
                const estado = estadoDe(r, vistos);
                const aqui = r.id === actual;
                const pasos = pasosDelRol(r, rol).length;
                const meta = [aqui ? "Estás aquí" : null, r.descripcion, `${pasos} ${pasos === 1 ? "paso" : "pasos"}`]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={r.id} className={cn("flex items-center gap-3 rounded-lg px-2 py-2.5", aqui && "bg-surface-hover")}>
                    {estado === "visto" ? (
                      <span
                        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-success-line bg-success-surface text-[11px] font-bold text-success-ink"
                        title="Ya lo viste"
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="inline-flex h-5 w-5 flex-none items-center justify-center" title={estado === "cambio" ? "Cambió desde que lo viste" : "No lo has visto"}>
                        <span className="h-2 w-2 rounded-full bg-brand" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-fg">{r.titulo}</span>
                        {estado === "cambio" && (
                          <span className="rounded-full border border-info-line bg-info-surface px-2 text-[11px] font-semibold text-brand">Cambió</span>
                        )}
                      </span>
                      <span className="text-xs text-fg-muted">{meta}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onVer(r.id)}
                      className="flex-none rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      {estado === "visto" ? "Verlo de nuevo" : aqui ? "Ver ahora" : "Ver"}
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
