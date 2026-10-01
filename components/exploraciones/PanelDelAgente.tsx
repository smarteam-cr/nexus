"use client";

/**
 * PanelDelAgente — el agente de la exploración: prepararla, leer las reuniones y la historia de lo
 * que leyó.
 *
 * El agente corre en segundo plano y PROPONE: cuando termina, lo propuesto aparece en el lugar de
 * cada casilla para usarlo o descartarlo. Si el vendedor sale y vuelve, la pantalla retoma la
 * corrida que sigue viva (la consulta al abrir). Las reuniones de Meet las lee solo cuando llega la
 * transcripción; las que quedan sin leer se avisan acá y en «Qué sigue».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, useToast } from "@/components/ui";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import type { CorridaDelAgente } from "@/lib/exploraciones/contenido";
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

/** Qué casillas alimentó una corrida, en palabras: «Metas», «Retos» y el nivel de 3 dimensiones. */
function queAlimento(claves: readonly string[]): string {
  const partes: string[] = [];
  const casillas = claves.filter((c) => c.startsWith("casilla:")).map((c) => `«${definicionDe(c.slice(8) as ClaveDeCasilla).etiqueta}»`);
  partes.push(...new Set(casillas));
  const contar = (prefijo: string) => claves.filter((c) => c.startsWith(prefijo)).length;
  const niveles = contar("nivel:");
  if (niveles) partes.push(niveles === 1 ? "el nivel de una dimensión" : `el nivel de ${niveles} dimensiones`);
  if (contar("falta:")) partes.push("lo que pide Funcional");
  if (contar("aExplorar:")) partes.push("las dimensiones a explorar");
  if (contar("area:")) partes.push("las áreas en juego");
  if (claves.includes("edicion") || claves.includes("perfil")) partes.push("la industria y el perfil");
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

function Historia({ corridas }: { corridas: CorridaDelAgente[] }) {
  if (corridas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-fg-secondary">Lo que leyó</p>
      <ul className="space-y-2">
        {corridas.slice(0, 5).map((c) => {
          const alimento = queAlimento(c.alimento);
          return (
            <li key={c.id} className="text-xs text-fg-muted">
              <p className="text-fg-secondary">
                {diaYHora(c.en)} · {c.modo === "preparar" ? "Preparó" : c.automatica ? "Leyó sola la reunión que llegó" : "Leyó lo nuevo"}
                {" · "}
                {c.propuestos === 0 ? "nada nuevo que proponer" : `${c.propuestos} ${c.propuestos === 1 ? "propuesta" : "propuestas"}`}
                {alimento ? ` en ${alimento}` : ""}
              </p>
              {c.leyo.length > 0 && (
                <details>
                  <summary className="cursor-pointer select-none">
                    {c.leyo.length} {c.leyo.length === 1 ? "fuente" : "fuentes"}
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {c.leyo.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PanelDelAgente({ modoPrincipal = "preparar" }: { modoPrincipal?: "preparar" | "leer" }) {
  const { exp, escala, puedeEditar, recargar, sinLeer } = useLienzo();
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
  // Con una reunión sin leer, leerla es lo primero, en cualquier paso.
  const leerPrimero = modoPrincipal === "leer" || sinLeer.length > 0;
  const leido = exp.leido;
  // La foto es de la última lectura: lo que ya pasó desde entonces no es agenda (es «sin leer»).
  const agenda = leido.agenda.filter((a) => Date.parse(a.inicio) > Date.now());
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
            {leerPrimero ? (
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

      {sinLeer.length > 0 && !corriendo && (
        <Alert variant="warning" title={sinLeer.length === 1 ? "Hay una reunión sin leer" : `Hay ${sinLeer.length} reuniones sin leer`}>
          <ul className="space-y-0.5">
            {sinLeer.slice(0, 4).map((r) => (
              <li key={`${r.origen}-${r.id}`}>
                «{r.titulo}», {diaCorto(r.fecha)}
                {r.origen === "hubspot" ? " (agendada en HubSpot: se lee lo que dejó el notetaker)" : ""}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Historia corridas={corridas} />

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

      {agenda.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-fg-secondary">Reuniones agendadas en HubSpot</p>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            {agenda.slice(0, 3).map((a) => (
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
