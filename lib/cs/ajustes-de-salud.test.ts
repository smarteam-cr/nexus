import { describe, expect, it } from "vitest";
import { leerPartner } from "./lectura-partner";
import { saludDeLaCuenta, saludSegunNexus, type CuentaDeCartera, type ProyectoDeCuenta } from "./cartera-reglas";
import {
  DIAS_DE_LA_CORRECCION,
  SIN_AJUSTES,
  ajustesDesdeEventos,
  esMotivoDelCliente,
  propuestaDeEspera,
  sugerirEspera,
  venceLaCorreccion,
  type EventoDeAjuste,
} from "./ajustes-de-salud";
import { citaDeLaEvidencia, citaEnElTexto, citaPedida } from "./cita-de-alerta";

const HOY = "2026-10-09";

const evento = (o: Partial<EventoDeAjuste>): EventoDeAjuste => ({
  id: "e1",
  tipo: "corregir",
  salud: "saludable",
  nota: "Hablé con el gerente: el atraso está acordado",
  saludDeNexus: "en-riesgo",
  razonesDeNexus: ["bloqueado"],
  huella: null,
  porEmail: "avanegas@smarteamcr.com",
  porNombre: "Alexander Vanegas",
  en: "2026-10-01T15:00:00Z",
  ...o,
});

const proyecto = (o: Partial<ProyectoDeCuenta> = {}): ProyectoDeCuenta => ({
  id: "p1",
  nombre: "Refresh HubSpot",
  etapa: "Configuración",
  cseNombre: "Andrea",
  cseEmail: "andrea@smarteamcr.com",
  activo: true,
  bloqueado: false,
  motivoBloqueo: null,
  detalleBloqueo: null,
  atraso: null,
  cierre: { prometido: null, proyectado: null, corrimientoDias: null },
  avance: 0.5,
  salud: "SALUDABLE",
  cerradoEn: null,
  ...o,
});

const cuenta = (o: Partial<CuentaDeCartera> = {}): CuentaDeCartera => ({
  clientId: "c1",
  nombre: "Librería",
  partner: leerPartner({ hs_is_active: "true", hs_is_managed: "true", hs_unified_usage_score: "60", hs_last_4_weeks_usage_score_trend: "0.01" }),
  proyectos: [proyecto()],
  ultimoContacto: "2026-10-05T15:00:00Z",
  ticketsAbiertos: 0,
  alertas: [],
  facturacion: null,
  licenciasManuales: [],
  ...o,
});

describe("el estado sale del último evento de cada clase", () => {
  it("corregir y después quitar: no hay corrección", () => {
    const a = ajustesDesdeEventos([evento({ id: "a", en: "2026-10-01T10:00:00Z" }), evento({ id: "b", tipo: "quitar-correccion", en: "2026-10-02T10:00:00Z" })]);
    expect(a.correccion).toBeNull();
  });

  it("los eventos pueden llegar en cualquier orden", () => {
    const a = ajustesDesdeEventos([
      evento({ id: "b", tipo: "quitar-espera", en: "2026-10-03T10:00:00Z" }),
      evento({ id: "a", tipo: "en-espera", nota: "Pidió pausa", en: "2026-10-02T10:00:00Z" }),
    ]);
    expect(a.espera).toBeNull();
  });

  it(`una corrección vale ${DIAS_DE_LA_CORRECCION} días, contados en Costa Rica`, () => {
    // 1-oct a las 02:00 UTC todavía es 30-sep en Costa Rica.
    expect(venceLaCorreccion("2026-10-01T02:00:00Z")).toBe("2026-10-30");
    expect(venceLaCorreccion("2026-10-01T15:00:00Z")).toBe("2026-10-31");
  });
});

describe("«en espera del cliente»: lo propone Nexus, lo marca la CSL", () => {
  it("solo los motivos que dicen que el freno es del cliente", () => {
    expect(esMotivoDelCliente("Atraso por cliente")).toBe(true);
    expect(esMotivoDelCliente("Cliente no responde")).toBe(true);
    expect(esMotivoDelCliente("Cliente pidió pausa")).toBe(true);
    expect(esMotivoDelCliente("Atraso por Smarteam")).toBe(false);
    expect(esMotivoDelCliente("Proveedor")).toBe(false);
  });

  it("propone con el proyecto y su motivo; descartada, no vuelve hasta que cambie", () => {
    const p = propuestaDeEspera([proyecto({ motivoBloqueo: "Cliente no responde", bloqueado: true })]);
    expect(p?.nota).toContain("cliente no responde");
    expect(sugerirEspera(p, SIN_AJUSTES)).toBe(true);
    expect(sugerirEspera(p, { ...SIN_AJUSTES, esperaDescartada: p!.huella })).toBe(false);
    const otra = propuestaDeEspera([proyecto({ motivoBloqueo: "Cliente pidió pausa", bloqueado: true })]);
    expect(sugerirEspera(otra, { ...SIN_AJUSTES, esperaDescartada: p!.huella })).toBe(true);
  });
});

