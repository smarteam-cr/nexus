"use client";

/**
 * components/trivias/LanzarPartida.tsx — el diálogo que lanza una partida en vivo de una trivia: se elige cómo se
 * cuentan los puntos (Velocidad por defecto) y se abre la pantalla del anfitrión en la sala de espera, con el código y el
 * QR para que el equipo entre desde el teléfono.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Segmentado, useToast, type OpcionSegmentada } from "@/components/ui";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ETIQUETA_DEL_MODO, EXPLICACION_DEL_MODO, type ModoDePuntos } from "@/lib/trivias/tipos";

/** Velocidad primero: es la de por defecto, la que más se juega. */
const MODOS: OpcionSegmentada<ModoDePuntos>[] = (["VELOCIDAD", "PRECISION"] as const).map((m) => ({
  clave: m,
  etiqueta: ETIQUETA_DEL_MODO[m],
}));

export interface LanzarPartidaProps {
  triviaId: string;
  abierto: boolean;
  onCerrar: () => void;
}

export default function LanzarPartida({ triviaId, abierto, onCerrar }: LanzarPartidaProps) {
  const router = useRouter();
  const toast = useToast();
  const [modo, setModo] = useState<ModoDePuntos>("VELOCIDAD");
  const [lanzando, setLanzando] = useState(false);

  const cerrar = () => {
    if (!lanzando) onCerrar();
  };

  async function lanzar() {
    setLanzando(true);
    try {
      const partida = await fetchJson<{ id: string; codigo: string }>(`/api/trivia/${triviaId}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      // Queda «lanzando» hasta que la pantalla del anfitrión abre: un segundo clic no lanza otra partida.
      router.push(`/trivia/games/${partida.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo lanzar la partida. Prueba de nuevo.");
      setLanzando(false);
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={cerrar}
      title="Lanzar una partida"
      description="Se abre la sala de espera con el código y el QR para que el equipo entre desde el teléfono."
      size="md"
      closeOnBackdrop={!lanzando}
      closeOnEscape={!lanzando}
      footer={
        <>
          <Button variant="secondary" onClick={cerrar} disabled={lanzando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={lanzar} loading={lanzando}>
            Lanzar
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs font-medium text-fg-secondary">¿Cómo se cuentan los puntos?</p>
        <Segmentado
          opciones={MODOS}
          valor={modo}
          onCambio={setModo}
          etiqueta="Cómo se cuentan los puntos"
          deshabilitado={lanzando}
          lleno
          tamano="grande"
        />
        <p className="text-sm leading-relaxed text-fg-secondary">{EXPLICACION_DEL_MODO[modo]}</p>
      </div>
    </Modal>
  );
}
