import { describe, expect, it } from "vitest";
import {
  clienteDeLaComunicacion,
  direccionDelCorreo,
  huellaDe,
  limpiarTexto,
  motivoDeLaLectura,
  planDeCopia,
  sinElHilo,
  type ComunicacionLeida,
  type DatosDeLaComunicacion,
} from "./reglas";
import { compromisosPrendidos, copiaPrendida } from "./banderas";

const ahora = new Date("2026-10-18T15:00:00.000Z");
const datos = (o: Partial<DatosDeLaComunicacion> = {}): DatosDeLaComunicacion => ({
  direccion: "enviado",
  ocurrioAt: new Date("2026-10-16T15:00:00.000Z"),
  asunto: "Minuta de la sesión",
  texto: "Hola Ana, quedamos en agendar la sesión de revisión para el martes 21 de octubre.",
  autorEmail: "marco@smarteamcr.com",
  deEmail: null,
  modificadoEnHubspot: null,
  ...o,
});

describe("de qué cliente es una comunicación (invariante 1)", () => {
  const porEmpresa = new Map([
    ["e1", ["c1"]],
    ["e2", ["c2"]],
    ["e3", ["c3", "c4"]],
  ]);
  const porContacto = new Map([
    ["k1", ["c1"]],
    ["k2", ["c2"]],
    ["k3", ["c1", "c2"]],
  ]);

  it("una empresa de un cliente → ese cliente", () => {
    expect(clienteDeLaComunicacion({ empresas: ["e1", "fuera"], contactos: [] }, porEmpresa, porContacto)).toEqual({ tipo: "uno", clientId: "c1", por: "empresa" });
  });

  it("dos clientes por empresa → ambigua, no se guarda", () => {
    expect(clienteDeLaComunicacion({ empresas: ["e1", "e2"], contactos: [] }, porEmpresa, porContacto)).toEqual({ tipo: "ambigua", clientIds: ["c1", "c2"] });
    // Una empresa de HubSpot con dos fichas en Nexus (un duplicado sin fusionar) también.
    expect(clienteDeLaComunicacion({ empresas: ["e3"], contactos: [] }, porEmpresa, porContacto).tipo).toBe("ambigua");
  });

  it("la empresa manda sobre los contactos", () => {
    expect(clienteDeLaComunicacion({ empresas: ["e1"], contactos: ["k2"] }, porEmpresa, porContacto)).toEqual({ tipo: "uno", clientId: "c1", por: "empresa" });
  });

  it("sin empresa de un cliente, los contactos: uno → ese; dos → ambigua", () => {
    expect(clienteDeLaComunicacion({ empresas: [], contactos: ["k2"] }, porEmpresa, porContacto)).toEqual({ tipo: "uno", clientId: "c2", por: "contacto" });
    expect(clienteDeLaComunicacion({ empresas: [], contactos: ["k1", "k2"] }, porEmpresa, porContacto).tipo).toBe("ambigua");
    // Un contacto que es de dos clientes (una agencia) no decide.
    expect(clienteDeLaComunicacion({ empresas: [], contactos: ["k3"] }, porEmpresa, porContacto).tipo).toBe("ambigua");
  });

  it("nada de Nexus → de nadie", () => {
    expect(clienteDeLaComunicacion({ empresas: ["otra"], contactos: ["otro"] }, porEmpresa, porContacto)).toEqual({ tipo: "ninguno" });
  });
});

describe("el texto", () => {
  it("la dirección del correo", () => {
    expect(direccionDelCorreo("EMAIL")).toBe("enviado");
    expect(direccionDelCorreo("FORWARDED_EMAIL")).toBe("enviado");
    expect(direccionDelCorreo("INCOMING_EMAIL")).toBe("recibido");
    expect(direccionDelCorreo(null)).toBeNull();
  });

  it("saca el HTML y la cita del hilo", () => {
    const t = limpiarTexto(
      { html: "<p>Hola Ana,</p><p>Te envío la minuta.</p><div>El jue, 16 oct 2026 a las 10:00, Ana &lt;ana@x.com&gt; escribió:</div><blockquote>&gt; lo anterior</blockquote>" },
      { sinHilo: true },
    );
    expect(t).toBe("Hola Ana,\nTe envío la minuta.");
  });

  it("el hilo en inglés y el «De: … Enviado:» de Outlook", () => {
    expect(sinElHilo("Gracias.\nOn Thu, Oct 16, 2026 at 10:00 AM Ana wrote:\n> hola")).toBe("Gracias.\n");
    expect(sinElHilo("Listo.\nDe: Ana\nEnviado: jueves\nPara: Marco")).toBe("Listo.\n");
  });

  it("sin nada → null", () => {
    expect(limpiarTexto({ texto: "  ", html: "" })).toBeNull();
    expect(limpiarTexto({ html: "<p> </p>" })).toBeNull();
  });
});

