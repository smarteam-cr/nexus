"use client";

/**
 * AnalisisDeVentaDeLaReunion — el análisis de una reunión de venta, en la reunión misma (S3, 2026-10-25). Solo lo ven los
 * super admin mientras se prueba (S6, con Andrés).
 *
 * Es COACHING, no evaluación: sin puntaje ni ranking. Arriba, el resumen y quién habló (calculado por Nexus); después cada
 * punto con su lectura y sus citas de la transcripción (lo que Nexus no encontró va marcado «no se encontró en la
 * reunión»), las etapas del proceso consultivo y dos o tres recomendaciones para la siguiente. Se puede marcar la reunión
 * como referencia, y ver al lado las de referencia para comparar. Solo tokens del tema.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS } from "@/lib/analizador-venta/criterio";
import { TEXTO_DEL_VALOR, VALORES, type Cita, type Juicio, type ResultadoDelAnalisis } from "@/lib/analizador-venta/analisis";
import { quienHabloEnPalabras, type QuienHablo } from "@/lib/analizador-venta/quien-hablo";

export interface AnalisisVisto {
  estado: "PROPUESTO" | "ERROR";
  resultado: ResultadoDelAnalisis | null;
  descartados: number;
  error: string | null;
  analizadoAt: string;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });

/** El tono del valor: el primero de su lista es el mejor (verde), el último el peor (ámbar). */
function tonoDelValor(j: Pick<Juicio, "punto" | "valor">): string {
  const lista = VALORES[j.punto];
  const i = j.valor ? lista.indexOf(j.valor) : -1;
  if (j.valor?.startsWith("sin_") && j.valor !== "sin_explorar") return "bg-surface-muted text-fg-muted";
  if (i === 0) return "bg-success-surface text-success-ink";
  if (i === lista.length - 1 || j.valor === "sin_explorar" || j.valor === "ninguno") return "bg-warn-surface text-warn-ink";
  return "bg-surface-muted text-fg-secondary";
}

function Citas({ citas }: { citas: readonly Cita[] }) {
  if (!citas.length) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {citas.map((c, i) => (
        <li key={i} className="border-l-2 border-line pl-2.5 text-xs leading-[18px] text-fg-secondary">
          «{c.texto}» <span className="text-fg-muted">— {c.hablante}, turno {c.turno}</span>
        </li>
      ))}
    </ul>
  );
}

function JuicioVisto({ j, titulo }: { j: Juicio; titulo?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {titulo && <span className="text-[13px] font-semibold text-fg">{titulo}</span>}
        {j.valor && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tonoDelValor(j))}>{TEXTO_DEL_VALOR[j.valor] ?? j.valor}</span>}
      </div>
      <p className="text-[13px] leading-[19px] text-fg">{j.lectura}</p>
      {j.porAusencia && <p className="text-xs text-fg-muted">No se encontró en la reunión: por eso no trae cita.</p>}
      <Citas citas={j.citas} />
    </div>
  );
}

export function BarraDeQuienHablo({ q }: { q: QuienHablo }) {
  if (q.fuente === "nada") return <p className="text-xs text-fg-muted">{quienHabloEnPalabras(q)}</p>;
  return (
    <div className="space-y-1.5">
      <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        <span className="bg-brand" style={{ width: `${q.smarteam.porcentaje}%` }} />
        <span className="bg-success" style={{ width: `${q.cliente.porcentaje}%` }} />
      </div>
      <p className="text-xs text-fg-secondary">
        {quienHabloEnPalabras(q)} <span className="text-fg-muted">({q.fuente === "meet" ? "según las frases de Meet" : "según la transcripción"}; lo cuenta Nexus)</span>
      </p>
      <p className="text-xs text-fg-muted">{q.personas.slice(0, 6).map((p) => `${p.nombre} ${p.porcentaje} %`).join(" · ")}</p>
    </div>
  );
}

