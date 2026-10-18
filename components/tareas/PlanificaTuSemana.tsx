"use client";

/**
 * components/tareas/PlanificaTuSemana.tsx — «Planifica tu semana» (fase 2.3 de docs/nexus-sistema-de-trabajo-plan.md,
 * 2026-10-17). La pantalla de los viernes: Nexus arma la semana que viene por cuenta (lib/mi-dia/planificar.ts) y tú la
 * ajustas acá.
 *
 * Cada cuenta, una fila con dos columnas: la ACCIÓN (la que ya tiene, o la sugerida: darle fecha a una tarea abierta o
 * crear una) y la REUNIÓN (la que ya está, o la sugerida en tu primer hueco libre con su objetivo). Lo de Nexus va en
 * azul con la chispa, una vez, y dice de dónde sale. «Agendar» deja el mismo borrador de la agenda de «Para ti» y abre
 * Google Calendar con todo lleno (Nexus no escribe en el calendario); «Ya lo guardé» deja la reunión planeada en Tareas.
 * Lo que no cabe en la semana se ve aparte, con la opción de elegir otra hora.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Alert, EmptyState, Input, Select, Textarea } from "@/components/ui";
import { BotonAzul, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { horaCR, instante, minutoDelDia } from "@/lib/mi-dia/inicio";
import { diaCorto } from "@/lib/mi-dia/servicio";
import { enlaceDelBorrador } from "@/lib/mi-dia/agenda-borrador";
import { MINUTOS_DE_LA_REUNION_SUGERIDA, resumenDelPlan, type PlanDeLaCuenta, type PlanDeLaSemana, type ReunionDelPlan } from "@/lib/mi-dia/planificar";
import { HORA_FIN_LABORAL, HORA_INICIO_LABORAL } from "@/lib/mi-dia/constantes";
import BorradorDelEvento from "@/components/para-ti/inicio/BorradorDelEvento";
import { crearBorrador, useBorradores } from "@/components/para-ti/inicio/borradores";
import { apiTareas, avisarQueCambiaronLasTareas } from "./api";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaLargo = (ymd: string) => `${DIAS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;
const diaCortoDe = (ymd: string) => `${DIAS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3).toLowerCase()} ${Number(ymd.slice(8, 10))}`;
const HORAS = Array.from({ length: (HORA_FIN_LABORAL - HORA_INICIO_LABORAL) * 2 - 1 }, (_, i) => HORA_INICIO_LABORAL * 60 + i * 30);
const horaDeMinuto = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export default function PlanificaTuSemana({ plan, sinEntrar, correo }: { plan: PlanDeLaSemana; sinEntrar: number; correo: string }) {
  const r = resumenDelPlan(plan);
  const s = plan.semana;
  const caben = plan.cuentas.filter((c) => c.reunion.tipo !== "no-cabe");
  const noCaben = plan.cuentas.filter((c) => c.reunion.tipo === "no-cabe");

  if (plan.cuentas.length === 0) {
    return (
      <EmptyState
        title="No tienes cuentas que planificar"
        description="Esta pantalla arma la semana de las cuentas que llevas (Customer Success y Desarrollo). Tu trabajo de la semana está en Mis tareas."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-fg-secondary">
        <span>
          <strong className="font-semibold text-fg">{r.cuentas}</strong> {r.cuentas === 1 ? "cuenta" : "cuentas"}
        </span>
        <span>
          <strong className="font-semibold text-fg">{r.conAccion}</strong> ya con acción
        </span>
        <span>
          <strong className="font-semibold text-fg">{r.conReunion}</strong> ya con reunión
        </span>
        {r.noCaben > 0 && <span className="font-semibold text-warn-ink">{r.noCaben === 1 ? "1 reunión no cabe" : `${r.noCaben} reuniones no caben`}</span>}
        <span className="text-fg-muted">
          De {diaLargo(s.dias[0])} a {diaLargo(s.viernes)}, de {HORA_INICIO_LABORAL}:00 a {HORA_FIN_LABORAL}:00.
        </span>
      </div>

      {!plan.calendarioLeido && (
        <Alert variant="warning">No se pudo leer tu calendario: las reuniones que ya tienes pueden no verse, y las horas sugeridas no saben qué tienes ocupado.</Alert>
      )}
      {sinEntrar > 0 && <p className="text-xs text-fg-muted">Y {sinEntrar} cuentas más que no entran en esta pantalla: están en «Para ti» › La cartera.</p>}

      <ul className="flex flex-col gap-3">
        {caben.map((c) => (
          <FilaDelPlan key={c.clientId} c={c} plan={plan} correo={correo} />
        ))}
      </ul>

      {noCaben.length > 0 && (
        <section aria-labelledby="no-cabe-t" className="space-y-3">
          <div>
            <h2 id="no-cabe-t" className="text-sm font-semibold text-fg">
              No cabe en tu semana
            </h2>
            <p className="text-[13px] text-fg-secondary">
              Tu calendario no tiene una hora libre antes del {diaLargo(s.viernes).toLowerCase()} a las {HORA_FIN_LABORAL}:00 para estas reuniones. Si igual las quieres, elige el día y
              la hora; si no, quedan para la semana siguiente.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {noCaben.map((c) => (
              <FilaDelPlan key={c.clientId} c={c} plan={plan} correo={correo} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilaDelPlan({ c, plan, correo }: { c: PlanDeLaCuenta; plan: PlanDeLaSemana; correo: string }) {
  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          <Link href={`/clients/${encodeURIComponent(c.clientId)}`} className="text-sm font-semibold text-fg hover:text-brand">
            {c.empresa}
          </Link>
          {c.proyectos.length > 0 && <span className="truncate text-xs text-fg-muted">{c.proyectos.join(" · ")}</span>}
        </div>
        <span className="text-xs text-fg-muted">{c.ultimaReunion ? `Última reunión: ${diaCorto(c.ultimaReunion)}` : "Sin reuniones registradas"}</span>
      </div>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
        <AccionDeLaFila c={c} plan={plan} />
        <ReunionDeLaFila c={c} plan={plan} correo={correo} />
      </div>
    </li>
  );
}

function Hecho({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-[19px] text-fg">
      <span className="font-semibold text-success-ink">✓</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Sugerencia({ titulo, porque, children }: { titulo: string; porque: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-surface px-3.5 py-3">
      <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        {titulo}
      </p>
      {children}
      <p className="text-xs text-fg-secondary">De dónde sale: {porque}.</p>
    </div>
  );
}

function SelectorDeDia({ dias, valor, onCambio, etiqueta }: { dias: readonly string[]; valor: string; onCambio: (d: string) => void; etiqueta: string }) {
  return (
    <Select aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} className="w-auto">
      {dias.map((d) => (
        <option key={d} value={d}>
          {diaLargo(d)}
        </option>
      ))}
    </Select>
  );
}

function AccionDeLaFila({ c, plan }: { c: PlanDeLaCuenta; plan: PlanDeLaSemana }) {
  const toast = useToast();
  const a = c.accion;
  const [dia, setDia] = useState(a.dia);
  const [titulo, setTitulo] = useState(a.tipo === "nueva" ? a.titulo : "");
  const [modo, setModo] = useState<"sugerida" | "nueva">(a.tipo === "nueva" ? "nueva" : "sugerida");
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [descartada, setDescartada] = useState(false);

  const rotulo = <p className={ROTULO_DEL_SISTEMA}>La acción de la semana</p>;
  if (a.tipo === "tiene") {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <Hecho>
          <Link href={`/tareas?t=${encodeURIComponent(a.tarea.id)}`} className="font-semibold hover:text-brand">
            T-{a.tarea.numero}
          </Link>{" "}
          {a.tarea.titulo} <span className="text-fg-muted">· {diaCortoDe(a.dia)}</span>
        </Hecho>
      </div>
    );
  }
  if (hecho) {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <Hecho>{hecho}</Hecho>
      </div>
    );
  }
  if (descartada) {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <p className="text-[13px] text-fg-muted">
          Sin acción esta semana.{" "}
          <BotonTexto onClick={() => setDescartada(false)}>Deshacer</BotonTexto>
        </p>
      </div>
    );
  }

  const usar = async () => {
    setEnviando(true);
    try {
      if (modo === "sugerida" && a.tipo === "darle-fecha") {
        await apiTareas.cambiar(a.tarea.id, { accion: "editar", version: a.tarea.version, cambios: { venceEl: dia } });
        setHecho(`T-${a.tarea.numero} ${a.tarea.titulo} · vence el ${diaCortoDe(dia)}`);
      } else {
        const t = titulo.trim();
        if (!t) return;
        const r = await apiTareas.crear({ titulo: t, clientId: c.clientId, cuando: plan.semana.desde, venceEl: dia });
        setHecho(`T-${r.numero} ${t} · vence el ${diaCortoDe(dia)}`);
      }
      avisarQueCambiaronLasTareas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la acción.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {rotulo}
      {modo === "sugerida" && a.tipo === "darle-fecha" ? (
        <Sugerencia titulo="Nexus sugiere darle fecha" porque={a.porque}>
          <p className="text-[13px] text-fg">
            <Link href={`/tareas?t=${encodeURIComponent(a.tarea.id)}`} className="font-semibold hover:text-brand">
              T-{a.tarea.numero}
            </Link>{" "}
            {a.tarea.titulo}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SelectorDeDia dias={plan.semana.dias} valor={dia} onCambio={setDia} etiqueta="Para qué día" />
            <BotonAzul onClick={usar} disabled={enviando}>
              {enviando ? "Guardando…" : "Usar"}
            </BotonAzul>
            <BotonTexto onClick={() => setModo("nueva")}>Otra tarea</BotonTexto>
            <BotonTexto onClick={() => setDescartada(true)}>Descartar</BotonTexto>
          </div>
        </Sugerencia>
      ) : (
        <Sugerencia titulo="Nexus sugiere una acción" porque={a.tipo === "nueva" ? a.porque : "la cuenta no tiene una tarea con fecha esta semana"}>
          <Input aria-label="Qué vas a hacer" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={`Seguimiento semanal con ${c.empresa}`} />
          <div className="flex flex-wrap items-center gap-2">
            <SelectorDeDia dias={plan.semana.dias} valor={dia} onCambio={setDia} etiqueta="Para qué día" />
            <BotonAzul onClick={usar} disabled={enviando || !titulo.trim()}>
              {enviando ? "Creando…" : "Crear la acción"}
            </BotonAzul>
            {a.tipo === "darle-fecha" && <BotonTexto onClick={() => setModo("sugerida")}>Volver a la sugerida</BotonTexto>}
            <BotonTexto onClick={() => setDescartada(true)}>Descartar</BotonTexto>
          </div>
        </Sugerencia>
      )}
    </div>
  );
}

function ReunionDeLaFila({ c, plan, correo }: { c: PlanDeLaCuenta; plan: PlanDeLaSemana; correo: string }) {
  const r = c.reunion;
  const rotulo = <p className={ROTULO_DEL_SISTEMA}>La reunión de la semana</p>;
  if (r.tipo === "tiene") {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <Hecho>
          {diaCortoDe(minutoDelDia(r.reunion.inicio).dia)} · {horaCR(r.reunion.inicio)} · {r.reunion.titulo}
          {r.reunion.fuente === "tarea" && <span className="text-fg-muted"> · planeada en Tareas</span>}
        </Hecho>
      </div>
    );
  }
  return <ReunionSugerida c={c} r={r} plan={plan} correo={correo} rotulo={rotulo} />;
}

function ReunionSugerida({
  c,
  r,
  plan,
  correo,
  rotulo,
}: {
  c: PlanDeLaCuenta;
  r: Exclude<ReunionDelPlan, { tipo: "tiene" }>;
  plan: PlanDeLaSemana;
  correo: string;
  rotulo: React.ReactNode;
}) {
  const toast = useToast();
  const borradores = useBorradores(correo);
  const desde = r.inicio ? minutoDelDia(r.inicio) : { dia: plan.semana.viernes, minuto: (HORA_FIN_LABORAL - 1) * 60 };
  const [dia, setDia] = useState(desde.dia);
  const [minuto, setMinuto] = useState(desde.minuto);
  const [titulo, setTitulo] = useState(r.titulo);
  const [objetivo, setObjetivo] = useState(r.objetivo);
  const [borradorId, setBorradorId] = useState<string | null>(null);
  const [agendada, setAgendada] = useState<string | null>(null);
  const [descartada, setDescartada] = useState(false);
  const borrador = useMemo(() => borradores.lista.find((b) => b.id === borradorId) ?? null, [borradores.lista, borradorId]);
  const horas = useMemo(() => (HORAS.includes(minuto) ? HORAS : [...HORAS, minuto].sort((a, b) => a - b)), [minuto]);

  if (agendada) {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <Hecho>{agendada}</Hecho>
      </div>
    );
  }
  if (descartada) {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <p className="text-[13px] text-fg-muted">
          Sin reunión esta semana. <BotonTexto onClick={() => setDescartada(false)}>Deshacer</BotonTexto>
        </p>
      </div>
    );
  }
  if (borrador) {
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <BorradorDelEvento
          b={borrador}
          className="w-full max-w-none shadow-none"
          onGuardado={async (b) => {
            setAgendada(`${diaCortoDe(minutoDelDia(b.inicio).dia)} · ${horaCR(b.inicio)} · ${b.titulo || titulo} · quedó en tus tareas`);
            if (r.sessionId) {
              // La próxima que dejó sugerida esa reunión queda agendada (la página de la reunión lo dice).
              await fetch(`/api/sessions/${encodeURIComponent(r.sessionId)}/seguimiento`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proxima: { estado: "agendada", inicio: b.inicio, titulo: b.titulo || titulo, objetivo: b.objetivo ?? objetivo } }),
              }).catch(() => undefined);
            }
            avisarQueCambiaronLasTareas();
          }}
        />
      </div>
    );
  }

  const agendar = () => {
    const inicio = instante(dia, minuto);
    const fin = new Date(Date.parse(inicio) + MINUTOS_DE_LA_REUNION_SUGERIDA * 60_000).toISOString();
    const b = crearBorrador({
      correo,
      inicio,
      fin,
      titulo: titulo.trim(),
      cuenta: { id: c.clientId, nombre: c.empresa },
      invitados: r.invitados.map((x) => ({ correo: x, nombre: null, clientId: c.clientId })),
      objetivo: objetivo.trim() || null,
      deLaReunion: r.sessionId,
      origen: "agendar",
      abierto: true,
    });
    setBorradorId(b.id);
    const url = enlaceDelBorrador(b, window.location.origin);
    if (!window.open(url, "_blank", "noopener,noreferrer")) toast.info("Tu navegador bloqueó la pestaña: usa «Abrir de nuevo».");
  };

  return (
    <div className="flex flex-col gap-2">
      {rotulo}
      <Sugerencia titulo={r.tipo === "no-cabe" ? "No cabe: elige otra hora" : "Nexus sugiere esta reunión"} porque={r.objetivoDe}>
        <Input aria-label="Título de la reunión" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Textarea aria-label="Objetivo de la reunión" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2} />
        <div className="flex flex-wrap items-center gap-2">
          <SelectorDeDia dias={plan.semana.dias} valor={dia} onCambio={setDia} etiqueta="Qué día" />
          <Select aria-label="A qué hora" value={String(minuto)} onChange={(e) => setMinuto(Number(e.target.value))} className="w-auto">
            {horas.map((m) => (
              <option key={m} value={m}>
                {horaDeMinuto(m)}
              </option>
            ))}
          </Select>
          <span className="text-xs text-fg-secondary">
            {MINUTOS_DE_LA_REUNION_SUGERIDA} min · {r.invitados.length ? `${r.invitados.length} del cliente de la última reunión` : "sin invitados todavía"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={agendar} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover">
            Agendar
          </button>
          <BotonTexto onClick={() => setDescartada(true)}>Descartar</BotonTexto>
        </div>
      </Sugerencia>
    </div>
  );
}
