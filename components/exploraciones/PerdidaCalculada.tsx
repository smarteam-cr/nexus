"use client";

/**
 * PerdidaCalculada — cuánto pierde el cliente, dentro de «Qué pasa si no actúa» (2026-11-20, lib/exploraciones/perdida.ts).
 *
 * Con Negocio, Embudo y una meta de cuánto a cuánto, Nexus hace la cuenta y la propone, con la cuenta a la vista. Quien
 * lleva la preventa la valida con el cliente (la agenda de la próxima sesión la trae como «Validar con el cliente: …») y
 * aprieta «Lo validé con el cliente»: queda guardada con su cuenta. Si después cambian las cifras, se ve la cuenta nueva
 * para volver a validarla. Sin cuenta todavía, dice qué falta para hacerla.
 *
 * ⛔ Interno: nada de esto llega a la propuesta (Elías, 20 nov). Solo en la preventa (marco `venta`).
 */
import { Badge, Button } from "@/components/ui";
import { loQueFaltaParaLaCuenta, perdidaDeLaExploracion, type CalculoDeLaPerdida } from "@/lib/exploraciones/perdida";
import { BotonTexto } from "@/components/ui/sistema";
import { useLienzo } from "./contexto";

/** El mismo nombre en «Qué pasa si no actúa» y en «Lo que falta saber» de «En vivo». */
export const MARCAR_COMO_VALIDADA = "Marcar como validada con el cliente";

function LaCuenta({ c }: { c: Pick<CalculoDeLaPerdida, "texto" | "cuenta"> }) {
  return (
    <>
      <p className="text-sm font-semibold text-fg">{c.texto}</p>
      <p className="text-[13px] leading-[19px] text-fg-secondary">
        <span className="font-medium">La cuenta: </span>
        {c.cuenta}
      </p>
    </>
  );
}

export function PerdidaCalculada() {
  const { exp, marco, puedeEditar, guardando, cambiar } = useLienzo();
  if (marco.clave !== "venta") return null;
  const casillas = exp.estado.contenido.casillas;
  const { validada, porValidar } = perdidaDeLaExploracion(casillas, exp.estado.contenido.perdida);
  const conCifras = casillas.negocio !== undefined || casillas.embudo !== undefined;
  const falta = !validada && !porValidar && conCifras ? loQueFaltaParaLaCuenta(casillas) : null;
  if (!validada && !porValidar && !falta) return null;

  return (
    <div className="space-y-2">
      {validada && (
        <div className="space-y-1.5 rounded-xl border border-success-line bg-success-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="xs" variant="success">
              Validada con el cliente
            </Badge>
            <Badge size="xs" title="No entra a la propuesta: la ve el cliente.">
              Interno
            </Badge>
          </div>
          <LaCuenta c={validada} />
          {puedeEditar && (
            <BotonTexto className="-ml-1.5" disabled={guardando} onClick={() => void cambiar([{ op: "perdida", huella: null }])}>
              Quitar la validación
            </BotonTexto>
          )}
        </div>
      )}
      {porValidar && (
        <div className="space-y-1.5 rounded-xl border border-info-line bg-info-surface px-4 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand">
            {validada ? "Con las cifras de hoy, la cuenta da otra cosa" : "Nexus calculó cuánto pierden"}
          </p>
          <LaCuenta c={porValidar} />
          <p className="text-xs text-fg-muted">Sale de Negocio, Embudo y Metas. Valídalo con el cliente: la agenda de la próxima sesión ya lo trae. No llega a la propuesta.</p>
          {puedeEditar && (
            <Button size="xs" variant="secondary" loading={guardando} onClick={() => void cambiar([{ op: "perdida", huella: porValidar.huella }])}>
              {MARCAR_COMO_VALIDADA}
            </Button>
          )}
        </div>
      )}
      {falta && <p className="text-xs text-fg-muted">Para que Nexus calcule cuánto pierden falta {falta}.</p>}
    </div>
  );
}
