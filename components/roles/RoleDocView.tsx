"use client";

/**
 * components/roles/RoleDocView.tsx — un documento de /roles en LECTURA, con la plantilla que
 * le toca por `docType`. Lo montan las TRES superficies que no editan: la vista de quien lo
 * tiene compartido, la página pública por token, y la interna cuando alguien mira sin editar.
 *
 * Es un componente DISTINTO de `RoleWorkspace`, no el mismo con un flag apagado: el workspace
 * lleva adentro el autosave con debounce, el flush `keepalive` en `pagehide` y el CTA de IA, y
 * `Editable` comitea al desmontarse — un `canEdit=false` dejaría vivo el camino de escritura y
 * dispararía PATCHes 403 en la cara del lector. Doctrina del repo: no existe el camino, no es
 * un flag apagado (DECISIONS §Exploración).
 *
 * (Ex `PropuestaView`, que solo sabía de propuestas hardcodeadas.)
 */
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { landingConfigForDocType } from "@/components/landing/configs/doc-type";
import { contentKeysForDocType, escalaForDocType } from "@/lib/roles/doc-type";
import type { RoleDocTypeValue } from "@/lib/roles/schema";

export interface RoleDocHero {
  title: string;
  area: string | null;
  summary: string | null;
}

export default function RoleDocView({
  docType,
  hero,
  content,
  framed = true,
}: {
  docType: RoleDocTypeValue;
  hero: RoleDocHero;
  content: Record<string, unknown>;
  /**
   * El marco redondeado es para el EMBED interno (el documento vive dentro del shell de
   * Nexus). En la URL pública el documento ES la página: ahí va a sangre.
   */
  framed?: boolean;
}) {
  const sections: LandingSectionData[] = [
    { key: "hero", data: { title: hero.title, area: hero.area ?? "", summary: hero.summary ?? "" } },
    ...contentKeysForDocType(docType).map((k) => ({ key: k, data: content[k] ?? null })),
  ];

  // La escala sale del TIPO (la propuesta se lee 20% más grande), no de esta superficie: si
  // no, el mismo documento se vería distinto adentro, compartido y en público.
  const clases = [escalaForDocType(docType), framed && "overflow-hidden rounded-2xl border border-line"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={clases || undefined}>
      <LandingView
        config={landingConfigForDocType(docType)}
        ctx={{ clientName: "" }}
        sections={sections}
        mode="read"
        showBriefs={false}
      />
    </div>
  );
}
