"use client";

/**
 * components/tareas/LineaParaAgregar.tsx — anotar una tarea en una línea (docs/tareas-plan.md §5.1).
 *
 * Enter la crea tuya, en tu semana. Con «Para…» otra persona, le llega como propuesta y la decide ella (salvo que seas
 * su líder). Mientras escribes, se compara con tus tareas abiertas, que ya están cargadas (sin red ni IA): si una se
 * parece, pregunta «¿Es T-12?» antes de duplicarla.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { BotonTexto } from "@/components/ui/sistema";
import { esCandidataClara } from "@/lib/tareas/texto";
import type { PersonaVista, TareaVista } from "@/lib/tareas/tipos";

type Cuando = "esta_semana" | "proxima_semana" | "sin_semana";

export interface NuevaDesdeLaLinea {
  titulo: string;
  para: string | null;
  paraEquipo: string | null;
  cuando: Cuando;
  prioridad: "alta" | "media" | "baja";
  privada: boolean;
}

const NOMBRE_DE_CUANDO: Record<Cuando, string> = { esta_semana: "Esta semana", proxima_semana: "La próxima", sin_semana: "Más adelante" };

function ChipDeOpcion({ children, activo, onClick }: { children: React.ReactNode; activo?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-[3px] text-xs transition-colors",
        activo ? "border-info-line bg-info-surface font-semibold text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

export function LineaParaAgregar({
  yo,
  personas,
  equipos,
  abiertas,
  onCrear,
  onEsEsa,
  onTitulo,
}: {
  yo: string;
  personas: readonly PersonaVista[];
  equipos: readonly { clave: string; nombre: string }[];
  /** Tus abiertas (para «¿Es T-12?»). */
  abiertas: readonly TareaVista[];
  onCrear: (n: NuevaDesdeLaLinea) => Promise<void>;
  /** «Sí, es esa»: la trae a esta semana (si estaba en otra) sin crear nada. */
  onEsEsa: (t: TareaVista) => Promise<void>;
  /** Lo que se va escribiendo (para llevárselo al asistente sin volver a tipearlo). */
  onTitulo?: (t: string) => void;
}) {
  const [titulo, guardarTitulo] = useState("");
  const setTitulo = (t: string) => {
    guardarTitulo(t);
    onTitulo?.(t);
  };
  const [para, setPara] = useState<string | null>(null);
  const [paraEquipo, setParaEquipo] = useState<string | null>(null);
  const [cuando, setCuando] = useState<Cuando>("esta_semana");
  const [prioridad, setPrioridad] = useState<"alta" | "media" | "baja">("media");
  const [privada, setPrivada] = useState(false);
  const [eligiendo, setEligiendo] = useState<null | "para" | "cuando">(null);
  const [busca, setBusca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [noEsEsa, setNoEsEsa] = useState<string | null>(null);

  const paraMi = !para && !paraEquipo;
  const parecida = useMemo(() => {
    const texto = titulo.trim();
    if (!paraMi || texto.length < 6) return null;
    return abiertas.find((t) => t.id !== noEsEsa && esCandidataClara(texto, t.titulo)) ?? null;
  }, [titulo, abiertas, paraMi, noEsEsa]);

  const nombrePara = para ? (personas.find((p) => p.email === para)?.nombre ?? para) : paraEquipo ? (equipos.find((e) => e.clave === paraEquipo)?.nombre ?? paraEquipo) : "Para mí";

  async function crear() {
    const t = titulo.trim();
    if (!t || guardando) return;
    setGuardando(true);
    try {
      await onCrear({ titulo: t, para, paraEquipo, cuando, prioridad, privada: paraMi && privada });
      setTitulo("");
      setNoEsEsa(null);
    } finally {
      setGuardando(false);
    }
  }

  const filtradas = personas.filter((p) => p.email !== yo && (!busca || p.nombre.toLowerCase().includes(busca.toLowerCase())));

  return (
    <div data-recorrido="tareas.agregar" className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-lg leading-none text-fg-muted" aria-hidden="true">
          +
        </span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !parecida) void crear();
          }}
          placeholder={paraMi ? "Anota una tarea y presiona Enter" : `Sugiérele una tarea a ${nombrePara.split(" ")[0]}`}
          aria-label="Nueva tarea"
          disabled={guardando}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {parecida && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-info-surface px-3 py-2 text-[13px] text-brand">
          <span className="min-w-0 flex-1">
            ¿Es <span className="font-semibold">T-{parecida.numero}</span> «{parecida.titulo}»?
          </span>
          <BotonTexto
            className="text-brand"
            onClick={() =>
              void onEsEsa(parecida).then(() => {
                setTitulo("");
              })
            }
          >
            Sí, es esa
          </BotonTexto>
          <BotonTexto onClick={() => setNoEsEsa(parecida.id)}>No, es otra</BotonTexto>
        </div>
      )}
      {titulo.trim().length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          <ChipDeOpcion activo={!paraMi} onClick={() => setEligiendo(eligiendo === "para" ? null : "para")}>
            {nombrePara}
          </ChipDeOpcion>
          <ChipDeOpcion activo={cuando !== "esta_semana"} onClick={() => setCuando(cuando === "esta_semana" ? "proxima_semana" : cuando === "proxima_semana" ? "sin_semana" : "esta_semana")}>
            {NOMBRE_DE_CUANDO[cuando]}
          </ChipDeOpcion>
          <ChipDeOpcion activo={prioridad !== "media"} onClick={() => setPrioridad(prioridad === "media" ? "alta" : prioridad === "alta" ? "baja" : "media")}>
            Prioridad {prioridad}
          </ChipDeOpcion>
          {paraMi && (
            <ChipDeOpcion activo={privada} onClick={() => setPrivada((x) => !x)}>
              Solo para mí
            </ChipDeOpcion>
          )}
          <span className="ml-auto text-[11px] text-fg-muted">{paraMi ? "Enter la anota" : "Le llega como propuesta y decide"}</span>
        </div>
      )}
      {eligiendo === "para" && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar a una persona"
            aria-label="Buscar a una persona"
            className="w-full rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-fg outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            <ChipDeOpcion
              activo={paraMi}
              onClick={() => {
                setPara(null);
                setParaEquipo(null);
                setEligiendo(null);
              }}
            >
              Para mí
            </ChipDeOpcion>
            {filtradas.slice(0, 24).map((p) => (
              <ChipDeOpcion
                key={p.email}
                activo={para === p.email}
                onClick={() => {
                  setPara(p.email);
                  setParaEquipo(null);
                  setEligiendo(null);
                  setBusca("");
                }}
              >
                {p.nombre}
              </ChipDeOpcion>
            ))}
          </div>
          {equipos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-fg-muted">A un equipo (le llega a su líder):</span>
              {equipos.map((e) => (
                <ChipDeOpcion
                  key={e.clave}
                  activo={paraEquipo === e.clave}
                  onClick={() => {
                    setParaEquipo(e.clave);
                    setPara(null);
                    setEligiendo(null);
                  }}
                >
                  {e.nombre}
                </ChipDeOpcion>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
