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
import { configForCanvas } from "@/components/landing/configs/templates";
import { landingConfigForRoles } from "@/components/landing/configs/roles";
import { landingConfigForCronograma } from "@/components/landing/configs/cronograma";
import {
  buildKickoffConfig,
  buildKickoffSections,
} from "@/components/canvas/kickoff-landing-adapter";
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
  /** `templateId` solo lo usa el caso de negocio, que elige plantilla por DOCUMENTO. */
  config: (orderedKeys: string[], templateId: string | null) => LandingConfig;
  sections: (rows: PrintRow[]) => Array<{ key: string; data: unknown }>;
}

/**
 * docType → su adaptador. Las claves son las de `lib/print/doc-types.ts`; que falte una
 * significa "ese tipo todavía no imprime por acá", y la página responde 404 en vez de una
 * hoja en blanco. `lib/print/doc-types.test.ts` cuida que el mapa y el registro no se
 * separen.
 */
/* Los perfiles de puesto no tienen adaptador propio porque no lo necesitan: su config es
   fija (sin orden arrastrable) y el loader ya deja la data lista en un bloque CARD. */
const ADAPTADOR_ROLES: Adaptador = {
  config: () => landingConfigForRoles(),
  sections: (rows) =>
    rows.map((r) => ({ key: r.key, data: r.blocks[0]?.data ?? null })),
};

/**
 * El caso de negocio elige plantilla POR DOCUMENTO (no por tipo), así que su config sale de
 * `templateId`; las filas ya vienen con la `data` en un bloque CARD, igual que en pantalla.
 *
 * ⚠ La plantilla se RECORTA a las keys que llegaron, y en SU orden. Devolverla entera —que es
 * lo que hacía— rompía dos cosas a la vez, porque `LandingView` recorre la CONFIG y no las
 * filas: una sección que el vendedor ocultó no tenía fila, el motor caía a su `empty`, y como
 * el de «Sobre Smarteam» trae textos de fábrica ("HubSpot Partner Elite", "+200 proyectos")
 * se imprimía igual; y el orden que el vendedor arrastró se perdía a favor del de la
 * plantilla. Ese recorte era una COPIA del que hace el editor; hoy los dos llaman a
 * `configForCanvas`, que además sintetiza las secciones personalizadas (`custom:*`).
 *
 * ⚠ Acá solo llegan las KEYS (`PrintRow` no lleva `label`), así que una sección
 * personalizada toma el nombre de su `titleOverride` — que `LandingView` aplica sobre el
 * `label` de la def. Por eso el POST que la crea escribe los dos campos.
 */
const ADAPTADOR_BUSINESS_CASE: Adaptador = {
  config: (keys, templateId) => configForCanvas(templateId, keys.map((key) => ({ key }))),
  sections: (rows) => rows.map((r) => ({ key: r.key, data: r.blocks[0]?.data ?? null })),
};

/* El cronograma tampoco necesita adaptador propio: su orden es FIJO (portada + Gantt) y su
   contenido sale de `ctx`, no de `data`. La única fila con datos es la portada, y el cargador
   ya la deja lista en un bloque CARD. */
const ADAPTADOR_CRONOGRAMA: Adaptador = {
  config: () => landingConfigForCronograma(),
  sections: (rows) => rows.map((r) => ({ key: r.key, data: r.blocks[0]?.data ?? null })),
};

const ADAPTADORES: Record<string, Adaptador> = {
  "business-case": ADAPTADOR_BUSINESS_CASE,
  timeline: ADAPTADOR_CRONOGRAMA,
  role: ADAPTADOR_ROLES,
  kickoff: { config: buildKickoffConfig, sections: buildKickoffSections },
  "tech-requirements": { config: buildDesarrolloConfig, sections: buildDesarrolloSections },
  diagnosis: { config: buildDiagnosticoConfig, sections: buildDiagnosticoSections },
  planning: { config: buildPlanificacionConfig, sections: buildPlanificacionSections },
  implementation: { config: buildImplementacionConfig, sections: buildImplementacionSections },
  exploration: { config: buildExploracionConfig, sections: buildExploracionSections },
};

export default function PrintDocView({ doc }: { doc: PrintDocPayload }) {
  const adaptador = ADAPTADORES[doc.docType];

  const { config, sections } = useMemo(() => {
    if (!adaptador) return { config: null, sections: [] };
    const built = adaptador.sections(doc.rows);
    return {
      config: adaptador.config(doc.rows.map((r) => r.key), doc.templateId),
      sections: doc.rows.map((r, i) => ({
        key: r.key,
        data: built[i]?.data ?? null,
        titleOverride: r.titleOverride,
        eyebrowOverride: r.eyebrowOverride,
      })),
    };
  }, [adaptador, doc.rows, doc.templateId]);

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
        /* Solo kickoff, y solo lectura: SIN `onAssignSession`. `HorariosSection` decide si
           es interactiva con `editable || !!onAssign`, así que pasarlo metería dnd-kit en el
           PDF — su ausencia es lo que rinde la variante estática. */
        kickoff: doc.ctx.kickoff
          ? { timeline: doc.ctx.kickoff.timeline, procesos: doc.ctx.kickoff.procesos }
          : undefined,
        cronograma: doc.ctx.cronograma,
      }}
      sections={sections}
      mode="read"
    />
  );
}
