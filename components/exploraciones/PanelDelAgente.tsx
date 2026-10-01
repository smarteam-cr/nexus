"use client";

/**
 * PanelDelAgente — el agente de la exploración: prepararla, leer la última reunión y lo que leyó.
 *
 * El agente corre en segundo plano y PROPONE: cuando termina, lo propuesto aparece en el lugar de
 * cada casilla para usarlo o descartarlo. Si el vendedor sale y vuelve, la pantalla retoma la
 * corrida que sigue viva (la consulta al abrir).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, useToast } from "@/components/ui";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";
import { useLienzo } from "./contexto";

interface Corrida {
  id: string;
  estado: "RUNNING" | "DONE" | "ERROR";
  etiqueta: string | null;
  fase: string | null;
  empezo: string;
  propuestos: number | null;
  nadaNuevo: boolean;
  error: string | null;
}

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return diaCorto(iso);
}

export default function PanelDelAgente({ modoPrincipal = "preparar" }: { modoPrincipal?: "preparar" | "leer" }) {
  const { exp, escala, puedeEditar, recargar } = useLienzo();
  const toast = useToast();
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [lanzando, setLanzando] = useState(false);
  const vivo = useRef(true);

  const consultar = useCallback(async (): Promise<Corrida | null> => {
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/agente`);
      const data = (await res.json()) as { corrida?: Corrida | null };
      return data.corrida ?? null;
    } catch {
      return null;
    }
  }, [exp.id]);

  /** Sigue la corrida hasta que termina; al terminar, recarga el lienzo para ver lo propuesto. */
  const seguir = useCallback(async () => {
    for (let i = 0; i < 160 && vivo.current; i++) {
      const c = await consultar();
      if (!vivo.current) return;
      setCorrida(c);
      if (!c || c.estado !== "RUNNING") {
        if (c?.estado === "DONE") {
          await recargar();
          if (c.nadaNuevo) toast.success("No había reuniones nuevas para leer.");
          else toast.success(c.propuestos ? `El agente propuso ${c.propuestos} ${c.propuestos === 1 ? "cosa" : "cosas"}: están en su lugar.` : "El agente no encontró nada nuevo que proponer.");
        } else if (c?.estado === "ERROR") {
          toast.error(c.error ?? "El agente no pudo terminar.");
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }, [consultar, recargar, toast]);

  useEffect(() => {
    vivo.current = true;
    void (async () => {
      const c = await consultar();
      if (!vivo.current) return;
      setCorrida(c);
      if (c?.estado === "RUNNING") void seguir();
    })();
    return () => {
      vivo.current = false;
    };
  }, [consultar, seguir]);

  async function lanzar(modo: "preparar" | "leer") {
    setLanzando(true);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/agente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo lanzar el agente.");
        return;
      }
      void seguir();
    } finally {
      setLanzando(false);
    }
  }

  const corriendo = corrida?.estado === "RUNNING";
  const corridas = [...exp.estado.propuesta.corridas].reverse();
  const yaPreparo = corridas.some((c) => c.modo === "preparar");
  const leido = exp.leido;
  const nombreDeArea = (id: string) => escala.areas.find((a) => a.id === id)?.nombre ?? id;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">El agente</h3>
          <p className="text-xs text-fg-muted">
            Lee lo que hay en HubSpot (la empresa, sus contactos, negocios, notas, llamadas, reuniones y el test) y las reuniones de Meet, y propone qué va en cada casilla con la frase que lo respalda. Nada se confirma solo.
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {modoPrincipal === "leer" ? (
              <>
                <Button size="sm" variant="primary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("leer")}>
                  Leer la última reunión
                </Button>
                <Button size="sm" variant="secondary" disabled={corriendo || lanzando} onClick={() => void lanzar("preparar")}>
                  Volver a preparar
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" loading={lanzando} disabled={corriendo} onClick={() => void lanzar("preparar")}>
                  {yaPreparo ? "Volver a preparar" : "Preparar con el agente"}
                </Button>
                <Button size="sm" variant="secondary" disabled={corriendo || lanzando} onClick={() => void lanzar("leer")}>
                  Leer la última reunión
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {corriendo && (
        <p className="text-xs text-fg-secondary" role="status">
          {corrida?.etiqueta ?? "El agente está trabajando"}: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && <Alert variant="danger">{corrida.error}</Alert>}

      {corridas.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs text-fg-muted">
          {corridas.slice(0, 4).map((c) => (
            <li key={c.id}>
              <Badge size="xs">
                {c.modo === "preparar" ? "Preparó" : "Leyó una reunión"} · {haceCuanto(c.en)} · {c.propuestos} {c.propuestos === 1 ? "propuesta" : "propuestas"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {leido.tests.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-fg-secondary">El test de marketing</p>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            {leido.tests.map((t) => (
              <li key={t.resultado.areaId}>
                {nombreDeArea(t.resultado.areaId)}: lo contestó {t.contacto}
                {t.resultado.fecha ? ` el ${diaCorto(t.resultado.fecha)}` : ""}. Sus niveles entran como propuesta: son de la escala anterior, valídalos en la primera reunión.
              </li>
            ))}
          </ul>
        </div>
      )}

      {leido.agenda.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-fg-secondary">Reuniones agendadas en HubSpot</p>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            {leido.agenda.slice(0, 3).map((a) => (
              <li key={a.id}>
                {diaYHora(a.inicio)} · {a.titulo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {leido.correosSinPermiso > 0 && (
        <p className="text-xs text-fg-muted">
          Hay {leido.correosSinPermiso} {leido.correosSinPermiso === 1 ? "correo" : "correos"} con la empresa que Nexus todavía no puede leer: falta el permiso de correos en la conexión con HubSpot.
        </p>
      )}
    </section>
  );
}
