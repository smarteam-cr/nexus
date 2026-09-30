"use client";

/**
 * components/escala/comentarios/CompositorDeComentario.tsx — un comentario nuevo sobre un ancla.
 *
 * Primero el tipo, porque cambia lo que se pregunta: «no se entiende» pide qué; «no calza con un
 * cliente» pide con qué cliente y qué pasó; «propuesta», qué cambiarías y —si se sabe— qué
 * decisión con el cliente cambiaría (la columna del manual con la que se decide qué cambia).
 * El perfil de negocio que se está mirando se guarda con el comentario; se puede corregir.
 */
import { useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CIERRES,
  DESPUES,
  ETIQUETA_DE_CIERRE,
  ETIQUETA_DE_DESPUES,
  type Cierre,
  type Despues,
  type Perfil,
} from "@/lib/escala/documento/perfil";
import { TIPOS_DE_COMENTARIO, type TipoDeComentario } from "@/lib/escala/comentarios/reglas";
import type { ClienteParaElegir, NuevoComentario } from "./almacen";
import SelectorDeCliente, { type ClienteElegido } from "./SelectorDeCliente";

export default function CompositorDeComentario({
  ancla,
  version,
  edicion = null,
  perfilDeLaPantalla,
  onEnviar,
  cargarClientes,
}: {
  ancla: string;
  version: string;
  /** La edición por industria con que se está leyendo la escala (null = la general): se guarda con el comentario. */
  edicion?: { slug: string; nombre: string } | null;
  perfilDeLaPantalla: Perfil;
  onEnviar: (nuevo: NuevoComentario) => Promise<boolean>;
  cargarClientes: () => Promise<ClienteParaElegir[]>;
}) {
  const [tipo, setTipo] = useState<TipoDeComentario>("no_se_entiende");
  const [cuerpo, setCuerpo] = useState("");
  const [decision, setDecision] = useState("");
  const [cliente, setCliente] = useState<ClienteElegido>(null);
  const [cierre, setCierre] = useState<Cierre | null>(perfilDeLaPantalla.cierre);
  const [despues, setDespues] = useState<Despues | null>(perfilDeLaPantalla.despues);
  const [enviando, setEnviando] = useState(false);
  const def = TIPOS_DE_COMENTARIO.find((t) => t.clave === tipo)!;
  const falta = !cuerpo.trim() || (tipo === "no_calza" && !cliente);

  const enviar = async () => {
    if (falta || enviando) return;
    setEnviando(true);
    const ok = await onEnviar({
      ancla,
      tipo,
      cuerpo: cuerpo.trim(),
      decisionQueCambiaria: tipo === "no_se_entiende" ? null : decision.trim() || null,
      clienteId: tipo === "no_calza" ? cliente?.id ?? null : null,
      clienteNombre: tipo === "no_calza" ? cliente?.nombre ?? null : null,
      perfilCierre: cierre,
      perfilDespues: despues,
      edicion: edicion?.slug ?? null,
    });
    setEnviando(false);
    if (ok) {
      setCuerpo("");
      setDecision("");
      setCliente(null);
    }
  };

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="text-sm font-semibold text-fg">Nuevo comentario</p>
      <div role="radiogroup" aria-label="Tipo de comentario" className="grid grid-cols-3 gap-1.5">
        {TIPOS_DE_COMENTARIO.map((t) => (
          <button
            key={t.clave}
            type="button"
            role="radio"
            aria-checked={tipo === t.clave}
            onClick={() => setTipo(t.clave)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-xs leading-tight transition-colors",
              tipo === t.clave ? "border-brand/50 bg-info-surface font-semibold text-info-ink" : "border-line text-fg-secondary hover:bg-surface-hover",
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {tipo === "no_calza" && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-fg-secondary">¿Con qué cliente?</p>
          <SelectorDeCliente valor={cliente} onCambio={setCliente} cargar={cargarClientes} />
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-fg-secondary">{def.pregunta}</span>
        <Textarea
          rows={3}
          value={cuerpo}
          placeholder={def.ayuda}
          onChange={(e) => setCuerpo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void enviar();
          }}
        />
      </label>

      {tipo !== "no_se_entiende" && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-fg-secondary">¿Qué decisión con el cliente cambiaría? · opcional</span>
          <Textarea rows={2} value={decision} placeholder="Por ejemplo: qué se le recomienda primero, o en qué nivel queda" onChange={(e) => setDecision(e.target.value)} />
        </label>
      )}

      <fieldset className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
        <legend className="sr-only">Perfil de negocio del caso</legend>
        <span className="text-fg-muted">Perfil del caso:</span>
        <select
          aria-label="Cómo se cierra la venta"
          value={cierre ?? ""}
          onChange={(e) => setCierre((e.target.value || null) as Cierre | null)}
          className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-fg"
        >
          <option value="">Cómo vende: sin decir</option>
          {CIERRES.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_DE_CIERRE[c]}
            </option>
          ))}
        </select>
        <select
          aria-label="Qué pasa después de la venta"
          value={despues ?? ""}
          onChange={(e) => setDespues((e.target.value || null) as Despues | null)}
          className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-fg"
        >
          <option value="">Después: sin decir</option>
          {DESPUES.map((d) => (
            <option key={d} value={d}>
              {ETIQUETA_DE_DESPUES[d]}
            </option>
          ))}
        </select>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xs text-fg-muted">
          Queda anclado a <span className="font-mono">{ancla}</span> y a la versión {version}
          {edicion ? `, edición ${edicion.nombre}` : ""}.
        </span>
        <Button type="submit" size="sm" variant="primary" loading={enviando} disabled={falta}>
          Comentar
        </Button>
      </div>
    </form>
  );
}
