"use client";

/**
 * components/seguimiento/LeerEstaReunion.tsx — «Leer esta reunión», en la página de una reunión que todavía no tiene
 * minuta (memoria de la cuenta, etapa 2).
 *
 * Es el camino de una persona para leer YA una reunión que la cola no leyó: quedó en error, se cayó del corte de 14
 * días, o el job no tenía presupuesto. Llama a la misma ruta que «Generar minuta» (POST /api/sessions/[id]/post-process,
 * con el acceso al cliente y el presupuesto de quien la pide). Es el remedio que nombran INV44 y el RUNBOOK.
 *
 * La página decide cuándo se muestra (una reunión con tarjeta, con transcripción y sin minuta); esto solo la pide y
 * dice qué pasó.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { BotonBlanco } from "@/components/ui/sistema";

type Respuesta = { status?: string; reason?: string; error?: string };

export default function LeerEstaReunion({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function leer() {
    setLeyendo(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/post-process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const r = (await res.json().catch(() => ({}))) as Respuesta;
      if (res.ok && (r.status === "ok" || r.status === "skipped")) {
        toast.success("Listo: Nexus leyó la reunión.");
        router.refresh();
        return;
      }
      if (res.status === 409) setAviso(r.reason ?? r.error ?? "Ya se está leyendo esta reunión. Vuelve en unos minutos.");
      else if (res.ok) setAviso(r.reason ?? "Nexus no leyó esta reunión.");
      else setAviso(r.reason ?? r.error ?? "No se pudo leer la reunión. Prueba de nuevo en unos minutos.");
    } catch {
      setAviso("No se pudo leer la reunión. Revisa tu conexión y prueba de nuevo.");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">{leyendo ? "Nexus está leyendo la reunión…" : "Nexus todavía no leyó esta reunión: no tiene minuta."}</p>
        <p className="text-xs text-fg-muted">
          {leyendo ? "Suele tardar uno o dos minutos. Puedes seguir en otra pantalla: lo que deje queda acá." : (aviso ?? "Al leerla deja la minuta, los compromisos de los dos lados y lo que quedó fuera de alcance, para revisar.")}
        </p>
      </div>
      <BotonBlanco onClick={() => void leer()} disabled={leyendo}>
        {leyendo ? "Leyendo…" : "Leer esta reunión"}
      </BotonBlanco>
    </section>
  );
}
