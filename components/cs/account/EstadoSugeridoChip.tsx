"use client";

/**
 * components/cs/account/EstadoSugeridoChip.tsx — CUANDO HUBSPOT SE CONTRADICE A SÍ MISMO.
 *
 * ── QUÉ MUESTRA ──────────────────────────────────────────────────────────────
 * En HubSpot hay un campo «motivo de bloqueo» que el equipo carga a mano y un campo «estado» que
 * casi nadie actualiza. Medido el 2026-08-15: **29 proyectos con motivo cargado y solo 3 en
 * estado Bloqueado**. O sea que el registro dice dos cosas a la vez, y el tablero que mira todo
 * el equipo muestra la mitad optimista.
 *
 * Este chip aparece únicamente cuando esas dos mitades se contradicen, dice cuál es la
 * contradicción, y ofrece resolverla con un clic — que escribe en HubSpot y espera al espejo
 * (`PATCH /api/projects/[id]/estado-hubspot`).
 *
 * ── ⚠ POR QUÉ NO TIENE «DESCARTAR», A DIFERENCIA DE `HealthProposalChip` ─────
 * Aquél propone una INFERENCIA del watchdog sobre señales blandas: puede equivocarse, así que
 * descartarla es una respuesta legítima. Acá no hay inferencia ninguna. Los dos valores salen del
 * mismo registro de HubSpot y se contradicen; descartar el aviso no arreglaría la contradicción,
 * la escondería — y el tablero seguiría mintiendo con la bendición de un clic.
 *
 * La otra salida existe y es la correcta cuando el estado ya está bien: **borrar el motivo viejo
 * en HubSpot**. El chip lo dice, en vez de ofrecer un botón que simula resolver.
 *
 * ── LO QUE ESTE CHIP *NO* ES ─────────────────────────────────────────────────
 * No es «el agente propone el estado». Es el piso determinístico y gratis: dos columnas ya
 * espejadas y una tabla de traducción probada (`lib/projects/estado-hubspot.ts`). La propuesta
 * rica —la que sale de leer las sesiones y puede sugerir un estado que ningún campo declara—
 * necesita las columnas de SQL #2 y un agente, y **sí** va a tener Descartar, porque ahí sí hay
 * una inferencia que puede estar mal.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { proponerEstadoDesdeMotivo } from "@/lib/projects/estado-hubspot";
import { HS_STATUS_LABEL } from "@/components/cs/dashboard/chart-theme";

export default function EstadoSugeridoChip({
  projectId,
  estadoActual,
  motivo,
}: {
  projectId: string;
  estadoActual: string | null;
  motivo: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [resuelto, setResuelto] = useState(false);

  /* Se deriva acá, en el render, y no viaja en el DTO: son dos columnas que la pantalla ya tiene
     y una función pura. Persistir la sugerencia crearía una tercera copia que puede quedar vieja
     respecto de las dos de las que salió — exactamente el modo de falla que el endpoint evita
     releyendo HubSpot en vivo. */
  const propuesta = proponerEstadoDesdeMotivo(estadoActual, motivo);
  if (!propuesta || resuelto) return null;

  const destino = HS_STATUS_LABEL[propuesta.valor] ?? propuesta.valor;

  const aceptar = async () => {
    setBusy(true);
    try {
      const r = await fetchJson<{ estado: string | null }>(
        `/api/projects/${projectId}/estado-hubspot`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          /* `visto` es lo que ESTA pantalla tenía cuando armó la sugerencia. Si en HubSpot ya
             es otra cosa, el endpoint devuelve 409 en vez de pisarla: la copia de Nexus puede
             tener días y alguien pudo haberlo cambiado a mano mientras tanto. */
          body: JSON.stringify({ estado: propuesta.valor, visto: { estado: estadoActual } }),
        },
      );
      setResuelto(true);
      /* Se anuncia lo que VOLVIÓ de HubSpot, no lo que se pidió. */
      const quedo = r.estado ? (HS_STATUS_LABEL[r.estado] ?? r.estado) : destino;
      toast.success(`En HubSpot quedó como «${quedo}».`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar el estado en HubSpot.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink"
      title={
        `${propuesta.motivo} Si el estado actual ya es el correcto, lo que quedó viejo es el ` +
        `motivo: borralo en HubSpot y este aviso desaparece.`
      }
    >
      HubSpot dice «{motivo?.trim()}» pero el estado no
      <button
        onClick={aceptar}
        disabled={busy}
        className="underline decoration-dotted hover:text-fg disabled:opacity-50"
      >
        {busy ? "…" : `Pasar a ${destino}`}
      </button>
    </span>
  );
}
