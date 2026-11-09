/**
 * scripts/lib/unidades.ts — LAS EMPRESAS QUE SE SEPARAN EN UNIDADES, una entrada por empresa (2026-11-07).
 *
 * Lo lee scripts/separar-en-unidades.ts (`--empresa tec`). Plan: docs/empresas-con-dominio-compartido-plan.md, parte 2;
 * DECISIONS «Una empresa con varias unidades». Una empresa nueva es una entrada más: la ficha principal (la del dominio
 * y la empresa de HubSpot) y sus unidades, con su nombre, sus siglas y sus dominios propios si los tiene.
 *
 * `aMano`: lo que decidió una persona después de ver el simulacro (id → clave de la unidad). Es lo único que el
 * `--apply` mueve cuando ni el título ni la gente lo deciden: un proyecto o una propuesta que Nexus propone «por la
 * gente de sus reuniones» se queda donde está hasta que alguien lo ponga acá.
 */
import type { SeparacionEnUnidades } from "@/lib/sessions/separar-en-unidades";

export const EMPRESAS_EN_UNIDADES: Readonly<Record<string, SeparacionEnUnidades>> = {
  /**
   * El TEC (decidido el 29 oct): la vieja «TEC» es TAE, con los dominios y la empresa de HubSpot del ITCR; «TEC- AE»
   * (creada el 22 jul, vacía) es AE, comparte el dominio y suelta su empresa de HubSpot, que está fusionada en la del
   * ITCR. Lo mismo que hacía scripts/separar-tec.ts. El proyecto de AE y la propuesta «AE - Smartloop» van a AE por su
   * título; la preventa, con su propuesta.
   */
  tec: {
    empresa: "TEC",
    principal: { clave: "TAE", id: "cmpc0dmsq001kxgijrw1y0bzd", nombre: "TEC · TAE", siglas: ["TAE"], esperaDominio: "itcr.ac.cr" },
    unidades: [
      {
        clave: "AE",
        id: "cmrw92hc7005h07n14cdkxe6e",
        nombre: "TEC · AE",
        siglas: ["AE"],
        soltarEmpresaDeHubspot:
          "la suya (56463266574) está fusionada en la del ITCR y responde con sus datos; la del ITCR es de TAE (R7b)",
      },
    ],
  },

  /**
   * CEMACO (decisión 6 del 7 nov): «Cemaco Internacional» es Costa Rica, la principal (`cemaco.co.cr`, la empresa de
   * HubSpot). Ecuador nace con sus dominios propios: sus reuniones («SUKASA + CEMACO + COMOHOGAR | …») las separa el
   * dominio. La del 30 oct, con gente de los dos países, queda por decidir. El proyecto de Desarrollo «CEMACO » y la
   * propuesta «CRM + ERP» se proponen a Costa Rica por su gente, y los confirma Elías.
   * Siglas: «CR» y «EC», que valen en un título junto a la marca («Cemaco CR |»): «CR» suelto está en 27 títulos de otros.
   */
  cemaco: {
    empresa: "CEMACO",
    principal: { clave: "CR", id: "cmu0qg14g000107n3bwavv7i6", nombre: "Cemaco · Costa Rica", siglas: ["CR"], esperaDominio: "cemaco.co.cr" },
    unidades: [{ clave: "EC", nombre: "Cemaco · Ecuador", siglas: ["EC"], dominios: ["sukasa.com", "comohogar.com"] }],
    /* Elías, 9 nov, después del simulacro: las cuatro de sep–oct sin gente del cliente (solo Smarteam o HubSpot) son de
       Costa Rica, de antes de Ecuador; «Platiquemos sobre HubSpot» del 30 oct (5 de Cemaco CR, 3 de Sukasa, 1 de
       Comohogar) abre el diagnóstico de Ecuador y va a Ecuador. Los proyectos, la propuesta y las preventas se quedan. */
    aMano: {
      reuniones: {
        gmeet_1lrm115rdcu302o3mj0spsmadl: "CR", // CEMACO INTERNACIONAL | DESPEGANDO CON HUBSPOT (24 sep)
        gmeet_7f1memgvvbn0jtbgpskp13chbf: "CR", // Sales & Service Handoff | CEMACO (1 oct)
        gmeet_64rql2qsju8i8hla0jhijtl8qe: "CR", // Alineación CEMACO (5 oct)
        gmeet_67m38r5gluopkmr9dfk33bh88h: "CR", // Caso CEMACO (19 oct)
        gmeet_6f5eocn45660qts2s8jpkeu4la: "EC", // Platiquemos sobre HubSpot | SUKASA + CEMACO + COMOHOGAR (30 oct)
      },
    },
  },
};
