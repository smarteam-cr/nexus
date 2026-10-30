"use client";

/**
 * components/cs/MarcaDePrioridad.tsx — la cuenta prioritaria (más seguimiento), 2026-10-29. Regla en
 * lib/cs/prioridad-de-cuenta.ts.
 *
 * Lo usan la pestaña «Cartera», «A quién llamar» y el panel de la cuenta. Muestra la marca (con su motivo y quién la
 * puso) y, a quien tiene `customerSuccess.marcarPrioridad`, el enlace para marcarla, cambiar el motivo o quitarla. El
 * servidor lo vuelve a mirar. Al guardar, la pantalla se refresca: la marca ordena la cartera, no cambia el color.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal, Segmentado, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import {
  LARGO_DE_LA_NOTA_DE_PRIORIDAD,
  MOTIVOS_DE_PRIORIDAD,
  NOMBRE_DEL_MOTIVO,
  type MotivoDePrioridad,
  type PrioridadVisible,
} from "@/lib/cs/prioridad-de-cuenta";
import type { PrioridadDeCuentaPedido } from "@/lib/cs/schema";

const OPCIONES = MOTIVOS_DE_PRIORIDAD.map((clave) => ({ clave, etiqueta: NOMBRE_DEL_MOTIVO[clave] }));

function Estrella({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("h-3 w-3 flex-shrink-0", className)} fill="currentColor">
      <path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" />
    </svg>
  );
}

/** La marca, sola (sin el enlace para cambiarla): para las filas de quien no puede marcar. */
export function ChipDePrioridad({ prioritaria, className }: { prioritaria: PrioridadVisible; className?: string }) {
  return (
    <span
      title={`Prioritaria: ${prioritaria.enPalabras} · la marcó ${prioritaria.quien}`}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand", className)}
    >
      <Estrella />
      <span className="truncate">Prioritaria · {prioritaria.enPalabras}</span>
    </span>
  );
}

export default function MarcaDePrioridad({
  clientId,
  cuenta,
  prioritaria,
  puedeMarcar,
  compacto = false,
}: {
  clientId: string;
  cuenta: string;
  prioritaria: PrioridadVisible | null;
  puedeMarcar: boolean;
  /** En la fila de una lista: el enlace más chico, y sin marca no muestra nada más que el enlace. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDePrioridad>(prioritaria?.motivo ?? "smartloop");
  const [nota, setNota] = useState(prioritaria?.nota ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function guardar(cuerpo: PrioridadDeCuentaPedido, listo: string) {
    setOcupado(true);
    try {
      await fetchJson(`/api/cs/prioridad/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      toast.success(listo);
      setAbierto(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const abrir = () => {
    setMotivo(prioritaria?.motivo ?? "smartloop");
    setNota(prioritaria?.nota ?? "");
    setAbierto(true);
  };
  const otroSinTexto = motivo === "otro" && nota.trim().length < 3;

  if (!puedeMarcar) return prioritaria ? <ChipDePrioridad prioritaria={prioritaria} /> : null;

  return (
    <>
      <span className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5">
        {prioritaria && <ChipDePrioridad prioritaria={prioritaria} />}
        <button
          type="button"
          onClick={abrir}
          className={cn("text-xs text-fg-muted transition-colors hover:text-brand", compacto && "text-[11px]")}
          title={prioritaria ? "Cambiar el motivo o quitar la marca" : "Marcar la cuenta como prioritaria: pide más seguimiento"}
        >
          {prioritaria ? "cambiar" : "Marcar prioritaria"}
        </button>
      </span>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`${prioritaria ? "Cuenta prioritaria" : "Marcar como prioritaria"}: ${cuenta}`}
        description="Pide más seguimiento. No cambia el color: dentro del mismo color, las prioritarias van primero."
        size="sm"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {prioritaria ? (
              <BotonBlanco disabled={ocupado} onClick={() => void guardar({ accion: "quitar" }, "Listo: la cuenta ya no es prioritaria.")}>
                Quitar la marca
              </BotonBlanco>
            ) : (
              <span />
            )}
            <BotonAzul
              disabled={ocupado || otroSinTexto}
              onClick={() => void guardar({ accion: "marcar", motivo, nota: nota.trim() || null }, "Cuenta marcada como prioritaria.")}
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </BotonAzul>
          </div>
        }
      >
        <div className="space-y-4">
          {prioritaria && (
            <p className="text-[13px] text-fg-secondary">
              Hoy: prioritaria por «{prioritaria.enPalabras}», la marcó {prioritaria.quien}.
            </p>
          )}
          <Segmentado<MotivoDePrioridad> etiqueta="Por qué" valor={motivo} onCambio={setMotivo} opciones={OPCIONES} />
          <Field
            label={motivo === "otro" ? "Cuál es el motivo" : "Algo más (opcional)"}
            hint={`Una línea. Hasta ${LARGO_DE_LA_NOTA_DE_PRIORIDAD} caracteres.`}
          >
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, LARGO_DE_LA_NOTA_DE_PRIORIDAD))}
              rows={2}
              placeholder={motivo === "otro" ? "Ej.: el sponsor se va en diciembre." : "Ej.: renueva 3 hubs en enero."}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
