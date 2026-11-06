"use client";

/**
 * LoQueDejoLaSesion — lo que queda después de cada sesión y dónde quedó la exploración (2026-11-06, puntos 14 a 16;
 * lib/exploraciones/despues-de-la-sesion.ts):
 *   · LoQueDejoLaSesion: el desafío principal (lo escribe la persona o lo propone Nexus desde la reunión leída), lo que
 *     falta para confirmarlo y de 3 a 5 temas por retomar, cada uno con dónde. Alimenta la guía de la siguiente sesión.
 *   · LaEscalaDespuesDeLaSesion: qué áreas de la escala ya tienen evidencia y cuáles quedan pendientes.
 *   · DondeQuedo: en el inicio, para que cualquiera del equipo vea en qué sesión quedó, qué se averiguó y qué falta.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { coberturaDeLaEscala, dondeQuedo, MAX_RETOMAR, type TemaPorRetomar } from "@/lib/exploraciones/despues-de-la-sesion";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { resultadoAveriguado } from "@/lib/exploraciones/resultado";
import { claveDeLaReunion } from "@/lib/exploraciones/contenido";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { Rotulo, useEditarLaSesion } from "./piezas-de-la-sesion";
import { useSesiones } from "./useSesiones";

const CAMPO =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60";

export function LoQueDejoLaSesion({ pestana, conLectura }: { pestana: PestanaDeSesion; conLectura: boolean }) {
  const { exp, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "despues");
  const s = pestana.sesion;
  const [editando, setEditando] = useState(!s?.desafio);
  const [texto, setTexto] = useState(s?.desafio?.texto ?? "");
  const [falta, setFalta] = useState((s?.desafio?.falta ?? []).join("\n"));
  // El resultado que busca (2026-11-06): si la reunión no lo dejó claro, el desafío queda sin confirmar.
  const marcadoEnLaAgenda = resultadoAveriguado(s ? exp.estado.propuesta.guias[s.id]?.agenda : undefined, s?.hechas);
  const [resultado, setResultado] = useState(s?.desafio?.resultado ?? "");
  const [claro, setClaro] = useState(s?.desafio ? !s.desafio.sinConfirmar : marcadoEnLaAgenda !== false);
  const [retomar, setRetomar] = useState<TemaPorRetomar[]>(s?.retomar?.length ? s.retomar : [{ tema: "", donde: "" }]);
  // El texto que propuso Nexus: si la persona no lo cambia, queda marcado como propuesto.
  const [propuesto, setPropuesto] = useState<string | null>(s?.desafio?.propuesto ? s.desafio.texto : null);
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proponer = async () => {
    if (!pestana.reunion) return;
    setPidiendo(true);
    setError(null);
    try {
      const sesionId = s?.id ?? (await editar(null));
      if (!sesionId) return;
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/despues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesionId, reunion: claveDeLaReunion(pestana.reunion) }),
      });
      const j = (await r.json().catch(() => ({}))) as { desafio?: { texto: string; falta: string[]; resultado?: string; sinConfirmar?: true }; retomar?: TemaPorRetomar[]; error?: string };
      if (!r.ok || !j.desafio) return setError(j.error ?? "No se pudo proponer. Vuelve a intentarlo.");
      setTexto(j.desafio.texto);
      setPropuesto(j.desafio.texto);
      setFalta(j.desafio.falta.join("\n"));
      setResultado(j.desafio.resultado ?? "");
      setClaro(!j.desafio.sinConfirmar);
      setRetomar(j.retomar?.length ? j.retomar : [{ tema: "", donde: "" }]);
      setEditando(true);
    } finally {
      setPidiendo(false);
    }
  };

  const guardar = async () => {
    const t = texto.trim();
    const lineas = falta
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 4);
    const temas = retomar.map((r) => ({ tema: r.tema.trim(), donde: r.donde.trim() })).filter((r) => r.tema && r.donde).slice(0, MAX_RETOMAR);
    const id = await editar(
      (x) => {
        const { desafio: _d, retomar: _r, ...resto } = x;
        void _d;
        void _r;
        return {
          ...resto,
          ...(t
            ? {
                desafio: {
                  texto: t,
                  falta: lineas,
                  ...(propuesto === t ? { propuesto: true as const } : {}),
                  ...(resultado.trim() ? { resultado: resultado.trim().slice(0, 300) } : {}),
                  ...(claro && resultado.trim() ? {} : { sinConfirmar: true as const }),
                },
              }
            : {}),
          ...(temas.length ? { retomar: temas } : {}),
        };
      },
      undefined,
      { exito: "Quedó para la siguiente sesión." },
    );
    if (id) setEditando(false);
  };
  const cambiarTema = (i: number, campo: keyof TemaPorRetomar, v: string) => setRetomar((ts) => ts.map((t, k) => (k === i ? { ...t, [campo]: v } : t)));

  if (!editando && s?.desafio) {
    return (
      <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-4">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[15px] font-semibold text-fg">Lo que dejó esta sesión</h3>
          {puedeEditar && <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>}
        </div>
        <Rotulo>Desafío principal</Rotulo>
        <p className="text-[14px] leading-5 text-fg">
          {s.desafio.propuesto && <IconoDeSugerencia className="mr-1 inline h-[13px] w-[13px] text-brand" />}
          {s.desafio.texto}
        </p>
        <p className="text-[13px] text-fg-secondary">
          <span className="text-fg-muted">El resultado que buscan: </span>
          {s.desafio.resultado ?? "no quedó dicho"}
          {s.desafio.sinConfirmar && (
            <span className="ml-2 rounded-full border border-warn-line bg-warn-surface px-2 py-0.5 text-[11px] font-medium text-warn-ink">Sin confirmar: la próxima guía arranca por ahí</span>
          )}
        </p>
        {s.desafio.falta.length > 0 && (
          <p className="text-[13px] text-fg-secondary">
            <span className="text-fg-muted">Falta para confirmarlo: </span>
            {s.desafio.falta.join(" · ")}
          </p>
        )}
        {s.retomar?.length ? (
          <>
            <Rotulo className="pt-1">Para retomar</Rotulo>
            <ul className="space-y-0.5 text-[13.5px] text-fg">
              {s.retomar.map((r) => (
                <li key={r.tema}>
                  {r.tema} <span className="text-fg-muted">· {r.donde}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    );
  }
  if (!puedeEditar) return null;
  return (
    <section className="space-y-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-fg">Lo que dejó esta sesión</h3>
        {conLectura && pestana.reunion && (
          <BotonBlanco disabled={pidiendo || guardando} onClick={() => void proponer()}>
            {pidiendo ? "Proponiendo…" : "Proponer desde la reunión"}
          </BotonBlanco>
        )}
      </div>
      <p className="text-[13px] text-fg-secondary">El desafío principal que detectaste y lo que hay que retomar. Alimenta la guía de la siguiente sesión.</p>
      {error && <p className="text-[13px] text-danger-ink">{error}</p>}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">Desafío principal</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} rows={2} className={cn(CAMPO, "resize-y")} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">El resultado que buscan, en sus palabras (de dónde a dónde, con qué número y para cuándo)</span>
        <input value={resultado} onChange={(e) => setResultado(e.target.value)} maxLength={300} className={CAMPO} />
      </label>
      <label className="flex items-center gap-2 text-[13px] text-fg">
        <input type="checkbox" checked={claro} onChange={(e) => setClaro(e.target.checked)} className="h-4 w-4 accent-brand" />
        Quedó claro qué resultado busca
        {!claro && <span className="text-xs text-warn-ink">· el desafío queda sin confirmar</span>}
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">Lo que falta para confirmarlo (una por línea)</span>
        <textarea value={falta} onChange={(e) => setFalta(e.target.value)} rows={2} className={cn(CAMPO, "resize-y")} />
      </label>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-fg-secondary">Temas por retomar (de 3 a 5): el tema y con quién o en qué sesión</span>
        {retomar.map((r, i) => (
          <div key={i} className="grid gap-1.5 sm:grid-cols-2">
            <input aria-label="Tema" value={r.tema} onChange={(e) => cambiarTema(i, "tema", e.target.value)} maxLength={200} placeholder="Tema" className={CAMPO} />
            <input aria-label="Dónde retomarlo" value={r.donde} onChange={(e) => cambiarTema(i, "donde", e.target.value)} maxLength={160} placeholder="Con quién o en qué sesión" className={CAMPO} />
          </div>
        ))}
        {retomar.length < MAX_RETOMAR && <BotonTexto onClick={() => setRetomar((ts) => [...ts, { tema: "", donde: "" }])}>+ Agregar tema</BotonTexto>}
      </div>
      <div className="flex gap-2">
        <BotonAzul disabled={guardando || !texto.trim()} onClick={() => void guardar()}>
          Guardar
        </BotonAzul>
        {s?.desafio && <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>}
      </div>
    </section>
  );
}

const TONO = { cubierta: "border-success-line bg-success-surface text-success-ink", "a medias": "border-warn-line bg-warn-surface text-warn-ink", pendiente: "border-line bg-surface-muted text-fg-muted" } as const;

/** Punto 14: qué áreas de la escala ya tienen evidencia y cuáles quedan pendientes. */
export function LaEscalaDespuesDeLaSesion() {
  const { exp, escala, mapa } = useLienzo();
  const areas = coberturaDeLaEscala(escala.areas, exp.estado.areas, mapa.posiciones);
  if (!areas.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-3.5">
      <Rotulo>La escala hasta ahora</Rotulo>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <span key={a.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", TONO[a.estado])}>
            {a.nombre} · {a.estado === "pendiente" ? "pendiente" : `${a.conEvidencia} de ${a.total}`}
          </span>
        ))}
      </div>
      <p className="text-xs text-fg-muted">Con evidencia: lo que dijo el cliente o se vio. No hace falta cubrirlas todas en una sesión.</p>
    </section>
  );
}

