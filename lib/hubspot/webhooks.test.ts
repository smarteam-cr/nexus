/**
 * lib/hubspot/webhooks.test.ts — la firma de los avisos de HubSpot, su lectura y qué dispara cada uno (U10).
 */
import { describe, expect, it } from "vitest";
import { eventosDelAviso, firmaV3, uriFirmada, verificarFirma } from "./webhooks";
import { avisoListo, planDeEventos, sePuedeAdelantar, type EventoPendiente } from "./eventos";

const SECRETO = "secreto-de-prueba";
const AHORA = Date.parse("2026-10-25T12:00:00Z");
const URI = "https://nexus.smarteamcr.com/api/hubspot/webhooks";
const firmado = (cuerpo: string, ts = String(AHORA)) => ({
  secreto: SECRETO,
  metodo: "POST",
  uri: URI,
  cuerpo,
  timestamp: ts,
  firma: firmaV3({ secreto: SECRETO, metodo: "POST", uri: URI, cuerpo, timestamp: ts }),
  ahora: AHORA,
});

describe("la firma v3", () => {
  it("⭐ coincide con un vector calculado por fuera (openssl), no consigo misma", () => {
    /* printf '%s' 'POST<uri><cuerpo><timestamp>' | openssl dgst -sha256 -hmac 'secreto-de-prueba' -binary | base64
       Es la receta de HubSpot para la v3: método + URI + cuerpo + timestamp, HMAC-SHA256 con el secreto de la app, en
       base64. Si alguien cambia el orden o la codificación, esto se pone en rojo antes de rechazar todos los avisos. */
    const cuerpo = '[{"eventId":1,"subscriptionId":9,"objectId":123,"subscriptionType":"company.propertyChange"}]';
    expect(firmaV3({ secreto: SECRETO, metodo: "POST", uri: URI, cuerpo, timestamp: "1761400000000" })).toBe("YPv9P5lHE5Kr0SB7dfEK6x/8B7AvriANto3uy53T/Uo=");
  });
  it("acepta el aviso firmado con el secreto de la app", () => {
    expect(verificarFirma(firmado("[]"))).toBe("valida");
  });
  it("⭐ rechaza un cuerpo cambiado, otro secreto, sin firma o sin secreto", () => {
    expect(verificarFirma({ ...firmado("[]"), cuerpo: '[{"objectId":1}]' })).toBe("invalida");
    expect(verificarFirma({ ...firmado("[]"), secreto: "otro" })).toBe("invalida");
    expect(verificarFirma({ ...firmado("[]"), firma: null })).toBe("sin_firma");
    expect(verificarFirma({ ...firmado("[]"), secreto: "" })).toBe("sin_secreto");
  });
  it("⭐ rechaza un aviso de hace más de 5 minutos (no se puede reenviar uno capturado)", () => {
    const ts = String(AHORA - 6 * 60_000);
    expect(verificarFirma(firmado("[]", ts))).toBe("vieja");
  });
  it("la URI es la pública (APP_URL), con los caracteres que HubSpot decodifica", () => {
    expect(uriFirmada("https://nexus.smarteamcr.com/", "/api/hubspot/webhooks")).toBe(URI);
    expect(uriFirmada("https://nexus.smarteamcr.com", "/api/hubspot/webhooks?a=1%3A2")).toBe(`${URI}?a=1:2`);
  });
});

