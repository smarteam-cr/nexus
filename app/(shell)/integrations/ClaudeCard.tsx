/**
 * app/(shell)/integrations/ClaudeCard.tsx — CLAUDE, EN LA PANTALLA DONDE SE MIRAN LAS INTEGRACIONES.
 *
 * Server component: no tiene estado ni handlers, solo pinta lo que la página ya midió.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Nexus usa Claude en ~30 caminos —handoff, kickoff, cronograma, briefs, el asistente— pero en
 * `/integrations` solo se veían HubSpot y Google. La integración más usada del producto era la
 * única invisible, y su gasto vivía en `/settings/gasto-ia`, una pantalla que hay que saber que
 * existe.
 *
 * ⛔ EL GASTO ES PLATA, Y SE TRATA COMO TAL. `/settings/gasto-ia` está gateada a los roles de
 * costos (`isCostosRole`), y `/integrations` la ve cualquier consultor interno. Así que el número
 * llega en `gasto: null` para quien no tiene ese rol — no oculto por CSS, AUSENTE del payload,
 * igual que hace la pantalla original. Ver la guarda en `lib/ai/gasto-en-integraciones.test.ts`.
 */
import Link from "next/link";
import { formatearUsd } from "@/lib/ai/precios";

export interface GastoDeClaude {
  costo30: number;
  llamadas30: number;
  costo7: number;
  llamadas7: number;
  /** Los modelos con más llamadas en los últimos 30 días. */
  modelos: { model: string; llamadas: number }[];
}

interface Props {
  /** `null` cuando quien mira NO tiene el rol de costos. Ver el docblock. */
  gasto: GastoDeClaude | null;
  /** `false` si la tabla del medidor todavía no existe en esta base. */
  medidorListo: boolean;
}

const miles = (n: number) => n.toLocaleString("es-CR");

export default function ClaudeCard({ gasto, medidorListo }: Props) {
  return (
    <section className="rounded-xl bg-surface border border-line p-5">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
          <span className="text-xl" aria-hidden>
            ✳
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-sm font-semibold text-fg">Claude (Anthropic)</h2>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success-surface border border-success-line text-success-ink">
              <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
              Conectado
            </span>
          </div>

          <p className="text-xs text-fg-muted leading-relaxed mb-4">
            El motor de IA de Nexus. Redacta el handoff, el kickoff y los demás documentos, arma y
            modifica el cronograma, clasifica las reuniones con cada cliente y sostiene el
            asistente que conversa antes de generar. Todas las llamadas pasan por un solo lugar,
            así que quedan medidas y topeadas — ninguna corre sin registrarse.
          </p>

          {!medidorListo ? (
            <p className="text-xs text-warn-ink">
              ⚠ El medidor de gasto todavía no está en esta base — falta aplicar su migración.
            </p>
          ) : gasto === null ? (
            /* Sin rol de costos: se dice que el dato existe y quién lo ve. Esconderlo sin
               explicar deja a la persona pensando que no se mide. */
            <p className="text-xs text-fg-muted">
              El gasto en Claude se mide llamada por llamada. El detalle está reservado a los roles
              de costos.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-fg-muted">
                    Últimos 30 días
                  </p>
                  <p className="mt-0.5 text-xl font-bold text-fg tabular-nums">
                    {formatearUsd(gasto.costo30)}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {miles(gasto.llamadas30)} {gasto.llamadas30 === 1 ? "llamada" : "llamadas"}
                  </p>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-fg-muted">
                    Últimos 7 días
                  </p>
                  <p className="mt-0.5 text-xl font-bold text-fg tabular-nums">
                    {formatearUsd(gasto.costo7)}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {miles(gasto.llamadas7)} {gasto.llamadas7 === 1 ? "llamada" : "llamadas"}
                  </p>
                </div>
              </div>

              {gasto.modelos.length > 0 && (
                <p className="text-[11px] text-fg-muted mb-3">
                  Modelos en uso:{" "}
                  {gasto.modelos.map((m, i) => (
                    <span key={m.model}>
                      {i > 0 && " · "}
                      <span className="text-fg-secondary">{m.model}</span> ({miles(m.llamadas)})
                    </span>
                  ))}
                </p>
              )}

              {/* ⚠ La misma salvedad que la pantalla de gasto: el medidor no es contabilidad. */}
              <p className="text-[11px] text-fg-muted mb-3">
                Ventanas móviles de 30 y 7 días. No es contabilidad: se cruza contra la consola de
                Anthropic, no la reemplaza.
              </p>

              <Link
                href="/settings/gasto-ia"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-light hover:text-brand transition-colors"
              >
                Ver el gasto por día, por agente y por corrida →
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
