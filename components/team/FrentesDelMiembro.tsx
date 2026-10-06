"use client";

/**
 * FrentesDelMiembro — «Lo que lleva» de una persona, en el modal de Equipo (2026-10-04, lib/para-ti/frentes.ts).
 *
 * El ROL de arriba dice qué puede ver y hacer. Esto dice qué le llega en «Para ti». Tres personas con el mismo rol (los
 * Super Admin) no siguen lo mismo. No da permisos: si marca un frente cuyas pantallas la persona no puede abrir, lo avisa
 * en ámbar en vez de impedirlo (puede ser a propósito, mientras se ajusta su rol). Ese frente se calla: no le llega nada
 * de ese tema hasta que tenga el permiso (lib/para-ti/frentes.ts, `puedeLlevar`).
 *
 * `valor`: null = no se tocó en este modal (se muestra lo guardado y no se manda); "rol" = volver a lo de su rol; una
 * lista = elegidos a mano.
 */
import { avisoSinPermiso, FRENTES_ACTIVOS, frentesDe, puedeLlevar, type ClaveDeFrente } from "@/lib/para-ti/frentes";

interface Props {
  role: string;
  vistaFinanzas: string | null;
  esResponsableDeLaEscala: boolean;
  /** Los efectivos guardados (con el default del rol si nadie los eligió). */
  guardados: string[];
  elegidos: boolean;
  valor: string[] | "rol" | null;
  onChange: (v: string[] | "rol") => void;
  permisos: { sections: Record<string, Record<string, boolean>> } | null;
}

export default function FrentesDelMiembro({
  role,
  vistaFinanzas,
  esResponsableDeLaEscala,
  guardados,
  elegidos,
  valor,
  onChange,
  permisos,
}: Props) {
  const delRol = frentesDe({ roleEnum: role, vistaFinanzas, esResponsableDeLaEscala });
  // Sin tocar y sin elegir a mano, sigue al rol que está elegido en pantalla (aunque se cambie arriba).
  const actuales: string[] =
    valor === "rol" ? delRol : Array.isArray(valor) ? valor : elegidos ? guardados : delRol;
  const aMano = Array.isArray(valor) || (valor === null && elegidos);

  const alternar = (clave: ClaveDeFrente) => {
    const set = new Set(actuales);
    if (set.has(clave)) set.delete(clave);
    else set.add(clave);
    onChange(FRENTES_ACTIVOS.map((f) => f.clave).filter((c) => set.has(c)));
  };

  return (
    <section aria-label="Lo que lleva" className="space-y-2 rounded-lg border border-line px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-fg">Lo que lleva</span>
        <span className="text-xs text-fg-muted">{aMano ? "Elegido a mano" : "Lo de su rol"}</span>
      </div>
      <p className="text-xs text-fg-muted">
        No da permisos: decide qué le llega en «Para ti». Lo suyo (sus proyectos, sus preventas, lo que le devuelven) le
        llega igual.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {FRENTES_ACTIVOS.map((f) => {
          const marcado = actuales.includes(f.clave);
          const puede = puedeLlevar(f, { role, email: null, permissions: permisos, esResponsableDeLaEscala });
          return (
            <label
              key={f.clave}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-2.5 py-2 text-xs hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => alternar(f.clave)}
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block font-medium text-fg">{f.nombre}</span>
                <span className="block text-fg-muted">{f.queLlega}</span>
                {marcado && !puede && f.requisitoTexto && (
                  <span className="mt-0.5 block text-warn-ink">⚠ {avisoSinPermiso(f)}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {aMano && (
        <button
          type="button"
          onClick={() => onChange("rol")}
          className="text-xs text-brand hover:text-brand-light"
        >
          Volver a lo de su rol
        </button>
      )}
    </section>
  );
}
