"use client";

/**
 * components/escala/isotipos.tsx — el isotipo de cada herramienta del mapa, para su marca.
 *
 * Pedido de Elías (2026-10-02): en vez de la letra, el isotipo del logo de cada una. Se elige por la
 * CLAVE de la herramienta en el mapa (`hubspot`, `insider`, `smarteam`), que no cambia; una clave sin
 * isotipo acá sigue con su sigla.
 *
 *   · HubSpot: el engranaje (el mismo SVG que usa el sitio de Smarteam).
 *   · Insider One: su isotipo con el degradado rojo a naranja (el del sitio, igual al de insiderone.com).
 *   · Smarteam: dos cápsulas a 45° con un círculo en cada punta, medidas sobre su logo.
 *
 * Los colores son los de cada marca, como tokens del tema (globals.css). Es arte: no lleva texto de
 * la escala ni del mapa.
 */
import { useId, type SVGProps } from "react";

type PropsDelIsotipo = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">;

function HubSpot(props: PropsDelIsotipo) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path style={{ fill: "var(--color-isotipo-hubspot)" }} d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z" />
    </svg>
  );
}

function InsiderOne(props: PropsDelIsotipo) {
  // Un id por dibujo: la rueda pinta varias marcas a la vez y cada una necesita su degradado.
  const id = `isotipo-insider-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 158 180" aria-hidden {...props}>
      <defs>
        <linearGradient id={id} x1="79" y1="7" x2="79" y2="174" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--color-isotipo-insider-desde)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-isotipo-insider-hasta)" }} />
        </linearGradient>
      </defs>
      <path
        style={{ fill: `url(#${id})` }}
        d="M157.756 92.2523C157.756 84.3843 156.68 76.773 154.681 69.5757C152.826 62.9209 153.03 55.8578 155.029 49.2438C158.569 37.5322 155.39 24.2926 145.764 15.5147C136.178 6.77188 122.832 4.82384 111.578 9.38481C105.149 11.9861 98.1388 12.6393 91.297 11.5137C87.2513 10.8488 83.1009 10.5046 78.8749 10.5046C35.3132 10.4988 0 47.1033 0 92.2523C0 105.859 3.20871 118.685 8.88208 129.971C10.4981 133.184 10.8468 136.894 9.81795 140.335C8.1729 145.835 9.40524 152.035 13.5905 156.532C17.7467 160.999 23.7805 162.662 29.326 161.437C32.8428 160.661 36.5049 161.314 39.6031 163.157C51.1649 170.057 64.5752 174 78.8749 174C89.2625 174 99.1851 171.918 108.271 168.133C111.433 166.814 114.938 166.686 118.234 167.619C127.633 170.285 138.149 167.578 145.078 159.763C151.361 152.677 153.14 143.146 150.635 134.678C149.682 131.458 149.908 127.988 151.21 124.897C155.419 114.9 157.756 103.859 157.756 92.2523ZM71.1961 160.824C62.2385 160.824 53.7284 158.678 46.0554 154.829C43.2943 153.441 41.8295 150.414 42.2305 147.346C42.8642 142.569 41.4342 137.553 37.9 133.75C34.2378 129.813 29.1167 128.058 24.1583 128.53C21.1763 128.816 18.3106 127.247 17.0085 124.535C12.3989 114.911 9.78307 103.923 9.78307 92.2465C9.78307 54.3764 37.2722 23.6743 71.1845 23.6743C74.8582 23.6743 78.4506 24.0359 81.9441 24.7242C87.7512 25.8732 91.7563 31.204 91.2912 37.1181C90.5239 46.8642 94.093 56.8493 101.859 63.9358C107.48 69.0625 114.392 71.8504 121.419 72.3578C126.901 72.7544 131.284 77.0938 131.976 82.5646C132.377 85.7258 132.58 88.957 132.58 92.2407C132.58 97.0466 132.138 101.736 131.295 106.262C130.348 111.359 126.273 115.32 121.175 116.148C115.415 117.087 109.927 119.939 105.742 124.657C100.789 130.239 98.6329 137.343 99.1677 144.249C99.592 149.76 96.5461 154.992 91.4133 156.993C85.0773 159.466 78.2646 160.807 71.1787 160.807L71.1961 160.824Z"
      />
    </svg>
  );
}

function Smarteam(props: PropsDelIsotipo) {
  const r = 14.81;
  return (
    <svg viewBox="0 0 100 100" aria-hidden {...props}>
      <line x1={r} y1={56.01} x2={56.01} y2={r} style={{ stroke: "var(--color-isotipo-smarteam-menta)", strokeWidth: r * 2, strokeLinecap: "round" }} />
      <circle cx={56.01} cy={r} r={r} style={{ fill: "var(--color-isotipo-smarteam-azul)" }} />
      <line x1={43.99} y1={85.19} x2={100 - r} y2={43.99} style={{ stroke: "var(--color-isotipo-smarteam-azul)", strokeWidth: r * 2, strokeLinecap: "round" }} />
      <circle cx={43.99} cy={85.19} r={r} style={{ fill: "var(--color-isotipo-smarteam-menta)" }} />
    </svg>
  );
}

const ISOTIPOS: Record<string, (props: PropsDelIsotipo) => React.ReactElement> = {
  hubspot: HubSpot,
  insider: InsiderOne,
  smarteam: Smarteam,
};

export function tieneIsotipo(clave: string): boolean {
  return clave in ISOTIPOS;
}

/** El isotipo de la herramienta, como un `<svg>` (sirve en HTML y dentro del SVG de la rueda). */
export function Isotipo({ clave, ...props }: PropsDelIsotipo & { clave: string }) {
  const Dibujo = ISOTIPOS[clave];
  return Dibujo ? <Dibujo {...props} /> : null;
}
