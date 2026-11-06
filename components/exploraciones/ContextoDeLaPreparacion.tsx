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
  MAX_LO_QUE_ESPERA,
  MAX_LO_QUE_SABEMOS,
  MAX_OBJETIVO_DE_LA_EXPLORACION,
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

export function ContextoDeTodaLaExploracion() {
  const { exp, marco, puedeEditar, cambiar, guardando } = useLienzo();
  const cx = exp.estado.contenido.contexto;
  const cs = marco.clave === "cs";
  const [editando, setEditando] = useState(!cx);
  const [objetivo, setObjetivo] = useState(cx?.objetivo ?? "");
  const [sabemos, setSabemos] = useState(cx?.sabemos ?? "");
  const [de, setDe] = useState<string[]>([]);
  const [cargado, setCargado] = useState(false);
  const cargando = editando && puedeEditar && !cx?.sabemos && !cargado;

  // Lo que Nexus ya tiene, cargado para confirmar o completar (sin IA). Solo si no hay nada escrito.
  useEffect(() => {
    if (!editando || !puedeEditar || cx?.sabemos || cargado) return;
    let vivo = true;
    fetch(`/api/sales/exploraciones/${exp.id}/contexto`)
      .then((r) => (r.ok ? (r.json() as Promise<{ sabemos: string; de: string[] }>) : null))
      .then((b) => {
        if (!vivo || !b) return;
        setDe(b.de);
        setSabemos((actual) => (actual.trim() ? actual : b.sabemos));
      })
      .catch(() => undefined)
      .finally(() => vivo && setCargado(true));
    return () => {
      vivo = false;
    };
  }, [editando, puedeEditar, cx?.sabemos, cargado, exp.id]);

  const confirmar = async () => {
    const ok = await cambiar([{ op: "contexto", valor: { objetivo: objetivo.trim(), sabemos: sabemos.trim() } }], { exito: "Contexto de la exploración confirmado." });
    if (ok) setEditando(false);
  };

  if (!editando && cx) {
    return (
      <section className="space-y-1.5 rounded-xl border border-line bg-surface px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <Rotulo className="flex-1">Contexto de la exploración</Rotulo>
          {puedeEditar && <BotonTexto onClick={() => setEditando(true)}>Editar</BotonTexto>}
        </div>
        <p className="text-[14px] leading-5 text-fg">{cx.objetivo}</p>
        {cx.sabemos && (
          <details>
            <summary className="cursor-pointer select-none text-[13px] text-fg-secondary">Lo que ya sabemos del cliente</summary>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-[19px] text-fg-secondary">{cx.sabemos}</p>
          </details>
        )}
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
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          maxLength={MAX_OBJETIVO_DE_LA_EXPLORACION}
          rows={2}
          placeholder={cs ? "Por ejemplo: entender qué resultados persigue antes de planificar la implementación del Sales Hub." : "Por ejemplo: ver si ordenar su seguimiento comercial les cambia los números antes de proponer."}
          className={cn(CAMPO, "resize-y")}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">
          {cs
            ? "Lo que ya sabemos: lo que entregó ventas en el traspaso (retos, objetivos, planes, plazos, consecuencias, presupuesto y quién decide)"
            : "Lo que ya sabemos: cómo llegó (lo que se habló en el primer contacto o lo que contó quien lo refirió)"}
        </span>
        <textarea
          value={sabemos}
          onChange={(e) => setSabemos(e.target.value)}
          maxLength={MAX_LO_QUE_SABEMOS}
          rows={6}
          placeholder={cargando ? "Cargando lo que Nexus ya tiene…" : "Si todavía no sabemos nada, déjalo vacío."}
          className={cn(CAMPO, "resize-y leading-[1.5]")}
        />
        {de.length > 0 && <span className="text-xs text-fg-muted">Lo cargamos con lo que Nexus ya tenía ({de.join(", ").toLowerCase()}). Confírmalo o complétalo.</span>}
      </label>
      <div className="flex gap-2">
        <BotonAzul disabled={guardando || !objetivo.trim()} onClick={() => void confirmar()}>
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
