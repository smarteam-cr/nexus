"use client";

/**
 * components/tareas/RevisaTuSemana.tsx — «Revisa tu semana» (docs/tareas-plan.md §5.8). Reemplaza a «Cerrar la semana».
 *
 * Dos pasos: 1 Revisa · 2 Agenda. Una fila por tarea abierta de esa semana, sin nada marcado, con dos frases: «La
 * terminé» y «Sigue la próxima semana» («Sigue esta semana» en una semana pasada); «Otra respuesta» abre «Para más
 * adelante» y «Ya no se hará». Cada respuesta se guarda al hacer clic: si se cierra a la mitad, no se pierde nada. Lo que
 * dijo la retro viene en azul, con su cita, y no se marca solo. El botón azul se activa cuando no queda nada sin
 * responder, cierra la revisión y pasa a agendar lo que sigue (el diálogo Agendar, que abre quien monta este).
 *
 * «Revisar con el equipo» (la líder, en la retro) usa la MISMA revisión con una pestaña por persona y solo las tareas
 * de su sprint que ve: no hay paso 2 (la líder no toca el calendario de nadie) y a cada persona le llega UN aviso.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Tabs } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, BotonUsar, FranjaDeSugerencias, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { estaAbierta } from "@/lib/tareas/estados";
import { diaCortoConSemana, rangoDeLaSemana, sumarSemanas, viernesDe } from "@/lib/tareas/semana";
import type { PersonaDeLaSemana, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip, ChipsDeTarea, horas } from "./chips";

type Respuesta = "hecha" | "sigue" | "mas_adelante" | "no_se_hara";

interface DatosDeLaSemana {
  persona: { email: string; nombre: string; equipo: string };
  semana: string;
  lunesDeHoy: string;
  tareas: TareaVista[];
  resultados: Record<string, { resultado: string; decididoPor: string }>;
  cierre: { cerradaPor: string; cerradaAt: string } | null;
}

/** El resultado guardado («pasa» en la base) como la respuesta de la pantalla. */
function comoRespuesta(r: string | undefined): Respuesta | null {
  if (r === "hecha" || r === "mas_adelante" || r === "no_se_hara") return r;
  if (r === "pasa") return "sigue";
  return null;
}

/** «Te falta marcar 2» o, de otra persona, «Faltan marcar 2». */
function faltanTexto(n: number, deOtra: boolean, verbo = "marcar "): string {
  const cuerpo = n === 1 ? `falta ${verbo}1` : `faltan ${verbo}${n}`;
  return deOtra ? cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1) : `Te ${cuerpo}`;
}

