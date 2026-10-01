/**
 * lib/documentacion/semillas/customer-success/index.ts — la sección de Customer Success, entera.
 *
 *   🌱 Customer Success
 *   ├── 👋 Tus primeros días en Customer Success   ← la puerta de entrada (2026-09-30)
 *   ├── 🛠️ Customer Success Executive (CSE)
 *   ├── 🛡️ Customer Success Lead (CSL)
 *   ├── 🎯 Guía de CSE                  ← la de siempre, movida adentro
 *   ├── 🧑‍💻 Nexus para un CSE, paso a paso  (2026-09-30)
 *   ├── 🧠 Competencias core            (dominio · resolución · relacional)
 *   ├── 💬 La relación con el cliente   (empatía y confianza · antes de una reunión · descubrimiento)
 *   ├── 🌳 Land and Expand
 *   └── 🔁 SmartLoop                    (el proceso operativo)
 *
 * ⚠ La Guía de CSE ya estaba editada por una persona cuando se armó la sección. Figura acá para que
 * la siembra la MUEVA a su lugar; su contenido no se toca (ver `semillas/accion.ts`).
 */
import type { PaginaSembrada } from "../bloques";
import { construirGuiaCse } from "../guia-cse";
import { construirCompetencias } from "./competencias";
import { pagina } from "./enlaces";
import { construirLandAndExpand } from "./land-and-expand";
import { construirNexusParaCse } from "./nexus-para-cse";
import { bloquesDePortada } from "./portada";
import { construirPrimerosDias } from "./primeros-dias";
import { construirRelacion } from "./relacion";
import { construirRolCse, construirRolCsl } from "./roles";
import { construirSmartloop } from "./smartloop";

export function construirCustomerSuccess(): PaginaSembrada {
  return {
    ...pagina("customerSuccess"),
    bloques: bloquesDePortada(),
    hijas: [
      construirPrimerosDias(),
      construirRolCse(),
      construirRolCsl(),
      construirGuiaCse(),
      construirNexusParaCse(),
      construirCompetencias(),
      construirRelacion(),
      construirLandAndExpand(),
      construirSmartloop(),
    ],
  };
}
