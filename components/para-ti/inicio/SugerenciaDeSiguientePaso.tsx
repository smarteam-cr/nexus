"use client";

/**
 * SugerenciaDeSiguientePaso — el siguiente paso que Nexus sugiere para una cuenta con reunión esta semana y sin acción
 * (2026-10-19): la reunión misma, en una fila azul con la chispa, para «Usar» o «Descartar» ahí mismo.
 *
 * «Usar» deja la tarea con la fecha de la reunión para quien lleva la cuenta (es su acción de la semana y el siguiente
 * paso de su equipo, y va a HubSpot); «Descartar» no se la vuelve a mostrar a quien la descarta. Lo decide el servidor
 * (app/api/para-ti/siguiente-paso-de-la-reunion): acá solo se manda qué reunión y qué se eligió. Lo arma el código, sin
 * IA.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonTexto, BotonUsar, IconoDeSugerencia } from "@/components/ui/sistema";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import type { SiguientePasoDelPendiente } from "@/lib/para-ti/tipos";

export default function SugerenciaDeSiguientePaso({ clientId, paso, className }: { clientId: string; paso: SiguientePasoDelPendiente; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enviando, setEnviando] = useState<"usar" | "descartar" | null>(null);
  const [listo, setListo] = useState<"usada" | "descartada" | null>(null);

  const decidir = async (accion: "usar" | "descartar") => {
    setEnviando(accion);
    try {
      const r = await fetchJson<{ ok: boolean; numero?: number; estado?: string; hubspot?: "al-dia" | "pendiente" }>("/api/para-ti/siguiente-paso-de-la-reunion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, eventoId: paso.eventoId, llevaEmail: paso.llevaEmail, accion }),
      });
      if (accion === "usar") {
        setListo("usada");
        const sugerencia = r.estado === "propuesta" ? " Le llega como sugerencia a quien lleva la cuenta." : "";
        const hubspot = r.hubspot === "pendiente" ? " HubSpot no respondió: se escribe en la próxima hora." : "";
        toast.success(`Quedó T-${r.numero} como el siguiente paso, ${paso.cuando}.${sugerencia}${hubspot}`);
      } else {
        setListo("descartada");
        toast.info("Listo: no te la vuelve a sugerir.");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
    } finally {
      setEnviando(null);
    }
  };

  if (listo) {
    return (
      <p className={cn("text-xs leading-4 text-fg-muted", className)}>
        {listo === "usada" ? `Quedó «${paso.titulo}» como el siguiente paso.` : "Descartaste la sugerencia."}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-info-line bg-info-surface py-2 pl-2.5 pr-2", className)}>
      <IconoDeSugerencia className="h-[14px] w-[14px] flex-shrink-0 text-brand" />
      <p className="min-w-0 flex-[1_1_200px] text-xs leading-[17px] text-fg">
        <span className="font-medium text-brand">Siguiente paso: </span>«{paso.titulo}», {paso.cuando}
      </p>
      <div className="flex flex-shrink-0 items-center gap-1">
        <BotonTexto onClick={() => decidir("descartar")} disabled={!!enviando}>
          {enviando === "descartar" ? "Descartando…" : "Descartar"}
        </BotonTexto>
        <BotonUsar onClick={() => decidir("usar")} disabled={!!enviando} title="Deja una tarea con la fecha de la reunión: es la acción de la semana y el siguiente paso, y se escribe en HubSpot">
          {enviando === "usar" ? "Usando…" : "Usar"}
        </BotonUsar>
      </div>
    </div>
  );
}
