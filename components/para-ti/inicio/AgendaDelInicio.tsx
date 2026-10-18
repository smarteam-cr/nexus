"use client";

/**
 * AgendaDelInicio — la agenda del inicio, como Google Calendar (ficha D, 2026-10-17; diseño «Para ti · Ventas y CSE»).
 *
 * Vista de día (una columna de 8:00 a 18:00, que se estira si hay reuniones antes o después) o de semana (lunes a
 * viernes). Cada reunión es un botón: tocarla abre su panel al costado. Tocar una hora libre (o «+ Crear evento», que
 * busca la primera hora libre en horario laboral) deja ahí un borrador de una hora, con su cuadro para el título, los
 * invitados y la cuenta; «Abrir en Google Calendar» lo abre configurado y la persona lo guarda allá. Nexus no escribe en
 * el calendario. El hueco libre de hoy (una hora o más, en horario laboral) va punteado en azul.
 */
import Link from "next/link";
import { useEffect, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Segmentado } from "@/components/ui";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { grillaDelDia, horaCR, instante, lineaDeAhora, minutoDelDia, type EventoEnLaGrilla } from "@/lib/mi-dia/inicio";
import { MINUTOS_DEL_BORRADOR, sePisan, tituloDelBorrador, type BorradorDeEvento } from "@/lib/mi-dia/agenda-borrador";
import type { AgendaDeHoy, ReunionDeLaAgenda } from "@/lib/mi-dia/agenda-server";
import { ENLACE_BOTON, TARJETA, TITULO } from "./piezas";
import { useRouter } from "next/navigation";
import BorradorDelEvento from "./BorradorDelEvento";
import { crearBorrador, editarBorrador, fijarEventosDeLaAgenda, primeraHoraLibre, useBorradores, yaEnfocado } from "./borradores";

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
  agenda,
  vista,
  dia,
  hoyISO,
  ahora,
  correo,
  seleccion,
  onElegir,
  hueco,
  enlaces,
}: {
  agenda: AgendaDeHoy;
  vista: "dia" | "semana";
  /** El día que se ve, o el lunes en la semana. */
  dia: string;
  hoyISO: string;
  ahora: Date;
  correo: string;
  seleccion: string | null;
  onElegir: (id: string) => void;
  hueco: { inicio: string; fin: string } | null;
  enlaces: { hoy: string; anterior: string; siguiente: string; dia: string; semana: string };
}) {
  const router = useRouter();
  const borradores = useBorradores(correo);
  const dias = useMemo(() => (vista === "semana" ? [0, 1, 2, 3, 4].map((i) => sumarDias(dia, i)) : [dia]), [vista, dia]);
  const titulo = vista === "semana" ? `Semana del ${fechaCorta(dia)} al ${fechaCorta(sumarDias(dia, 4))}` : fechaLarga(dia);
  const eventos = useMemo(() => agenda.reuniones.map((r) => ({ id: r.id, inicio: r.inicio, fin: r.fin })), [agenda.reuniones]);
  // «Agendar» y «+ Crear evento» buscan la primera hora libre sin pisar lo que la agenda tiene cargado.
  useEffect(() => fijarEventosDeLaAgenda(eventos), [eventos]);
  // Un borrador tapa el hueco libre que se pisa con él (ya se está usando).
  const huecoVisible = hueco && vista === "dia" && !borradores.lista.some((b) => sePisan(b, hueco)) ? hueco : null;
  const conBorradores = [
    ...eventos,
    ...(huecoVisible ? [{ id: "__hueco__", inicio: huecoVisible.inicio, fin: huecoVisible.fin }] : []),
    ...borradores.lista.map((b) => ({ id: ID_DEL_BORRADOR + b.id, inicio: b.inicio, fin: b.fin })),
  ];
  const grillas = dias.map((d) => grillaDelDia(conBorradores, d));
  const desdeHora = Math.min(...grillas.map((g) => g.desdeHora));
  const hastaHora = Math.max(...grillas.map((g) => g.hastaHora));
  const horas = Array.from({ length: hastaHora - desdeHora }, (_, i) => desdeHora + i);
  const porId = new Map(agenda.reuniones.map((r) => [r.id, r]));
  const borradorPorId = new Map(borradores.lista.map((b) => [ID_DEL_BORRADOR + b.id, b]));

  // «Agendar» (en «Lo que importa hoy») o «+ Crear evento» pueden dejar el borrador en otro día: se va a ese día y se
  // lleva el borrador a la vista.
  const enfocar = borradores.enfocar ? (borradores.lista.find((b) => b.id === borradores.enfocar) ?? null) : null;
  useEffect(() => {
    if (!enfocar) return;
    const suDia = minutoDelDia(enfocar.inicio).dia;
    if (!dias.includes(suDia)) {
      const u = new URL(enlaces.dia, window.location.origin);
      u.searchParams.set("dia", suDia);
      u.searchParams.delete("agenda");
      router.push(`${u.pathname}${u.search}`, { scroll: false });
      return;
    }
    document.getElementById(`borrador-${enfocar.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    yaEnfocado();
  }, [enfocar, dias, enlaces.dia, router]);

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
          <Link href={enlaces.hoy} className={ENLACE_BOTON} scroll={false}>
            Hoy
          </Link>
          <div className="flex gap-0.5">
            <Link href={enlaces.anterior} scroll={false} aria-label={vista === "semana" ? "Semana anterior" : "Día anterior"} className="rounded px-2 py-0.5 text-[15px] text-fg-muted transition-colors hover:text-fg">
              ‹
            </Link>
            <Link href={enlaces.siguiente} scroll={false} aria-label={vista === "semana" ? "Semana siguiente" : "Día siguiente"} className="rounded px-2 py-0.5 text-[15px] text-fg-muted transition-colors hover:text-fg">
              ›
            </Link>
          </div>
          <span className="text-sm font-medium text-fg">{titulo}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Segmentado
            etiqueta="Vista del calendario"
            opciones={[
              { clave: "dia", etiqueta: "Día" },
              { clave: "semana", etiqueta: "Semana" },
            ]}
            valor={vista}
            onCambio={(k) => router.replace(k === "semana" ? enlaces.semana : enlaces.dia, { scroll: false })}
          />
          <button type="button" className={ENLACE_BOTON} onClick={crearEnLaPrimeraHora} title="Deja un borrador en tu primera hora libre de trabajo">
            + Crear evento
          </button>
        </div>
      </div>

      {agenda.estado !== "ok" ? (
        <p className="text-[13px] text-fg-muted">{SIN_AGENDA[agenda.estado]}</p>
      ) : (
        <div className="relative pt-2">
          {vista === "semana" && (
            <div className="grid pb-1.5 pl-[56px]" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
              {dias.map((d) => (
                <span key={d} className={cn("px-1 text-xs font-medium", d === hoyISO ? "text-brand" : "text-fg-muted")}>
                  {DIAS[diaDeLaSemana(d)].slice(0, 3)} {Number(d.slice(8, 10))}
                </span>
              ))}
            </div>
          )}
          <div className="relative" aria-hidden>
            {horas.map((h) => (
              <div key={h} className="relative border-t border-surface-hover" style={{ height: ALTO_HORA }}>
                <span className="absolute -top-2 left-0 w-[50px] bg-surface pr-1.5 text-right text-[11px] text-fg-muted">{h}:00</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 grid pl-[56px]" style={{ top: vista === "semana" ? 30 : 8, gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
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
                            <BorradorDelEvento b={b} className={cn("absolute", vista === "semana" ? (i >= 3 ? "right-full mr-1.5" : "left-full ml-1.5") : "right-2")} />
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
                      esHueco={e.id === "__hueco__"}
                      hueco={huecoVisible}
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
      )}
      <p className="text-xs text-fg-muted">
        {agenda.estado === "ok" && agenda.reuniones.length === 0
          ? vista === "semana"
            ? "No tienes reuniones esta semana. Toca una hora para crear un evento: se guarda en Google Calendar."
            : "No tienes reuniones este día. Toca una hora para crear un evento: se guarda en Google Calendar."
          : "Toca una reunión para ver su guía, o una hora libre para crear un evento. Se guarda y se mueve en Google Calendar."}
      </p>
    </section>
  );
}

function Evento({
  e,
  desplazamiento,
  reunion,
  esHueco,
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
  esHueco: boolean;
  hueco: { inicio: string; fin: string } | null;
  elegida: boolean;
  hoyISO: string;
  ahora: Date;
  angosto: boolean;
  onElegir: () => void;
}) {
  if (!reunion && !esHueco) return null;
  const pasada = reunion ? Date.parse(reunion.fin ?? reunion.inicio) < ahora.getTime() : false;
  const interna = !!reunion && reunion.empresas.length === 0;
  const titulo = esHueco
    ? "Hueco libre"
    : reunion!.empresas.length === 1
      ? `${reunion!.titulo} · ${reunion!.nombres[reunion!.empresas[0]]}`
      : reunion!.titulo;
  const linea = esHueco && hueco ? `${horaCR(hueco.inicio)}–${horaCR(hueco.fin)}` : lineaDeLaReunion(reunion!, hoyISO, ahora);
  const corto = e.alto < 40;
  const ancho = 100 / e.columnas;
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-label={`${titulo}, ${linea}`}
      aria-pressed={elegida}
      className={cn(
        "absolute overflow-hidden rounded-md px-2 py-1 text-left transition hover:brightness-[0.98]",
        corto ? "flex flex-row items-center gap-2" : "flex flex-col gap-px",
        esHueco
          ? "border border-dashed border-brand-light bg-info-surface"
          : pasada
            ? "border border-line bg-surface-muted"
            : interna
              ? "border border-line bg-surface-hover"
              : "border border-fg-muted/35 bg-surface",
        elegida && "border-2 border-solid border-brand",
      )}
      style={{
        top: e.arriba + desplazamiento + 1,
        height: e.alto - 3,
        left: `calc(${angosto ? 2 : 6}px + ${ancho * e.columna}%)`,
        width: `calc(${ancho}% - ${angosto ? 4 : 16}px)`,
      }}
    >
      <span className={cn("truncate text-[12.5px] font-semibold leading-[17px]", esHueco ? "text-brand" : pasada ? "text-fg-muted" : interna ? "text-fg-secondary" : "text-fg")}>
        {titulo}
      </span>
      <span className={cn("whitespace-nowrap text-[11.5px] leading-[15px]", esHueco ? "text-brand" : pasada || interna ? "text-fg-muted" : "text-fg-secondary")}>{linea}</span>
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
  return (
    <>
      <button
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
        <div className="absolute inset-x-0 z-20" style={{ top: topDelCuadro }}>
          <div className="relative">{cuadro}</div>
        </div>
      )}
    </>
  );
}
