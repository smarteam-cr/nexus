"use client";

/**
 * components/feedback/Festejo.tsx — el festejo en toda la pantalla cuando alguien manda una mejora.
 *
 * Decisión de Elías (2026-10-04): cada vez que alguien deja una idea, confeti en toda la pantalla y una
 * tarjeta que agradece, SIN nombres. Reglas:
 *   · El confeti usa los colores de MARCA de Smarteam, no los de estado: no significa nada, festeja.
 *     Son hex literales a propósito (iguales en claro y en oscuro, como el logo).
 *   · No bloquea: la capa deja pasar los clics; solo la tarjeta los recibe. Se cierra sola a los 5 s.
 *   · Con «reducir movimiento» activado en la computadora, sale solo la tarjeta, sin confeti.
 *   · Una falla que frena el trabajo NUNCA festeja: eso es otra respuesta, en el panel.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { lineaDeIdeas, TIPO } from "@/lib/feedback/reglas";
import { Z } from "@/lib/ui/z";
import { Trazo } from "./piezas";

const COLORES = ["#0B58D3", "#1E8FF6", "#E8481C", "#F87B5B", "#051849"];
const CAIDAS = [
  [-90, 620],
  [-35, 480],
  [40, 560],
  [95, 700],
] as const;

const CSS = `
${CAIDAS.map(([dx, rot], i) => `@keyframes nx-feedback-caer-${i}{0%{transform:translate3d(0,-40px,0) rotate(0deg);opacity:1}85%{opacity:1}100%{transform:translate3d(${dx}px,105vh,0) rotate(${rot}deg);opacity:0}}`).join("\n")}
@keyframes nx-feedback-aparecer{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
.nx-feedback-tarjeta{animation:nx-feedback-aparecer .28s ease-out both}
@media (prefers-reduced-motion: reduce){.nx-feedback-confeti{display:none}.nx-feedback-tarjeta{animation:none}}
`;

/** El confeti, con una semilla fija: el mismo dibujo cada vez, sin `Math.random` en el render. */
function armarConfeti(): { estilo: React.CSSProperties; clave: number }[] {
  let semilla = 11;
  const azar = () => {
    semilla = (semilla * 9301 + 49297) % 233280;
    return semilla / 233280;
  };
  return Array.from({ length: 90 }, (_, i) => {
    const ancho = 6 + Math.round(azar() * 6);
    const redondo = i % 5 === 0;
    const alto = redondo ? ancho : Math.round(ancho * (1.3 + azar() * 0.9));
    const dur = (2.4 + azar() * 1.6).toFixed(2);
    const ret = (azar() * 0.9).toFixed(2);
    const caida = Math.floor(azar() * CAIDAS.length);
    return {
      clave: i,
      estilo: {
        position: "absolute",
        top: -24,
        left: `${(azar() * 100).toFixed(1)}%`,
        width: ancho,
        height: alto,
        borderRadius: redondo ? 999 : 2,
        background: COLORES[i % COLORES.length],
        animation: `nx-feedback-caer-${caida} ${dur}s cubic-bezier(.25,.6,.4,1) ${ret}s 1 both`,
      },
    };
  });
}

export function Festejo({ ideas, onCerrar }: { ideas: number; onCerrar: () => void }) {
  const [montado, setMontado] = useState(false);
  const confeti = useMemo(() => armarConfeti(), []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard del portal (SSR)
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    const t = window.setTimeout(onCerrar, 5000);
    return () => window.clearTimeout(t);
  }, [onCerrar]);

  if (!montado) return null;
  return createPortal(
    <div
      data-feedback-ui=""
      className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden px-4 pb-32"
      style={{ zIndex: Z.TOAST }}
    >
      <style>{CSS}</style>
      {confeti.map((c) => (
        <span key={c.clave} aria-hidden="true" className="nx-feedback-confeti" style={c.estilo} />
      ))}
      <div
        role="status"
        className="nx-feedback-tarjeta pointer-events-auto relative flex w-[420px] max-w-full flex-col items-center gap-2.5 rounded-xl border border-line bg-surface px-6 pb-[22px] pt-7 text-center"
      >
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-success-line bg-success-surface text-success-ink">
          <Trazo d={TIPO.mejora.icono} className="h-[26px] w-[26px]" />
        </span>
        <p className="text-[22px] font-bold leading-7 text-fg">¡Gracias por la idea!</p>
        <p className="text-sm leading-[1.5] text-fg-secondary">
          Ya la tiene dirección. Las mejoras que más personas piden suben primero en la hoja de ruta.
        </p>
        {ideas > 0 && <p className="text-xs text-fg-muted">{lineaDeIdeas(ideas)}</p>}
        <button
          type="button"
          onClick={onCerrar}
          className="mt-1.5 rounded-lg border border-line bg-surface px-3.5 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          Seguir trabajando
        </button>
      </div>
    </div>,
    document.body,
  );
}
