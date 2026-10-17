"use client";

/**
 * SprintsQueLidera — «Lidera los sprints de», en el modal de Equipo (2026-10-16, fase 0.1 de
 * docs/nexus-sistema-de-trabajo-plan.md).
 *
 * El líder de un sprint asigna directo en él, reparte «Por asignar», revisa la semana con su equipo y recibe los
 * pedidos que le hacen al equipo. Una persona puede liderar más de un sprint, y uno que no es el de su área. No da
 * permisos sobre clientes: decide quién lleva cada sprint en Tareas (`TeamMember.lideraEquipos`).
 *
 * `valor`: null = no se tocó en este modal (se muestra lo guardado y no se manda).
 */
import { EQUIPOS, claveDeEquipo } from "@/lib/tareas/equipos";

interface Props {
  area: string | null;
  email: string;
  guardados: string[];
  valor: string[] | null;
  onChange: (v: string[]) => void;
}

export default function SprintsQueLidera({ area, email, guardados, valor, onChange }: Props) {
  const actuales = valor ?? guardados;
  const suyo = claveDeEquipo(area, email);

  const alternar = (clave: string) => {
    const set = new Set(actuales);
    if (set.has(clave)) set.delete(clave);
    else set.add(clave);
    onChange(EQUIPOS.map((e) => e.clave as string).filter((c) => set.has(c)));
  };

  return (
    <section aria-label="Lidera los sprints de" className="space-y-2 rounded-lg border border-line px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-fg">Lidera los sprints de</span>
        <span className="text-xs text-fg-muted">{actuales.length === 0 ? "Ninguno" : `${actuales.length} ${actuales.length === 1 ? "sprint" : "sprints"}`}</span>
      </div>
      <p className="text-xs text-fg-muted">
        En Tareas, quien lidera un sprint asigna directo, reparte «Por asignar», revisa la semana con su equipo y recibe lo
        que le piden al equipo. Puede ser un sprint que no es el de su área.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {EQUIPOS.map((e) => (
          <label
            key={e.clave}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-hover"
          >
            <input
              type="checkbox"
              checked={actuales.includes(e.clave)}
              onChange={() => alternar(e.clave)}
              className="h-3.5 w-3.5 accent-primary"
            />
            <span className="font-medium text-fg">{e.nombre}</span>
            {e.clave === suyo && <span className="text-fg-muted">· su área</span>}
          </label>
        ))}
      </div>
    </section>
  );
}
