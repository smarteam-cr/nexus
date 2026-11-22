"use client";

/**
 * LoQueDejoLaSesion — la escala después de cada sesión y dónde quedó la exploración (2026-11-06, puntos 14 y 16;
 * lib/exploraciones/despues-de-la-sesion.ts):
 *   · LaEscalaDespuesDeLaSesion: qué áreas de la escala ya tienen evidencia y cuáles quedan pendientes.
 *   · DondeQuedo se fue el 22 nov (Elías, docs/resumen-liviano-plan.md): el inicio mostraba de más. En qué sesión va lo
 *     dice el Resumen y lo que queda, cada sesión. `dondeQuedo` sigue en lib con sus pruebas.
 * El formulario del desafío y los temas por retomar se fue el 2026-11-07: ahora la sesión muestra lo que queda para la
 * próxima, todo marcado, sin nada que escribir (LoQueQueda.tsx). Lo ya escrito se sigue leyendo ahí.
 */
import { cn } from "@/lib/cn";
import { coberturaDeLaEscala } from "@/lib/exploraciones/despues-de-la-sesion";
import { useLienzo } from "./contexto";
import { Rotulo } from "./piezas-de-la-sesion";

const TONO = { cubierta: "border-success-line bg-success-surface text-success-ink", "a medias": "border-warn-line bg-warn-surface text-warn-ink", pendiente: "border-line bg-surface-muted text-fg-muted" } as const;

/** Punto 14: qué áreas de la escala ya tienen evidencia y cuáles quedan pendientes. */
export function LaEscalaDespuesDeLaSesion() {
  const { exp, escala, mapa } = useLienzo();
  const areas = coberturaDeLaEscala(escala.areas, exp.estado.areas, mapa.posiciones);
  if (!areas.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-3.5">
      <Rotulo>La escala hasta ahora</Rotulo>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <span key={a.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", TONO[a.estado])}>
            {a.nombre} · {a.estado === "pendiente" ? "pendiente" : `${a.conEvidencia} de ${a.total}`}
          </span>
        ))}
      </div>
      <p className="text-xs text-fg-muted">Con evidencia: lo que dijo el cliente o se vio. No hace falta cubrirlas todas en una sesión.</p>
    </section>
  );
}
