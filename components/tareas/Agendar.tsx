"use client";

/**
 * components/tareas/Agendar.tsx — llevar tareas de la semana a tu Google Calendar (docs/tareas-plan.md §5.9).
 *
 * Una tarea, su bloque. A la izquierda, dos tercios: tu semana (`AgendaDeLaSemana`) con lo ocupado en gris y lo que
 * propone Nexus en azul punteado. A la derecha, la tanda: por tarea, la duración en chips (sin ninguna elegida si no la
 * tenía: una tarea sin duración no se agenda), el día y la hora en selectores (es también el camino por teclado) y
 * «Quitar de esta tanda». El único azul: «Agendar las N en tu calendario».
 *
 * Nexus crea los bloques con tu clic. Si todavía no tiene el permiso de Calendar (409 `sinPermiso`), el diálogo cambia a
 * plan B: un enlace por tarea que abre Calendar con el evento ya lleno y, al volver, «Ya la agendé».
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgendaDeLaSemana, Modal, type BloqueDeLaAgenda } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { DURACIONES_DE_AGENDA, FRANJA_DE_AGENDA, PASO_DE_AGENDA_MIN } from "@/lib/tareas/reglas";
import { enlaceDePlantilla, instanteCR, posicionEnLaGrilla, proponerHorarios, type Intervalo } from "@/lib/tareas/agenda";
import type { PosicionEnMinutos } from "@/lib/ui/agenda-geometria";
import { diaCortoConSemana, horaCorta, horaDeCostaRica, lunesDeHoy, rangoDeLaSemana, sumarDias, sumarSemanas } from "@/lib/tareas/semana";
import type { TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, ErrorDeApi } from "./api";
import { horas } from "./chips";

interface EnLaTanda {
  t: TareaVista;
  minutos: number | null;
  inicio: string | null;
  fin: string | null;
  /** La persona eligió el día y la hora: Nexus no lo vuelve a proponer. */
  aMano: boolean;
  /** Ya quedó en el calendario (en esta apertura). */
  hecha: boolean;
}

type Ocupado = { inicio: string; fin: string; titulo: string; todoElDia: boolean; deTarea: boolean };

const ETIQUETA_DE_DURACION: Record<number, string> = { 30: "0,5 h", 60: "1 h", 120: "2 h", 240: "4 h" };

/** Las horas que ofrece el selector: de 8:00 hasta el final de la grilla, cada 15 minutos (lo mismo que deja el arrastre). */
const HORAS_DEL_SELECTOR = (() => {
  const salida: { h: number; m: number }[] = [];
  for (let h = FRANJA_DE_AGENDA.desdeHora; h < FRANJA_DE_AGENDA.grillaHastaHora; h++) {
    for (let m = 0; m < 60; m += PASO_DE_AGENDA_MIN) salida.push({ h, m });
  }
  return salida;
})();

function lunesInicial(tareas: TareaVista[]): string {
  const hoy = lunesDeHoy();
  const semanas = tareas.map((t) => t.semana).filter((s): s is string => !!s && s >= hoy).sort();
  return semanas[0] ?? hoy;
}

