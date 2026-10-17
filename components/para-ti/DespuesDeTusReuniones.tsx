"use client";

/**
 * DespuesDeTusReuniones — el paso de dos minutos después de cada reunión (etapa 4d de docs/mi-dia-plan.md).
 *
 * Por cada reunión con un cliente o un prospecto en la que estuviste y que terminó en las últimas 36 horas: lo que dejó
 * (la minuta, tus tareas propuestas, los pedidos fuera de alcance) con «Usar todo», y el siguiente paso de tu equipo
 * sobre la cuenta. Si no hay, se propone la primera de tus tareas de esa reunión. Si nadie lo mira, igual queda como
 * borrador: la IA se usa desde el primer momento (DECISIONS «La IA como borrador»).
 *
 * «Usar todo» es el de la tarjeta (POST /api/sessions/[id]/lo-que-dejo). El siguiente paso es una tarea (fase 0.2):
 * «Usar como siguiente paso» usa la tarea propuesta (POST /api/tareas/[id]/decision) y la copia de cada hora la escribe en
 * HubSpot.
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { DespuesDeLaReunion } from "@/lib/mi-dia/despues-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cuando = (iso: string, hoyISO: string) => {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  const dia = d.toISOString().slice(0, 10);
  const hora = d.toISOString().slice(11, 16);
  return dia === hoyISO ? `hoy ${hora}` : `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${hora}`;
};
const fecha = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

function queDejo(r: DespuesDeLaReunion): string {
  const partes: string[] = [];
  if (r.minutaPorRevisar) partes.push("la minuta por revisar");
  if (r.tareasPropuestas) partes.push(`${r.tareasPropuestas} ${r.tareasPropuestas === 1 ? "tarea propuesta" : "tareas propuestas"} para ti`);
  if (r.pedidos) partes.push(`${r.pedidos} ${r.pedidos === 1 ? "pedido fuera de alcance" : "pedidos fuera de alcance"}`);
  if (r.notaParaHubspot) partes.push("la nota para HubSpot");
  return partes.length ? `Dejó ${partes.join(", ")}.` : "No dejó nada para decidir.";
}

export default function DespuesDeTusReuniones({ reuniones, hoyISO }: { reuniones: DespuesDeLaReunion[]; hoyISO: string }) {
  if (reuniones.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4" aria-labelledby="despues-de-tus-reuniones">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="despues-de-tus-reuniones" className={ROTULO_DEL_SISTEMA}>
          Después de tus reuniones
        </h2>
        <span className="text-xs text-fg-muted">Lo que dejaron las de las últimas 36 horas: dos minutos por reunión.</span>
      </div>
      <ul className="divide-y divide-line">
        {reuniones.map((r) => (
          <Reunion key={r.sessionId} r={r} hoyISO={hoyISO} />
        ))}
      </ul>
    </section>
  );
}

function Reunion({ r, hoyISO }: { r: DespuesDeLaReunion; hoyISO: string }) {
  const router = useRouter();
  const toast = useToast();
  const [ocupado, setOcupado] = useState<null | "todo" | "paso" | "nota">(null);
  const [usado, setUsado] = useState(false);
  const [notaEscrita, setNotaEscrita] = useState(false);
  const pasoVencido = !!r.paso?.fecha && r.paso.fecha < hoyISO;
  const proponer = !!r.equipo && !!r.sugerencia && (!r.paso || pasoVencido);

  async function usarTodo() {
    setOcupado("todo");
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(r.sessionId)}/lo-que-dejo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ huella: r.huella }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409) {
        toast.info("La reunión cambió desde que abriste «Para ti». Revísala.");
        router.refresh();
        return;
      }
      if (!res.ok) {
        toast.error(j?.error ?? "No se pudo usar todo.");
        return;
      }
      setUsado(true);
      toast.success("Listo: quedó revisada.");
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function usarComoPaso() {
    if (!r.equipo || !r.sugerencia) return;
    setOcupado("paso");
    try {
      const res = await fetch(`/api/tareas/${encodeURIComponent(r.sugerencia.id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: r.sugerencia.version, decision: { tipo: "usar" } }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "No se pudo usar la tarea.");
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success(`Listo: T-${r.sugerencia.numero} es tu siguiente paso. Se escribe en HubSpot en la próxima copia.`);
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  /** La nota para HubSpot tal cual la armó Nexus. Para cambiarla, «Revisar» (la tarjeta de la reunión). */
  async function escribirNota() {
    if (!r.notaParaHubspot) return;
    setOcupado("nota");
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(r.sessionId)}/nota-para-hubspot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "usar", texto: r.notaParaHubspot }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; hubspotEstado?: string } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "No se pudo escribir la nota.");
        return;
      }
      setNotaEscrita(true);
      toast.success(j?.hubspotEstado === "escrita" ? "La nota quedó en HubSpot." : "Nota guardada. HubSpot no respondió: se reintenta cada hora.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <li className={cn("space-y-1.5 py-2.5 text-[13px]", usado && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-semibold text-fg">{r.empresa}</span>
          <span className="text-fg-secondary"> · {r.titulo}</span>
          <span className="text-xs text-fg-muted"> · {cuando(r.fecha, hoyISO)}</span>
        </span>
        <span className="flex items-center gap-2">
          <Link
            href={`/sessions/${encodeURIComponent(r.sessionId)}#lo-que-dejo`}
            className="text-xs font-semibold text-brand transition-colors hover:text-brand-light"
          >
            Revisar
          </Link>
          {!r.usarTodoVacio && !usado && (
            <BotonBlanco onClick={usarTodo} disabled={ocupado !== null} title="Revisa la minuta, confirma los pedidos y usa tus tareas propuestas de esta reunión">
              {ocupado === "todo" ? "Usando…" : "Usar todo"}
            </BotonBlanco>
          )}
        </span>
      </div>
      <p className="text-xs text-fg-muted">{queDejo(r)}</p>
      {r.notaParaHubspot && !notaEscrita && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-brand">
            <IconoDeSugerencia className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">Nota para HubSpot: {r.notaParaHubspot.split("\n").slice(1).join(" ").trim() || r.notaParaHubspot}</span>
          </span>
          <BotonBlanco onClick={escribirNota} disabled={ocupado !== null} title="La escribe en HubSpot tal cual. Para cambiarla, Revisar.">
            {ocupado === "nota" ? "Escribiendo…" : "Escribir en HubSpot"}
          </BotonBlanco>
        </div>
      )}
      {r.equipo && (
        <div className="text-xs">
          {r.paso && !pasoVencido ? (
            <span className="text-fg-secondary">
              Siguiente paso: {r.paso.que}
              {r.paso.fecha && <span className="text-fg-muted"> · para el {fecha(r.paso.fecha)}</span>}
            </span>
          ) : proponer ? (
            <span className="flex flex-wrap items-center gap-2 text-brand">
              <IconoDeSugerencia className="h-3 w-3" />
              <span>
                {pasoVencido ? "El siguiente paso venció. " : "Sin siguiente paso. "}Nexus propone: «{r.sugerencia!.titulo}»
              </span>
              <BotonAzul onClick={usarComoPaso} disabled={ocupado !== null}>
                {ocupado === "paso" ? "Guardando…" : "Usar como siguiente paso"}
              </BotonAzul>
            </span>
          ) : (
            <span className="text-warn-ink">{pasoVencido ? "El siguiente paso venció." : "Sin siguiente paso."} Defínelo en la ficha del cliente.</span>
          )}
        </div>
      )}
    </li>
  );
}
