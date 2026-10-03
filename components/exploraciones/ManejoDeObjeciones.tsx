"use client";

/**
 * ManejoDeObjeciones — el cajón «Cómo manejar objeciones».
 *
 * Pedido de Elías (2026-10-01): a mano en cualquier pieza, porque una objeción aparece en la reunión
 * y no espera. Lo abren el botón del pie de la barra de la izquierda y «Cómo responder» en las
 * objeciones del panel de la derecha (el cajón vive en el lienzo). Pestañas: las de ESTA empresa,
 * adaptadas por la guía de la próxima sesión (si el agente ya la armó); LAER (qué es cada paso y una
 * frase para decirlo); las más comunes con sus cuatro pasos; y qué hacer si el cliente no deja
 * explorar. El contenido de base vive en lib/exploraciones/objeciones-comunes.ts.
 */
import { useState } from "react";
import { Badge, Drawer, Tabs } from "@/components/ui";
import { ETIQUETA_DE_LA_OBJECION } from "@/lib/exploraciones/casillas";
import { OBJECION, OBJECIONES_DE_BASE, POCA_APERTURA_DE_BASE } from "@/lib/exploraciones/guia";
import { OBJECIONES_COMUNES, PASOS_LAER, QUE_ES_CADA_PASO } from "@/lib/exploraciones/objeciones-comunes";
import { useLienzo } from "./contexto";

type Pestana = "empresa" | "laer" | "comunes" | "apertura";

/** El botón del pie de la barra de la izquierda. */
export function BotonDeObjeciones({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-left text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      </svg>
      Cómo manejar objeciones
    </button>
  );
}

export default function ManejoDeObjeciones({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { exp } = useLienzo();
  const guia = exp.estado.propuesta.guia;
  const [elegida, setPestana] = useState<Pestana | null>(null);
  const pestana: Pestana = elegida ?? (guia ? "empresa" : "laer");
  const deLaEmpresa = OBJECIONES_DE_BASE.map((base) => guia?.objeciones.find((o) => o.tipo === base.tipo) ?? base);

  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      title="Cómo manejar objeciones"
      description="Con LAER: escuchar, reconocer, explorar y responder. Una objeción bien explorada suele ser una pregunta más del diagnóstico."
      size="lg"
    >
      <div className="space-y-4">
        <Tabs<Pestana>
          aria-label="Manejo de objeciones"
          variant="pill"
          size="sm"
          value={pestana}
          onChange={setPestana}
          items={[
            ...(guia ? [{ key: "empresa" as const, label: "De esta empresa" }] : []),
            { key: "laer", label: "LAER" },
            { key: "comunes", label: "Las más comunes", count: OBJECIONES_COMUNES.length },
            { key: "apertura", label: "Si no deja explorar" },
          ]}
        />

        {pestana === "empresa" && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">Adaptadas a lo que se sabe de la empresa, en la guía de la próxima sesión.</p>
            {deLaEmpresa.map((o) => (
              <div key={o.tipo} className="space-y-2 rounded-lg border border-line bg-surface p-3">
                <p className="text-sm font-semibold text-fg">{OBJECION[o.tipo]}</p>
                <dl className="space-y-1">
                  {PASOS_LAER.map((paso) => (
                    <div key={paso.clave} className="grid grid-cols-[5.5rem_1fr] gap-x-3">
                      <dt className="text-xs font-semibold text-fg-muted">{paso.nombre}</dt>
                      <dd className="text-sm text-fg-secondary">{o[paso.clave]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}

        {pestana === "laer" && (
          <ol className="space-y-3">
            {PASOS_LAER.map((p, i) => (
              <li key={p.clave} className="space-y-1 rounded-lg border border-line bg-surface p-3">
                <p className="text-sm font-semibold text-fg">
                  {i + 1}. {p.nombre}
                </p>
                <p className="text-sm text-fg-secondary">{QUE_ES_CADA_PASO[p.clave].que}</p>
                <p className="text-xs text-fg-muted">Por ejemplo: {QUE_ES_CADA_PASO[p.clave].ejemplo}</p>
              </li>
            ))}
          </ol>
        )}

        {pestana === "comunes" && (
          <div className="space-y-3">
            {OBJECIONES_COMUNES.map((o) => (
              <details key={o.clase} className="group rounded-lg border border-line bg-surface p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-sm font-medium text-fg">{o.dice}</span>
                  <Badge size="xs">{ETIQUETA_DE_LA_OBJECION[o.clase]}</Badge>
                </summary>
                <dl className="mt-3 space-y-2">
                  {PASOS_LAER.map((p) => (
                    <div key={p.clave}>
                      <dt className="text-xs font-semibold text-fg-secondary">{p.nombre}</dt>
                      <dd className="text-sm text-fg-secondary">{o[p.clave]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        )}

        {pestana === "apertura" && (
          <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
            <p className="text-sm text-fg-secondary">{guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}