/** Punto 16: dónde quedó la exploración, para quien la abre. */
export function DondeQuedo() {
  const { exp } = useLienzo();
  const { todas } = useSesiones();
  const d = dondeQuedo(todas, exp.estado.propuesta.guias);
  const cx = exp.estado.contenido.contexto;
  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-4">
      <h3 className="text-[15px] font-semibold text-fg">Dónde quedó</h3>
      <p className="text-[13.5px] text-fg">
        {cx ? (
          <>
            <span className="text-fg-muted">Objetivo de la exploración: </span>
            {cx.objetivo}
          </>
        ) : (
          <span className="text-fg-muted">Todavía nadie dio el contexto de la exploración: se pide en la Preparación de la próxima sesión.</span>
        )}
      </p>
      <p className="text-[13.5px] text-fg">
        {d.ultima
          ? `Quedó en la sesión ${d.ultima.numero}${d.ultima.titulo ? ` «${d.ultima.titulo}»` : ""}${d.ultima.fecha ? `, del ${diaCorto(d.ultima.fecha)}` : ""}.`
          : "Todavía no hubo sesiones."}
        {d.averiguado.total > 0 && <span className="text-fg-muted"> Se averiguó {d.averiguado.sabidas} de {d.averiguado.total} cosas de sus guías.</span>}
      </p>
      {d.ultima?.desafio && (
        <p className="text-[13.5px] text-fg">
          <span className="text-fg-muted">Desafío principal: </span>
          {d.ultima.desafio.texto}
          {d.ultima.desafio.falta.length > 0 && <span className="text-fg-muted"> · falta: {d.ultima.desafio.falta.join(", ")}</span>}
        </p>
      )}
      {d.retomar.length > 0 && (
        <div>
          <Rotulo>Para retomar</Rotulo>
          <ul className="mt-1 space-y-0.5 text-[13.5px] text-fg">
            {d.retomar.map((r) => (
              <li key={r.tema}>
                {r.tema} <span className="text-fg-muted">· {r.donde}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
