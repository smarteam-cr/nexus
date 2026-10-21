"use client";

/**
 * AgendaDelInicio — la agenda del inicio, como Google Calendar (ficha D, 2026-10-17; diseño «Para ti · Ventas y CSE»).
 *
 * Vista de semana (lunes a viernes; la de entrada desde el 2026-10-18) o de día (una columna de 8:00 a 18:00, que se
 * estira si hay reuniones antes o después). Cada reunión es un botón: tocarla abre su panel al costado. Tocar una hora libre (o «+ Crear evento», que
 * busca la primera hora libre en horario laboral) deja ahí un borrador de una hora, con su cuadro para el título, los
 * invitados y la cuenta; «Abrir en Google Calendar» lo abre configurado y la persona lo guarda allá. Nexus no escribe en
 * el calendario. Los espacios libres (una hora o más, en horario laboral) van punteados en azul, cada uno con la
 * tarea tuya más importante que cabe ahí («Con qué avanzar», lib/mi-dia/inicio.ts › conQueAvanzar): los de hoy y, desde
 * el 2026-10-19, los de los días que vienen en lo que se ve. Al tocar un espacio, el borrador trae «Con qué usar este
 * espacio» (lib/mi-dia/espacio-libre.ts): tus tareas que caben, la reunión con una cuenta sin reunión y el siguiente
 * paso, que lo llenan con un clic.
 *
 * La agenda es la de Google Calendar (2026-10-19): además de las reuniones, pinta los eventos propios («Tenis», «Cita
 * Médica», el bloque de una tarea), que ocupan el tiempo; tocar uno lo abre en el panel como a una reunión (el bloque de
 * una tarea abre la tarea); los de todo el día van arriba de cada
 * columna; los que se pisan van lado a lado; uno donde la persona es opcional o respondió «quizás» se ve más claro. Lo
 * que sugiere Nexus son bloques del tamaño de cada tarea, nunca el espacio entero, y nunca encima del almuerzo.
 *
 * Segunda vuelta (2026-10-17, noche): ‹ ›, «Hoy» y Día ↔ Semana se mueven sin volver a pedir la página
 * (agenda-navegable.ts); la agenda es de lunes a viernes (lib/mi-dia/agenda-dias.ts); tocar afuera, la X o Escape suelta
 * el borrador (se borra y el hueco queda como estaba).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Segmentado } from "@/components/ui";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { grillaDelDia, horaCR, instante, lineaDeAhora, minutoDelDia, ocupadoDeLaAgenda, type ConQueAvanzar, type EventoEnLaGrilla } from "@/lib/mi-dia/inicio";
import { deTodoElDiaEn } from "@/lib/mi-dia/agenda";
import { HORA_FIN_LABORAL, HORA_INICIO_LABORAL } from "@/lib/mi-dia/constantes";
import { MINUTOS_DEL_BORRADOR, sePisan, tituloDelBorrador, type BorradorDeEvento } from "@/lib/mi-dia/agenda-borrador";
import { finDelEspacio, sugerenciasParaElEspacio, type ParaSugerirEnElEspacio } from "@/lib/mi-dia/espacio-libre";
import type { AgendaDeHoy, EventoPropioDeLaAgenda, ReunionDeLaAgenda } from "@/lib/mi-dia/agenda-server";
import { diaDeEntradaDeLaAgenda, diaQueSeVe, diasDeLaGrilla, esFinDeSemana, pasoDeLaAgenda, type VistaDeLaAgenda } from "@/lib/mi-dia/agenda-dias";
import { ENLACE_BOTON, TARJETA, TITULO } from "./piezas";
import BorradorDelEvento from "./BorradorDelEvento";
import { tareaParaUnaPersona } from "@/lib/tareas/titulo-corto";
import type { AgendaQueSeVe } from "./agenda-navegable";
import {
  anunciarAgenda,
  crearBorrador,
  editarBorrador,
  fijarEventosDeLaAgenda,
  primeraHoraLibre,
  soltarBorrador,
  useBorradores,
  yaEnfocado,
} from "./borradores";

const ALTO_HORA = 60;
/** Al tocar una hora libre, el borrador arranca en la media hora que se tocó. */
const PASO_AL_TOCAR = 30;
/** El id de un borrador en la grilla (no choca con el de una reunión de Google). */
const ID_DEL_BORRADOR = "__borrador__:";
/** Lo que mide el cuadro de un borrador, para que no se salga por abajo de la grilla. */
const ALTO_DEL_CUADRO = 470;
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const sumarDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaDeLaSemana = (ymd: string) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
const fechaLarga = (ymd: string) => `${DIAS[diaDeLaSemana(ymd)]} ${Number(ymd.slice(8, 10))} de ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
const fechaCorta = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES_CORTOS[Number(ymd.slice(5, 7)) - 1]}`;

