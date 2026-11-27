/**
 * scripts/lib/empresas-arriba.ts — LAS EMPRESAS QUE PASAN A TENER SU FICHA ARRIBA DE SUS UNIDADES (2026-11-26).
 *
 * Lo lee scripts/crear-empresa-de-unidades.ts (`--empresa tec|cemaco|teamnet`). Decisiones de Elías del 26 nov: DECISIONS
 * «La empresa arriba de sus unidades». Lo compartido por dos o más unidades sube a la empresa; lo de una sola, se queda.
 */
import type { EmpresaArriba } from "@/lib/clients/crear-empresa";

const TAE = "cmpc0dmsq001kxgijrw1y0bzd";
const AE = "cmrw92hc7005h07n14cdkxe6e";
const CR = "cmu0qg14g000107n3bwavv7i6";
const EC = "cmw9te90j00001kijroc16578";
const SUKASA = "cmwmi31wr071r08ngq7028ii2";
const TEAMNET = "cmoiswxin0000tcijn8zlam3d";
const STRATOSPHERE = "cmrf4x0ea00b27gijovbb0asx";

export const EMPRESAS_ARRIBA: Readonly<Record<string, EmpresaArriba>> = {
  /** El TEC: los dominios del instituto y la empresa de HubSpot del ITCR, que hoy tiene TAE, suben. AE y TAE, iguales. */
  tec: {
    clave: "tec",
    nombre: "TEC",
    unidades: [TAE, AE],
    desde: TAE,
    dominiosCompartidos: ["tec.ac.cr", "itcr.ac.cr"],
    empresaDeHubspot: "59180429929",
  },

  /**
   * Cemaco: «Cemaco Internacional» de HubSpot es del grupo (Elías, 26 nov) y sube desde Costa Rica. `cemaco.co.cr` lo usa
   * solo Costa Rica: se queda. Sukasa es la TERCERA unidad (Elías, 27 nov: «una unidad de negocio de Cemaco
   * Internacional, está en Ecuador y en Costa Rica»): la ficha «Sukasa» (prospecto del 18 nov, con su empresa de HubSpot
   * 60198830904, su propuesta, sus contactos y su lead) entra tal cual y suelta sukasa.com, que es de Cemaco · Ecuador
   * desde el 9 nov (INV37: el dominio en dos fichas). Las reuniones «SUKASA…» siguen en Ecuador (Elías, 27 nov): el
   * dominio propio de una unidad es una palabra suya (categorize.ts › palabrasCompartidasDelGrupo). Pasa a llamarse
   * «Cemaco · Sukasa» para que las tres compartan la marca (ver `renombrar`).
   * ⛔ Lo usa el cliente (Marco le pasó un diagnóstico): el --apply espera el OK explícito de Elías.
   */
  cemaco: {
    clave: "cemaco",
    nombre: "Cemaco",
    unidades: [CR, EC, SUKASA],
    quitarDominios: { [SUKASA]: ["sukasa.com"] },
    renombrar: { [SUKASA]: "Cemaco · Sukasa" },
    nombresDeAntes: { [SUKASA]: "Sukasa" },
    sueltasAntes: [SUKASA],
    desde: CR,
    empresaDeHubspot: "59033632123",
    esperaOk: "Cemaco lo usa el cliente: Marco le acaba de pasar un diagnóstico. Elías da el OK antes de aplicar.",
  },

  /** El grupo Teamnet + Stratosphere: cada una con su dominio y su empresa de HubSpot. La empresa solo agrupa. */
  teamnet: {
    clave: "teamnet",
    nombre: "Grupo Teamnet",
    unidades: [TEAMNET, STRATOSPHERE],
    soloSinMoverReuniones: true,
  },
};
