"use client";

/**
 * DespuesDeTusReuniones — lo que dejó una reunión con un cliente o un prospecto, en el panel de la reunión del inicio
 * (components/para-ti/inicio; etapa 4d de docs/mi-dia-plan.md, dentro del panel desde la ficha D, 2026-10-17).
 *
 * Desde el 2026-10-19 es un RESUMEN que lleva a la página de la sesión: cuántas cosas piden tu decisión y cuáles (los
 * mismos números y las mismas palabras que la tarjeta «Lo que dejó esta reunión» y que «Lo que importa hoy»: salen de
 * la misma tarjeta, lib/seguimiento/tarjeta.ts), el siguiente paso de tu equipo y «Revisar sesión». Las decisiones
 * (las tareas, la minuta, los pedidos, la nota para HubSpot) se toman en la página: antes el panel tenía su propio
 * «Usar todo» y su «Usar como siguiente paso», que competían con la página y decían lo mismo con otras palabras.
 * Usar una de tus tareas propuestas de la reunión la vuelve tu siguiente paso (el siguiente paso es una tarea, fase 0.2).
 */
import Link from "next/link";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import type { DespuesDeLaReunion } from "@/lib/mi-dia/despues-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cuando = (iso: string, hoyISO: string) => {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  const dia = d.toISOString().slice(0, 10);
  const hora = d.toISOString().slice(11, 16);
  return dia === hoyISO ? `hoy ${hora}` : `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${hora}`;
};
const fecha = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

/** El enlace a la tarjeta de la sesión (la misma dirección que usa «Lo que importa hoy»). */
export const hrefDeLaSesion = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}#lo-que-dejo`;

export function ReunionDespues({ r, hoyISO }: { r: DespuesDeLaReunion; hoyISO: string }) {
  const pasoVencido = !!r.paso?.fecha && r.paso.fecha < hoyISO;
  return (
    <li className="flex flex-col gap-2 py-2.5 text-[13px]">
      <span className="min-w-0">
        <span className="font-semibold text-fg">{r.empresa}</span>
        <span className="text-fg-secondary"> · {r.titulo}</span>
        <span className="text-xs text-fg-muted"> · {cuando(r.fecha, hoyISO)}</span>
      </span>
      <p className="leading-[19px] text-fg">
        {r.pideDecision > 0
          ? `${r.pideDecision} ${r.pideDecision === 1 ? "cosa pide" : "cosas piden"} tu decisión${r.queDejo.length ? `: ${r.queDejo.join(", ")}` : ""}.`
          : "No dejó nada por decidir."}
      </p>
      {r.equipo && (
        <p className="text-xs leading-[17px]">
          {r.paso && !pasoVencido ? (
            <span className="text-fg-secondary">
              Siguiente paso: {r.paso.que}
              {r.paso.fecha && <span className="text-fg-muted"> · para el {fecha(r.paso.fecha)}</span>}
            </span>
          ) : r.sugerencia ? (
            <span className="flex items-start gap-1.5 text-brand">
              <IconoDeSugerencia className="mt-0.5 h-3 w-3 flex-none" />
              <span>
                {pasoVencido ? "El siguiente paso venció. " : "Sin siguiente paso. "}Usa en la sesión «T-{r.sugerencia.numero} · {r.sugerencia.titulo}» y queda
                como el siguiente.
              </span>
            </span>
          ) : (
            <span className="text-warn-ink">{pasoVencido ? "El siguiente paso venció." : "Sin siguiente paso."} Defínelo en la ficha del cliente.</span>
          )}
        </p>
      )}
      <Link
        href={hrefDeLaSesion(r.sessionId)}
        className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-md bg-primary px-3.5 py-[7px] text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Revisar sesión
      </Link>
      {r.pideDecision > 0 && <p className="text-xs leading-[17px] text-fg-muted">En la sesión decides las tareas, la minuta y lo demás, una por una o con «Usar todo».</p>}
    </li>
  );
}