describe("eventosDelAviso", () => {
  it("lee cambios, borrados y fusiones; descarta lo que no entiende", () => {
    const eventos = eventosDelAviso([
      { eventId: 11, subscriptionId: 7, portalId: 6553628, occurredAt: AHORA, subscriptionType: "company.propertyChange", objectId: 123, propertyName: "name", propertyValue: "Acme" },
      { eventId: 12, subscriptionId: 8, occurredAt: AHORA, subscriptionType: "contact.merge", objectId: 50, primaryObjectId: 50, newObjectId: 60, mergedObjectIds: [40, 60] },
      { eventId: 13, subscriptionType: "product.creation", objectId: 9 },
      { eventId: 14, subscriptionId: 8, occurredAt: AHORA, subscriptionType: "contact.associationChange", fromObjectId: 70, toObjectId: 100, associationType: "CONTACT_TO_COMPANY" },
      { eventId: 15, subscriptionId: 8, occurredAt: AHORA, subscriptionType: "company.merge", objectId: 5, primaryObjectId: 5, newObjectId: 9, mergedObjectIds: [3] },
      { subscriptionType: "deal.deletion", objectId: 3 },
    ]);
    expect(eventos).toHaveLength(4);
    expect(eventos[2]).toMatchObject({ objeto: "contacto", tipo: "asociacion", hubspotId: "70" });
    // El primario (5) también quedó absorbido: el que sobrevive es un registro nuevo (9).
    expect(eventos[3]).toMatchObject({ tipo: "fusion", idSobreviviente: "9" });
    expect([...eventos[3]!.idsFusionados].sort()).toEqual(["3", "5"]);
    expect(eventos[0]).toMatchObject({ clave: `7:11:123:name:${AHORA}`, portalId: "6553628", objeto: "empresa", tipo: "cambio", hubspotId: "123", propiedad: "name", valor: "Acme" });
    expect(eventos[1]).toMatchObject({ objeto: "contacto", tipo: "fusion", idSobreviviente: "60", idsFusionados: ["40", "50"] });
  });
  it("un cuerpo que no es una lista no da avisos", () => {
    expect(eventosDelAviso({ hola: 1 })).toEqual([]);
  });
});

describe("planDeEventos", () => {
  const ev = (o: Partial<EventoPendiente>): EventoPendiente => ({ id: "e", objeto: "empresa", tipo: "cambio", hubspotId: "1", idsFusionados: [], idSobreviviente: null, ...o });
  const empresas = new Map([["100", ["c1"]], ["200", ["c2"]]]);

  it("una empresa de Nexus pide sincronizar sus proyectos; una que no es de Nexus se ignora", () => {
    const p = planDeEventos([ev({ id: "a", hubspotId: "100" }), ev({ id: "b", hubspotId: "999" })], empresas);
    expect(p.clientes).toEqual(["c1"]);
    expect(p.ignorados).toEqual(["b"]);
  });
  it("contactos y tickets adelantan su copia; los negocios, la suya", () => {
    const p = planDeEventos([ev({ id: "a", objeto: "contacto" }), ev({ id: "b", objeto: "ticket" }), ev({ id: "c", objeto: "negocio" })], empresas);
    expect(p).toMatchObject({ copiarContactos: true, copiarNegocios: true, porCopia: { contactos: ["a", "b"], negocios: ["c"] } });
  });
  it("⭐ la fusión de una empresa guarda los pares Y sincroniza la ficha (sus proyectos se mudaron)", () => {
    const p = planDeEventos([ev({ id: "f", tipo: "fusion", hubspotId: "200", idSobreviviente: "200", idsFusionados: ["100"] })], empresas);
    expect(p.pares).toEqual([{ objeto: "empresa", idAbsorbido: "100", idSobreviviente: "200" }]);
    expect(p.clientes.sort()).toEqual(["c1", "c2"]);
    expect(p.clientesDelAviso.get("f")?.sort()).toEqual(["c1", "c2"]);
  });
  it("⭐ un aviso de empresa queda procesado solo si TODAS sus fichas se sincronizaron (no la que se saltó)", () => {
    expect(avisoListo(["c1", "c2"], new Set(["c1"]))).toBe(false);
    expect(avisoListo(["c1"], new Set(["c1"]))).toBe(true);
    expect(avisoListo(undefined, new Set())).toBe(true);
  });
  it("se adelanta una copia como mucho cada 20 minutos, y solo de día", () => {
    const ahora = new Date(AHORA);
    expect(sePuedeAdelantar(null, ahora, 10)).toBe(true);
    expect(sePuedeAdelantar(new Date(AHORA - 15 * 60_000), ahora, 10)).toBe(false);
    expect(sePuedeAdelantar(new Date(AHORA - 21 * 60_000), ahora, 10)).toBe(true);
    expect(sePuedeAdelantar(null, ahora, 23)).toBe(false);
    expect(sePuedeAdelantar(null, ahora, 5)).toBe(false);
  });
});
