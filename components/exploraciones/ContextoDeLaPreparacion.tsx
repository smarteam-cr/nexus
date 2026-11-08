"use client";

/**
 * ContextoDeLaPreparacion — lo que Nexus propone del contexto de la exploración y el contacto antes de la primera sesión
 * (2026-11-06; los tres niveles, 2026-11-07, lib/exploraciones/contexto-de-la-exploracion.ts):
 *   · usePropuestaDelContexto: lo que Nexus ya propuso (el objetivo, el desafío y el resultado del negocio), que viaja con
 *     la exploración y se muestra al instante, y lo de la empresa que ya tiene su ficha. Si nunca se pidió, lo pide UNA vez;
 *   · ContactoPrevio (solo preventa, primera sesión): si no hubo contacto, un correo corto o un guion de llamada.
 * El recuadro «Antes de armar cualquier guía» (el objetivo y las seis tarjetas de «Lo que ya sabemos») y el formulario
 * «Esta sesión» (con quién, qué espera y cuánto dura) se retiraron el 2026-11-07: el objetivo se valida una vez en el
 * inicio, lo de la compra está en el Resumen y lo de la sesión sale de su reunión del calendario.
 */
import { useEffect, useState } from "react";
import { BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import { faltaPedirLaPropuesta, type ContextoPropuesto, type TipoDeMensajePrevio } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { useLienzo } from "./contexto";

// ── Lo que Nexus ya propuso para el contexto (una sola llamada por exploración) ──

/** Lo de la EMPRESA que ya tiene su ficha (Información del cliente). */
export interface EmpresaEnLaFicha {
  desafio: { texto: string; confirmado: boolean } | null;
  resultado: { texto: string; confirmado: boolean; deLosProyectos?: true } | null;
}

/** Las exploraciones cuya propuesta ya se pidió en esta pantalla (no se vuelve a gastar IA al reabrir). */
const PEDIDAS = new Set<string>();
/** Lo último que se leyó de la ficha, por exploración: no se vuelve a esperar al volver al inicio. */
const FICHAS = new Map<string, EmpresaEnLaFicha | null>();

/**
 * Lo que Nexus ya propuso para el contexto y lo de la empresa en su ficha. Lo propuesto viaja con la exploración
 * (`propuesta.contextoPropuesto`): se muestra al instante, sin esperar al servidor (2026-11-07, Elías: «los recuadros tardan
 * en aparecer»). Si nunca se pidió y hay de dónde (el traspaso, las notas, las reuniones leídas), se pide UNA vez por
 * exploración: una llamada de IA, que además deja lo de la compra como sugerencias del Resumen. `activo` en false no lee.
 */
export function usePropuestaDelContexto(activo: boolean) {
  const { exp, puedeEditar, recargar } = useLienzo();
  const propuesto: ContextoPropuesto | null = exp.estado.propuesta.contextoPropuesto ?? null;
  const [empresa, setEmpresa] = useState<EmpresaEnLaFicha | null>(FICHAS.get(exp.id) ?? null);
  const [proponiendo, setProponiendo] = useState(false);
  const falta = faltaPedirLaPropuesta(propuesto);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`);
        const b = r.ok ? ((await r.json()) as { hayFuentes: boolean; empresa: EmpresaEnLaFicha | null }) : null;
        if (!vivo || !b) return;
        FICHAS.set(exp.id, b.empresa);
        setEmpresa(b.empresa);
        // Pedirla gasta IA: una vez por exploración (el servidor tampoco la repite aunque haya dos pestañas).
        if (!puedeEditar || !falta || !b.hayFuentes || PEDIDAS.has(exp.id)) return;
        PEDIDAS.add(exp.id);
        setProponiendo(true);
        const p = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proponer: true }) });
        // Lo propuesto y las sugerencias de la compra quedaron en la exploración: se trae lo último.
        if (vivo && p.ok) await recargar();
      } catch {
        // Sin la propuesta, la persona escribe lo que sepa.
      } finally {
        if (vivo) setProponiendo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activo, exp.id, puedeEditar, falta, recargar]);

  /** Valida (o corrige) el desafío o el resultado del negocio: va a la ficha de la empresa. Con null, se descarta. */
  const validarEnLaFicha = async (que: "desafio" | "resultado", texto: string | null): Promise<string | null> => {
    const r = await fetch(`/api/sales/exploraciones/${exp.id}/contexto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [que]: texto }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { empresa?: EmpresaEnLaFicha | null; error?: string }) : {};
    if (!r?.ok) return j.error ?? "No se pudo guardar. Vuelve a intentarlo.";
    if (j.empresa !== undefined) {
      FICHAS.set(exp.id, j.empresa);
      setEmpresa(j.empresa);
    }
    await recargar();
    return null;
  };

  return { propuesto, empresa, proponiendo, validarEnLaFicha };
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