export type ReunionElegible = ReunionDeLaAgenda;

/**
 * Un bloque que sugiere Nexus en un espacio libre, con su id en la grilla: del tamaño de la tarea con que avanzar, o la
 * primera hora del espacio si no cabe ninguna. `espacio` es el espacio libre entero.
 */
export interface HuecoDeLaAgenda {
  id: string;
  inicio: string;
  fin: string;
  espacio: { inicio: string; fin: string };
  avanzar: ConQueAvanzar | null;
}

const SIN_AGENDA: Record<Exclude<AgendaDeHoy["estado"], "ok">, string> = {
  "sin-google": "La agenda de Google no está configurada en este servidor.",
  "sin-permiso": "Nexus no pudo leer tu calendario (falta el permiso en Google Workspace).",
  error: "Tu calendario no se pudo leer ahora. Vuelve a intentarlo en un rato.",
};

/** Lo que dice la segunda línea de una reunión: la hora y si ya pasó, está en curso o cuánto falta. */
export function lineaDeLaReunion(r: { inicio: string; fin: string | null }, hoyISO: string, ahora: Date): string {
  const desde = horaCR(r.inicio);
  const hasta = r.fin ? horaCR(r.fin) : null;
  const rango = hasta ? `${desde}–${hasta}` : desde;
  if (minutoDelDia(r.inicio).dia !== hoyISO) return rango;
  const ini = Date.parse(r.inicio);
  const fin = r.fin ? Date.parse(r.fin) : ini + 30 * 60_000;
  if (fin <= ahora.getTime()) return `${rango} · terminó`;
  if (ini <= ahora.getTime()) return `${rango} · en curso`;
  const min = Math.round((ini - ahora.getTime()) / 60_000);
  return `${rango} · en ${min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ""}` : `${min} min`}`;
}

export default function AgendaDelInicio({
  agenda: vistaActual,
  cargando,
  onIr,
  onPrecargar,
  hoyISO,
  ahora,
  correo,
  seleccion,
  onElegir,
  huecos,
  paraSugerir,
}: {
  agenda: AgendaQueSeVe;
  /** Se está leyendo el calendario del día (o la semana) nuevo. */
  cargando: boolean;
  /** Ir a otro día o vista, sin volver a pedir la página (agenda-navegable.ts). */
  onIr: (vista: VistaDeLaAgenda, dia: string) => void;
  onPrecargar: (vista: VistaDeLaAgenda, dia: string) => void;
  hoyISO: string;
  ahora: Date;
  correo: string;
  seleccion: string | null;
  onElegir: (id: string) => void;
  huecos: readonly HuecoDeLaAgenda[];
  /** Con qué sugerir llenar un borrador que se dejó en una hora libre. Sin esto, el borrador va sin sugerencias. */
  paraSugerir?: ParaSugerirEnElEspacio;
}) {
  const { vista, dia, datos: agenda } = vistaActual;
  const borradores = useBorradores(correo);
  const dias = useMemo(() => diasDeLaGrilla(vista, dia), [vista, dia]);
  const titulo = vista === "semana" ? `Semana del ${fechaCorta(dia)} al ${fechaCorta(sumarDias(dia, 4))}` : fechaLarga(dia);
  // Lo que ocupa el tiempo (las reuniones y los eventos propios): no lo pisan «Agendar» ni lo que sugiere Nexus.
  const eventos = useMemo(() => ocupadoDeLaAgenda(agenda), [agenda]);
  // Lo que se pinta: todo evento con hora, también lo que la persona marcó «disponible».
  const pintados = useMemo(
    () => [...agenda.reuniones, ...agenda.propios].map((r) => ({ id: r.id, inicio: r.inicio, fin: r.fin })),
    [agenda.reuniones, agenda.propios],
  );
  // «Agendar» y «+ Crear evento» buscan la primera hora libre sin pisar lo que la agenda tiene cargado.
  useEffect(() => fijarEventosDeLaAgenda(eventos), [eventos]);
  // «Planificar acción» (la cartera) sabe si hay una agenda donde mostrar el borrador.
  useEffect(() => anunciarAgenda(), []);
  // Un borrador tapa el espacio libre que se pisa con él (ya se está usando).
  const huecosVisibles = useMemo(() => huecos.filter((h) => !borradores.lista.some((b) => sePisan(b, h))), [huecos, borradores.lista]);
  const huecoPorId = useMemo(() => new Map(huecosVisibles.map((h) => [h.id, h])), [huecosVisibles]);
  // Solo el horario de trabajo (2026-10-20, decisión de Elías): lo de antes de las 8:00 y después de las 17:00
  // («Fuera de la oficina») no se pinta, salvo que la persona pida el calendario completo.
  const [completa, setCompleta] = useState(false);
  // La grilla se calcula una vez por cambio de lo que se ve (no en cada render del inicio).
  const grillas = useMemo(() => {
    const todos = [
      ...pintados,
      ...huecosVisibles.map((h) => ({ id: h.id, inicio: h.inicio, fin: h.fin })),
      ...borradores.lista.map((b) => ({ id: ID_DEL_BORRADOR + b.id, inicio: b.inicio, fin: b.fin })),
    ];
    const rango = completa ? null : { desde: HORA_INICIO_LABORAL, hasta: HORA_FIN_LABORAL };
    return dias.map((d) => grillaDelDia(todos, d, rango));
  }, [pintados, huecosVisibles, borradores.lista, dias, completa]);
  const fueraDelHorario = grillas.reduce((n, g) => n + g.fuera, 0);
  const desdeHora = Math.min(...grillas.map((g) => g.desdeHora));
  const hastaHora = Math.max(...grillas.map((g) => g.hastaHora));
  const horas = Array.from({ length: hastaHora - desdeHora }, (_, i) => desdeHora + i);
  const porId = useMemo(() => new Map(agenda.reuniones.map((r) => [r.id, r])), [agenda.reuniones]);
  const propioPorId = useMemo(() => new Map(agenda.propios.map((p) => [p.id, p])), [agenda.propios]);
  const conTodoElDia = dias.some((d) => deTodoElDiaEn(agenda.todoElDia, d).length > 0);
  const borradorPorId = new Map(borradores.lista.map((b) => [ID_DEL_BORRADOR + b.id, b]));
  const editando = borradores.editando ? (borradores.lista.find((b) => b.id === borradores.editando) ?? null) : null;
  // Las sugerencias del borrador que se está editando, para el espacio donde quedó (hasta la próxima reunión de ese día).
  const sugerencias = useMemo(() => {
    if (!editando || !paraSugerir || editando.origen !== "agenda" || editando.abierto) return [];
    return sugerenciasParaElEspacio({ inicio: editando.inicio, fin: finDelEspacio(eventos, editando.inicio, editando.fin), hoyISO, ...paraSugerir });
  }, [editando, paraSugerir, eventos, hoyISO]);

  // ‹ ›, «Hoy» y la vista: a dónde lleva cada uno (para ir y para adelantar la lectura al pasar el mouse).
  const anterior = pasoDeLaAgenda(vista, dia, -1);
  const siguiente = pasoDeLaAgenda(vista, dia, 1);
  const entrada = diaDeEntradaDeLaAgenda(hoyISO, vista);
  const hoyDeTrabajo = diaDeEntradaDeLaAgenda(hoyISO, "dia");
  // De la semana al día: hoy si cae en esa semana; si no, su lunes.
  const diaDesdeLaSemana = vista === "semana" && dias.includes(hoyDeTrabajo) ? hoyDeTrabajo : dia;

  // «Agendar» (en «Lo que importa hoy» o la cartera) o «+ Crear evento» pueden dejar el borrador en otro día: se va a
  // ese día (o a su semana) y se lleva el borrador a la vista.
  const enfocar = borradores.enfocar ? (borradores.lista.find((b) => b.id === borradores.enfocar) ?? null) : null;
  useEffect(() => {
    if (!enfocar) return;
    const suDia = minutoDelDia(enfocar.inicio).dia;
    // Un borrador en un día que la agenda no muestra (un fin de semana) no la hace ir y venir: se da por mostrado.
    if (!dias.includes(suDia) && diaQueSeVe(vista, suDia) !== dia) {
      onIr(vista, suDia);
      return;
    }
    document.getElementById(`borrador-${enfocar.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    yaEnfocado();
  }, [enfocar, dias, vista, dia, onIr]);

  const nuevoEnLaHora = (d: string, minuto: number) => {
    crearBorrador({ correo, inicio: instante(d, minuto), fin: instante(d, minuto + MINUTOS_DEL_BORRADOR), origen: "agenda" });
    // Cierra el panel de una reunión, si había uno abierto (ninguna reunión tiene este id).
    onElegir(ID_DEL_BORRADOR);
  };
  const crearEnLaPrimeraHora = () => {
    const h = primeraHoraLibre(correo, ahora);
    crearBorrador({ correo, inicio: h.inicio, fin: h.fin, origen: "agendar", enfocar: true });
    onElegir(ID_DEL_BORRADOR);
  };

  return (
    <section className={cn(TARJETA, "flex flex-col gap-3.5 px-5 pb-5 pt-4")} aria-labelledby="agenda-t">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="agenda-t" className={TITULO}>
            Agenda
          </h2>
          <button
            type="button"
            className={ENLACE_BOTON}
            onClick={() => onIr(vista, entrada)}
            onPointerEnter={() => onPrecargar(vista, entrada)}
            title={esFinDeSemana(hoyISO) ? "Es fin de semana: la agenda muestra el lunes que viene" : undefined}
          >
            Hoy
          </button>
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => onIr(vista, anterior)}
              onPointerEnter={() => onPrecargar(vista, anterior)}
              aria-label={vista === "semana" ? "Semana anterior" : "Día anterior"}
              className="rounded px-2 py-0.5 text-[15px] text-fg-muted transition-colors hover:text-fg"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onIr(vista, siguiente)}
              onPointerEnter={() => onPrecargar(vista, siguiente)}
              aria-label={vista === "semana" ? "Semana siguiente" : "Día siguiente"}
              className="rounded px-2 py-0.5 text-[15px] text-fg-muted transition-colors hover:text-fg"
            >
              ›
            </button>
          </div>
          <span className="text-sm font-medium text-fg">{titulo}</span>
          {cargando && (
            <span role="status" className="text-xs text-fg-muted">
              Leyendo tu calendario…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5" onPointerEnter={() => onPrecargar(vista === "semana" ? "dia" : "semana", vista === "semana" ? diaDesdeLaSemana : dia)}>
          <Segmentado
            etiqueta="Vista del calendario"
            opciones={[
              { clave: "dia", etiqueta: "Día" },
              { clave: "semana", etiqueta: "Semana" },
            ]}
            valor={vista}
            onCambio={(k) => onIr(k === "semana" ? "semana" : "dia", k === "semana" ? dia : diaDesdeLaSemana)}
          />
          <button type="button" className={ENLACE_BOTON} onClick={crearEnLaPrimeraHora} title="Deja un borrador en tu primera hora libre de trabajo">
            + Crear evento
          </button>
        </div>
      </div>

      {agenda.estado !== "ok" ? (
        <>
          <p className="text-[13px] text-fg-muted">{SIN_AGENDA[agenda.estado]}</p>
          {/* Sin la grilla, el borrador que dejó «Agendar» se ve igual: nunca se abre Calendar sin verlo antes. */}
          {editando && <BorradorDelEvento b={editando} sugerencias={sugerencias} onCerrar={() => soltarBorrador(editando.id)} />}
        </>
      ) : (
        <div className={cn("relative pt-2 transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
          {vista === "semana" && (
            <div className="grid pb-1.5 pl-[56px]" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
              {dias.map((d) => (
                <span key={d} className={cn("px-1 text-xs font-medium", d === hoyISO ? "text-brand" : "text-fg-muted")}>
                  {DIAS[diaDeLaSemana(d)].slice(0, 3)} {Number(d.slice(8, 10))}
                </span>
              ))}
            </div>
          )}
          {conTodoElDia && (
            <div className="grid gap-y-0.5 pb-1.5 pl-[56px]" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }} aria-label="Todo el día">
              {dias.map((d) => (
                <div key={d} className="flex min-w-0 flex-col gap-0.5 px-0.5">
                  {deTodoElDiaEn(agenda.todoElDia, d).map((e) => (
                    <span key={e.id} title={`${e.titulo} · todo el día`} className="truncate rounded bg-surface-hover px-1.5 py-px text-[11.5px] leading-4 text-fg-secondary">
                      {e.titulo}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <div aria-hidden>
              {horas.map((h) => (
                <div key={h} className="relative border-t border-surface-hover" style={{ height: ALTO_HORA }}>
                  <span className="absolute -top-2 left-0 w-[50px] bg-surface pr-1.5 text-right text-[11px] text-fg-muted">{h}:00</span>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 grid pl-[56px]" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
              {dias.map((d, i) => {
                const g = grillas[i];
                const ahoraM = lineaDeAhora({ desdeHora, hastaHora }, d, ahora);
                const altoDeLaGrilla = (hastaHora - desdeHora) * ALTO_HORA;
                return (
                  <div
                    key={d}
                    onClick={(ev) => {
                      // Solo lo libre: tocar una reunión o un borrador hace lo suyo.
                      if (ev.target !== ev.currentTarget) return;
                      const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                      const minuto = desdeHora * 60 + Math.floor(Math.max(0, y) / ((ALTO_HORA / 60) * PASO_AL_TOCAR)) * PASO_AL_TOCAR;
                      nuevoEnLaHora(d, Math.min(minuto, hastaHora * 60 - PASO_AL_TOCAR));
                    }}
                    className={cn("relative cursor-pointer", vista === "semana" && "border-l border-surface-hover")}
                  >
                    {ahoraM != null && (
                      <div aria-hidden className="absolute inset-x-0 z-[1] h-0.5 bg-fg" style={{ top: ahoraM }}>
                        <span className="absolute -left-[5px] -top-1 h-2.5 w-2.5 rounded-full bg-fg" />
                      </div>
                    )}
                    {g.eventos.map((e) => {
                      const b = borradorPorId.get(e.id);
                      if (!b) return null;
                      const arriba = e.arriba + (g.desdeHora - desdeHora) * ALTO_HORA;
                      const editando = borradores.editando === b.id;
                      return (
                        <BloqueDelBorrador
                          key={e.id}
                          b={b}
                          e={e}
                          arriba={arriba}
                          angosto={vista === "semana"}
                          abierto={editando}
                          topDelCuadro={Math.max(0, Math.min(arriba + (vista === "semana" ? 0 : e.alto + 4), altoDeLaGrilla - ALTO_DEL_CUADRO))}
                          cuadro={
                            editando ? (
                              <BorradorDelEvento
                                b={b}
                                sugerencias={sugerencias}
                                onCerrar={() => soltarBorrador(b.id)}
                                className={cn("absolute", vista === "semana" ? (i >= 3 ? "right-full mr-1.5" : "left-full ml-1.5") : "right-2")}
                              />
                            ) : null
                          }
                        />
                      );
                    })}
                    {g.eventos.filter((e) => !borradorPorId.has(e.id)).map((e) => (
                      <Evento
                        key={e.id}
                        e={e}
                        desplazamiento={(g.desdeHora - desdeHora) * ALTO_HORA}
                        reunion={porId.get(e.id) ?? null}
                        propio={propioPorId.get(e.id) ?? null}
                        hueco={huecoPorId.get(e.id) ?? null}
                        elegida={seleccion === e.id}
                        hoyISO={hoyISO}
                        ahora={ahora}
                        angosto={vista === "semana"}
                        onElegir={() => {
                          editarBorrador(null);
                          onElegir(e.id);
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {(completa || fueraDelHorario > 0) && (
        <button
          type="button"
          onClick={() => setCompleta((v) => !v)}
          className="self-start text-xs font-medium text-brand transition-colors hover:text-brand-light"
        >
          {completa
            ? `Ver solo de ${HORA_INICIO_LABORAL}:00 a ${HORA_FIN_LABORAL}:00`
            : `Ver el calendario completo · ${fueraDelHorario === 1 ? "1 evento" : `${fueraDelHorario} eventos`} fuera del horario`}
        </button>
      )}
      <p className="text-xs text-fg-muted">
        {agenda.estado === "ok" && agenda.reuniones.length === 0 && agenda.propios.length === 0
          ? vista === "semana"
            ? "No tienes nada en tu calendario esta semana. Toca una hora para crear un evento: se guarda en Google Calendar."
            : "No tienes nada en tu calendario este día. Toca una hora para crear un evento: se guarda en Google Calendar."
          : "Toca una reunión para ver su guía, un evento tuyo para tus notas, o un espacio libre para ver con qué usarlo y crear un evento. Se guarda y se mueve en Google Calendar."}
      </p>
    </section>
  );
}

function Evento({
  e,
  desplazamiento,
  reunion,
  propio,
  hueco,
  elegida,
  hoyISO,
  ahora,
  angosto,
  onElegir,
}: {
  e: EventoEnLaGrilla;
  desplazamiento: number;
  reunion: ReunionDeLaAgenda | null;
  propio: EventoPropioDeLaAgenda | null;
  hueco: HuecoDeLaAgenda | null;
  elegida: boolean;
  hoyISO: string;
  ahora: Date;
  angosto: boolean;
  onElegir: () => void;
}) {
  const esHueco = !!hueco;
  const evento = reunion ?? propio;
  if (!evento && !hueco) return null;
  const pasada = evento ? Date.parse(evento.fin ?? evento.inicio) < ahora.getTime() : false;
  // Lo de la persona sola («Tenis», el bloque de una tarea) se ve como una reunión interna.
  const interna = !!propio || (!!reunion && reunion.empresas.length === 0);
  // Opcional o «quizás»: más claro, pero igual ocupa. Lo marcado «disponible», también más claro.
  const tenue = !!evento && (evento.tenue === true || evento.ocupa === false);
  const titulo = hueco
    ? hueco.avanzar
      ? `Avanza: ${tareaParaUnaPersona(hueco.avanzar.tarea)}`
      : "Espacio libre"
    : reunion
      ? reunion.empresas.length === 1
        ? `${reunion.titulo} · ${reunion.nombres[reunion.empresas[0]]}`
        : reunion.titulo
      : propio!.titulo;
  const linea = hueco
    ? hueco.avanzar
      ? `Sugerido ${horaCR(hueco.inicio)}–${horaCR(hueco.fin)}`
      : `Libre ${horaCR(hueco.espacio.inicio)}–${horaCR(hueco.espacio.fin)}`
    : `${lineaDeLaReunion(evento!, hoyISO, ahora)}${evento!.ocupa === false ? " · disponible" : ""}`;
  const aviso = evento?.tenue ? "Eres opcional o respondiste «quizás»: igual ocupa tu tiempo." : evento?.ocupa === false ? "Lo marcaste «disponible»." : undefined;
  const corto = e.alto < 40;
  const ancho = 100 / e.columnas;
  const clase = cn(
    "absolute overflow-hidden rounded-md px-2 py-1 text-left transition hover:brightness-[0.98]",
    corto ? "flex flex-row items-center gap-1.5" : "flex flex-col gap-px",
    esHueco
      ? "border border-dashed border-brand-light bg-info-surface"
      : pasada
        ? "border border-line bg-surface-muted"
        : interna
          ? "border border-line bg-surface-hover"
          : "border border-fg-muted/35 bg-surface",
    tenue && "opacity-60",
    elegida && "border-2 border-solid border-brand",
  );
  const estilo = {
    top: e.arriba + desplazamiento + 1,
    height: e.alto - 3,
    left: `calc(${angosto ? 2 : 6}px + ${ancho * e.columna}%)`,
    width: `calc(${ancho}% - ${angosto ? 4 : 16}px)`,
  };
  const contenido = (
    <>
      {/* En un evento corto, la hora se achica primero: el título es lo que se tiene que leer. */}
      <span
        className={cn(
          "flex min-w-0 shrink items-center gap-1 text-[12.5px] font-semibold leading-[17px]",
          esHueco ? "text-brand" : pasada ? "text-fg-muted" : interna ? "text-fg-secondary" : "text-fg",
        )}
      >
        {hueco?.avanzar && <IconoDeSugerencia className="h-3 w-3 flex-none" />}
        <span className="truncate">{titulo}</span>
      </span>
      <span
        className={cn(
          "min-w-0 truncate whitespace-nowrap text-[11.5px] leading-[15px]",
          corto && "shrink-[100]",
          esHueco ? "text-brand" : pasada || interna ? "text-fg-muted" : "text-fg-secondary",
        )}
      >
        {linea}
      </span>
    </>
  );
  // El bloque de una tarea de Nexus abre la tarea. Lo demás propio («Tenis», el almuerzo) se elige como una reunión y
  // abre su panel (2026-10-19); «Abrir en Google Calendar» queda adentro, como enlace.
  if (propio && !reunion && propio.tareaId) {
    return (
      <a href={`/tareas?t=${encodeURIComponent(propio.tareaId)}`} aria-label={`${titulo}, ${linea}`} title={aviso ?? "Abrir la tarea"} className={clase} style={estilo}>
        {contenido}
      </a>
    );
  }
  return (
    <button type="button" onClick={onElegir} aria-label={`${titulo}, ${linea}`} aria-pressed={elegida} title={aviso} className={clase} style={estilo}>
      {contenido}
    </button>
  );
}

/** El borrador en la grilla: azul, con «borrador» y, si lo puso Nexus en la primera hora libre, la chispa. */
function BloqueDelBorrador({
  b,
  e,
  arriba,
  angosto,
  abierto,
  cuadro,
  topDelCuadro,
}: {
  b: BorradorDeEvento;
  e: EventoEnLaGrilla;
  arriba: number;
  angosto: boolean;
  abierto: boolean;
  cuadro: ReactNode;
  topDelCuadro: number;
}) {
  const ancho = 100 / e.columnas;
  const titulo = tituloDelBorrador(b);
  const linea = `${horaCR(b.inicio)}–${horaCR(b.fin)} · ${b.abierto ? "abierto en Calendar, sin guardar" : "borrador"}`;
  const corto = e.alto < 40;
  const bloque = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  // Tocar afuera suelta el borrador: se borra y el hueco queda como estaba (soltarBorrador).
  const conCuadro = !!cuadro;
  useEffect(() => {
    if (!conCuadro) return;
    const alTocar = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && (bloque.current?.contains(t) || caja.current?.contains(t))) return;
      soltarBorrador(b.id);
    };
    document.addEventListener("pointerdown", alTocar);
    return () => document.removeEventListener("pointerdown", alTocar);
  }, [conCuadro, b.id]);
  return (
    <>
      <button
        ref={bloque}
        id={`borrador-${b.id}`}
        type="button"
        onClick={() => editarBorrador(abierto ? null : b.id)}
        aria-label={`${titulo}, ${linea}`}
        aria-expanded={abierto}
        className={cn(
          "absolute z-[2] overflow-hidden rounded-md border bg-info-surface px-2 py-1 text-left transition hover:brightness-[0.98]",
          corto ? "flex flex-row items-center gap-2" : "flex flex-col gap-px",
          abierto ? "border-2 border-brand" : b.abierto ? "border-dashed border-brand" : "border-brand",
        )}
        style={{
          top: arriba + 1,
          height: e.alto - 3,
          left: `calc(${angosto ? 2 : 6}px + ${ancho * e.columna}%)`,
          width: `calc(${ancho}% - ${angosto ? 4 : 16}px)`,
        }}
      >
        <span className="flex min-w-0 items-center gap-1 text-[12.5px] font-semibold leading-[17px] text-brand">
          {b.origen === "agendar" && <IconoDeSugerencia className="h-3 w-3 flex-none" />}
          <span className="truncate">{titulo}</span>
        </span>
        <span className="whitespace-nowrap text-[11.5px] leading-[15px] text-brand">{linea}</span>
      </button>
      {cuadro && (
        <div ref={caja} className="absolute inset-x-0 z-20" style={{ top: topDelCuadro }}>
          <div className="relative">{cuadro}</div>
        </div>
      )}
    </>
  );
}