describe("el plan de la copia (nunca se borra)", () => {
  const leida = (o: Partial<ComunicacionLeida> = {}): ComunicacionLeida => ({ tipo: "correo", hubspotId: "h1", datos: datos(), cliente: { tipo: "uno", clientId: "c1", por: "empresa" }, ...o });

  it("nueva → crear; igual → sin cambio; cambió → actualizar", () => {
    expect(planDeCopia([], [leida()]).crear).toHaveLength(1);
    const h = huellaDe(datos());
    expect(planDeCopia([{ tipo: "correo", hubspotId: "h1", clientId: "c1", huella: h, vigente: true }], [leida()]).sinCambio).toBe(1);
    const p = planDeCopia([{ tipo: "correo", hubspotId: "h1", clientId: "c1", huella: "otra", vigente: true }], [leida()]);
    expect(p.actualizar).toHaveLength(1);
    expect(p.actualizar[0].cambioDeCliente).toBe(false);
  });

  it("una que pasa a ser de dos clientes queda de baja, y no se guarda la ambigua", () => {
    const p = planDeCopia([{ tipo: "correo", hubspotId: "h1", clientId: "c1", huella: "x", vigente: true }], [leida({ cliente: { tipo: "ambigua", clientIds: ["c1", "c2"] } })]);
    expect(p.bajas).toEqual([{ tipo: "correo", hubspotId: "h1" }]);
    expect(p.ambiguas).toHaveLength(1);
    expect(p.crear).toHaveLength(0);
  });

  it("de nadie, se cuenta", () => {
    expect(planDeCopia([], [leida({ cliente: { tipo: "ninguno" } })]).deNadie).toBe(1);
  });
});

describe("¿la IA lee sus compromisos? (el filtro va antes, sin gastar)", () => {
  const base = { tipo: "correo" as const, ...datos() };

  it("un correo enviado reciente con una fecha → lee", () => {
    expect(motivoDeLaLectura(base, ahora)).toBe("lee");
  });

  it("recibido, nota o llamada → no", () => {
    expect(motivoDeLaLectura({ ...base, direccion: "recibido" }, ahora)).toBe("no_es_enviado");
    expect(motivoDeLaLectura({ ...base, tipo: "nota" }, ahora)).toBe("no_es_correo");
  });

  it("de más de 14 días → no", () => {
    expect(motivoDeLaLectura({ ...base, ocurrioAt: new Date("2026-09-30T15:00:00.000Z") }, ahora)).toBe("vieja");
  });

  it("sin fecha ni compromiso → no", () => {
    expect(motivoDeLaLectura({ ...base, asunto: "Gracias", texto: "Muchas gracias por la atención de hoy, saludos cordiales a todo el equipo." }, ahora)).toBe("sin_fecha_ni_compromiso");
  });

  it("muy corto → no", () => {
    expect(motivoDeLaLectura({ ...base, texto: "Ok, gracias." }, ahora)).toBe("sin_texto");
  });

  it("una minuta con próximos pasos, sin día de la semana → lee", () => {
    expect(motivoDeLaLectura({ ...base, asunto: "Resumen", texto: "Comparto los próximos pasos acordados: enviar la base de contactos y revisar el pipeline." }, ahora)).toBe("lee");
  });
});

describe("las banderas", () => {
  it("prendidas por defecto, se apagan con 0", () => {
    expect(copiaPrendida({})).toBe(true);
    expect(copiaPrendida({ COMUNICACIONES_HUBSPOT_ENABLED: "0" })).toBe(false);
    expect(compromisosPrendidos({})).toBe(true);
    expect(compromisosPrendidos({ COMPROMISOS_DE_CORREOS_ENABLED: "0" })).toBe(false);
  });
});
