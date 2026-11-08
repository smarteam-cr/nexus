"use client";

/**
 * ContextoDeLaPreparacion — lo que Nexus pide ANTES de armar una guía (2026-11-06, puntos 1 a 5;
 * lib/exploraciones/contexto-de-la-exploracion.ts):
 *   · ContextoDeTodaLaExploracion: el objetivo de la exploración y lo que ya sabemos del cliente, cargado con lo que Nexus
 *     ya tenía (el traspaso, las notas, lo que dejaron las sesiones) para confirmar o completar;
 *   · ContactoPrevio (solo preventa, primera sesión): si no hubo contacto, un correo corto o un guion de llamada;
 *   · ContextoDeLaSesion: con quién es, qué espera el cliente y cuánto dura (el objetivo va en su propia tarjeta).
 */
import { useEffect, useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import {
  DURACIONES,
  CLAVES_DE_LO_QUE_SABEMOS,
  faltaPedirElObjetivo,
  type ContextoPropuesto,
  FUENTE_DEL_EQUIPO,
  MAX_LO_QUE_ESPERA,
  MAX_OBJETIVO_DE_LA_EXPLORACION,
  MAX_TEXTO_DE_LA_TARJETA,
  NOMBRE_DE_LA_TARJETA,
  porAveriguar,
  type ClaveDeLoQueSabemos,
  type TarjetasDeLoQueSabemos,
  MAX_PERSONAS_DE_LA_SESION,
  textoDeConQuien,
  type PersonaDeLaSesion,
  type TipoDeMensajePrevio,
} from "@/lib/exploraciones/contexto-de-la-exploracion";
import { diaCorto } from "@/lib/exploraciones/fechas";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { Rotulo, useEditarLaSesion } from "./piezas-de-la-sesion";

const CAMPO =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60";

// ── El contexto de toda la exploración (punto 2) ─────────────────────────────

// ── Lo que Nexus ya propuso para el contexto (una sola llamada por exploración) ──

/** Lo que devuelve `GET …/contexto` y lo que se usa de ahí. */
export interface PropuestaDelContexto {
  hayFuentes: boolean;
  propuesto: ContextoPropuesto | null;
  /** El desafío principal que ya tiene la ficha de la empresa (Información del cliente). */
  desafioDeLaFicha: { texto: string; confirmado: boolean } | null;
}

/** Las exploraciones cuya propuesta ya se pidió en esta pantalla (no se vuelve a gastar IA al reabrir). */
const PEDIDAS = new Set<string>();
/** Lo último que se leyó, por exploración: el inicio y la Preparación lo comparten. */
const LEIDAS = new Map<string, PropuestaDelContexto>();

/**
 * Lo que Nexus ya propuso para el contexto de la exploración (las tarjetas, el objetivo y el desafío) y el desafío de la
 * ficha. Si falta y hay de dónde (el traspaso, las notas, las reuniones leídas), lo pide UNA vez por exploración: una
 * llamada de IA. Sin fuentes no gasta IA. `activo` en false no lee nada.
 */
export function usePropuestaDelContexto(activo: boolean) {
  const { exp, puedeEditar } = useLienzo();
  const cx = exp.estado.contenido.contexto;
  const [leida, setLeida] = useState<PropuestaDelContexto | null>(LEIDAS.get(exp.id) ?? null);
  const [proponiendo, setProponiendo] = useState(false);
  const objetivoConfirmado = !!cx?.objetivo.trim();
  // Lo que ya sabemos, confirmado en tarjetas o en el texto libre de la primera tanda: no se vuelve a proponer.
  const conTarjetas = !!cx?.tarjetas || !!cx?.sabemos?.trim();
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`);
        const b = r.ok ? ((await r.json()) as PropuestaDelContexto) : null;
        if (!vivo || !b) return;
        LEIDAS.set(exp.id, b);
        setLeida(b);
        const falta = faltaPedirElObjetivo(objetivoConfirmado ? { objetivo: "x" } : undefined, b.propuesto) || (!conTarjetas && !b.propuesto);
        // Pedirla gasta IA: una vez por exploración en esta pantalla (cerrar a mitad de camino no la repite).
        if (!puedeEditar || !falta || !b.hayFuentes || PEDIDAS.has(exp.id)) return;
        PEDIDAS.add(exp.id);
        setProponiendo(true);
        const p = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proponer: true }) });
        const j = p.ok ? ((await p.json()) as { propuesto: Omit<ContextoPropuesto, "en"> }) : null;
        if (!vivo || !j) return;
        const nueva = { ...b, propuesto: { ...j.propuesto, en: new Date().toISOString() } };
        LEIDAS.set(exp.id, nueva);
        setLeida(nueva);
      } catch {
        // Sin la propuesta, la persona escribe lo que sepa.
      } finally {
        if (vivo) setProponiendo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activo, exp.id, puedeEditar, objetivoConfirmado, conTarjetas]);

  /** Valida (o corrige) el desafío: va a la ficha de la empresa. Con null, se descarta. */
  const validarDesafio = async (texto: string | null): Promise<boolean> => {
    const r = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desafio: texto }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { desafioDeLaFicha?: PropuestaDelContexto["desafioDeLaFicha"] }) : {};
    if (!r?.ok) return false;
    const base = leida ?? { hayFuentes: false, propuesto: null, desafioDeLaFicha: null };
    const nueva = { ...base, propuesto: base.propuesto ? { ...base.propuesto, desafio: null } : null, desafioDeLaFicha: j.desafioDeLaFicha ?? base.desafioDeLaFicha };
    LEIDAS.set(exp.id, nueva);
    setLeida(nueva);
    return true;
  };

  return { leida, proponiendo, validarDesafio };
}

export function ContextoDeTodaLaExploracion() {
  const { exp, marco, puedeEditar, cambiar, guardando } = useLienzo();
  const cx = exp.estado.contenido.contexto;
  const cs = marco.clave === "cs";
  // Sin las tarjetas confirmadas (el objetivo se pudo validar en el inicio), se abre para confirmarlas ya cargadas.
  const [editando, setEditando] = useState(puedeEditar && (!cx || (!cx.tarjetas && !cx.sabemos)));
  // Lo escrito por la persona; mientras tanto, lo confirmado o lo que propuso Nexus (2026-11-07: nada vacío para llenar).
  const [objetivo, setObjetivo] = useState<string | null>(cx?.objetivo ?? null);
  const [tarjetas, setTarjetas] = useState<TarjetasDeLoQueSabemos | null>(cx?.tarjetas ?? null);
  const { leida, proponiendo } = usePropuestaDelContexto(editando && puedeEditar);
  const objetivoVisto = objetivo ?? leida?.propuesto?.objetivo ?? "";
  const tarjetasVistas = tarjetas ?? leida?.propuesto?.tarjetas ?? {};

  const cambiarTarjeta = (k: ClaveDeLoQueSabemos, texto: string) => {
    const antes = tarjetasVistas[k];
    // Lo que cambia la persona deja de ser de la fuente: lo escribió el equipo.
    setTarjetas({ ...tarjetasVistas, [k]: { texto, fuente: antes && antes.texto === texto ? antes.fuente : FUENTE_DEL_EQUIPO } });
  };

  const confirmar = async () => {
    const ok = await cambiar([{ op: "contexto", valor: { objetivo: objetivoVisto.trim(), ...(cx?.sabemos ? { sabemos: cx.sabemos } : {}), tarjetas: tarjetasVistas } }], {
      exito: "Contexto de la exploración confirmado.",
    });
    if (ok) setEditando(false);
  };

  if (!editando && cx) {
    const faltan = porAveriguar(cx.tarjetas);
    return (
      <section className="space-y-2 rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <Rotulo className="flex-1">Contexto de la exploración</Rotulo>
          {puedeEditar && <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>}
        </div>
        <p className="text-[14px] leading-5 text-fg">{cx.objetivo}</p>
        {cx.tarjetas ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {CLAVES_DE_LO_QUE_SABEMOS.filter((k) => cx.tarjetas?.[k]).map((k) => (
              <li key={k} className="rounded-lg border border-line bg-surface-muted px-2.5 py-1.5 text-[13px] leading-[18px]">
                <span className="font-semibold text-fg">{NOMBRE_DE_LA_TARJETA[k]}: </span>
                <span className="text-fg-secondary">{cx.tarjetas![k]!.texto}</span>
                <span className="block text-[11px] text-fg-muted">{cx.tarjetas![k]!.fuente}</span>
              </li>
            ))}
          </ul>
        ) : (
          cx.sabemos && <p className="whitespace-pre-line text-[13px] leading-[19px] text-fg-secondary">{cx.sabemos}</p>
        )}
        {faltan.length > 0 && <p className="text-[13px] text-fg-muted">Por averiguar: {faltan.map((k) => NOMBRE_DE_LA_TARJETA[k].toLowerCase()).join(", ")}. La guía lo pregunta.</p>}
        <p className="text-xs text-fg-muted">
          Confirmado{cx.por ? ` por ${cx.por}` : ""} el {diaCorto(cx.en)}. Todas las sesiones dependen de este objetivo.
        </p>
      </section>
    );
  }
  if (!puedeEditar) {
    return <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-[13px] text-fg-muted">Todavía nadie dio el contexto de esta exploración.</p>;
  }
  return (
    <section className="space-y-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
      <div>
        <p className="text-sm font-semibold text-fg">Antes de armar cualquier guía: el contexto de la exploración</p>
        <p className="text-[13px] text-fg-secondary">Nexus arma las guías solo con lo que le das. Todas las sesiones dependen de este objetivo.</p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">¿Por qué exploramos esta empresa y qué queremos lograr?</span>
        <textarea
          value={objetivoVisto}
          onChange={(e) => setObjetivo(e.target.value)}
          maxLength={MAX_OBJETIVO_DE_LA_EXPLORACION}
          rows={2}
          placeholder={cs ? "Por ejemplo: entender qué resultados persigue antes de planificar la implementación del Sales Hub." : "Por ejemplo: ver si ordenar su seguimiento comercial les cambia los números antes de proponer."}
          className={cn(CAMPO, "resize-y")}
        />
      </label>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-fg-secondary">
          Lo que ya sabemos {cs ? "(del traspaso de ventas" : "(de cómo llegó"}, las notas y las reuniones). Lo vacío queda por averiguar y la guía lo pregunta.
        </span>
        {proponiendo && <p className="text-[13px] text-fg-muted">Nexus está leyendo lo que ya tiene del cliente…</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {CLAVES_DE_LO_QUE_SABEMOS.map((k) => (
            <label key={k} className="block space-y-1 rounded-lg border border-line bg-surface px-2.5 py-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-fg">
                {NOMBRE_DE_LA_TARJETA[k]}
                <span className="ml-auto text-[11px] font-normal text-fg-muted">{tarjetasVistas[k]?.texto.trim() ? tarjetasVistas[k]!.fuente : "Por averiguar"}</span>
              </span>
              <textarea
                value={tarjetasVistas[k]?.texto ?? ""}
                onChange={(e) => cambiarTarjeta(k, e.target.value)}
                maxLength={MAX_TEXTO_DE_LA_TARJETA}
                rows={2}
                placeholder="Por averiguar"
                className={cn(CAMPO, "resize-y border-0 px-0 py-0 focus:border-0")}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <BotonAzul disabled={guardando || proponiendo || !objetivoVisto.trim()} onClick={() => void confirmar()}>
          Confirmar el contexto
        </BotonAzul>
        {cx && <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>}
      </div>
    </section>
  );
}

// ── El contacto antes de la primera sesión (punto 3, solo preventa) ──────────

export function ContactoPrevio() {
  const { exp, puedeEditar, cambiar, guardando } = useLienzo();
  const previo = exp.estado.contenido.contactoPrevio;
  const [redactando, setRedactando] = useState<TipoDeMensajePrevio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const redactar = async (tipo: TipoDeMensajePrevio) => {
    setRedactando(tipo);
    setError(null);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje: tipo }) });
      const j = (await r.json().catch(() => ({}))) as { texto?: string; error?: string };
      if (!r.ok || !j.texto) return setError(j.error ?? "No se pudo redactar. Vuelve a intentarlo.");
      await cambiar([{ op: "contactoPrevio", valor: { hubo: false, mensaje: { tipo, texto: j.texto, en: new Date().toISOString() } } }]);
    } finally {
      setRedactando(null);
    }
  };

  if (!previo) {
    if (!puedeEditar) return null;
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <p className="min-w-0 flex-[1_1_320px] text-sm text-fg">¿Ya hubo contacto con el prospecto antes de esta primera sesión?</p>
        <BotonBlanco disabled={guardando} onClick={() => void cambiar([{ op: "contactoPrevio", valor: { hubo: true } }])}>
          Sí, ya hubo
        </BotonBlanco>
        <BotonBlanco disabled={guardando} onClick={() => void cambiar([{ op: "contactoPrevio", valor: { hubo: false } }])}>
          Todavía no
        </BotonBlanco>
      </section>
    );
  }
  if (previo.hubo) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-fg-muted">
        Ya hubo contacto antes de la primera sesión.
        {puedeEditar && <BotonTexto onClick={() => void cambiar([{ op: "contactoPrevio", valor: null }])}>Cambiar</BotonTexto>}
      </p>
    );
  }
  return (
    <section className="space-y-2.5 rounded-xl border border-line bg-surface px-[18px] py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg">Antes de la primera sesión: que el cliente llegue sabiendo a qué va</p>
        {puedeEditar && <BotonTexto onClick={() => void cambiar([{ op: "contactoPrevio", valor: null }])}>Cambiar</BotonTexto>}
      </div>
      <p className="text-[13px] text-fg-secondary">Nos presentamos, mencionamos clientes parecidos con los que trabajamos y explicamos cómo será la reunión. Lo revisas y lo mandas tú.</p>
      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <BotonBlanco disabled={!!redactando || guardando} onClick={() => void redactar("correo")}>
            {redactando === "correo" ? "Redactando…" : previo.mensaje?.tipo === "correo" ? "Rehacer el correo" : "Redactar un correo corto"}
          </BotonBlanco>
          <BotonBlanco disabled={!!redactando || guardando} onClick={() => void redactar("llamada")}>
            {redactando === "llamada" ? "Redactando…" : previo.mensaje?.tipo === "llamada" ? "Rehacer el guion" : "Guion para una llamada de 2 a 3 minutos"}
          </BotonBlanco>
        </div>
      )}
      {error && <p className="text-[13px] text-danger-ink">{error}</p>}
      {previo.mensaje && (
        <div className="space-y-1.5">
          <p className="whitespace-pre-line rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[13.5px] leading-5 text-fg">{previo.mensaje.texto}</p>
          <BotonTexto
            onClick={() => {
              void navigator.clipboard.writeText(previo.mensaje!.texto).then(() => setCopiado(true));
            }}
          >
            {copiado ? "Copiado" : "Copiar"}
          </BotonTexto>
        </div>
      )}
    </section>
  );
}

// ── El contexto de la sesión (punto 4) ────────────────────────────────────────

export function ContextoDeLaSesion({ pestana }: { pestana: PestanaDeSesion }) {
  const { puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "antes");
  const s = pestana.sesion;
  const vacia = !s?.conQuien?.length && !s?.espera;
  const [editando, setEditando] = useState(vacia);
  const [personas, setPersonas] = useState<PersonaDeLaSesion[]>(s?.conQuien?.length ? s.conQuien : [{ nombre: "" }]);
  const [espera, setEspera] = useState(s?.espera ?? "");
  const [duracion, setDuracion] = useState<number>(s?.duracion ?? 60);

  const guardar = async () => {
    const limpias = personas
      .map((p) => ({ nombre: p.nombre.trim(), ...(p.puesto?.trim() ? { puesto: p.puesto.trim() } : {}), ...(p.area?.trim() ? { area: p.area.trim() } : {}) }))
      .filter((p) => p.nombre);
    const id = await editar((x) => {
      const { conQuien: _c, espera: _e, duracion: _d, ...resto } = x;
      void _c;
      void _e;
      void _d;
      return { ...resto, ...(limpias.length ? { conQuien: limpias } : {}), ...(espera.trim() ? { espera: espera.trim() } : {}), duracion };
    });
    if (id) setEditando(false);
  };
  const cambiarPersona = (i: number, campo: keyof PersonaDeLaSesion, valor: string) => setPersonas((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));

  if (!editando) {
    return (
      <section className="space-y-1 rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <Rotulo className="flex-1">Esta sesión</Rotulo>
          {puedeEditar && <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>}
        </div>
        <p className="text-[13.5px] text-fg">
          <span className="text-fg-muted">Con: </span>
          {textoDeConQuien(s?.conQuien) ?? "sin decir todavía"}
        </p>
        {s?.espera && (
          <p className="text-[13.5px] text-fg">
            <span className="text-fg-muted">Qué espera el cliente: </span>
            {s.espera}
          </p>
        )}
        <p className="text-[13px] text-fg-muted">{s?.duracion ?? 60} minutos</p>
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface px-[18px] py-4">
      <Rotulo>Esta sesión</Rotulo>
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-fg-secondary">¿Con quién es? Nombre, puesto y área</span>
        {personas.map((p, i) => (
          <div key={i} className="grid gap-1.5 sm:grid-cols-3">
            <input aria-label="Nombre" value={p.nombre} onChange={(e) => cambiarPersona(i, "nombre", e.target.value)} placeholder="Nombre" maxLength={120} className={CAMPO} disabled={!puedeEditar} />
            <input aria-label="Puesto" value={p.puesto ?? ""} onChange={(e) => cambiarPersona(i, "puesto", e.target.value)} placeholder="Puesto" maxLength={120} className={CAMPO} disabled={!puedeEditar} />
            <input aria-label="Área" value={p.area ?? ""} onChange={(e) => cambiarPersona(i, "area", e.target.value)} placeholder="Área" maxLength={80} className={CAMPO} disabled={!puedeEditar} />
          </div>
        ))}
        {personas.length < MAX_PERSONAS_DE_LA_SESION && (
          <BotonTexto onClick={() => setPersonas((ps) => [...ps, { nombre: "" }])}>+ Agregar persona</BotonTexto>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">¿Qué espera el cliente de esta reunión?</span>
        <input value={espera} onChange={(e) => setEspera(e.target.value)} maxLength={MAX_LO_QUE_ESPERA} placeholder="Por ejemplo: quieren ver un demo y precios." className={CAMPO} disabled={!puedeEditar} />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-fg-secondary">¿Cuánto dura?</span>
        <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={cn(CAMPO, "w-auto")} disabled={!puedeEditar}>
          {DURACIONES.map((d) => (
            <option key={d} value={d}>
              {d} minutos
            </option>
          ))}
        </select>
      </label>
      {puedeEditar && (
        <div className="flex gap-2">
          <BotonAzul disabled={guardando || !personas.some((p) => p.nombre.trim())} onClick={() => void guardar()}>
            Guardar
          </BotonAzul>
          {!vacia && <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>}
        </div>
      )}
    </section>
  );
}
