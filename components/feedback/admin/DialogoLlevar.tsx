"use client";

/**
 * «Llevar a la hoja de ruta»: el diálogo que decide a qué tema va un reporte.
 *
 * Dos caminos: sumarlo a un tema que ya existe (el que se parece va primero) o crear uno nuevo, eligiendo
 * en qué columna entra (por defecto «Por decidir»). Se puede avisar o no a quien reportó.
 *
 * Lo comentado desde la escala lleva además la fila de «Cambios pendientes» del manual (qué cambiaría,
 * el caso y qué decisión con el cliente cambiaría): viene propuesta desde el comentario y se corrige acá.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Segmentado } from "@/components/ui/Segmentado";
import { cn } from "@/lib/cn";
import type { DetalleDeEscala } from "@/lib/feedback/escala";
import type { ReporteDeBandeja, TemaResumen } from "@/lib/feedback/queries";
import { COLUMNA, COLUMNAS, type Columna } from "@/lib/feedback/reglas";

type Modo = "existente" | "nuevo";
const COLUMNAS_DE_ENTRADA = COLUMNAS.filter((c) => c !== "listo");

const TONO: Record<string, string> = { muted: "text-fg-muted", warning: "text-warning", brand: "text-brand", success: "text-success" };

export default function DialogoLlevar({
  reporte,
  escala,
  temas,
  sugerido,
  onCerrar,
  onLlevar,
}: {
  reporte: ReporteDeBandeja;
  /** Si es de la escala: lo que se comentó y la fila del manual que se propone. */
  escala: DetalleDeEscala | null;
  temas: TemaResumen[];
  sugerido: string | null;
  onCerrar: () => void;
  onLlevar: (body: unknown, exito: string) => Promise<void>;
}) {
  const [modo, setModo] = useState<Modo>(temas.length ? "existente" : "nuevo");
  const [temaId, setTemaId] = useState<string | null>(sugerido);
  const [busqueda, setBusqueda] = useState("");
  const [titulo, setTitulo] = useState("");
  const [columna, setColumna] = useState<Columna>("decidir");
  const [avisar, setAvisar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [que, setQue] = useState(escala?.sugerida.que ?? "");
  const [caso, setCaso] = useState(escala?.sugerida.caso ?? "");
  const [decision, setDecision] = useState(escala?.sugerida.decision ?? "");
  const nombre = reporte.autor.nombre.split(" ")[0];
  // Un reporte de la escala que todavía no cargó su detalle no puede llevarse: falta la fila del manual.
  const deLaEscala = !!reporte.escala;
  const filaLista = !deLaEscala || (!!escala && que.trim().length >= 3 && decision.trim().length >= 3);

  const ordenados = [...temas]
    .sort((a, b) => (a.id === sugerido ? -1 : b.id === sugerido ? 1 : b.personas - a.personas))
    .filter((t) => !busqueda.trim() || t.titulo.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const elegido = temas.find((t) => t.id === temaId) ?? null;
  const destino = modo === "existente" ? elegido?.titulo ?? "" : titulo.trim();
  const listo = (modo === "existente" ? !!elegido : titulo.trim().length >= 3) && filaLista;

  const confirmar = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    const cambio = deLaEscala ? { cambio: { que: que.trim(), caso: caso.trim(), decision: decision.trim() } } : {};
    await onLlevar(
      modo === "existente"
        ? { accion: "llevar", temaId, avisar, ...cambio }
        : { accion: "llevar", nuevo: { titulo: titulo.trim(), columna }, avisar, ...cambio },
      `Llevado a «${destino}».`,
    );
    setGuardando(false);
  };

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Llevar a la hoja de ruta"
      description={`${reporte.autor.nombre}: «${reporte.cuerpo.length > 140 ? `${reporte.cuerpo.slice(0, 139)}…` : reporte.cuerpo}»`}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!listo || guardando}
            onClick={() => void confirmar()}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Guardando…" : modo === "nuevo" ? "Crear el tema y llevarlo" : "Llevar a la hoja de ruta"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Segmentado<Modo>
          etiqueta="Cómo lo llevas"
          valor={modo}
          onCambio={setModo}
          opciones={[
            { clave: "existente", etiqueta: "Sumarlo a un tema", deshabilitada: temas.length === 0, title: temas.length === 0 ? "Todavía no hay temas" : undefined },
            { clave: "nuevo", etiqueta: "Crear un tema nuevo" },
          ]}
        />

        {modo === "existente" ? (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar un tema…"
              aria-label="Buscar un tema"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
            />
            <div role="radiogroup" aria-label="Tema" className="max-h-[300px] space-y-1.5 overflow-y-auto">
              {ordenados.map((t) => {
                const activo = t.id === temaId;
                const c = COLUMNA[t.columna];
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setTemaId(t.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      activo ? "border-info-line bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("mt-px h-4 w-4 flex-none rounded-full bg-surface", activo ? "border-[5px] border-brand" : "border-[1.5px] border-line")}
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-fg">{t.titulo}</span>
                        {t.id === sugerido && (
                          <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">se parece</span>
                        )}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        <span className={TONO[c.tono]}>{c.marca}</span> {c.nombre} · {t.personas} {t.personas === 1 ? "persona" : "personas"} · {t.reportes}{" "}
                        {t.reportes === 1 ? "reporte" : "reportes"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {ordenados.length === 0 && <p className="text-[13px] text-fg-muted">Ningún tema con ese nombre.</p>}
            </div>
            <p className="text-xs text-fg-muted">El reporte toma la columna del tema: si el tema pasa a «Listo», a {nombre} le llega el aviso.</p>
          </>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-semibold text-fg">Nombre del tema</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Lo que se va a hacer, en pocas palabras"
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
              />
              <span className="block text-xs text-fg-muted">Escríbelo como lo que se va a hacer, no como el problema: «Corregir la etapa desde la ficha».</span>
            </label>
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-fg">En qué columna entra</p>
              <Segmentado<Columna>
                etiqueta="En qué columna entra"
                valor={columna}
                onCambio={setColumna}
                opciones={COLUMNAS_DE_ENTRADA.map((c) => ({ clave: c, etiqueta: COLUMNA[c].nombre }))}
              />
              <p className="text-xs text-fg-muted">{COLUMNA[columna].ayuda}</p>
            </div>
          </>
        )}

        {deLaEscala && (
          <div className="space-y-2.5 rounded-lg border border-line bg-surface-muted px-3 py-3">
            <div className="space-y-0.5">
              <p className="text-[13px] font-semibold text-fg">La fila del manual · {reporte.escala?.ancla}</p>
              <p className="text-xs text-fg-muted">Va a «Cambios pendientes» del manual de la escala. Viene propuesta desde el comentario: corrígela.</p>
            </div>
            {!escala ? (
              <p className="text-xs text-fg-muted">Cargando lo que se comentó…</p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="block text-xs font-semibold text-fg-secondary">Qué cambiaría</span>
                  <textarea
                    value={que}
                    onChange={(e) => setQue(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-semibold text-fg-secondary">Caso que lo originó (opcional)</span>
                  <textarea
                    value={caso}
                    onChange={(e) => setCaso(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-semibold text-fg-secondary">Qué decisión con el cliente cambiaría</span>
                  <textarea
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                    rows={2}
                    placeholder="Obligatorio: si no cambia ninguna decisión, no es un cambio a la escala."
                    className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                  />
                </label>
              </>
            )}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="mt-0.5 accent-brand" />
          <span className="space-y-0.5">
            <span className="block text-[13px] font-semibold text-fg">Avisarle a {nombre}</span>
            <span className="block text-xs text-fg-muted">
              Le llega en «Para ti»: su reporte está en la hoja de ruta{destino ? `, en «${destino}»` : ""}.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
