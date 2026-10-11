"use client";

/**
 * components/tareas/VistasDeLaSemana.tsx — Tablero y Calendario de tu semana, en Mis tareas (docs/tareas-plan.md §9.2).
 *
 * Tablero: tus tareas de esta semana en Pendiente · En curso · Hecha; arrastrar una tarjeta cambia su estado (con las
 * mismas reglas que el cajón). Calendario: tu semana con horas y los bloques de Nexus de cada tarea; lo que no tiene
 * bloque va al lado, con «Agendar». Lo ocupado del resto de tu calendario no se lee acá (eso lo hace «Agendar»).
 */
import { AgendaDeLaSemana, Tablero, type BloqueDeLaAgenda, type ColumnaDelTablero } from "@/components/ui";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { NOMBRE_DEL_ESTADO, estaAbierta } from "@/lib/tareas/estados";
import { FRANJA_DE_AGENDA } from "@/lib/tareas/reglas";
import { posicionEnLaGrilla } from "@/lib/tareas/agenda";
import { diaCortoConSemana, horaCorta, horaDeCostaRica, sumarDias } from "@/lib/tareas/semana";
import type { TareaVista } from "@/lib/tareas/tipos";
import { Chip } from "./chips";

const COLUMNAS: ColumnaDelTablero[] = (["pendiente", "en_curso", "hecha"] as const).map((e) => ({
  clave: e,
  titulo: NOMBRE_DEL_ESTADO[e],
  vacia: e === "hecha" ? "Lo que termines esta semana aparece acá." : "Nada en este estado.",
}));

export function TableroDeLaSemana({
  tareas,
  onAbrir,
  onMover,
  conResponsable = false,
}: {
  tareas: TareaVista[];
  onAbrir: (t: TareaVista) => void;
  onMover: (t: TareaVista, hacia: "pendiente" | "en_curso" | "hecha") => void;
  /** En la semana del equipo: de quién es cada tarjeta. */
  conResponsable?: boolean;
}) {
  return (
    <>
      <Tablero
        etiqueta="Tu semana por estado"
        columnas={COLUMNAS}
        items={tareas}
        claveDe={(t) => t.id}
        columnaDe={(t) => (t.estado === "en_curso" ? "en_curso" : t.estado === "hecha" ? "hecha" : "pendiente")}
        fija={(t) => !(t.acciones.empezar || t.acciones.terminar || t.acciones.reabrir)}
        onMover={(t, c) => onMover(t, c as "pendiente" | "en_curso" | "hecha")}
        tarjeta={(t, { levantada }) => (
          <button
            type="button"
            onClick={() => !levantada && onAbrir(t)}
            className={cn(
              "w-full space-y-1.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover",
              levantada && "ring-1 ring-brand",
              t.estado === "hecha" && "opacity-70",
            )}
          >
            <p className={cn("text-[13px] text-fg", t.estado === "hecha" && "line-through decoration-fg-muted")}>
              {t.titulo} <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
            </p>
            <span className="flex flex-wrap gap-1">
              {conResponsable && <Chip>{t.responsable ? t.responsable.nombre.split(" ")[0] : "Por asignar"}</Chip>}
              {t.ambito.ambito !== "sin_clasificar" && <Chip>{t.ambito.etiqueta}</Chip>}
              {t.agenda.estado === "agendada" && t.agenda.inicio && <Chip tono="azul">{diaCortoConSemana(horaDeCostaRica(t.agenda.inicio).fecha)}</Chip>}
              {t.venceEl && <Chip tono={t.atrasada ? "rojo" : "neutro"}>Vence {diaCortoConSemana(t.venceEl)}</Chip>}
            </span>
          </button>
        )}
      />
      <p className="text-xs text-fg-muted">Arrastrar solo cambia el estado. Con el teclado, ábrela y cámbialo en su cajón.</p>
    </>
  );
}

export function CalendarioDeLaSemana({ lunes, tareas, onAbrir, onAgendar }: { lunes: string; tareas: TareaVista[]; onAbrir: (t: TareaVista) => void; onAgendar: (ts: TareaVista[]) => void }) {
  const dias = Array.from({ length: 5 }, (_, i) => diaCortoConSemana(sumarDias(lunes, i)));
  const horas = Array.from({ length: FRANJA_DE_AGENDA.grillaHastaHora - FRANJA_DE_AGENDA.desdeHora + 1 }, (_, i) => `${FRANJA_DE_AGENDA.desdeHora + i}:00`);
  const bloques: BloqueDeLaAgenda[] = tareas.flatMap((t) =>
    t.agenda.bloques.flatMap((b, i) => {
      const p = posicionEnLaGrilla({ inicio: b.inicio, fin: b.fin }, lunes);
      return p ? [{ clave: `${t.id}:${i}`, ...p, titulo: t.titulo, detalle: `${horaCorta(b.inicio)} – ${horaCorta(b.fin)}`, tipo: "propuesto" as const }] : [];
    }),
  );
  const sinBloque = tareas.filter((t) => estaAbierta(t.estado) && t.agenda.estado !== "agendada");
  const hoy = horaDeCostaRica(new Date());
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <AgendaDeLaSemana className="min-w-0 flex-[2]" dias={dias} horas={horas} bloques={bloques} hoy={hoy.fecha >= lunes && hoy.fecha <= sumarDias(lunes, 4) ? hoy.diaDeLaSemana : null} />
      <aside className="flex-1 space-y-2">
        <p className={ROTULO_DEL_SISTEMA}>Sin bloque · {sinBloque.length}</p>
        {sinBloque.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Todo lo de esta semana tiene su bloque.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {sinBloque.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onAbrir(t)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] text-fg transition-colors hover:bg-surface-hover">
                    {t.titulo} <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
                  </button>
                </li>
              ))}
            </ul>
            <BotonBlanco onClick={() => onAgendar(sinBloque.filter((t) => t.acciones.agendar))}>Agendar {sinBloque.length === 1 ? "la que falta" : `las ${sinBloque.length}`}</BotonBlanco>
          </>
        )}
      </aside>
    </div>
  );
}
