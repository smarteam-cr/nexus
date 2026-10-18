"use client";

/**
 * PreguntaDeLaGuia — una pregunta de la guía de una sesión, en la Preparación (validaciones 69 y 71, 2026-10-18).
 *
 * Solo la pregunta, corta: de dónde sale (lo que dijo el cliente, con sus palabras, y la fuente) va en un ⓘ, que pinta
 * la capa de Tooltip con el `title`. En la próxima sesión, quien puede editar tiene «Regenerar» (otra del mismo tema y
 * paso, sin rearmar la guía), y en «⋯» editarla, quitarla o devolverla a la de la guía. Lo que cambia queda en la sesión
 * (`ajustesDeLaGuia`): sobrevive a «Actualizar la guía». Abajo de la lista, «+ Agregar pregunta».
 */
import { useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import {
  claveDePregunta,
  LARGO_DE_UNA_PREGUNTA,
  LARGO_DE_UNA_REPREGUNTA,
  MAX_REPREGUNTAS,
  nuevoIdDePropia,
  type CambioDeLaGuia,
} from "@/lib/exploraciones/ajustes-de-la-guia";
import type { PestanaDeSesion, PreguntaParaMostrar } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { DeQueEs, EtiquetaDePregunta, nombreDelPara, useEditarLaSesion } from "./piezas-de-la-sesion";

/** Cambiar la guía de una sesión: la operación `ajustarGuia` (si la próxima todavía no es sesión, la crea). */
export function useAjustarLaGuia(pestana: PestanaDeSesion) {
  const editar = useEditarLaSesion(pestana, "antes");
  return async (cambio: CambioDeLaGuia): Promise<boolean> => (await editar(null, (id) => [{ op: "ajustarGuia", sesionId: id, cambio }])) !== null;
}

/** El texto del ⓘ: lo que dijo el cliente, con sus palabras, y de dónde sale. */
export function textoDelOrigen(p: Pick<PreguntaParaMostrar, "motivo">): string | null {
  return p.motivo ? `Parte de lo que dijo el cliente: «${p.motivo.texto.replace(/[.\s]+$/, "")}» · ${p.motivo.de}` : null;
}

function Origen({ p }: { p: PreguntaParaMostrar }) {
  const texto = textoDelOrigen(p);
  if (!texto) return null;
  return (
    <button
      type="button"
      title={texto}
      aria-label={texto}
      className="ml-1.5 inline-flex h-[18px] w-[18px] translate-y-[-1px] items-center justify-center rounded-full border border-line align-middle text-[11px] font-semibold text-fg-muted hover:border-brand hover:text-brand"
    >
      i
    </button>
  );
}

/** Editar una pregunta y sus repreguntas (de la guía o propia). */
function EditarPregunta({ p, alGuardar, alCancelar, guardando }: { p: PreguntaParaMostrar; alGuardar: (pregunta: string, repreguntas: string[]) => void; alCancelar: () => void; guardando: boolean }) {
  const [pregunta, setPregunta] = useState(p.pregunta);
  const [repreguntas, setRepreguntas] = useState<string[]>([...p.repreguntas, ...Array(MAX_REPREGUNTAS).fill("")].slice(0, MAX_REPREGUNTAS));
  return (
    <div className="space-y-2">
      <textarea
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        maxLength={LARGO_DE_UNA_PREGUNTA}
        rows={2}
        autoFocus
        aria-label="La pregunta"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-[1.45] text-fg focus:border-brand focus:outline-none"
      />
      <p className="text-xs text-fg-muted">Si responde rápido, profundiza (opcional):</p>
      {repreguntas.map((r, i) => (
        <input
          key={i}
          value={r}
          onChange={(e) => setRepreguntas((xs) => xs.map((x, k) => (k === i ? e.target.value : x)))}
          maxLength={LARGO_DE_UNA_REPREGUNTA}
          aria-label={`Repregunta ${i + 1}`}
          placeholder={`Repregunta ${i + 1}`}
          className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
        />
      ))}
      <div className="flex justify-end gap-2">
        <BotonTexto onClick={alCancelar}>Cancelar</BotonTexto>
        <BotonAzul disabled={guardando || !pregunta.trim()} onClick={() => alGuardar(pregunta, repreguntas.map((r) => r.trim()).filter(Boolean))}>
          Guardar
        </BotonAzul>
      </div>
    </div>
  );
}

/**
 * Una pregunta de la guía. `editable`: es la próxima sesión y quien mira puede cambiarla (regenerar, editar, quitar).
 */
export function PreguntaDeLaGuia({ p, pestana, corta, borde, editable }: { p: PreguntaParaMostrar; pestana: PestanaDeSesion; corta?: boolean; borde?: boolean; editable?: boolean }) {
  const { exp, recargar, guardando } = useLienzo();
  const toast = useToast();
  const ajustar = useAjustarLaGuia(pestana);
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const clave = claveDePregunta(p);
  const propia = p.tipo === "propia";
  // Un punto llevado de otra sesión es texto del vendedor: se edita o se quita, no se regenera.
  const sePuedeRegenerar = editable && p.tipo !== "abierto";

  const regenerar = async () => {
    setRegenerando(true);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/guia/pregunta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) toast.error(j.error ?? "No se pudo regenerar la pregunta.");
      await recargar();
    } finally {
      setRegenerando(false);
    }
  };

  const items = [
    { key: "editar", label: "Editar", onSelect: () => setEditando(true) },
    ...(p.cambiada ? [{ key: "volver", label: "Volver a la de la guía", onSelect: () => void ajustar({ tipo: "restaurar", clave }) }] : []),
    { key: "quitar", label: propia ? "Quitar" : "Quitar de esta sesión", danger: true, separatorBefore: true, onSelect: () => void ajustar({ tipo: "quitar", clave }) },
  ];

  return (
    <li className={cn("flex gap-3 py-3.5 first:pt-0 last:pb-0", borde && "border-b border-surface-hover last:border-b-0")}>
      <EtiquetaDePregunta p={p} />
      <div className="min-w-0 flex-1">
        {editando ? (
          <EditarPregunta
            p={p}
            guardando={guardando}
            alCancelar={() => setEditando(false)}
            alGuardar={(pregunta, repreguntas) =>
              void ajustar({ tipo: "cambiar", clave, pregunta, repreguntas, origen: "tuya" }).then((ok) => ok && setEditando(false))
            }
          />
        ) : (
          <>
            <div className="flex items-start gap-2">
              <p className={cn("min-w-0 flex-1 text-[14.5px] font-semibold leading-[21px] text-fg", regenerando && "opacity-50")}>
                {p.pregunta}
                <Origen p={p} />
              </p>
              {editable && (
                <Menu
                  align="end"
                  aria-label="Más acciones de la pregunta"
                  triggerClassName="flex h-6 w-6 flex-none items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
                  trigger={<span aria-hidden="true">⋯</span>}
                  items={items}
                />
              )}
            </div>
            <DeQueEs p={p} corta={corta} />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {p.repreguntas.length > 0 && (
                <button type="button" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)} className="text-[12.5px] text-brand hover:underline">
                  {abierta ? "Ocultar repreguntas" : `${p.repreguntas.length} ${p.repreguntas.length === 1 ? "repregunta" : "repreguntas"}`}
                </button>
              )}
              {sePuedeRegenerar && (
                <button type="button" disabled={regenerando} onClick={() => void regenerar()} className="text-[12.5px] text-fg-muted hover:text-brand hover:underline disabled:opacity-60">
                  {regenerando ? "Regenerando…" : "Regenerar pregunta"}
                </button>
              )}
            </div>
            {abierta && p.repreguntas.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-l-2 border-line pl-3">
                <span className="text-xs text-fg-muted">Si responde rápido, profundiza:</span>
                {p.repreguntas.map((r, i) => (
                  <span key={i} className="text-[13px] text-fg-secondary">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** «+ Agregar pregunta»: una pregunta tuya para esta sesión, con su tema si lo tiene. */
export function AgregarPregunta({ pestana, temas }: { pestana: PestanaDeSesion; temas: readonly { id: string; nombre: string }[] }) {
  const { guardando } = useLienzo();
  const ajustar = useAjustarLaGuia(pestana);
  const [abierto, setAbierto] = useState(false);
  const [pregunta, setPregunta] = useState("");
  const [tema, setTema] = useState("");
  const [repregunta, setRepregunta] = useState("");

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-3 text-[13px] font-medium text-brand hover:underline">
        + Agregar pregunta
      </button>
    );
  }
  const guardar = async () => {
    const ok = await ajustar({
      tipo: "agregar",
      pregunta: { id: nuevoIdDePropia(), pregunta, repreguntas: repregunta.trim() ? [repregunta.trim()] : [], ...(tema ? { para: tema } : {}), origen: "tuya" },
    });
    if (ok) {
      setPregunta("");
      setRepregunta("");
      setTema("");
      setAbierto(false);
    }
  };
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <textarea
        value={pregunta}
        onChange={(e) => setPregunta(e.target.value)}
        maxLength={LARGO_DE_UNA_PREGUNTA}
        rows={2}
        autoFocus
        aria-label="Tu pregunta"
        placeholder="Tu pregunta, como se la vas a hacer al cliente"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-[1.45] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
      />
      <input
        value={repregunta}
        onChange={(e) => setRepregunta(e.target.value)}
        maxLength={LARGO_DE_UNA_REPREGUNTA}
        aria-label="Una repregunta (opcional)"
        placeholder="Una repregunta, si responde rápido (opcional)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-fg-muted" htmlFor={`tema-${pestana.clave}`}>
          ¿De qué es?
        </label>
        <select
          id={`tema-${pestana.clave}`}
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-[13px] text-fg focus:border-brand focus:outline-none"
        >
          <option value="">Sin tema</option>
          {temas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <BotonTexto onClick={() => setAbierto(false)}>Cancelar</BotonTexto>
        <BotonAzul disabled={guardando || !pregunta.trim()} onClick={() => void guardar()}>
          Agregar
        </BotonAzul>
      </div>
      <p className="text-xs text-fg-muted">Queda marcada como tuya y se queda aunque actualices la guía.</p>
    </div>
  );
}

/** Las preguntas de la guía que se quitaron de esta sesión: se pueden devolver. */
export function Quitadas({ pestana }: { pestana: PestanaDeSesion }) {
  const ajustar = useAjustarLaGuia(pestana);
  const { escala, marco } = useLienzo();
  const quitadas = pestana.sesion?.ajustesDeLaGuia?.quitadas ?? [];
  if (!quitadas.length) return null;
  const nombre = (clave: string) => nombreDelPara(clave.split(":")[0], escala, marco);
  return (
    <p className="mt-3 text-[12.5px] text-fg-muted">
      Quitaste {quitadas.length === 1 ? "1 pregunta" : `${quitadas.length} preguntas`} de la guía ({quitadas.map(nombre).join(", ")}).{" "}
      <button type="button" className="text-brand hover:underline" onClick={() => void Promise.all(quitadas.map((clave) => ajustar({ tipo: "restaurar", clave })))}>
        Devolverlas
      </button>
    </p>
  );
}

/** Los temas a los que puede apuntar una pregunta tuya: las tarjetas del marco y las dimensiones de las áreas en juego. */
export function useTemasDeLaGuia(): { id: string; nombre: string }[] {
  const { exp, escala, marco } = useLienzo();
  return [
    ...marco.tarjetas.map((k) => ({ id: k as string, nombre: nombreDelPara(k, escala, marco) })),
    ...escala.areas.filter((a) => exp.estado.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: `${d.nombre} (${a.nombre})` }))),
  ];
}

