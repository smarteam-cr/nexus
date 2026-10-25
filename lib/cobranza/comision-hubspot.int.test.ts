/**
 * lib/cobranza/comision-hubspot.int.test.ts — la comisión de HubSpot desde Partner (U25), de punta a punta contra una
 * base REAL: el job no pisa lo que escribió una persona, el script lo toma una vez, una edición a mano lo devuelve a
 * la persona, y una con factura o cobrada no se toca. Y el invariante INV50 (historial y comisión al día).
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { aplicarEstimado, cargarComisionDeHubspot, escribirEstimado, FIRMA_DEL_ESTIMADO, planDelEstimado } from "./comision-hubspot-server";
import { cambiarEstadoComisionPartner, updateComisionPartner } from "./mutations";
import { INV50 } from "@/lib/invariantes/partner";

const AHORA = new Date("2026-10-24T15:00:00Z");
const HOY = "2026-10-24";
const COPIA = new Date("2026-10-23T12:00:00Z");
const PAGO = new Date("2026-11-15T00:00:00Z");

async function sembrarCopia(opciones: { fetchedAt?: Date } = {}) {
  const fetchedAt = opciones.fetchedAt ?? COPIA;
  const filas = [
    // kölbi: 4.701,60 al mes desde antes del trimestre → 3 meses.
    { id: "p-kolbi", props: { hs_client_name: "KÖLBI ICE", hs_projected_commission: "4701.599998", hs_projected_commission_currency_code: "USD", hs_sold_relationship_start_date: "2025-09-30T00:00:00Z", hs_is_managed: "true", hs_is_sold: "true" } },
    // Club de Amantes del Vino: vendida el 30 sep → solo septiembre.
    { id: "p-vino", props: { hs_client_name: "Club de Amantes del Vino", hs_projected_commission: "537.572", hs_sold_relationship_start_date: "2026-09-30T00:00:00Z" } },
    // Sin comisión: no aporta.
    { id: "p-cero", props: { hs_client_name: "Sin comisión", hs_projected_commission: "0" } },
  ];
  for (const f of filas) {
    await prisma.clientPartnerSnapshot.create({ data: { hubspotPartnerClientId: f.id, fetchedAt, properties: f.props } });
  }
  // Un registro que HubSpot ya no devuelve: quedó con su comisión vieja y no debe sumar.
  await prisma.clientPartnerSnapshot.create({
    data: { hubspotPartnerClientId: "p-ido", fetchedAt: new Date(fetchedAt.getTime() - 10 * 86400000), properties: { hs_projected_commission: "9999" } },
  });
}

const ESPERADO = 14642.37; // 3 × 4.701,60 + 1 × 537,57

async function aliado() {
  return prisma.partnerComercial.create({ data: { nombre: "HubSpot", clave: "hubspot", frecuenciaMeses: 3 } });
}

async function anotadaAMano(partnerId: string) {
  return prisma.comisionPartner.create({
    data: {
      partner: "HubSpot",
      partnerId,
      concepto: "Comisión quincena 15-11",
      monto: 51000,
      moneda: "USD",
      fecha: PAGO,
      estado: "POR_COBRAR",
      montoEsProyeccion: true,
      registradoPor: "alex@test.local",
    },
  });
}

const leer = async (id: string) => {
  const c = await prisma.comisionPartner.findUniqueOrThrow({ where: { id } });
  return { ...c, monto: Number(c.monto) };
};

describe("la comisión de HubSpot desde Partner", () => {
  it("el job no pisa la estimada a mano; el script la toma; desde ahí la pone al día el job", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    const { id } = await anotadaAMano(partnerId);

    const job = await aplicarEstimado(prisma, HOY, AHORA);
    expect(job.escrito).toBeNull();
    expect(job.plan.decision).toMatchObject({ accion: "nada" });
    expect((await leer(id)).monto).toBe(51000);

    const script = await aplicarEstimado(prisma, HOY, AHORA, { tomarLaManual: true });
    expect(script.escrito).toEqual({ accion: "actualizada", id, antes: 51000, despues: ESPERADO });
    const tomada = await leer(id);
    expect(tomada.monto).toBe(ESPERADO);
    expect(tomada.montoDesdePartner).toBe(true);
    expect((tomada.detalleDePartner as { cuentas: unknown[] }).cuentas).toHaveLength(2);

    // El job ya la reconoce como suya.
    expect((await aplicarEstimado(prisma, HOY, AHORA)).escrito?.accion).toBe("actualizada");
  });

  it("una edición a mano del monto le devuelve la fila a la persona: el job deja de tocarla", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    const { id } = await anotadaAMano(partnerId);
    await aplicarEstimado(prisma, HOY, AHORA, { tomarLaManual: true });

    // Editar otra cosa no la suelta.
    await updateComisionPartner(id, { notas: "revisado" }, "alex@test.local");
    expect((await leer(id)).montoDesdePartner).toBe(true);

    await updateComisionPartner(id, { monto: 50000 }, "alex@test.local");
    expect((await leer(id)).montoDesdePartner).toBe(false);
    expect((await aplicarEstimado(prisma, HOY, AHORA)).escrito).toBeNull();
    expect((await leer(id)).monto).toBe(50000);
  });

  it("con la factura de HubSpot ya no se toca, ni con el script; el estimado de Partner queda como lo que decía antes", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    const { id } = await anotadaAMano(partnerId);
    await aplicarEstimado(prisma, HOY, AHORA, { tomarLaManual: true });
    await updateComisionPartner(id, { monto: 52000, montoReal: true, facturaAliado: "HS-Q3" }, "alex@test.local");
    const real = await leer(id);
    expect(Number(real.montoEstimado)).toBe(ESPERADO);
    expect((await aplicarEstimado(prisma, HOY, AHORA, { tomarLaManual: true })).escrito).toBeNull();
    expect((await leer(id)).monto).toBe(52000);
  });

  it("sin fila para el pago, la anota estimada y ligada al aliado", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    const r = await aplicarEstimado(prisma, HOY, AHORA);
    expect(r.escrito?.accion).toBe("creada");
    const c = await leer(r.escrito!.id);
    expect(c).toMatchObject({
      partner: "HubSpot",
      partnerId,
      monto: ESPERADO,
      moneda: "USD",
      estado: "POR_COBRAR",
      montoEsProyeccion: true,
      montoDesdePartner: true,
      registradoPor: FIRMA_DEL_ESTIMADO,
    });
    expect(c.fecha.toISOString().slice(0, 10)).toBe("2026-11-15");
    // Idempotente: la segunda corrida no crea otra.
    await aplicarEstimado(prisma, HOY, AHORA);
    expect(await prisma.comisionPartner.count()).toBe(1);
  });

  it("lee las columnas de la copia (el camino de producción), no solo el crudo", async () => {
    await aliado();
    // Las columnas dicen lo que cuenta; el crudo trae otra cosa a propósito.
    await prisma.clientPartnerSnapshot.create({
      data: {
        hubspotPartnerClientId: "p-col",
        fetchedAt: COPIA,
        properties: { hs_client_name: "Columnas", hs_projected_commission: "1" },
        isSold: true,
        projectedCommission: 100,
        projectedCommissionCurrency: "USD",
        soldRelationshipStartAt: new Date("2026-08-17T00:00:00Z"),
      },
    });
    const r = await aplicarEstimado(prisma, HOY, AHORA);
    expect(r.plan.estimado?.cuentas).toMatchObject([{ id: "p-col", comisionMensual: 100, meses: 2, aporte: 200 }]);
    expect(r.escrito?.despues).toBe(200);
  });

  it("una fila movida de día o con el nombre escrito distinto sigue siendo la del pago: no se crea otra", async () => {
    await aliado();
    await sembrarCopia();
    await prisma.comisionPartner.create({
      data: { partner: " Hub  Spot ", monto: 51000, moneda: "USD", fecha: new Date("2026-11-13T00:00:00Z"), estado: "POR_COBRAR", montoEsProyeccion: true, registradoPor: "alex@test.local" },
    });
    const r = await aplicarEstimado(prisma, HOY, AHORA);
    expect(r.plan.filas).toHaveLength(1);
    expect(r.escrito).toBeNull();
    expect(await prisma.comisionPartner.count()).toBe(1);
    // Otra de otro aliado en la misma fecha no cuenta como de HubSpot.
    const otro = await prisma.partnerComercial.create({ data: { nombre: "Atom Chat", clave: "atom chat", frecuenciaMeses: 3 } });
    await prisma.comisionPartner.create({
      data: { partner: "Atom Chat", partnerId: otro.id, monto: 2849.25, moneda: "USD", fecha: PAGO, estado: "POR_COBRAR", montoEsProyeccion: true, registradoPor: "alex@test.local" },
    });
    expect((await planDelEstimado(prisma, HOY, AHORA)).filas).toHaveLength(1);
  });

  it("cobrarla con otro monto y revertir el cobro: el estimado ya no la toca", async () => {
    await aliado();
    await sembrarCopia();
    const { escrito } = await aplicarEstimado(prisma, HOY, AHORA);
    const id = escrito!.id;
    await cambiarEstadoComisionPartner(id, { estado: "COBRADO", fechaCobro: "2026-11-13", monto: 50430 }, "alex@test.local");
    await cambiarEstadoComisionPartner(id, { estado: "POR_COBRAR" }, "alex@test.local");
    const c = await leer(id);
    expect(c.montoDesdePartner).toBe(false);
    expect((await aplicarEstimado(prisma, HOY, AHORA)).escrito).toBeNull();
    expect((await leer(id)).monto).toBe(50430);
  });

  it("si Partner llega en cero, no baja a cero la que ya armó", async () => {
    await aliado();
    await sembrarCopia();
    const { escrito } = await aplicarEstimado(prisma, HOY, AHORA);
    await prisma.clientPartnerSnapshot.updateMany({ data: { properties: { hs_client_name: "x" } } });
    const r = await aplicarEstimado(prisma, HOY, AHORA);
    expect(r.escrito).toBeNull();
    expect((await leer(escrito!.id)).monto).toBe(ESPERADO);
  });

  it("la guarda: si entre el plan y la escritura alguien registró la factura o cambió el monto, no se pisa", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    const { id } = await anotadaAMano(partnerId);
    const plan = await planDelEstimado(prisma, HOY, AHORA, { tomarLaManual: true });
    await updateComisionPartner(id, { monto: 53000, montoReal: true, facturaAliado: "HS-Q3" }, "alex@test.local");
    const r = await escribirEstimado(prisma, plan, AHORA);
    expect(r.escrito).toBeNull();
    expect(r.aviso).toContain("cambió");
    expect((await leer(id)).monto).toBe(53000);

    // Solo el monto, sin factura: tampoco.
    const { id: otra } = await prisma.comisionPartner.create({
      data: { partner: "HubSpot", partnerId, monto: 1, moneda: "USD", fecha: new Date("2027-02-15T00:00:00Z"), estado: "POR_COBRAR", montoEsProyeccion: true, montoDesdePartner: true, registradoPor: FIRMA_DEL_ESTIMADO },
    });
    await prisma.clientPartnerSnapshot.updateMany({ data: { fetchedAt: new Date("2026-11-16T12:00:00Z") } });
    const planFeb = await planDelEstimado(prisma, "2026-11-16", new Date("2026-11-16T15:00:00Z"));
    expect(planFeb.decision).toEqual({ accion: "actualizar", tomaLaManual: false });
    await prisma.comisionPartner.update({ where: { id: otra }, data: { monto: 2 } });
    expect((await escribirEstimado(prisma, planFeb, new Date("2026-11-16T15:00:00Z"))).escrito).toBeNull();
  });

  it("con la copia vieja no escribe nada, y la pantalla lo dice", async () => {
    await aliado();
    await sembrarCopia({ fetchedAt: new Date("2026-10-10T12:00:00Z") });
    expect((await aplicarEstimado(prisma, HOY, AHORA)).escrito).toBeNull();
    const dto = await cargarComisionDeHubspot(prisma, HOY, AHORA);
    expect(dto.estimado).toBeNull();
    expect(dto.copiaFresca).toBe(false);
  });

  it("la pantalla: el estimado por cuenta y la comprobación contra el último pago", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    await prisma.comisionPartner.create({
      data: { partner: "HubSpot", partnerId, monto: 15000, moneda: "USD", fecha: new Date("2026-08-15T00:00:00Z"), estado: "COBRADO", fechaCobro: new Date("2026-08-13T00:00:00Z"), confirmadoPor: "alex@test.local", montoEsProyeccion: false, registradoPor: "alex@test.local" },
    });
    const dto = await cargarComisionDeHubspot(prisma, HOY, AHORA);
    expect(dto.pago).toEqual({ fecha: "2026-11-15", trimestre: "jul–sep 2026" });
    expect(dto.estimado?.total).toBe(ESPERADO);
    expect(dto.estimado?.cuentas.map((c) => c.nombre)).toEqual(["KÖLBI ICE", "Club de Amantes del Vino"]);
    // ago paga abr–jun: solo kölbi existía → 3 × 4.701,60 = 14.104,80 contra 15.000.
    expect(dto.comprobacion).toMatchObject({ fecha: "2026-08-15", estimadoConLasDeHoy: 14104.8, cobrado: 15000, diferenciaPct: -6 });
    expect(dto.queHace).toContain("el job la anota estimada");
  });
});

describe("INV50", () => {
  async function semanas(claves: string[], filasPorSemana = 3) {
    for (const weekKey of claves) {
      for (let i = 0; i < filasPorSemana; i++) {
        await prisma.partnerUsageSnapshot.create({ data: { hubspotPartnerClientId: `p-${i}`, weekKey } });
      }
    }
  }

  it("sin copia de Partner cumple", async () => {
    expect((await INV50.correr(prisma, AHORA)).ok).toBe(true);
  });

  it("con el historial completo y la comisión anotada por Partner, cumple", async () => {
    await aliado();
    await sembrarCopia();
    await semanas(["2026-W41", "2026-W42"]);
    await aplicarEstimado(prisma, HOY, AHORA);
    const r = await INV50.correr(prisma, AHORA);
    expect(r.lineas.join("\n")).toContain("la arma Partner");
    expect(r.ok).toBe(true);
  });

  it("una semana sin copia la nombra", async () => {
    await aliado();
    await sembrarCopia();
    await semanas(["2026-W41"]);
    await aplicarEstimado(prisma, HOY, AHORA);
    const r = await INV50.correr(prisma, AHORA);
    expect(r.ok).toBe(false);
    expect(r.lineas.join("\n")).toContain("2026-W42");
  });

  it("a menos de 45 días del pago, sin la comisión anotada, viola; con la de una persona cumple", async () => {
    const { id: partnerId } = await aliado();
    await sembrarCopia();
    await semanas(["2026-W41", "2026-W42"]);
    const sin = await INV50.correr(prisma, AHORA);
    expect(sin.ok).toBe(false);
    expect(sin.lineas.join("\n")).toContain("no está anotada");
    await anotadaAMano(partnerId);
    expect((await INV50.correr(prisma, AHORA)).ok).toBe(true);
  });

  it("la que arma Partner y no se puso al día en una semana, viola", async () => {
    await aliado();
    await sembrarCopia();
    await semanas(["2026-W41", "2026-W42", "2026-W43"]);
    await aplicarEstimado(prisma, HOY, new Date("2026-10-23T13:00:00Z"));
    expect((await INV50.correr(prisma, AHORA)).ok).toBe(true);
    const r = await INV50.correr(prisma, new Date("2026-10-26T15:00:00Z"));
    // El lunes 26 la copia del viernes sigue fresca y el cálculo del jueves también: cumple.
    expect(r.ok).toBe(true);
    // El viernes 30 la copia es del jueves, pero el estimado sigue siendo del jueves anterior.
    await prisma.clientPartnerSnapshot.updateMany({ data: { fetchedAt: new Date("2026-10-29T12:00:00Z") } });
    const vieja = await INV50.correr(prisma, new Date("2026-10-30T15:00:00Z"));
    expect(vieja.ok).toBe(false);
    expect(vieja.lineas.join("\n")).toContain("no se puso al día");
  });
});