export function AnalisisDeVentaDeLaReunion({
  sessionId,
  analisis,
  quienHablo,
  conTranscripcion,
  aviso,
  esDeVenta,
  esReferencia,
  referencias,
}: {
  sessionId: string;
  analisis: AnalisisVisto | null;
  quienHablo: QuienHablo | null;
  conTranscripcion: boolean;
  /** Una reunión de un cliente sin preventa: se analiza a mano si fue de venta (una expansión). */
  aviso: string | null;
  /** Cuenta sola como de venta (y puede ser referencia). */
  esDeVenta: boolean;
  esReferencia: boolean;
  referencias: { sessionId: string; titulo: string; fecha: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [analizando, setAnalizando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/sessions/${encodeURIComponent(sessionId)}`;

  async function analizar() {
    setAnalizando(true);
    setError(null);
    try {
      const r = await fetchJson<{ juicios: number; descartados: number }>(`${base}/analisis-de-venta`, { method: "POST" });
      toast.success(`Listo: ${r.juicios} juicios con su cita${r.descartados ? ` (${r.descartados} sin cita, descartados)` : ""}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar la reunión.");
    } finally {
      setAnalizando(false);
    }
  }

  async function alternarReferencia() {
    setMarcando(true);
    try {
      await fetchJson(`${base}/referencia-de-venta`, { method: esReferencia ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" }, body: esReferencia ? undefined : "{}" });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo marcar la referencia.");
    } finally {
      setMarcando(false);
    }
  }

  const r = analisis?.resultado ?? null;
  const juiciosDe = (punto: Juicio["punto"]) => (r?.juicios ?? []).filter((j) => j.punto === punto);
  const otrasReferencias = referencias.filter((x) => x.sessionId !== sessionId);
  const q = quienHablo;

  return (
    <section aria-label="Análisis de la reunión de venta" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-fg">Cómo fue esta reunión de venta</h2>
          <p className="text-xs text-fg-muted">
            Coaching, no evaluación: es una propuesta de Nexus para que el vendedor la lea y la comente. Cada juicio trae su cita. Solo lo ven los super admin
            mientras se prueba.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conTranscripcion && (
            <Button variant={analisis ? "secondary" : "primary"} size="sm" loading={analizando} onClick={() => void analizar()}>
              {analisis ? "Volver a analizar" : aviso ? "Analizar como reunión de venta" : "Analizar esta reunión"}
            </Button>
          )}
          {conTranscripcion && esDeVenta && (
            <Button variant="secondary" size="sm" loading={marcando} onClick={() => void alternarReferencia()}>
              {esReferencia ? "Quitar como referencia" : "Marcar como referencia"}
            </Button>
          )}
        </div>
      </div>

      {aviso && <Alert variant="info">{aviso}</Alert>}
      {!conTranscripcion && <Alert variant="info">Sin transcripción no se puede analizar: las notas no dicen quién dijo qué.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
      {esReferencia && <p className="text-xs font-semibold text-brand">Esta reunión es una referencia de lo que sí es una reunión consultiva.</p>}

      {q && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-fg-secondary">Quién habló</p>
          <BarraDeQuienHablo q={q} />
        </div>
      )}

      {analisis?.estado === "ERROR" && !r && <Alert variant="danger">El último análisis falló: {analisis.error ?? "sin detalle"}. Vuelve a intentarlo.</Alert>}

      {r && (
        <div className="space-y-5">
          <p className="text-[13px] leading-[20px] text-fg">{r.resumen}</p>
          <p className="text-xs text-fg-muted">
            Analizada el {fecha(analisis!.analizadoAt)}
            {analisis!.descartados ? ` · ${analisis!.descartados} juicios sin una cita que esté en la transcripción se descartaron` : ""}.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {PUNTOS_DEL_ANALISIS.filter((p) => !["quien_hablo", "recomendaciones", "exploracion"].includes(p.id)).map((p) =>
              juiciosDe(p.id as Juicio["punto"]).map((j, i) => <JuicioVisto key={`${p.id}-${i}`} j={j} titulo={p.titulo} />),
            )}
          </div>

          {juiciosDe("exploracion").length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">Qué se exploró, por dimensión de la escala</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {juiciosDe("exploracion").map((j, i) => (
                  <JuicioVisto key={i} j={j} titulo={j.dimension ?? undefined} />
                ))}
              </div>
            </div>
          )}

          {juiciosDe("etapa").length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">El proceso consultivo</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {PROCESO_CONSULTIVO.map((e) =>
                  juiciosDe("etapa")
                    .filter((j) => j.etapa === e.id)
                    .map((j, i) => <JuicioVisto key={`${e.id}-${i}`} j={j} titulo={e.nombre} />),
                )}
              </div>
            </div>
          )}

          {r.recomendaciones.length > 0 && (
            <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
              <h3 className="text-sm font-semibold text-fg">Para la siguiente reunión</h3>
              <ol className="list-decimal space-y-2 pl-5">
                {r.recomendaciones.map((x, i) => (
                  <li key={i} className="text-[13px] leading-[19px] text-fg">
                    {x.texto}
                    <Citas citas={x.citas} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {otrasReferencias.length > 0 && (
        <p className="text-xs text-fg-muted">
          Para comparar, las reuniones de referencia:{" "}
          {otrasReferencias.map((x, i) => (
            <span key={x.sessionId}>
              {i > 0 && " · "}
              <Link href={`/sessions/${x.sessionId}`} className="font-semibold text-brand hover:text-brand-dark">
                {x.titulo}
              </Link>{" "}
              ({fecha(x.fecha)})
            </span>
          ))}
          . Nexus no las usa al analizar (son de otra empresa).
        </p>
      )}
    </section>
  );
}