describe("⭐ el color con los ajustes de una persona", () => {
  const bloqueadaPorElCliente = proyecto({ bloqueado: true, motivoBloqueo: "Atraso por cliente" });

  it("Librería: bloqueada por el cliente y marcada en espera → «En espera», no rojo", () => {
    const c = cuenta({ proyectos: [bloqueadaPorElCliente] });
    expect(saludDeLaCuenta(c, HOY).salud).toBe("en-riesgo");
    const espera = ajustesDesdeEventos([evento({ tipo: "en-espera", nota: "Esperamos los accesos al ERP" })]);
    const s = saludDeLaCuenta({ ...c, ajustes: espera }, HOY);
    expect(s.salud).toBe("en-espera");
    expect(s.porque).toContain("Esperamos los accesos al ERP");
  });

  it("«Atraso por Smarteam» sigue rojo aunque esté en espera, y dice las dos cosas", () => {
    const c = cuenta({ proyectos: [proyecto({ bloqueado: true, motivoBloqueo: "Atraso por Smarteam" })] });
    const s = saludDeLaCuenta({ ...c, ajustes: ajustesDesdeEventos([evento({ tipo: "en-espera", nota: "Pausa" })]) }, HOY);
    expect(s.salud).toBe("en-riesgo");
    expect(s.porque).toContain("y en espera del cliente");
  });

  it("el motivo de bloqueo cuenta aunque el estado no diga bloqueado (amarillo)", () => {
    const s = saludDeLaCuenta(cuenta({ proyectos: [proyecto({ motivoBloqueo: "Atraso por cliente" })] }), HOY);
    expect(s.salud).toBe("en-friccion");
    expect(s.razones.map((r) => r.clave)).toEqual(["bloqueoPorMotivo"]);
  });

  it("una corrección vigente manda, y el color de Nexus se sigue viendo", () => {
    const c = cuenta({ proyectos: [bloqueadaPorElCliente], ajustes: ajustesDesdeEventos([evento({})]) });
    const s = saludDeLaCuenta(c, HOY);
    expect(s.salud).toBe("saludable");
    expect(s.nexus?.salud).toBe("en-riesgo");
    expect(s.porque).toContain("Corregido por Alexander");
    expect(saludSegunNexus(c, HOY).salud).toBe("en-riesgo");
  });

  it("vencida, vuelve el color de Nexus y lo dice", () => {
    const c = cuenta({ proyectos: [bloqueadaPorElCliente], ajustes: ajustesDesdeEventos([evento({ en: "2026-08-01T15:00:00Z" })]) });
    const s = saludDeLaCuenta(c, HOY);
    expect(s.salud).toBe("en-riesgo");
    expect(s.correccionQueCaduco?.motivo).toBe("vencio");
  });

  it("una razón roja que no estaba al corregir la deja sin efecto", () => {
    const c = cuenta({
      proyectos: [bloqueadaPorElCliente],
      partner: leerPartner({ hs_is_active: "true", hs_is_managed: "true", hs_unified_usage_score: "60", hs_cancellation_products: "SALES" }),
      ajustes: ajustesDesdeEventos([evento({ razonesDeNexus: ["bloqueado"] })]),
    });
    const s = saludDeLaCuenta(c, HOY);
    expect(s.salud).toBe("en-riesgo");
    expect(s.correccionQueCaduco?.motivo).toBe("senal-nueva");
  });
});

describe("la frase de una queja", () => {
  it("el agente la pide con texto y de dónde; el runner la verifica tal cual", () => {
    const pedida = citaPedida({ cita: { texto: "  el reporte sigue sin funcionar ", sessionId: "s1" } });
    expect(pedida).toEqual({ texto: "el reporte sigue sin funcionar", sessionId: "s1", correoId: null });
    expect(citaPedida({ cita: { texto: "algo" } })).toBeNull();
    expect(citaEnElTexto("el reporte sigue sin funcionar", "Cliente: «El reporte sigue  sin funcionar», dijo.")).toBe(true);
    expect(citaEnElTexto("el reporte ya funciona bien", "El reporte sigue sin funcionar")).toBe(false);
    // Una frase corta no prueba nada.
    expect(citaEnElTexto("no sirve", "no sirve")).toBe(false);
  });

  it("la cartera solo lee la que el runner marcó verificada", () => {
    expect(citaDeLaEvidencia({ cita: { texto: "x", id: "s1", fuente: "reunion" } })).toBeNull();
    expect(citaDeLaEvidencia({ cita: { texto: "x", id: "s1", fuente: "correo", verificada: true } })?.fuente).toBe("correo");
  });
});
