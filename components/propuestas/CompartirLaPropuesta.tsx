"use client";

/**
 * components/propuestas/CompartirLaPropuesta.tsx — el paso «Compartir» de la ficha (rediseño del
 * 2026-10-05). Era un modal detrás de «Acceso activo»; ahora es un paso propio con todo a la vista:
 *   · el link, para copiarlo (la URL es el acceso: sin contraseña desde el 2026-09-10,
 *     lib/business-cases/access-url.ts);
 *   · cuánto dura (vencido, el cliente ve un aviso con tu correo, no un error);
 *   · qué pasó del lado del cliente: cuándo la abrió y si la aprobó (y si aprobó OTRA versión);
 *   · revocar, si el link se filtró: subirla de nuevo da un link distinto.
 */
import { useState } from "react";
import { ConfirmDialog, Segmentado } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { fechaDeVentas } from "@/lib/business-cases/estado-de-la-propuesta";
import type { AccesoDeLaPropuesta } from "./useAccesoDeLaPropuesta";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
const TARJETA = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-4";

type Duracion = "15" | "30" | "60" | "nunca";
const DURACIONES: { clave: Duracion; etiqueta: string }[] = [
  { clave: "15", etiqueta: "15 días" },
  { clave: "30", etiqueta: "30 días" },
  { clave: "60", etiqueta: "60 días" },
  { clave: "nunca", etiqueta: "No vence" },
];

const DIA = 24 * 60 * 60 * 1000;

export default function CompartirLaPropuesta({
  acceso,
  linkVivo,
  publicada,
  publicadaEn,
  onIrAPropuesta,
  ajustar,
  revocar,
  onRevocada,
}: {
  acceso: AccesoDeLaPropuesta | null;
  linkVivo: boolean;
  publicada: boolean;
  publicadaEn: string | null;
  onIrAPropuesta: () => void;
  ajustar: (body: { expiresInDays?: number | null; clearApproval?: true }) => Promise<string | null>;
  revocar: () => Promise<boolean>;
  onRevocada: () => void;
}) {
  const toast = useToast();
  const [trabajando, setTrabajando] = useState(false);
  const [confirmarRevocar, setConfirmarRevocar] = useState(false);
  // La hora de cuando se abrió el paso: alcanza para contar días, y el render queda puro.
  const [ahora] = useState(() => Date.now());
  const compartida = publicada && linkVivo;

  const cambiar = async (body: { expiresInDays?: number | null; clearApproval?: true }, ok: string) => {
    setTrabajando(true);
    const error = await ajustar(body);
    setTrabajando(false);
    if (error) toast.error(error);
    else toast.success(ok);
  };

  const copiar = () =>
    acceso?.url &&
    navigator.clipboard?.writeText(acceso.url).then(
      () => toast.success("Link copiado."),
      () => toast.error("No se pudo copiar."),
    );

  /* La duración elegida: los días que le quedan, redondeados a la opción si coinciden. Con otra
     fecha (puesta antes con un número libre) ninguna opción queda marcada y se lee la fecha. */
  const vence = acceso?.expiresAt ? new Date(acceso.expiresAt) : null;
  const diasQueQuedan = vence ? Math.max(0, Math.ceil((vence.getTime() - ahora) / DIA)) : null;
  const duracion: Duracion | null = !vence ? "nunca" : (["15", "30", "60"] as const).find((d) => Number(d) === diasQueQuedan) ?? null;
  const vencido = !!vence && vence.getTime() <= ahora;

  if (!compartida) {
    return (
      <div className="flex flex-col gap-5">
        <Encabezado />
        <section className={cn(TARJETA, "items-start border-dashed")}>
          <span className="text-[15px] font-semibold text-fg">
            {acceso?.revokedAt ? "El link está revocado" : "Todavía no la compartes"}
          </span>
          <span className="max-w-xl text-[13px] leading-[19px] text-fg-muted">
            {acceso?.revokedAt
              ? `Lo revocaste el ${fechaDeVentas(acceso.revokedAt)}: quien tenga el link ya no la ve. Súbela de nuevo y nace un link distinto.`
              : "El link nace al subirla al cliente, en el paso Propuesta. Después lo copias acá y ves si la abrió o la aprobó."}
          </span>
          <button
            type="button"
            onClick={onIrAPropuesta}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover"
          >
            Ir a la propuesta
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Encabezado />

      <section className={TARJETA} aria-label="El link">
        <span className={ROTULO}>El link</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={acceso?.url ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link de la propuesta"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-muted px-3 font-mono text-xs text-fg-secondary"
          />
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Copiar el link
          </button>
        </div>
        <span className="text-xs leading-[17px] text-fg-muted">
          Quien reciba el link puede abrirla, sin contraseña. Volver a subirla no cambia el link: quien ya lo tiene ve la versión nueva.
        </span>
      </section>

      <section className={TARJETA} aria-label="Cuánto dura">
        <span className={ROTULO}>Cuánto dura</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-fg-secondary">Vence en</span>
          <Segmentado
            etiqueta="Cuánto dura el link"
            opciones={DURACIONES}
            valor={duracion}
            deshabilitado={trabajando}
            onCambio={(d) =>
              void cambiar(
                { expiresInDays: d === "nunca" ? null : Number(d) },
                d === "nunca" ? "El link ya no vence." : `El link vence en ${d} días.`,
              )
            }
          />
          <span className={cn("text-[13px]", vencido ? "font-semibold text-warn-ink" : "text-fg-muted")}>
            {!vence ? "no vence" : vencido ? `venció el ${fechaDeVentas(vence)}` : `el ${fechaDeVentas(vence)}`}
          </span>
        </div>
        <span className="text-xs leading-[17px] text-fg-muted">
          Vencido, el cliente ve un aviso con tu correo, no un error. Una propuesta aprobada no vence: el cliente puede releer lo que aprobó.
        </span>
      </section>

      <section className={TARJETA} aria-label="El cliente">
        <span className={ROTULO}>El cliente</span>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
            <span className="text-xs text-fg-muted">La abrió</span>
            <span className="text-sm font-semibold text-fg">
              {acceso?.lastUsedAt ? `El ${fechaDeVentas(acceso.lastUsedAt)}` : "Todavía no"}
            </span>
            {publicadaEn && <span className="text-xs text-fg-muted">Subida el {fechaDeVentas(publicadaEn)}</span>}
          </div>
          <Aprobacion acceso={acceso} trabajando={trabajando} onQuitar={() => void cambiar({ clearApproval: true }, "Aprobación quitada.")} />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="max-w-xl text-xs leading-[17px] text-fg-muted">
          Revocar corta el link para todos. Para volver a compartirla se sube de nuevo y nace un link distinto.
        </span>
        <button
          type="button"
          disabled={trabajando}
          onClick={() => setConfirmarRevocar(true)}
          className="rounded-lg border border-danger-line px-3 py-1.5 text-[13px] font-semibold text-danger-ink transition-colors hover:bg-danger-surface disabled:opacity-50"
        >
          Revocar el link
        </button>
      </section>

      <ConfirmDialog
        open={confirmarRevocar}
        onCancel={() => setConfirmarRevocar(false)}
        onConfirm={async () => {
          setConfirmarRevocar(false);
          setTrabajando(true);
          const ok = await revocar();
          setTrabajando(false);
          if (ok) {
            toast.info("Link revocado. Nadie más puede abrirla con ese link.");
            onRevocada();
          } else toast.error("No se pudo revocar.");
        }}
        title="¿Revocar el link?"
        description="Quien tenga el link deja de ver la propuesta. Para compartirla otra vez se sube de nuevo y nace un link distinto."
        confirmLabel="Revocar"
        variant="destructive"
      />
    </div>
  );
}

function Encabezado() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[22px] font-bold leading-7 text-fg">Compartir</h2>
      <p className="text-sm text-fg-secondary">El link que le mandas al cliente y lo que pasó con él.</p>
    </div>
  );
}

