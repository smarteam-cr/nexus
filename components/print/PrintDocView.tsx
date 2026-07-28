"use client";

/**
 * components/print/PrintDocView.tsx — el render de impresión, uno solo para todos los tipos.
 *
 * Monta el MISMO motor que el CSE ve en pantalla (`LandingView mode="read"`) sobre el
 * contenido que cargó `lib/print/load-doc.ts`. La consecuencia buscada: el PDF no es una
 * segunda maqueta que hay que mantener al día, es la pantalla impresa. Si una sección cambia
 * de aspecto, cambia en los dos lados el mismo día.
 *
 * ── POR QUÉ IMPORTA LOS ADAPTADORES Y NO CONSTRUYE LA CONFIG ─────────────────
 * Cada tipo ya tiene su adaptador, COMPARTIDO con su editor y —cuando existe— con su página
 * externa. Reusarlos es lo que garantiza que el PDF traiga las mismas secciones, en el mismo
 * orden y con el mismo tratamiento del hero. Armar la config acá sería una tercera copia de
 * esa regla, y la que nadie mira cuando algo cambia.
 */
import { useMemo } from "react";
import LandingView from "@/components/landing/LandingView";
import type { LandingConfig } from "@/components/landing/types";
import type { PrintDocPayload, PrintRow } from "@/lib/print/load-doc";
import {
  buildDesarrolloConfig,
  buildDesarrolloSections,
} from "@/components/canvas/desarrollo-landing-adapter";
import {
  buildDiagnosticoConfig,
  buildDiagnosticoSections,
} from "@/components/canvas/diagnostico-landing-adapter";
import {
  buildPlanificacionConfig,
  buildPlanificacionSections,
} from "@/components/canvas/planificacion-landing-adapter";
import {
  buildImplementacionConfig,
  buildImplementacionSections,
} from "@/components/canvas/implementacion-landing-adapter";
import {
  buildExploracionConfig,
  buildExploracionSections,
} from "@/components/canvas/exploracion-landing-adapter";

interface Adaptador {
  config: (orderedKeys: string[]) => LandingConfig;
  sections: (rows: PrintRow[]) => Array<{ key: string; data: unknown }>;
}

/**
 * docType → su adaptador. Las claves son las de `lib/print/doc-types.ts`; que falte una
 * significa "ese tipo todavía no imprime por acá", y la página responde 404 en vez de una
 * hoja en blanco. `lib/print/doc-adapters.test.ts` cuida que el mapa y el registro no se
 * separen.
 */
const ADAPTADORES: Record<string, Adaptador> = {
  "tech-requirements": { config: buildDesarrolloConfig, sections: buildDesarrolloSections },
  diagnosis: { config: buildDiagnosticoConfig, sections: buildDiagnosticoSections },
  planning: { config: buildPlanificacionConfig, sections: buildPlanificacionSections },
  implementation: { config: buildImplementacionConfig, sections: buildImplementacionSections },
  exploration: { config: buildExploracionConfig, sections: buildExploracionSections },
};

export function hasPrintAdapter(docType: string): boolean {
  return docType in ADAPTADORES;
}

export default function PrintDocView({ doc }: { doc: PrintDocPayload }) {
  const adaptador = ADAPTADORES[doc.docType];

  const { config, sections } = useMemo(() => {
    if (!adaptador) return { config: null, sections: [] };
    const built = adaptador.sections(doc.rows);
    return {
      config: adaptador.config(doc.rows.map((r) => r.key)),
      sections: doc.rows.map((r, i) => ({
        key: r.key,
        data: built[i]?.data ?? null,
        titleOverride: r.titleOverride,
        eyebrowOverride: r.eyebrowOverride,
      })),
    };
  }, [adaptador, doc.rows]);

  if (!config) return null;

  return (
    <LandingView
      config={config}
      /* La paleta entra por PROP, no envolviendo: `LandingView` renderiza su propio `.stl`
         adentro y ese re-declara los tokens sobre cualquier wrapper externo. Ver
         lib/ui/landing-palette-scope.test.ts. */
      palette={doc.palette}
      ctx={{
        clientName: doc.ctx.clientName,
        lang: doc.ctx.lang,
        pdfMode: true, // las secciones con piezas async (diagramas) van a su variante estática
        clientLogoUrl: doc.ctx.clientLogoUrl,
        clientLogoDarkUrl: doc.ctx.clientLogoDarkUrl,
        clientLogoScale: doc.ctx.clientLogoScale,
        smarteamLogoUrl: doc.ctx.smarteamLogoUrl,
        brandLogos: doc.ctx.brandLogos,
      }}
      sections={sections}
      mode="read"
    />
  );
}
