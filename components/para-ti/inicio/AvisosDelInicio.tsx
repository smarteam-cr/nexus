"use client";

/**
 * AvisosDelInicio — los avisos en la columna derecha del inicio (ficha D, 2026-10-17; diseño «Para ti · Ventas y CSE»).
 *
 * Un aviso es algo que pasó; lo que te toca hacer está en «Lo que importa hoy». Los tres más nuevos a la vista y el
 * resto con «Ver los N». Un mensaje sin leer (alguien te escribió) va en ámbar; una buena noticia, con ✓ en verde.
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { avisarCambioDeParaTi } from "../cuenta";
import type { AvisoVisto } from "@/lib/para-ti/tipos";
import { TARJETA, TITULO } from "./piezas";

const A_LA_VISTA = 3;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Armada a mano y con la hora del servidor: con `toLocaleDateString` y el reloj del navegador, no hidrataba igual. */
function cuandoFue(iso: string, ahoraMs: number): string {
  const d = new Date(iso);
  const min = Math.round((ahoraMs - d.getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return "ayer";
  const cr = new Date(d.getTime() - 6 * 3_600_000);
  return `${DIAS[cr.getUTCDay()]} ${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
}

export default function AvisosDelInicio({ avisos: iniciales, ahoraISO }: { avisos: AvisoVisto[]; ahoraISO: string }) {
  const ahoraMs = Date.parse(ahoraISO);
  const router = useRouter();
  const [avisos, setAvisos] = useState(iniciales);
  const [todos, setTodos] = useState(false);
  const [delServidor, setDelServidor] = useState(iniciales);
  if (delServidor !== iniciales) {
    setDelServidor(iniciales);
    setAvisos(iniciales);
  }

  const marcar = useCallback(
    async (ids: string[] | "todos") => {
      setAvisos((as) => as.map((a) => (ids === "todos" || ids.includes(a.id) ? { ...a, nuevo: false } : a)));
      try {
        await fetchJson("/api/para-ti/avisos/leidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids === "todos" ? { todos: true } : { ids }),
        });
        avisarCambioDeParaTi();
      } catch {
        router.refresh();
      }
    },
    [router],
  );

  const nuevos = avisos.filter((a) => a.nuevo).length;
  const vista = todos ? avisos : avisos.slice(0, A_LA_VISTA);
  return (
    <section className={cn(TARJETA, "flex flex-col gap-2.5 p-5")} aria-labelledby="avisos-t">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="avisos-t" className={TITULO}>
          Avisos
          {nuevos > 0 && <span className="ml-1 text-xs font-semibold text-brand">{nuevos === 1 ? "1 nuevo" : `${nuevos} nuevos`}</span>}
        </h2>
        {nuevos > 0 && (
          <button type="button" onClick={() => marcar("todos")} className="rounded px-1.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg">
            Marcar como leídos
          </button>
        )}
      </div>
      {avisos.length === 0 ? (
        <p className="border-t border-line pt-2.5 text-[13px] text-fg-muted">Todavía no te llegó ningún aviso.</p>
      ) : (
        vista.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            onClick={() => a.nuevo && marcar([a.id])}
            className={cn("flex gap-2.5 border-t border-line pt-2.5 transition-colors hover:text-brand", a.nuevo && a.mensaje && "rounded-md border border-warn-line bg-warn-surface p-2")}
          >
            <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", !a.nuevo ? "bg-surface-active" : a.mensaje ? "bg-warning" : a.bueno ? "bg-success" : "bg-primary")} />
            <span className="min-w-0">
              <span className={cn("block text-[13px] leading-[19px]", a.nuevo ? "font-medium text-fg" : "text-fg-secondary")}>
                {a.bueno && <span className="font-semibold text-success-ink">✓ </span>}
                {a.titulo}
              </span>
              <span className="block text-xs text-fg-muted">
                {a.nuevo && a.mensaje ? "Mensaje · " : ""}
                {a.detalle ? `${a.detalle} · ` : ""}
                {cuandoFue(a.creadoAt, ahoraMs)}
              </span>
            </span>
          </Link>
        ))
      )}
      {avisos.length > A_LA_VISTA && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="self-start text-[13px] font-medium text-brand hover:text-brand-light">
          {todos ? "Ver menos" : `Ver los ${avisos.length}`}
        </button>
      )}
    </section>
  );
}
