"use client";

/**
 * CorreoDeSeguimiento — el correo para el cliente después de una reunión de exploración (Elías,
 * 2026-10-07): qué entendimos, lo acordado y los próximos pasos (la minuta), las preguntas que quedaron
 * abiertas y la próxima reunión, o una sesión extra para profundizar. Va en «Análisis», después de
 * «Quedó abierto»: las preguntas salen de lo que no se preguntó y de lo que se marcó ahí.
 *
 * Lo escribe el agente a pedido; lo revisa, lo cambia y lo manda una persona desde su correo (copiar o
 * abrir en el correo). Nexus no envía nada. Lo cambiado se guarda solo.
 */
import { useState } from "react";
import { ConfirmDialog, useToast } from "@/components/ui";
import { BotonBlanco, BotonEnlace, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { claveDeLaReunion, type CorreoDeSeguimiento as Correo } from "@/lib/exploraciones/contenido";
import { avisosDelCorreo, enlaceDeCorreo, MAX_ASUNTO_DEL_CORREO, MAX_CUERPO_DEL_CORREO } from "@/lib/exploraciones/correo-de-seguimiento";
import { haceCuanto } from "@/lib/exploraciones/fechas";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { EstadoDelGuardado, useNotaQueSeGuarda } from "./piezas-de-la-sesion";

const CAMPO = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60";

function Editor({ clave, correo }: { clave: string; correo: Correo }) {
  const { cambiar, puedeEditar } = useLienzo();
  return <EditorDelCorreo correo={correo} puedeEditar={puedeEditar} guardar={(c) => cambiar([{ op: "correo", clave, ...c }])} />;
}

/**
 * El correo armado, para revisarlo, cambiarlo y mandarlo desde el correo de la persona. Lo usan la exploración y la
 * página de cada reunión (ficha G, components/sessions/reunion/DespuesDeLaReunion.tsx): `guardar` dice dónde se guarda
 * lo que se cambia (devuelve algo verdadero si se guardó).
 */
export function EditorDelCorreo({
  correo,
  puedeEditar,
  guardar,
}: {
  correo: Correo;
  puedeEditar: boolean;
  guardar: (cambio: { asunto: string } | { cuerpo: string }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);
  const asunto = useNotaQueSeGuarda(correo.asunto, (texto) => guardar({ asunto: texto }));
  const cuerpo = useNotaQueSeGuarda(correo.cuerpo, (texto) => guardar({ cuerpo: texto }));
  const avisos = avisosDelCorreo(asunto.texto, cuerpo.texto);
  const estado = asunto.estado === "error" || cuerpo.estado === "error" ? "error" : asunto.estado === "guardando" || cuerpo.estado === "guardando" ? "guardando" : asunto.estado === "guardado" || cuerpo.estado === "guardado" ? "guardado" : "quieto";

  const copiar = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(cuerpo.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      return true;
    } catch {
      toast.error("No se pudo copiar: selecciona el texto y cópialo a mano.");
      return false;
    }
  };
  const abrir = async () => {
    const e = enlaceDeCorreo(correo.para, asunto.texto, cuerpo.texto);
    // Largo de más para el enlace: va sin el texto, que queda copiado para pegarlo.
    if (!e.conCuerpo && (await copiar())) toast.info("El correo es largo: el texto quedó copiado. Pégalo en el correo que se abre.");
    window.location.href = e.href;
  };

  return (
    <div className="space-y-3 px-[18px] py-4">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        Lo escribió el agente {haceCuanto(correo.en)}
        {correo.editado && <span className="font-normal normal-case tracking-normal text-fg-muted">· con tus cambios</span>}
      </p>
      {avisos.length > 0 && (
        <ul role="status" className="space-y-0.5 rounded-lg border border-warn-line bg-warn-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-warn-ink">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">Para</span>
        <p className="text-[13px] text-fg-secondary">
          {correo.para.length ? correo.para.join(", ") : "Sin correos del cliente en la reunión: agrégalos en tu correo."}
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">Asunto</span>
        <input
          value={asunto.texto}
          onChange={(ev) => asunto.alEscribir(ev.target.value)}
          onBlur={asunto.alSalir}
          disabled={!puedeEditar}
          maxLength={MAX_ASUNTO_DEL_CORREO}
          className={CAMPO}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">El correo</span>
        <textarea
          value={cuerpo.texto}
          onChange={(ev) => cuerpo.alEscribir(ev.target.value)}
          onBlur={cuerpo.alSalir}
          disabled={!puedeEditar}
          maxLength={MAX_CUERPO_DEL_CORREO}
          rows={18}
          className={cn(CAMPO, "resize-y leading-[1.55]")}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <BotonBlanco onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar el correo"}</BotonBlanco>
        <BotonBlanco onClick={() => void abrir()}>Abrir en tu correo</BotonBlanco>
        <span className="flex-1" />
        <EstadoDelGuardado estado={estado} />
      </div>
    </div>
  );
}

export function CorreoDeSeguimiento({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, puedeEditar, recargar } = useLienzo();
  const toast = useToast();
  const [armando, setArmando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  // Por qué no se armó (la reunión no tiene la conversación): se dice ahí mismo, no en un aviso que se va.
  const [aviso, setAviso] = useState<string | null>(null);
  const r = pestana.reunion;
  if (!r) return null;
  const clave = claveDeLaReunion(r);
  const correo = exp.estado.propuesta.correos[clave] ?? null;

  const armar = async () => {
    setConfirmar(false);
    setAviso(null);
    setArmando(true);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/correo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reunion: { origen: r.origen, id: r.id }, sesionId: pestana.sesion?.id ?? null }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setAviso(d.error ?? "No se pudo armar el correo.");
        await recargar();
        return;
      }
      if (!res.ok) {
        toast.error(d.error ?? "No se pudo armar el correo.");
        return;
      }
      await recargar();
    } catch {
      toast.error("No se pudo armar el correo: revisa la conexión.");
    } finally {
      setArmando(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-[18px] py-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-fg">Correo de seguimiento</h3>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            Lo que entendimos, lo acordado y los próximos pasos, las preguntas que quedaron abiertas y la próxima reunión. Lo revisas y lo mandas tú.
          </p>
        </div>
        {correo && puedeEditar && (
          <BotonEnlace
            disabled={armando}
            title="El agente lo vuelve a escribir con lo que hay hoy de la reunión y de «Quedó abierto»."
            onClick={() => (correo.editado ? setConfirmar(true) : void armar())}
          >
            <span className="inline-flex items-center gap-1.5">
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              {armando ? "Regenerando…" : "Regenerar"}
            </span>
          </BotonEnlace>
        )}
      </header>
      {correo && armando && (
        <p role="status" className="border-b border-info-line bg-info-surface px-[18px] py-2 text-[12.5px] text-brand">
          Escribiendo el correo de nuevo: tarda unos segundos.
        </p>
      )}
      {correo ? (
        <Editor key={correo.corridaId} clave={clave} correo={correo} />
      ) : (
        <div className="flex flex-wrap items-center gap-3 px-[18px] py-4">
          {aviso && (
            <p role="status" className="w-full rounded-lg border border-warn-line bg-warn-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-warn-ink">
              {aviso}
            </p>
          )}
          <p className="min-w-0 flex-1 text-[13px] leading-[19px] text-fg-secondary">
            Las preguntas abiertas salen de lo que no se preguntó y de lo que marcaste en «Quedó abierto». Márcalo antes de armarlo.
          </p>
          {puedeEditar && (
            <BotonBlanco disabled={armando} onClick={() => void armar()}>
              <span className="inline-flex items-center gap-1.5">
                <IconoDeSugerencia className="h-[14px] w-[14px] text-brand" />
                {armando ? "Escribiendo el correo…" : "Armar el correo"}
              </span>
            </BotonBlanco>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmar}
        onCancel={() => setConfirmar(false)}
        onConfirm={() => armar()}
        title="¿Regenerar el correo?"
        description="Lo cambiaste a mano: si el agente lo vuelve a escribir, tus cambios se pierden."
        confirmLabel="Regenerar"
        variant="default"
      />
    </section>
  );
}