export function Agendar({ tareas, onCerrar }: { tareas: TareaVista[]; onCerrar: () => void }) {
  const toast = useToast();
  const hoy = lunesDeHoy();
  const [lunes, setLunes] = useState(() => lunesInicial(tareas));
  const [tanda, setTanda] = useState<EnLaTanda[]>(() =>
    tareas.map((t) => ({ t, minutos: t.minutosEstimados && (DURACIONES_DE_AGENDA as readonly number[]).includes(t.minutosEstimados) ? t.minutosEstimados : t.minutosEstimados ?? null, inicio: null, fin: null, aMano: false, hecha: false })),
  );
  const [ocupado, setOcupado] = useState<Ocupado[]>([]);
  const [avisoDelCalendario, setAvisoDelCalendario] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [planB, setPlanB] = useState<{ url: string; motivo: string } | null>(null);
  const [foco, setFoco] = useState<string | null>(null);

  // Lo ocupado de tu calendario esa semana.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    apiTareas
      .ocupado(lunes)
      .then((r) => {
        if (!vivo) return;
        setOcupado(r.ocupado);
        setAvisoDelCalendario(r.error ?? (r.sinGoogle ? "Nexus no está conectado a Google en este entorno: la semana sale sin lo ocupado." : null));
      })
      .catch(() => vivo && setAvisoDelCalendario("No se pudo leer tu calendario: la semana sale sin lo ocupado."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [lunes]);

  // Lo que propone Nexus: el primer hueco para cada tarea que no se eligió a mano. Lo elegido a mano cuenta como ocupado.
  const recalcular = useCallback(
    (actual: EnLaTanda[]): EnLaTanda[] => {
      const fijos: Intervalo[] = [
        ...ocupado.map((o) => ({ inicio: o.inicio, fin: o.fin })),
        ...actual.filter((x) => (x.aMano || x.hecha) && x.inicio && x.fin).map((x) => ({ inicio: x.inicio!, fin: x.fin! })),
      ];
      const libres = actual.filter((x) => !x.aMano && !x.hecha);
      const propuestos = proponerHorarios(
        lunes,
        libres.map((x) => ({ id: x.t.id, minutos: x.minutos ?? 0, prioridad: x.t.prioridad, venceEl: x.t.venceEl })),
        fijos,
      );
      const porId = new Map(propuestos.map((p) => [p.tareaId, p]));
      return actual.map((x) => (x.aMano || x.hecha ? x : { ...x, inicio: porId.get(x.t.id)?.inicio ?? null, fin: porId.get(x.t.id)?.fin ?? null }));
    },
    [lunes, ocupado],
  );

  useEffect(() => {
    if (cargando) return;
    setTanda((actual) => recalcular(actual));
  }, [cargando, recalcular]);

  function cambiar(id: string, cambio: Partial<EnLaTanda>, recalcularLuego = true) {
    setTanda((actual) => {
      const nueva = actual.map((x) => (x.t.id === id ? { ...x, ...cambio } : x));
      return recalcularLuego ? recalcular(nueva) : nueva;
    });
  }

  function elegirDuracion(x: EnLaTanda, minutos: number) {
    if (x.aMano && x.inicio) {
      cambiar(x.t.id, { minutos, fin: new Date(Date.parse(x.inicio) + minutos * 60_000).toISOString() });
    } else {
      cambiar(x.t.id, { minutos });
    }
  }

  function elegirHorario(x: EnLaTanda, dia: number, h: number, m: number) {
    if (!x.minutos) return;
    const inicio = instanteCR(sumarDias(lunes, dia), h, m);
    cambiar(x.t.id, { aMano: true, inicio: inicio.toISOString(), fin: new Date(+inicio + x.minutos * 60_000).toISOString() });
  }

  /** Soltar un bloque en la semana: queda elegido a mano, con el día, la hora y la duración que se arrastró. */
  function soltarEnLaAgenda(clave: string, p: PosicionEnMinutos) {
    const x = tanda.find((y) => y.t.id === clave);
    if (!x || x.hecha) return;
    const inicio = instanteCR(sumarDias(lunes, p.dia), FRANJA_DE_AGENDA.desdeHora + Math.floor(p.desde / 60), p.desde % 60);
    cambiar(x.t.id, { aMano: true, minutos: p.minutos, inicio: inicio.toISOString(), fin: new Date(+inicio + p.minutos * 60_000).toISOString() });
  }

  /** Cambiar de semana suelta lo elegido a mano (era de la otra semana): en esta lo vuelve a proponer Nexus. */
  function irASemana(delta: number) {
    setLunes((l) => sumarSemanas(l, delta));
    setTanda((a) => a.map((x) => (x.aMano && !x.hecha ? { ...x, aMano: false, inicio: null, fin: null } : x)));
  }

  const pendientes = tanda.filter((x) => !x.hecha);
  // Solo lo que cae en la semana a la vista: el botón no manda un horario que no se ve.
  const listas = pendientes.filter((x) => x.minutos && x.inicio && x.fin && posicionEnLaGrilla({ inicio: x.inicio, fin: x.fin }, lunes));
  const sucio = tanda.some((x) => x.aMano && !x.hecha);

  async function agendar() {
    setEnviando(true);
    let hechas = 0;
    try {
      for (const x of listas) {
        try {
          await apiTareas.agendar(x.t.id, { modo: "crear", bloques: [{ inicio: x.inicio, fin: x.fin }], minutos: x.minutos });
          hechas++;
          cambiar(x.t.id, { hecha: true }, false);
        } catch (e) {
          if (e instanceof ErrorDeApi && e.status === 409 && e.datos.sinPermiso) {
            setPlanB({ url: typeof e.datos.url === "string" ? e.datos.url : "", motivo: e.message });
            return;
          }
          throw e;
        }
      }
      toast.success(hechas === 1 ? "La tarea quedó en tu calendario." : `Las ${hechas} tareas quedaron en tu calendario.`);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agendar.");
    } finally {
      setEnviando(false);
    }
  }

  async function yaLaAgende(x: EnLaTanda) {
    if (!x.inicio || !x.fin || !x.minutos) return;
    try {
      await apiTareas.agendar(x.t.id, { modo: "ya_la_agende", bloques: [{ inicio: x.inicio, fin: x.fin }], minutos: x.minutos });
      cambiar(x.t.id, { hecha: true }, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  // La grilla.
  const ahora = new Date();
  const ahoraCR = horaDeCostaRica(ahora);
  const dias = Array.from({ length: 5 }, (_, i) => diaCortoConSemana(sumarDias(lunes, i)));
  const etiquetasDeHora = Array.from({ length: FRANJA_DE_AGENDA.grillaHastaHora - FRANJA_DE_AGENDA.desdeHora + 1 }, (_, i) => `${FRANJA_DE_AGENDA.desdeHora + i}:00`);
  const pasado = useMemo(() => {
    if (lunes > hoy) return null;
    if (lunes < hoy) return { dia: 5, arriba: 1 };
    const total = (FRANJA_DE_AGENDA.grillaHastaHora - FRANJA_DE_AGENDA.desdeHora) * 60;
    const min = (ahoraCR.hora - FRANJA_DE_AGENDA.desdeHora) * 60 + ahoraCR.minuto;
    return { dia: ahoraCR.diaDeLaSemana, arriba: Math.max(0, Math.min(1, min / total)) };
  }, [lunes, hoy, ahoraCR.hora, ahoraCR.minuto, ahoraCR.diaDeLaSemana]);

  const bloques: BloqueDeLaAgenda[] = [
    ...ocupado
      .filter((o) => !o.todoElDia)
      .flatMap((o, i) => {
        const p = posicionEnLaGrilla(o, lunes);
        return p ? [{ clave: `o${i}`, ...p, titulo: o.titulo || "Ocupado", detalle: `${horaCorta(o.inicio)} – ${horaCorta(o.fin)}`, tipo: "ocupado" as const }] : [];
      }),
    ...tanda.flatMap((x) => {
      if (!x.inicio || !x.fin) return [];
      const p = posicionEnLaGrilla({ inicio: x.inicio, fin: x.fin }, lunes);
      return p ? [{ clave: x.t.id, ...p, titulo: x.t.titulo, detalle: `${horaCorta(x.inicio)} – ${horaCorta(x.fin)}${x.hecha ? " · agendada" : ""}`, tipo: "propuesto" as const, resaltado: foco === x.t.id, arrastrable: !x.hecha && !planB }] : [];
    }),
  ];
  const todoElDia = ocupado
    .filter((o) => o.todoElDia)
    .flatMap((o) => {
      const desde = horaDeCostaRica(o.inicio).fecha;
      return Array.from({ length: 5 }, (_, d) => d).filter((d) => sumarDias(lunes, d) >= desde && sumarDias(lunes, d) < horaDeCostaRica(o.fin).fecha).map((d) => ({ dia: d, titulo: o.titulo || "Ocupado" }));
    });

  const titulo = `Agendar ${tanda.length === 1 ? "1 tarea" : `${tanda.length} tareas`} · semana del ${rangoDeLaSemana(lunes)}`;

  return (
    <Modal
      open
      onClose={onCerrar}
      size="pantalla"
      cuerpoSinRelleno
      closeOnBackdrop={false}
      closeOnEscape={!sucio}
      title={titulo}
      description="Cada tarea va en su propio bloque. Si la mueves en Calendar, manda Calendar."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <BotonTexto onClick={onCerrar}>{planB ? "Listo" : "Cancelar"}</BotonTexto>
          {!planB && (
            <BotonAzul onClick={() => void agendar()} disabled={enviando || cargando || listas.length === 0}>
              {enviando ? "Agendando…" : listas.length === 1 ? "Agendar la tarea en tu calendario" : `Agendar las ${listas.length} en tu calendario`}
            </BotonAzul>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <div className="min-h-0 flex-[2] space-y-3 overflow-y-auto p-6">
          <div className="flex items-center gap-2">
            <BotonBlanco onClick={() => irASemana(-1)} disabled={lunes <= hoy} title="Semana anterior">
              ‹
            </BotonBlanco>
            <span className="text-[13px] font-medium text-fg">Semana del {rangoDeLaSemana(lunes)}</span>
            <BotonBlanco onClick={() => irASemana(1)} title="Semana siguiente">
              ›
            </BotonBlanco>
            {cargando && <span className="text-xs text-fg-muted">Leyendo tu calendario…</span>}
          </div>
          {avisoDelCalendario && <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">{avisoDelCalendario}</p>}
          <AgendaDeLaSemana
            dias={dias}
            horas={etiquetasDeHora}
            bloques={bloques}
            todoElDia={todoElDia}
            pasado={pasado}
            hoy={lunes === hoy ? ahoraCR.diaDeLaSemana : null}
            paso={PASO_DE_AGENDA_MIN}
            onMover={soltarEnLaAgenda}
          />
          <p className="text-xs text-fg-muted">Arrastra un bloque azul para cambiarle el día o la hora; su borde de abajo cambia la duración.</p>
        </div>

        <aside className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-line bg-surface-muted p-6 lg:max-w-[420px] lg:border-l lg:border-t-0">
          {planB && (
            <div className="space-y-1.5 rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5 text-[13px] text-warn-ink">
              <p className="font-semibold">Nexus todavía no puede escribir en tu calendario.</p>
              <p>Abre cada tarea en Calendar con el evento ya lleno, guárdalo y vuelve a marcar «Ya la agendé».</p>
            </div>
          )}
          <p className={ROTULO_DEL_SISTEMA}>La tanda · {pendientes.length}</p>
          <ul className="space-y-2">
            {tanda.map((x) => (
              <FilaDeLaTanda
                key={x.t.id}
                x={x}
                lunes={lunes}
                planB={!!planB}
                urlDeLaTarea={planB?.url ?? ""}
                onFoco={(v) => setFoco(v ? x.t.id : null)}
                onDuracion={(m) => elegirDuracion(x, m)}
                onHorario={(d, h, m) => elegirHorario(x, d, h, m)}
                onQuitar={() => setTanda((a) => recalcular(a.filter((y) => y.t.id !== x.t.id)))}
                onYaLaAgende={() => void yaLaAgende(x)}
              />
            ))}
          </ul>
          {tanda.length === 0 && <p className="text-[13px] text-fg-muted">No quedó nada en la tanda.</p>}
        </aside>
      </div>
    </Modal>
  );
}

function FilaDeLaTanda({
  x,
  lunes,
  planB,
  urlDeLaTarea,
  onFoco,
  onDuracion,
  onHorario,
  onQuitar,
  onYaLaAgende,
}: {
  x: EnLaTanda;
  lunes: string;
  planB: boolean;
  urlDeLaTarea: string;
  onFoco: (v: boolean) => void;
  onDuracion: (m: number) => void;
  onHorario: (dia: number, h: number, m: number) => void;
  onQuitar: () => void;
  onYaLaAgende: () => void;
}) {
  const inicio = x.inicio ? horaDeCostaRica(x.inicio) : null;
  // Un horario fuera de esta semana no se muestra como otro día: el selector queda en «Día…».
  const diferencia = inicio ? Math.round((Date.parse(`${inicio.fecha}T00:00:00Z`) - Date.parse(`${lunes}T00:00:00Z`)) / 86_400_000) : null;
  const diaEnLaSemana = diferencia !== null && diferencia >= 0 && diferencia <= 4 ? diferencia : null;
  const diaElegido = diaEnLaSemana ?? 0;
  const horaElegida = inicio ? `${inicio.hora}:${inicio.minuto}` : "";
  const correo = x.t.responsable?.email ?? "";
  return (
    <li
      className={cn("space-y-2 rounded-lg border bg-surface px-3 py-2.5", x.hecha ? "border-success-line" : "border-line")}
      onMouseEnter={() => onFoco(true)}
      onMouseLeave={() => onFoco(false)}
      onFocus={() => onFoco(true)}
      onBlur={() => onFoco(false)}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-medium text-fg">
          {x.t.titulo} <span className="text-[11px] font-normal tabular-nums text-fg-muted">T-{x.t.numero}</span>
          {x.t.venceEl && <span className="block text-xs font-normal text-fg-muted">Vence {diaCortoConSemana(x.t.venceEl)}</span>}
        </p>
        {x.hecha ? (
          <span className="text-xs font-semibold text-success-ink">✓ Agendada</span>
        ) : (
          <BotonTexto onClick={onQuitar}>Quitar de esta tanda</BotonTexto>
        )}
      </div>
      {!x.hecha && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Duración">
            <span className="text-xs text-fg-muted">Duración</span>
            {DURACIONES_DE_AGENDA.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={x.minutos === m}
                onClick={() => onDuracion(m)}
                className={cn(
                  "rounded-full border px-2.5 py-[2px] text-xs transition-colors",
                  x.minutos === m ? "border-fg-muted bg-surface-hover font-semibold text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
                )}
              >
                {ETIQUETA_DE_DURACION[m]}
              </button>
            ))}
            {x.minutos && !(DURACIONES_DE_AGENDA as readonly number[]).includes(x.minutos) && <span className="text-xs text-fg-muted">({horas(x.minutos)})</span>}
          </div>
          {!x.minutos ? (
            <p className="text-xs text-warn-ink">Elige cuánto te va a tomar: sin duración no se agenda.</p>
          ) : !x.inicio ? (
            <p className="text-xs text-warn-ink">No cabe en esta semana antes de que venza. Elige el día y la hora, o prueba la semana siguiente.</p>
          ) : null}
          {x.minutos ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Día"
                value={diaEnLaSemana ?? ""}
                onChange={(e) => {
                  const [h, m] = horaElegida ? horaElegida.split(":").map(Number) : [FRANJA_DE_AGENDA.desdeHora, 0];
                  onHorario(Number(e.target.value), h, m);
                }}
                className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-fg"
              >
                {diaEnLaSemana === null && <option value="">Día…</option>}
                {Array.from({ length: 5 }, (_, d) => (
                  <option key={d} value={d}>
                    {diaCortoConSemana(sumarDias(lunes, d))}
                  </option>
                ))}
              </select>
              <select
                aria-label="Hora"
                value={horaElegida}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  onHorario(diaElegido, h, m);
                }}
                className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-fg"
              >
                {!x.inicio && <option value="">Hora…</option>}
                {HORAS_DEL_SELECTOR.map(({ h, m }) => (
                  <option key={`${h}:${m}`} value={`${h}:${m}`}>
                    {h}:{String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              {x.inicio && x.fin && <span className="text-xs text-fg-muted">hasta las {horaCorta(x.fin)}{x.aMano ? "" : " · lo propone Nexus"}</span>}
            </div>
          ) : null}
          {planB && x.inicio && x.fin && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={enlaceDePlantilla({ titulo: x.t.titulo, inicio: x.inicio, fin: x.fin, tareaId: x.t.id, urlDeLaTarea: urlDeLaTarea.replace(/\?t=.*$/, `?t=${x.t.id}`), correo })}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-brand hover:bg-surface-hover"
              >
                Abrir en Calendar
              </a>
              <BotonBlanco onClick={onYaLaAgende}>Ya la agendé</BotonBlanco>
            </div>
          )}
        </>
      )}
    </li>
  );
}
