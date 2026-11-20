/**
 * app/(juego)/layout.tsx — las pantallas del jugador de una trivia: sin el shell (sin menú, sin el chat ni las
 * preguntas flotantes), pensadas para el teléfono. El tema, la letra y los avisos los pone el layout raíz; quién puede
 * entrar lo dice cada página (basta ser del equipo: jugar no pide el permiso de Trivias).
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trivia · Nexus",
};

export default function JuegoLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-surface text-fg">{children}</main>;
}
