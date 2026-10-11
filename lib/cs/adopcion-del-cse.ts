/**
 * lib/cs/adopcion-del-cse.ts — lo que ve el CSE de una cuenta en Éxito del cliente: SOLO la pestaña
 * Adopción, y sin montos (2026-10-07). PURO.
 *
 * Elías eligió que los recordatorios de revisar la adopción le abran Éxito del cliente al CSE de la
 * cuenta. El resto del área sigue siendo de la CSL y de dirección (lib/cs/acceso.ts): el CSE no ve las
 * otras pestañas, ni el panel, ni el dinero de la cartera.
 *
 * ⚠ Esto se arma en el SERVIDOR antes de pasarle la cuenta a la pantalla: lo que llega a una pantalla
 * de cliente viaja entero al navegador aunque no se pinte. Por eso se VACÍA, no se esconde.
 */
import type { CsAccountData } from "./load-account";

/** Una frase del agente que habla de plata no le llega al CSE. */
const HABLA_DE_PLATA = /\$|US\$|USD|₡|MRR|d[oó]lar|colones|comisi[oó]n|factur/i;

export function soloLaAdopcion(data: CsAccountData): CsAccountData {
  const p = data.cuenta.partner;
  return {
    ...data,
    projects: [],
    projectOps: {},
    alerts: [],
    minutes: [],
    signals: null,
    motivos: [],
    estado: [],
    contactos: [],
    resultados: [],
    desvios: [],
    // El color y las alertas cerradas dicen deuda y lo que vio el agente: tampoco le llegan.
    salud: { salud: "sin-datos", porque: "", razones: [] },
    alertasCerradas: [],
    clasificacion: null,
    esperaPropuesta: null,
    equipoParaPase: [],
    empresa: null,
    puedeReasignar: false,
    brief: data.brief
      ? {
          ...data.brief,
          headline: null,
          statements: data.brief.statements.filter((s) => s.source?.kind === "hubspot_partner" && !HABLA_DE_PLATA.test(s.text)),
        }
      : null,
    partner: data.partner
      ? { ...data.partner, mrrTotal: null, mrrManaged: null, mrrUpForRenewal: null, revenueSignal: null, revenueSignalDetail: null }
      : null,
    cuenta: {
      ...data.cuenta,
      proyectos: [],
      alertas: [],
      facturacion: null,
      licenciasManuales: [],
      clasificacion: null,
      ajustes: null,
      ultimoContacto: null,
      ticketsAbiertos: null,
      partner: p
        ? {
            ...p,
            hubs: p.hubs.map((h) => ({ ...h, montoMensual: null })),
            mrrTotal: null,
            mrrGestionado: null,
            moneda: null,
            cambioAlRenovar: null,
            senales: [],
            senalExplicacion: null,
            senalComoPlantearlo: null,
            contratosHubspot: null,
            nivel: {
              vendidos: null,
              gestionados: null,
              total: null,
              mercado: null,
              multiplicador: null,
              actualizadoEn: null,
              comision: null,
              comisionCalculadaEn: null,
            },
          }
        : null,
    },
  };
}
