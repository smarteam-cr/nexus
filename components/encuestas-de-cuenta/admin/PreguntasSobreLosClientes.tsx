"use client";

/**
 * Feedback › Encuestas › Sobre los clientes (2026-10-13): las preguntas que Customer Success responde al entrar a cada
 * cliente (¿tiene apertura a la asesoría?). Por pregunta: si está activa, qué dice cada cliente (la última respuesta de
 * cada persona) y la exportación con TODOS los eventos para analizarlos aparte. Datos: GET /api/encuestas-de-cuenta.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Segmentado } from "@/components/ui/Segmentado";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { ResumenDePregunta } from "@/lib/encuestas-de-cuenta/servidor";
import type { LecturaDeCliente } from "@/lib/encuestas-de-cuenta/reglas";

type Filtro = "todos" | "si" | "no" | "sin";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(v: string | Date): string {
  const d = new Date(new Date(v).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const ROTULO: Record<string, string> = { si: "Sí", no: "No", no_se: "No sé" };
const CHIP: Record<string, string> = {
  si: "border-success-line bg-success-surface text-success-ink",
  no: "border-line bg-surface-hover text-fg-secondary",
  no_se: "border-line bg-surface text-fg-muted",
};

function Respuesta({ valor }: { valor: string }) {
  return <span className={cn("rounded-full border px-2 py-px text-[11px] font-semibold", CHIP[valor] ?? CHIP.no_se)}>{ROTULO[valor] ?? valor}</span>;
}

export default function PreguntasSobreLosClientes() {
  const [preguntas, setPreguntas] = useState<ResumenDePregunta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/encuestas-de-cuenta", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "No se pudieron cargar las preguntas sobre los clientes.");
        return j.preguntas as ResumenDePregunta[];
      })
      .then((p) => vivo && setPreguntas(p))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar las preguntas sobre los clientes."));
    return () => {
      vivo = false;
    };
  }, [n]);

  if (error) return <Alert variant="warning">{error}</Alert>;
  if (!preguntas) {
    return (
      <SkeletonPanel minH="min-h-[320px]">
        <SkeletonText lines={5} />
      </SkeletonPanel>
    );
  }
  return (
    <div className="space-y-6">
      {preguntas.map((p) => (
        <TarjetaDeLaPregunta key={p.clave} p={p} onCambio={() => setN((x) => x + 1)} />
      ))}
    </div>
  );
}

function TarjetaDeLaPregunta({ p, onCambio }: { p: ResumenDePregunta; onCambio: () => void }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [cambiando, setCambiando] = useState(false);
  const toast = useToast();
  const r = p.resultados;
  const desacuerdos = r.clientes.filter((c) => c.desacuerdo).length;

  const visibles = useMemo(() => {
    const f: Record<Filtro, (c: LecturaDeCliente) => boolean> = {
      todos: () => true,
      si: (c) => c.lectura === "si",
      no: (c) => c.lectura === "no",
      sin: (c) => c.lectura === null,
    };
    return r.clientes.filter(f[filtro]);
  }, [r.clientes, filtro]);

  const alternar = useCallback(async () => {
    setCambiando(true);
    try {
      const res = await fetch("/api/encuestas-de-cuenta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: p.clave, activa: !p.activa }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "No se pudo cambiar.");
      toast.success(p.activa ? "Pausada: no se le pregunta a nadie hasta que la actives." : "Activa: se pregunta al entrar a cada cliente.");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar.");
    } finally {
      setCambiando(false);
    }
  }, [p.clave, p.activa, onCambio, toast]);

  const nombre = (email: string) => p.nombres[email] ?? email;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-fg">{p.pregunta}</h2>
            <span
              className={cn(
                "rounded-full border px-2 py-px text-[11px] font-semibold",
                p.activa ? "border-success-line bg-success-surface text-success-ink" : "border-line bg-surface-hover text-fg-muted",
              )}
            >
              {p.activa ? "Activa" : "Pausada"}
            </span>
          </div>
          <p className="text-[13px] text-fg-muted">{p.descripcion}</p>
          <p className="text-xs text-fg-muted">
            Se le pregunta a {p.roles.join(" y ")} al entrar a un cliente de la cartera. Con «No sé», otra vez después de {p.diasParaVolverConNoSe} días.
            {p.actualizadaPorEmail && p.actualizadaAt ? ` Cambió ${nombre(p.actualizadaPorEmail)} el ${fecha(p.actualizadaAt)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/encuestas-de-cuenta/exportar?clave=${encodeURIComponent(p.clave)}`}
            className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Descargar CSV
          </a>
          <BotonBlanco onClick={alternar} disabled={cambiando}>
            {p.activa ? "Pausar" : "Activar"}
          </BotonBlanco>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Sí", r.conteo.si],
          ["No", r.conteo.no],
          ["Sin saber", r.conteo.no_se],
          ["Con respuestas distintas", desacuerdos],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-line bg-surface-muted px-3 py-2">
            <dt className={ROTULO_DEL_SISTEMA}>{rotulo}</dt>
            <dd className="text-[22px] font-bold tabular-nums text-fg">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-fg-muted">
        {r.clientes.length} {r.clientes.length === 1 ? "cliente" : "clientes"} con respuesta · {r.personas} {r.personas === 1 ? "persona" : "personas"} ·{" "}
        {r.respuestas} {r.respuestas === 1 ? "respuesta" : "respuestas"} · se mostró {p.mostrada} {p.mostrada === 1 ? "vez" : "veces"} · «Ahora no» {p.ahoraNo}.
        Un cliente cuenta por lo que dice la mayoría de sus respuestas; «No sé» no cuenta.
      </p>

      {r.clientes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-muted">
          {p.activa ? "Todavía nadie respondió. Aparece sola cuando alguien de Customer Success entra a un cliente." : "Está pausada: actívala para que se pregunte."}
        </p>
      ) : (
        <>
          <Segmentado<Filtro>
            etiqueta="Qué clientes"
            valor={filtro}
            onCambio={setFiltro}
            opciones={[
              { clave: "todos", etiqueta: "Todos", cuenta: r.clientes.length },
              { clave: "si", etiqueta: "Sí", cuenta: r.conteo.si },
              { clave: "no", etiqueta: "No", cuenta: r.conteo.no },
              { clave: "sin", etiqueta: "Sin saber", cuenta: r.conteo.no_se },
            ]}
          />
          <ul className="divide-y divide-line rounded-xl border border-line">
            {visibles.map((c) => (
              <li key={c.clientId ?? c.clientNombre} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {c.clientId ? (
                    <Link href={`/clients/${c.clientId}`} className="text-[13.5px] font-semibold text-fg hover:text-brand">
                      {c.clientNombre}
                    </Link>
                  ) : (
                    <span className="text-[13.5px] font-semibold text-fg">{c.clientNombre}</span>
                  )}
                  {c.desacuerdo && <p className="text-xs text-warning">Respuestas distintas: conviene hablarlo.</p>}
                </div>
                <ul className="flex flex-col gap-1.5 sm:max-w-[60%]">
                  {c.personas.map((x) => (
                    <li key={x.personaEmail} className="flex flex-wrap items-baseline gap-2 text-[13px]">
                      <Respuesta valor={x.valor} />
                      <span className="text-fg-secondary">
                        {nombre(x.personaEmail)}
                        {x.rol ? ` · ${x.rol}` : ""}
                        {x.esEncargado ? " · encargado" : ""}
                      </span>
                      <span className="text-xs tabular-nums text-fg-muted">{fecha(x.fecha)}</span>
                      {x.porQue && <span className="w-full text-xs text-fg-muted">«{x.porQue}»</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
