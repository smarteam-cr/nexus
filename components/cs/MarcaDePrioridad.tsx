"use client";

/**
 * components/cs/MarcaDePrioridad.tsx — la cuenta prioritaria (más seguimiento), 2026-10-29. Regla en
 * lib/cs/prioridad-de-cuenta.ts.
 *
 * Lo usa el panel de la cuenta; los listados llevan la columna de `CheckDePrioridad`, que comparte la ventana y el
 * guardado de acá. Muestra la marca (con su motivo y quién la puso) y, a quien tiene `customerSuccess.marcarPrioridad`, el
 * enlace para marcarla, cambiar el motivo o quitarla. El servidor lo vuelve a mirar. Al guardar, la pantalla se refresca:
 * la marca ordena la cartera, no cambia el color.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import {
  LARGO_DE_LA_NOTA_DE_PRIORIDAD,
  LARGO_DEL_MOTIVO,
  MOTIVOS_DE_PRIORIDAD,
  NOMBRE_DEL_MOTIVO,
  marcaDeLaVentana,
  motivoEscritoValido,
  opcionDeLaMarca,
  opcionDelEquipo,
  type MotivoDelEquipo,
  type PrioridadVisible,
} from "@/lib/cs/prioridad-de-cuenta";
import type { PrioridadDeCuentaPedido } from "@/lib/cs/schema";

/** La casilla de la marca: vacía si la cuenta no es prioritaria, llena y con el check si lo es. */
export function CheckDeMarca({ className, vacio = false }: { className?: string; vacio?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("h-3 w-3 flex-shrink-0", className)} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.25" fill={vacio ? "none" : "currentColor"} />
      {!vacio && <path d="M4.75 8.25l2.25 2.25 4.25-4.75" stroke="var(--surface)" strokeWidth="1.75" />}
    </svg>
  );
}

/** Guarda la marca y devuelve cómo quedó la cuenta (null = ya no es prioritaria). */
export async function guardarPrioridad(clientId: string, cuerpo: PrioridadDeCuentaPedido): Promise<PrioridadVisible | null> {
  const r = await fetchJson<{ prioritaria: PrioridadVisible | null }>(`/api/cs/prioridad/${clientId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return r.prioritaria;
}

/** La marca, sola (sin el enlace para cambiarla): para las filas de quien no puede marcar. */
export function ChipDePrioridad({ prioritaria, className }: { prioritaria: PrioridadVisible; className?: string }) {
  return (
    <span
      title={`Prioritaria: ${prioritaria.enPalabras} · la marcó ${prioritaria.quien}`}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand", className)}
    >
      <CheckDeMarca />
      <span className="truncate">Prioritaria · {prioritaria.enPalabras}</span>
    </span>
  );
}

export default function MarcaDePrioridad({
  clientId,
  cuenta,
  prioritaria,
  puedeMarcar,
  motivos,
}: {
  clientId: string;
  cuenta: string;
  prioritaria: PrioridadVisible | null;
  puedeMarcar: boolean;
  motivos: readonly MotivoDelEquipo[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  if (!puedeMarcar) return prioritaria ? <ChipDePrioridad prioritaria={prioritaria} /> : null;

  return (
    <>
      <span className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5">
        {prioritaria && <ChipDePrioridad prioritaria={prioritaria} />}
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-xs text-fg-muted transition-colors hover:text-brand"
          title={prioritaria ? "Cambiar el motivo o quitar la marca" : "Marcar la cuenta como prioritaria: pide más seguimiento"}
        >
          {prioritaria ? "cambiar" : "Marcar prioritaria"}
        </button>
      </span>
      {abierto && (
        <VentanaDePrioridad
          clientId={clientId}
          cuenta={cuenta}
          prioritaria={prioritaria}
          motivos={motivos}
          onCerrar={() => setAbierto(false)}
          onGuardada={() => router.refresh()}
        />
      )}
    </>
  );
}

/** La ventana del motivo y la línea. Se monta al abrirse: arranca con lo que la cuenta tiene hoy. */
export function VentanaDePrioridad({
  clientId,
  cuenta,
  prioritaria,
  motivos,
  enOtroMotivo = false,
  onCerrar,
  onGuardada,
}: {
  clientId: string;
  cuenta: string;
  prioritaria: PrioridadVisible | null;
  motivos: readonly MotivoDelEquipo[];
  enOtroMotivo?: boolean;
  onCerrar: () => void;
  onGuardada: (prioritaria: PrioridadVisible | null) => void;
}) {
  const toast = useToast();
  const [opcion, setOpcion] = useState(enOtroMotivo ? "otro" : opcionDeLaMarca(prioritaria));
  const [motivoNuevo, setMotivoNuevo] = useState("");
  const [nota, setNota] = useState(prioritaria?.nota ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function guardar(cuerpo: PrioridadDeCuentaPedido, listo: string) {
    setOcupado(true);
    try {
      onGuardada(await guardarPrioridad(clientId, cuerpo));
      toast.success(listo);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const escribeUnMotivo = opcion === "otro";
  const otroSinTexto = escribeUnMotivo && !motivoEscritoValido(motivoNuevo);

  return (
    <Modal
      open
      onClose={onCerrar}
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
            onClick={() => void guardar(marcaDeLaVentana(opcion, motivoNuevo, nota), "Cuenta marcada como prioritaria.")}
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
        <Field label="Por qué">
          <Select value={opcion} onChange={(e) => setOpcion(e.target.value)}>
            {MOTIVOS_DE_PRIORIDAD.filter((m) => m !== "otro").map((m) => (
              <option key={m} value={m}>
                {NOMBRE_DEL_MOTIVO[m]}
              </option>
            ))}
            {motivos.map((m) => (
              <option key={m.id} value={opcionDelEquipo(m)}>
                {m.nombre}
              </option>
            ))}
            <option value="otro">{NOMBRE_DEL_MOTIVO.otro}</option>
          </Select>
        </Field>
        {escribeUnMotivo && (
          <Field label="Cuál es el motivo" hint="Queda en la lista para todo el equipo.">
            <Input
              value={motivoNuevo}
              onChange={(e) => setMotivoNuevo(e.target.value.slice(0, LARGO_DEL_MOTIVO))}
              placeholder="Ej.: Cambio de sponsor"
            />
          </Field>
        )}
        <Field label="Algo más (opcional)" hint={`Una línea. Hasta ${LARGO_DE_LA_NOTA_DE_PRIORIDAD} caracteres.`}>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, LARGO_DE_LA_NOTA_DE_PRIORIDAD))}
            rows={2}
            placeholder="Ej.: renueva 3 hubs en enero."
          />
        </Field>
      </div>
    </Modal>
  );
}
