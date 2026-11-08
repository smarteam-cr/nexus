"use client";

/**
 * LoQueDejoLaSesion — la escala después de cada sesión y dónde quedó la exploración (2026-11-06, puntos 14 y 16;
 * lib/exploraciones/despues-de-la-sesion.ts):
 *   · LaEscalaDespuesDeLaSesion: qué áreas de la escala ya tienen evidencia y cuáles quedan pendientes.
 *   · DondeQuedo: en el inicio, para que cualquiera del equipo vea en qué sesión quedó, qué se averiguó y qué queda.
 * El formulario del desafío y los temas por retomar se fue el 2026-11-07: ahora la sesión muestra lo que queda para la
 * próxima, todo marcado, sin nada que escribir (LoQueQueda.tsx). Lo ya escrito se sigue leyendo ahí.
 */
import { cn } from "@/lib/cn";
import { coberturaDeLaEscala, dondeQuedo } from "@/lib/exploraciones/despues-de-la-sesion";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";
import { Rotulo } from "./piezas-de-la-sesion";
import { useSesiones } from "./useSesiones";

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

/**
 * Punto 16: dónde quedó la exploración, para quien la abre. El objetivo y el desafío van arriba, en sus tarjetas
 * (ObjetivoYDesafio.tsx): acá, la última sesión, cuánto se averiguó y lo que queda para la próxima.
 */
export function DondeQuedo() {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  const d = dondeQuedo(todas, exp.estado.propuesta.guias, exp.estado.propuesta.lecturas);
  if (!d.ultima) return null;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-4">
      <h3 className="text-[15px] font-semibold text-fg">Dónde quedó</h3>
      <p className="text-[13.5px] text-fg">
        {`Quedó en la sesión ${d.ultima.numero}${d.ultima.titulo ? ` «${d.ultima.titulo}»` : ""}${d.ultima.fecha ? `, del ${diaCorto(d.ultima.fecha)}` : ""}.`}
        {d.averiguado.total > 0 && <span className="text-fg-muted"> Se averiguó {d.averiguado.sabidas} de {d.averiguado.total} cosas de sus guías.</span>}
      </p>
      {d.queda.length > 0 && (
        <div>
          <Rotulo>Lo que queda para la próxima</Rotulo>
          <ul className="mt-1 space-y-0.5 text-[13.5px] text-fg">
            {d.queda.map((p) => (
              <li key={p.clave}>
                {p.texto}
                {p.detalle && <span className="text-fg-muted"> · {p.detalle}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
