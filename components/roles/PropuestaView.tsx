"use client";

/**
 * components/roles/PropuestaView.tsx — monta la propuesta en el motor de landing.
 *
 * Es deliberadamente MUCHO más chico que `RoleWorkspace`: no hay toggle de
 * edición, ni autoguardado, ni assist de IA, porque el contenido está
 * hardcodeado (ver lib/propuestas/csl.ts). En cuanto la propuesta tenga storage
 * propio, este componente pasa a parecerse a RoleWorkspace — no al revés.
 */
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigForPropuesta } from "@/components/landing/configs/propuesta";
import { PROPUESTA_CONTENT_KEYS } from "@/components/landing/configs/propuesta.defs";

export default function PropuestaView({
  hero,
  content,
  framed = true,
}: {
  hero: { title: string; area: string; summary: string };
  content: Record<string, unknown>;
  /**
   * El marco redondeado es para el EMBED interno (la propuesta vive dentro del
   * shell de Nexus). En la URL pública el documento ES la página: ahí va a
   * sangre, sin borde que insinúe que está metido en otra cosa.
   */
  framed?: boolean;
}) {
  const sections: LandingSectionData[] = [
    { key: "hero", data: hero },
    ...PROPUESTA_CONTENT_KEYS.map((k) => ({ key: k, data: content[k] ?? null })),
  ];

  // `stl-escala-120`: la propuesta se lee 20% más grande que el resto de los
  // documentos del motor (ver el modificador en landing-engine.css).
  const clase = framed ? "stl-escala-120 overflow-hidden rounded-2xl border border-line" : "stl-escala-120";
  return (
    <div className={clase}>
      <LandingView
        config={landingConfigForPropuesta()}
        ctx={{ clientName: "" }}
        sections={sections}
        mode="read"
        showBriefs={false}
      />
    </div>
  );
}
