"use client";

/**
 * ManejoDeObjeciones — el botón «Cómo manejar objeciones», al pie de la barra de la izquierda.
 *
 * Pedido de Elías (2026-10-01): a mano en cualquier pieza, porque una objeción aparece en la reunión
 * y no espera. Abre un cajón con tres pestañas: LAER (qué es cada paso y una frase para decirlo), las
 * objeciones más comunes con sus cuatro pasos, y qué hacer si el cliente no deja explorar. El
 * contenido vive en lib/exploraciones/objeciones-comunes.ts; las de ESTA empresa, adaptadas, están en
 * la guía de la próxima reunión.
 */
import { useState } from "react";
import { Badge, Button, Drawer, Tabs } from "@/components/ui";
import { ETIQUETA_DE_LA_OBJECION } from "@/lib/exploraciones/casillas";
import { POCA_APERTURA_DE_BASE } from "@/lib/exploraciones/guia";
import { OBJECIONES_COMUNES, PASOS_LAER, QUE_ES_CADA_PASO } from "@/lib/exploraciones/objeciones-comunes";
import { useLienzo } from "./contexto";

type Pestana = "laer" | "comunes" | "apertura";

export default function ManejoDeObjeciones() {
  const { irA } = useLienzo();
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("laer");

  return (
    <>
      <Button size="sm" variant="secondary" className="w-full lg:justify-start" onClick={() => setAbierto(true)}>
        Cómo manejar objeciones
      </Button>
      <Drawer
        open={abierto}
        onClose={() => setAbierto(false)}
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
              { key: "laer", label: "LAER" },
              { key: "comunes", label: "Las más comunes", count: OBJECIONES_COMUNES.length },
              { key: "apertura", label: "Si no deja explorar" },
            ]}
          />

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
              <p className="text-xs text-fg-muted">
                Las de esta empresa, adaptadas a lo que se sabe de ella, están en la guía de la próxima reunión.{" "}
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => {
                    setAbierto(false);
                    irA("exploracion");
                  }}
                >
                  Ir a la guía
                </button>
              </p>
            </div>
          )}

          {pestana === "apertura" && (
            <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
              <p className="text-sm text-fg-secondary">{POCA_APERTURA_DE_BASE}</p>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