function Aprobacion({ acceso, trabajando, onQuitar }: { acceso: AccesoDeLaPropuesta | null; trabajando: boolean; onQuitar: () => void }) {
  const a = acceso?.approval;
  if (!a) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line bg-surface-muted p-3">
        <span className="text-xs text-fg-muted">Aprobación</span>
        <span className="text-sm font-semibold text-fg-muted">○ Todavía no</span>
        <span className="text-xs text-fg-muted">Puede aprobarla desde la propuesta.</span>
      </div>
    );
  }
  const quien = [a.approvedByName, a.approvedByEmail].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3",
        a.desactualizada ? "border-warn-line bg-warn-surface" : "border-success-line bg-success-surface",
      )}
    >
      <span className="text-xs text-fg-muted">Aprobación</span>
      <span className={cn("text-sm font-semibold", a.desactualizada ? "text-warn-ink" : "text-success-ink")}>
        {a.desactualizada ? "● Aprobó otra versión" : `✓ Aprobada el ${fechaDeVentas(a.approvedAt)}`}
      </span>
      <span className="text-xs text-fg-secondary">
        {a.desactualizada
          ? `La aprobó el ${fechaDeVentas(a.approvedAt)}. Después subiste cambios: lo que aprobó no es lo que ve hoy.`
          : quien && `Por ${quien}`}
      </span>
      <button
        type="button"
        disabled={trabajando}
        onClick={onQuitar}
        className="mt-1 self-start text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
      >
        Quitar la aprobación
      </button>
    </div>
  );
}