/** La revisión de UNA persona en UNA semana: lo que se carga, lo que se responde y cerrar. */
function useRevision(semana: string, persona: string | undefined) {
  const toast = useToast();
  const [datos, setDatos] = useState<DatosDeLaSemana | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({});
  /** Las que eligió con «Usar» de la retro: dejan de verse en azul cuando se cambia la respuesta. */
  const [desdeLaRetro, setDesdeLaRetro] = useState<Set<string>>(new Set());
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const [otraAbierta, setOtraAbierta] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await apiTareas.semana(semana, persona);
      setDatos(d);
      const r: Record<string, Respuesta> = {};
      for (const [id, x] of Object.entries(d.resultados)) {
        const c = comoRespuesta(x.resultado);
        if (c) r[id] = c;
      }
      setRespuestas(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la semana.");
    }
  }, [semana, persona]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const W = datos?.semana ?? semana;
  const hoy = datos?.lunesDeHoy ?? semana;
  const pasada = W < hoy;
  const proxima = pasada ? hoy : sumarSemanas(W, 1);

  /** Las filas: lo abierto en esa semana y lo ya respondido (aunque haya pasado a otra). */
  const filas = useMemo(() => {
    if (!datos) return [];
    return datos.tareas.filter((t) => (t.semana === W && estaAbierta(t.estado)) || !!datos.resultados[t.id] || !!respuestas[t.id]);
  }, [datos, W, respuestas]);
  const yaHechas = useMemo(() => (datos ? datos.tareas.filter((t) => t.semana === W && t.estado === "hecha" && !datos.resultados[t.id] && !respuestas[t.id]) : []), [datos, W, respuestas]);

  const sinResponder = filas.filter((t) => !respuestas[t.id]);
  const conRetro = sinResponder.filter((t) => t.sugeridoCierre);
  const cuenta = (r: Respuesta) => filas.filter((t) => respuestas[t.id] === r).length;
  const siguen = filas.filter((t) => respuestas[t.id] === "sigue");

  async function responder(t: TareaVista, resultado: Respuesta, extra: { desde?: string | null; motivo?: string } = {}, deLaRetro = false) {
    setOcupadas((s) => new Set(s).add(t.id));
    try {
      await apiTareas.revisar({ accion: "responder", semana: W, tareaId: t.id, resultado, ...extra });
      setRespuestas((r) => ({ ...r, [t.id]: resultado }));
      setDesdeLaRetro((s) => {
        const n = new Set(s);
        if (deLaRetro) n.add(t.id);
        else n.delete(t.id);
        return n;
      });
      setOtraAbierta(null);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupadas((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
    }
  }

  async function usarLaRetro(lista: TareaVista[]) {
    for (const t of lista) {
      if (!t.sugeridoCierre) continue;
      const ok = await responder(t, t.sugeridoCierre.resultado === "hecha" ? "hecha" : "sigue", {}, true);
      if (!ok) return;
    }
  }

  async function lasQueFaltanQueSigan() {
    for (const t of sinResponder) {
      const ok = await responder(t, "sigue");
      if (!ok) return;
    }
  }

  /** Cierra la revisión. Devuelve lo que dijo el servidor, o null si falló (ya avisó con un toast). */
  async function cerrar(): Promise<{ cerrada?: boolean; faltanSuyas?: number } | null> {
    setCerrando(true);
    try {
      return await apiTareas.revisar({ accion: "cerrar", semana: W, ...(persona ? { persona } : {}) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar la revisión.");
      return null;
    } finally {
      setCerrando(false);
    }
  }

  return {
    datos,
    error,
    W,
    pasada,
    proxima,
    filas,
    yaHechas,
    sinResponder,
    conRetro,
    cuenta,
    siguen,
    respuestas,
    desdeLaRetro,
    ocupadas,
    otraAbierta,
    setOtraAbierta,
    cerrando,
    responder,
    usarLaRetro,
    lasQueFaltanQueSigan,
    cerrar,
    listo: !!datos && sinResponder.length === 0,
  };
}

type Revision = ReturnType<typeof useRevision>;

/** Las filas de la revisión (columna de la izquierda). `deOtra`: la revisa su líder, se habla en tercera persona. */
function FilasDeLaRevision({ r, deOtra }: { r: Revision; deOtra: string | null }) {
  const { datos, error, pasada, proxima, filas, yaHechas, conRetro } = r;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
      {error && <p className="text-[13px] text-danger-ink">{error}</p>}
      {!datos && !error && <p className="text-[13px] text-fg-muted">Abriendo la semana…</p>}
      {datos && (
        <>
          <p className="text-sm text-fg-secondary">
            {deOtra ? `Marca qué terminó ${deOtra}.` : "Marca qué terminaste."} Lo que no, sigue {pasada ? "esta semana" : `en la semana del ${rangoDeLaSemana(proxima)}`}.
          </p>
          {conRetro.length > 0 && (
            <FranjaDeSugerencias acciones={<BotonUsar onClick={() => void r.usarLaRetro(conRetro)}>{`Usar ${conRetro.length === 1 ? "la de la retro" : `las ${conRetro.length}`}`}</BotonUsar>}>
              La retro dice cómo {deOtra ? "le" : "te"} fue en {conRetro.length === 1 ? "1 tarea" : `${conRetro.length}`}. Revísalas: nada se cierra solo.
            </FranjaDeSugerencias>
          )}
          {filas.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-muted px-4 py-4 text-[13px] text-fg-muted">
              {deOtra ? "No le quedó nada abierto de tu sprint en esta semana." : "No quedó nada abierto en esta semana."}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {filas.map((t) => (
                <FilaDeRevision
                  key={t.id}
                  t={t}
                  W={r.W}
                  pasada={pasada}
                  respuesta={r.respuestas[t.id] ?? null}
                  deLaRetro={r.desdeLaRetro.has(t.id)}
                  ocupada={r.ocupadas.has(t.id)}
                  otraAbierta={r.otraAbierta === t.id}
                  onOtra={() => r.setOtraAbierta((x) => (x === t.id ? null : t.id))}
                  onResponder={(res, extra, retro) => void r.responder(t, res, extra, retro)}
                />
              ))}
            </ul>
          )}
          {yaHechas.length > 0 && (
            <details className="rounded-lg border border-line px-4 py-2.5 text-[13px]">
              <summary className="cursor-pointer text-fg-secondary">{yaHechas.length === 1 ? "1 ya estaba hecha" : `${yaHechas.length} ya estaban hechas`}</summary>
              <ul className="mt-2 space-y-1 text-fg-muted">
                {yaHechas.map((t) => (
                  <li key={t.id}>
                    {t.titulo} <span className="tabular-nums">· T-{t.numero}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** «Qué pasa al terminar», en vivo (columna de la derecha). */
function ResumenDeLaRevision({ r, deOtra, children }: { r: Revision; deOtra: string | null; children?: React.ReactNode }) {
  const { siguen, sinResponder, pasada, proxima, cuenta } = r;
  return (
    <aside className="flex-none space-y-4 border-t border-line bg-surface-muted p-6 lg:w-[320px] lg:border-l lg:border-t-0">
      <p className={ROTULO_DEL_SISTEMA}>Qué pasa al terminar</p>
      <ul className="space-y-1.5 text-[13px] text-fg">
        <li>{cuenta("hecha") === 1 ? "1 terminada" : `${cuenta("hecha")} terminadas`}</li>
        <li>
          {siguen.length === 1 ? "1 sigue" : `${siguen.length} siguen`} {pasada ? "esta semana" : `a la semana del ${rangoDeLaSemana(proxima)}`}
        </li>
        {cuenta("mas_adelante") > 0 && <li>{cuenta("mas_adelante") === 1 ? "1 para más adelante" : `${cuenta("mas_adelante")} para más adelante`}</li>}
        {cuenta("no_se_hara") > 0 && <li>{cuenta("no_se_hara") === 1 ? "1 ya no se hará" : `${cuenta("no_se_hara")} ya no se harán`}</li>}
        {sinResponder.length > 0 && <li className="font-medium text-warn-ink">{faltanTexto(sinResponder.length, !!deOtra)}</li>}
      </ul>
      {sinResponder.length > 0 && <BotonEnlace onClick={() => void r.lasQueFaltanQueSigan()}>Las que faltan, que sigan</BotonEnlace>}
      {children}
    </aside>
  );
}

export function RevisaTuSemana({
  semana,
  persona,
  onCerrar,
  onAgendar,
}: {
  semana: string;
  /** La de otra persona (su líder). Por defecto, la tuya. */
  persona?: string;
  onCerrar: () => void;
  /** Al terminar: las que siguen y quedaron sin agenda. Quien monta el diálogo abre «Agendar». */
  onAgendar?: (tareas: TareaVista[]) => void;
}) {
  const toast = useToast();
  const r = useRevision(semana, persona);
  const { datos, W, listo, siguen, sinResponder, cerrando } = r;
  const deOtra = persona && datos ? datos.persona.nombre.split(" ")[0] : null;

  async function terminar() {
    const res = await r.cerrar();
    if (!res) return;
    const paraAgendar = persona ? [] : siguen.map((t) => t.id);
    if (paraAgendar.length && onAgendar) {
      const frescas = (await Promise.all(paraAgendar.map((id) => apiTareas.una(id).then((x) => x.tarea).catch(() => null)))).filter(
        (t): t is TareaVista => !!t && estaAbierta(t.estado) && t.agenda.estado !== "agendada",
      );
      toast.success("Revisaste tu semana.");
      if (frescas.length) {
        onAgendar(frescas);
        return;
      }
    } else {
      toast.success(persona ? "Quedó revisada." : "Revisaste tu semana.");
    }
    onCerrar();
  }

  const textoDelAzul = !listo
    ? faltanTexto(sinResponder.length, !!deOtra, "")
    : siguen.length && !persona
      ? `Listo: agendar ${siguen.length === 1 ? "la que sigue" : `las ${siguen.length} que siguen`}`
      : "Terminar la revisión";

  return (
    <Modal
      open
      onClose={onCerrar}
      size="pantalla"
      cuerpoSinRelleno
      closeOnBackdrop={false}
      title={`${persona && datos ? `La semana de ${datos.persona.nombre}` : "Tu semana"} del ${rangoDeLaSemana(W)}`}
      description={`Paso 1 de 2 · Revisa${persona ? "" : " · después, agenda lo que sigue"}${datos?.cierre ? (datos.cierre.cerradaPor === "sistema" ? " · la revisó el sistema: lo que marques reemplaza lo suyo" : " · ya la habías revisado: lo que cambies reemplaza lo de antes") : ""}`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <BotonTexto onClick={onCerrar}>Ahora no</BotonTexto>
          <BotonAzul onClick={() => void terminar()} disabled={!listo || cerrando}>
            {cerrando ? "Guardando…" : textoDelAzul}
          </BotonAzul>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <FilasDeLaRevision r={r} deOtra={deOtra} />
        <ResumenDeLaRevision r={r} deOtra={deOtra}>
          {!persona && siguen.length > 0 && <p className="text-xs text-fg-muted">Al terminar, las agendas en tu calendario: cada tarea en su propio bloque.</p>}
        </ResumenDeLaRevision>
      </div>
    </Modal>
  );
}

/**
 * «Revisar con el equipo»: la líder, en la retro, con una pestaña por persona del sprint. Lo que marca queda a su
 * nombre; al terminar con cada persona, a ella le llega UN aviso (cuántas marcó, cuántas siguen para agendar y, si le
 * queda algo privado, que le falta marcarlo). No hay paso 2: el calendario de cada persona lo toca solo ella.
 */
export function RevisarConElEquipo({
  semana,
  equipoNombre,
  personas,
  onCerrar,
}: {
  semana: string;
  equipoNombre: string;
  personas: readonly PersonaDeLaSemana[];
  onCerrar: () => void;
}) {
  const [hechas, setHechas] = useState<Set<string>>(() => new Set(personas.filter((p) => p.revisada).map((p) => p.persona.email)));
  const primera = personas.find((p) => !p.revisada && p.faltan > 0) ?? personas[0];
  const [actual, setActual] = useState<string | null>(primera?.persona.email ?? null);
  const quedan = personas.filter((p) => !hechas.has(p.persona.email));

  function terminadaCon(email: string) {
    const n = new Set(hechas).add(email);
    setHechas(n);
    const siguiente = personas.find((p) => !n.has(p.persona.email));
    if (siguiente) setActual(siguiente.persona.email);
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      size="pantalla"
      cuerpoSinRelleno
      closeOnBackdrop={false}
      title={`Revisar con el equipo · ${equipoNombre}`}
      description={`Semana del ${rangoDeLaSemana(semana)} · lo que marques queda a tu nombre, y cada persona puede corregirlo`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">{quedan.length === 0 ? "Revisaron todas las personas." : `${quedan.length === 1 ? "Falta 1 persona" : `Faltan ${quedan.length} personas`}.`}</p>
          <BotonTexto onClick={onCerrar}>{quedan.length === 0 ? "Cerrar" : "Ahora no"}</BotonTexto>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-none px-6 pt-3">
          <Tabs
            items={personas.map((p) => ({
              key: p.persona.email,
              label: `${p.persona.nombre.split(" ")[0]}${hechas.has(p.persona.email) ? " ✓" : ""}`,
              count: hechas.has(p.persona.email) || p.faltan === 0 ? undefined : p.faltan,
            }))}
            value={actual ?? undefined}
            onChange={setActual}
            aria-label="Personas del equipo"
          />
        </div>
        {actual ? (
          <RevisionDeUnaPersona key={actual} semana={semana} persona={actual} yaRevisada={hechas.has(actual)} onTerminada={() => terminadaCon(actual)} />
        ) : (
          <p className="p-6 text-[13px] text-fg-muted">Este sprint no tiene personas activas.</p>
        )}
      </div>
    </Modal>
  );
}

function RevisionDeUnaPersona({ semana, persona, yaRevisada, onTerminada }: { semana: string; persona: string; yaRevisada: boolean; onTerminada: () => void }) {
  const toast = useToast();
  const r = useRevision(semana, persona);
  const nombre = r.datos?.persona.nombre.split(" ")[0] ?? "esta persona";

  async function terminar() {
    const res = await r.cerrar();
    if (!res) return;
    toast.success(
      res.faltanSuyas
        ? `Listo con ${nombre}. Le ${res.faltanSuyas === 1 ? "queda 1 tarea suya" : `quedan ${res.faltanSuyas} tareas suyas`} por marcar: le llegó el aviso.`
        : `Listo con ${nombre}: le llegó el aviso para agendar lo que sigue.`,
    );
    onTerminada();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <FilasDeLaRevision r={r} deOtra={nombre} />
      <ResumenDeLaRevision r={r} deOtra={nombre}>
        {yaRevisada && <p className="text-xs text-fg-muted">Ya está revisada. Si la revisó ella misma, lo que cambie lo corrige ella.</p>}
        <BotonAzul onClick={() => void terminar()} disabled={!r.listo || r.cerrando}>
          {r.cerrando ? "Guardando…" : r.listo ? `Terminar con ${nombre}` : faltanTexto(r.sinResponder.length, true, "")}
        </BotonAzul>
        <p className="text-xs text-fg-muted">Le llega un aviso con lo que marcaste. Agendar lo que sigue lo hace cada persona en su calendario.</p>
      </ResumenDeLaRevision>
    </div>
  );
}

function FilaDeRevision({
  t,
  W,
  pasada,
  respuesta,
  deLaRetro,
  ocupada,
  otraAbierta,
  onOtra,
  onResponder,
}: {
  t: TareaVista;
  W: string;
  pasada: boolean;
  respuesta: Respuesta | null;
  deLaRetro: boolean;
  ocupada: boolean;
  otraAbierta: boolean;
  onOtra: () => void;
  onResponder: (r: Respuesta, extra?: { desde?: string | null; motivo?: string }, deLaRetro?: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [desde, setDesde] = useState("");
  const retro = t.sugeridoCierre;
  const sugerida: Respuesta | null = retro ? (retro.resultado === "hecha" ? "hecha" : "sigue") : null;
  const enAzul = !!retro && (!respuesta || deLaRetro);
  const venceDespues = !!t.venceEl && t.venceEl > viernesDe(W);
  const boton = (r: Respuesta, texto: string) => (
    <button
      type="button"
      disabled={ocupada}
      aria-pressed={respuesta === r}
      onClick={() => onResponder(r, {}, false)}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[13px] transition-colors disabled:opacity-60",
        respuesta === r ? "border-fg-muted bg-surface-hover font-semibold text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
      )}
    >
      {respuesta === r ? `✓ ${texto}` : texto}
    </button>
  );
  return (
    <li className={cn("space-y-2 px-4 py-3", enAzul && "bg-info-surface")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">
            {t.titulo} <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ChipsDeTarea t={t} />
            {t.minutosEstimados ? <Chip>{horas(t.minutosEstimados)}</Chip> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {boton("hecha", "La terminé")}
          {boton("sigue", pasada ? "Sigue esta semana" : "Sigue la próxima semana")}
          <BotonTexto onClick={onOtra} disabled={ocupada}>
            {respuesta === "mas_adelante" ? "Para más adelante" : respuesta === "no_se_hara" ? "Ya no se hará" : "Otra respuesta"} ▾
          </BotonTexto>
        </div>
      </div>
      {enAzul && retro && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-brand">
          <IconoDeSugerencia className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1">
            La retro dice que {retro.resultado === "hecha" ? "la terminaste" : "no se terminó"}
            {retro.cita ? <span className="italic"> · «{retro.cita}»</span> : null}
          </span>
          {!respuesta && sugerida && <BotonUsar disabled={ocupada} onClick={() => onResponder(sugerida, {}, true)} />}
        </div>
      )}
      {respuesta === "sigue" && venceDespues && t.venceEl && <p className="text-xs text-fg-muted">Sigue · vence el {diaCortoConSemana(t.venceEl)}: este pase no cuenta.</p>}
      {t.pases >= 3 && !respuesta && <p className="text-xs text-warn-ink">Ya pasó {t.pases} veces. ¿Sigue siendo verdad? Si no, «Otra respuesta».</p>}
      {otraAbierta && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-fg">Para más adelante</p>
            <label className="block text-xs text-fg-muted">
              ¿Desde cuándo? (opcional)
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-1 block h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-fg"
              />
            </label>
            <BotonBlanco disabled={ocupada} onClick={() => onResponder("mas_adelante", { desde: desde || null })}>
              {desde ? "Desde esa semana" : "Sin semana"}
            </BotonBlanco>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-fg">Ya no se hará</p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué?"
              aria-label="Por qué ya no se hará"
              className="block h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-fg placeholder:text-fg-muted"
            />
            <BotonBlanco disabled={ocupada || !motivo.trim()} onClick={() => onResponder("no_se_hara", { motivo: motivo.trim() })}>
              Ya no se hará
            </BotonBlanco>
          </div>
        </div>
      )}
    </li>
  );
}
