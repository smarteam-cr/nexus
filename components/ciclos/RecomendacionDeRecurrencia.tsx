"use client";

/**
 * La RECOMENDACIÓN DE RECURRENCIA en el «Qué sigue» del Resumen (docs/smartloop-plan.md, etapa 6): cuando una
 * implementación llega a su entrega o cierra, Nexus propone seguir con SmartLoop y dice por qué, con datos (la escala de
 * la cuenta, lo que quedó fuera de alcance, los casos de uso y la adopción).
 *
 * Tres salidas: «Dejar la tarea» (una tarea al CSE para proponerlo, por el escritor de Tareas), «Abrir el alta»
 * (Clientes › Nuevo proyecto con SmartLoop elegido) y «Descartar». ⛔ Ninguna escribe en HubSpot.
 *
 * Es una regla, no un agente: va sin la chispa de la IA.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import type { RecomendacionDelProyecto } from "@/lib/servicios/recurrencia-server";

/** La recomendación del proyecto. `null` = no califica (o todavía no llegó). */
export function useRecomendacionDeRecurrencia(projectId: string, refresco: unknown) {
  const [rec, setRec] = useState<RecomendacionDelProyecto | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/recurrencia`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ recomendacion?: RecomendacionDelProyecto | null }>) : null))
      .catch(() => null)
      .then((r) => {
        if (vivo) setRec(r?.recomendacion ?? null);
      });
    return () => {
      vivo = false;
    };
  }, [projectId, refresco, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { rec, recargar };
}

/**
 * La recomendación en su PROPIO bloque del panel del Resumen, cuando «Qué sigue» dice otra cosa (lib/clients/
 * que-sigue-del-proyecto.ts › recurrenciaAparte). «Para ti» manda acá: tiene que verse siempre que esté pendiente.
 */
export function BloqueDeRecurrencia({
  projectId,
  rec,
  onDecidido,
}: {
  projectId: string;
  rec: RecomendacionDelProyecto;
  onDecidido: () => void;
}) {
  return (
    <section id="recomendacion-de-recurrencia" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5">
      <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted">Después de la entrega</p>
      <p className="text-sm leading-[1.4] text-fg">{rec.texto}</p>
      <AccionDeRecurrencia projectId={projectId} rec={rec} onDecidido={onDecidido} principal={false} />
    </section>
  );
}

/**
 * El porqué y las tres salidas, debajo del texto del «Qué sigue» o en su propio bloque del panel (`principal` false:
 * ahí la acción azul es la del «Qué sigue», y «Dejar la tarea» va en blanco).
 */
export function AccionDeRecurrencia({
  projectId,
  rec,
  onDecidido,
  principal = true,
}: {
  projectId: string;
  rec: RecomendacionDelProyecto;
  onDecidido: () => void;
  principal?: boolean;
}) {
  const BotonDeLaTarea = principal ? BotonAzul : BotonBlanco;
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const decidir = async (accion: "tarea" | "alta" | "descartar") => {
    setOcupado(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/recurrencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, motivo: accion === "descartar" ? motivo : null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; href?: string | null } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo guardar.");
        return;
      }
      if (accion === "tarea") toast.success("Te quedó la tarea en Tareas: proponerle el servicio al cliente.");
      if (accion === "descartar") toast.success("Listo: no se vuelve a proponer para este proyecto.");
      onDecidido();
      if (accion === "alta" && data?.href) router.push(data.href);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {rec.lineas.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] leading-[1.45] text-fg-secondary">
          {rec.lineas.map((l) => (
            <li key={l} className="flex gap-1.5">
              <span aria-hidden="true" className="text-fg-muted">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">
          Todavía no hay datos de la escala ni casos de uso: el diagnóstico del primer ciclo posiciona a la cuenta.
        </p>
      )}
      {!rec.puedeDecidir ? (
        <p className="text-xs text-fg-muted">La decide Customer Success. Nada se escribe en HubSpot.</p>
      ) : descartando ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">¿Por qué no? (opcional)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg focus:border-brand focus:outline-none"
              placeholder="El cliente no quiere seguir por ahora"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <BotonBlanco onClick={() => void decidir("descartar")} disabled={ocupado}>
              Descartar
            </BotonBlanco>
            <BotonTexto onClick={() => setDescartando(false)} disabled={ocupado}>
              Volver
            </BotonTexto>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <BotonDeLaTarea onClick={() => void decidir("tarea")} disabled={ocupado} title="Te deja una tarea esta semana para proponérselo al cliente">
            Dejar la tarea
          </BotonDeLaTarea>
          <BotonBlanco onClick={() => void decidir("alta")} disabled={ocupado} title={`Abre Clientes › Nuevo proyecto con ${rec.servicio} elegido`}>
            Abrir el alta
          </BotonBlanco>
          <BotonTexto onClick={() => setDescartando(true)} disabled={ocupado}>
            Descartar
          </BotonTexto>
        </div>
      )}
    </div>
  );
}
