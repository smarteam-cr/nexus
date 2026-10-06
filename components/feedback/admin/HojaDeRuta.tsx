"use client";

/**
 * La Hoja de ruta de /feedback: los temas, en cuatro columnas (Por decidir · Planeado · En curso · Listo).
 *
 * Un tema junta los reportes que piden lo mismo. Llega acá de tres maneras, y cada tarjeta dice de cuál
 * salió: desde un reporte de la Bandeja («Llevar a la hoja de ruta»), con «Nuevo tema» (lo que alguien dijo
 * en una sesión) o sumando el reporte que se parecía. Nada llega solo. Dentro de cada columna, primero
 * lo que pidieron más personas y, a igual cuenta, lo que les frena el trabajo: sin puntaje inventado.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Segmentado } from "@/components/ui/Segmentado";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { TemaDeHoja } from "@/lib/feedback/queries";
import { COLUMNA, COLUMNAS, type Columna } from "@/lib/feedback/reglas";
import { Iniciales } from "../piezas";

const TONO: Record<string, string> = { muted: "text-fg-muted", warning: "text-warning", brand: "text-brand", success: "text-success" };
const CLAVE_COMO = "nexus-feedback-como-oculto";

export default function HojaDeRuta({ temas }: { temas: TemaDeHoja[] }) {
  const router = useRouter();
  const toast = useToast();
  const [como, setComo] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia del navegador, leída al montar
      if (localStorage.getItem(CLAVE_COMO) === "1") setComo(false);
    } catch {
      /* sin storage: se ve abierto */
    }
  }, []);

  const alternarComo = () => {
    setComo((c) => {
      try {
        localStorage.setItem(CLAVE_COMO, c ? "1" : "0");
      } catch {
        /* nada */
      }
      return !c;
    });
  };

  /**
   * Los cambios de la escala que están en la hoja de ruta, con las columnas de «Cambios pendientes» del
   * manual (Markdown): se pegan en el manual o en el chat de la escala. Lo que se comenta en la escala
   * llega acá con esa fila desde el 2026-10-05.
   */
  const copiarCambiosDeLaEscala = async () => {
    try {
      const r = await fetch("/api/feedback/cambios-de-la-escala", { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { markdown?: string; filas?: number; error?: string } | null;
      if (!r.ok || !d?.markdown) {
        toast.error(d?.error ?? "No se pudieron leer los cambios de la escala.");
        return;
      }
      if (!d.filas) {
        toast.info("No hay cambios de la escala en la hoja de ruta.");
        return;
      }
      await navigator.clipboard.writeText(d.markdown);
      toast.success(`Copiados ${d.filas} ${d.filas === 1 ? "cambio" : "cambios"} de la escala, con las columnas del manual.`);
    } catch {
      toast.error("No se pudieron copiar los cambios de la escala.");
    }
  };

  const mover = async (id: string, columna: Columna, titulo: string) => {
    setMoviendo(null);
    try {
      const r = await fetch(`/api/feedback/temas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columna }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo mover el tema.");
        return;
      }
      toast.success(columna === "listo" ? `«${titulo}» quedó listo: se avisó a quien lo pidió.` : `«${titulo}» pasó a «${COLUMNA[columna].nombre}».`);
      router.refresh();
    } catch {
      toast.error("No hay conexión.");
    }
  };

  return (
    <div className="space-y-5">
      <section aria-label="Cómo llega un tema a la hoja de ruta" className="space-y-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-fg">Cómo llega un tema a la hoja de ruta</p>
          <button type="button" onClick={alternarComo} aria-expanded={como} className="text-xs text-fg-muted hover:text-fg">
            {como ? "Ocultar" : "Ver"}
          </button>
        </div>
        {como && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Desde la Bandeja", "En un reporte, «Llevar a la hoja de ruta»: lo sumas a un tema o creas uno nuevo. Es el camino normal."],
                ["Porque se parece", "La Bandeja muestra el tema al que se parece cada reporte. Con «Llevarlo ahí» lo sumas de un clic."],
                ["A mano, con «Nuevo tema»", "Para lo que te dijeron en una sesión, o lo que viste tú. Puedes ponerlo a nombre de quien lo pidió."],
              ].map(([titulo, texto], i) => (
                <div key={titulo} className="flex gap-2.5">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border border-line bg-surface-muted text-xs font-bold text-fg-secondary">
                    {i + 1}
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-[13px] font-semibold text-fg">{titulo}</span>
                    <span className="block text-xs text-fg-secondary">{texto}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-fg-muted">
              Un tema nuevo entra en «Por decidir», salvo que al crearlo elijas otra columna. Después lo mueves con «Mover a…». Nada llega solo: un reporte sin decidir se
              queda en la Bandeja.
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void copiarCambiosDeLaEscala()}
          title="Los cambios de la escala que están en la hoja de ruta, en una tabla con las columnas de «Cambios pendientes» del manual."
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          Copiar los cambios de la escala
        </button>
        <button
          type="button"
          onClick={() => setNuevo(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo tema
        </button>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map((c) => {
          const def = COLUMNA[c];
          const deLaColumna = temas.filter((t) => t.columna === c);
          return (
            <section key={c} aria-label={def.nombre} className="space-y-2.5 rounded-xl border border-line bg-surface-muted p-3">
              <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 px-0.5")}>
                <span className={cn("text-xs tracking-normal", TONO[def.tono])}>{def.marca}</span>
                {c === "listo" ? "Listo · últimas 4 semanas" : def.nombre} · {deLaColumna.length}
              </p>
              <p className="px-0.5 text-xs text-fg-muted">{def.ayuda}</p>
              {deLaColumna.length === 0 && (
                <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-muted">
                  {c === "decidir" ? "Lleva un reporte desde la Bandeja o crea un tema." : "Nada en esta columna."}
                </p>
              )}
              {deLaColumna.map((t) => (
                <Tarjeta key={t.id} t={t} abierto={moviendo === t.id} onAbrir={() => setMoviendo(moviendo === t.id ? null : t.id)} onMover={(col) => void mover(t.id, col, t.titulo)} />
              ))}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-fg-muted">
        Dentro de cada columna, primero lo que pidieron más personas y, a igual cuenta, lo que les frena el trabajo. Al pasar un tema a «En curso» o a «Listo», a cada
        persona que lo pidió le llega el aviso.
      </p>

      {nuevo && <NuevoTema onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function Tarjeta({ t, abierto, onAbrir, onMover }: { t: TemaDeHoja; abierto: boolean; onAbrir: () => void; onMover: (c: Columna) => void }) {
  const caras = t.personas.slice(0, 4);
  const resto = t.personas.length - caras.length;
  return (
    <article className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
      <p className="flex items-start gap-1.5">
        {t.columna === "listo" && <span className="font-bold text-success">✓</span>}
        <span className="text-[15px] font-semibold leading-5 text-fg">{t.titulo}</span>
      </p>
      {t.detalle && <p className="text-[13px] leading-[1.45] text-fg-secondary">{t.detalle}</p>}
      <p className="flex flex-wrap items-center gap-1.5">
        {t.pantalla && <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">{t.pantalla}</span>}
        {t.frena > 0 && (
          <span className="rounded-full border border-warn-line bg-warn-surface px-2 text-[11px] font-semibold text-warn-ink">
            {t.frena === 1 ? "A 1 le frena" : `A ${t.frena} les frena`}
          </span>
        )}
      </p>
      <p className="text-xs text-fg-muted">{t.origenTexto}</p>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex">
            {caras.map((p, i) => (
              <Iniciales key={p.email} texto={p.iniciales} className={cn("h-[22px] w-[22px] border-2 border-surface text-[9px]", i > 0 && "-ml-1.5")} />
            ))}
            {resto > 0 && <Iniciales texto={`+${resto}`} className="-ml-1.5 h-[22px] w-[22px] border-2 border-surface text-[9px]" />}
          </span>
          <span className="whitespace-nowrap text-xs text-fg-muted">
            {t.personas.length} {t.personas.length === 1 ? "persona" : "personas"} · {t.reportes} {t.reportes === 1 ? "reporte" : "reportes"}
          </span>
        </span>
        <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex-none text-xs font-semibold text-fg-secondary hover:text-fg">
          Mover a… ▾
        </button>
      </div>
      {abierto && (
        <div role="menu" aria-label="Mover a" className="space-y-0.5 rounded-lg border border-line bg-surface p-1">
          {COLUMNAS.filter((c) => c !== t.columna).map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              onClick={() => onMover(c)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg-secondary hover:bg-surface-hover hover:text-fg"
            >
              <span className={cn("w-3 text-center", TONO[COLUMNA[c].tono])}>{COLUMNA[c].marca}</span>
              {COLUMNA[c].nombre}
              <span className="ml-auto text-[11px] text-fg-muted">{COLUMNA[c].corta}</span>
            </button>
          ))}
        </div>
      )}
      {t.pie && <p className="text-xs text-fg-muted">{t.pie}</p>}
    </article>
  );
}

function NuevoTema({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [pantalla, setPantalla] = useState("");
  const [aNombreDe, setANombreDe] = useState("");
  const [columna, setColumna] = useState<Columna>("decidir");
  const [guardando, setGuardando] = useState(false);
  const listo = titulo.trim().length >= 3;

  const crear = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/feedback/temas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          detalle: detalle.trim() || undefined,
          pantalla: pantalla.trim() || undefined,
          aNombreDe: aNombreDe.trim() || undefined,
          columna,
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(d?.error ?? "No se pudo crear el tema.");
        return;
      }
      toast.success("Tema creado.");
      onCerrar();
      router.refresh();
    } finally {
      setGuardando(false);
    }
  };

  const campo = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none";
  return (
    <Modal
      open
      onClose={onCerrar}
      title="Nuevo tema"
      description="Para lo que alguien te dijo en una sesión o lo que viste tú. Los reportes se suman después, desde la Bandeja."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded px-2.5 py-2 text-[13px] text-fg-muted hover:text-fg">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!listo || guardando}
            onClick={() => void crear()}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear el tema"}
          </button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-fg">Nombre del tema</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lo que se va a hacer, en pocas palabras" className={campo} />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-semibold text-fg">Qué pide, en una línea</span>
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Opcional" className={campo} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">Dónde se nota</span>
            <input value={pantalla} onChange={(e) => setPantalla(e.target.value)} placeholder="Clientes, Cobranza…" className={campo} />
          </label>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-semibold text-fg">A nombre de</span>
            <input value={aNombreDe} onChange={(e) => setANombreDe(e.target.value)} placeholder="Quién lo pidió (opcional)" className={campo} />
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-fg">En qué columna entra</p>
          <Segmentado<Columna>
            etiqueta="En qué columna entra"
            valor={columna}
            onCambio={setColumna}
            opciones={COLUMNAS.filter((c) => c !== "listo").map((c) => ({ clave: c, etiqueta: COLUMNA[c].nombre }))}
          />
          <p className="text-xs text-fg-muted">{COLUMNA[columna].ayuda}</p>
        </div>
      </div>
    </Modal>
  );
}
