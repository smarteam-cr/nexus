/**
 * lib/clients/datos-de-la-empresa.int.test.ts — los datos de la empresa contra una base REAL (R1 y R7b, 2026-10-24).
 *
 * Usar, editar y descartar una propuesta; lo que una persona corrigió no lo pisa la IA; la industria deriva la edición
 * de la escala; el TAM v1 se recalcula solo; y una empresa de HubSpot es de una sola ficha. Correr con la base local:
 * `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { decidirPropuesta, ErrorDeDato, leerDatosDeLaEmpresa, proponerDato } from "./datos-de-la-empresa-server";
import { asignarEmpresaDeHubspot, crearOReusarFicha } from "./empresa-de-hubspot";
import { proponerLoEncontrado } from "./investigacion/servidor";

async function persona(nombre: string) {
  return prisma.teamMember.create({ data: { name: nombre, email: `${nombre.toLowerCase().replace(/\s+/g, ".")}@test.local` } });
}

const propuestasDe = (clientId: string) => prisma.propuestaDeDato.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });

describe("proponer y decidir un dato", () => {
  it("la investigación propone; una persona la usa, y queda la historia con el valor anterior", async () => {
    const c = await prisma.client.create({ data: { name: "Empresa (test)" } });
    const andrea = await persona("Andrea Mora");

    const r = await proponerDato({ clientId: c.id, clave: "perfilCierre", valor: "transaccional", fuente: "investigacion", cita: "«casi todo se compra en línea»" });
    expect(r[0].veredicto.accion).toBe("proponer");
    const antes = await leerDatosDeLaEmpresa(c.id);
    expect(antes!.porRevisar).toBe(1);
    expect(antes!.datos.find((d) => d.clave === "perfilCierre")?.valor).toBeNull();

    await decidirPropuesta({ clientId: c.id, propuestaId: r[0].propuestaId!, decision: { accion: "usar" }, decidePorId: andrea.id });
    const fila = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { perfilCierre: true, perfilCierreFuente: true, perfilCierreAt: true } });
    // Usarla es una decisión de Andrea: queda como suya, y de dónde salió la idea queda en la fila.
    expect(fila).toMatchObject({ perfilCierre: "transaccional", perfilCierreFuente: "persona" });
    expect(fila.perfilCierreAt).toBeInstanceOf(Date);

    const p = (await propuestasDe(c.id))[0];
    expect(p).toMatchObject({ estado: "usada", decididaPorId: andrea.id, valorAnterior: { __vacio: true }, valorDecidido: "transaccional" });
    const despues = await leerDatosDeLaEmpresa(c.id);
    expect(despues!.porRevisar).toBe(0);
    expect(despues!.datos.find((d) => d.clave === "perfilCierre")?.decidio).toEqual({ nombre: "Andrea Mora", estado: "usada", origen: "investigacion" });

    // Dos veces no: la segunda dice que ya la decidió alguien.
    await expect(decidirPropuesta({ clientId: c.id, propuestaId: p.id, decision: { accion: "descartar" }, decidePorId: andrea.id })).rejects.toMatchObject({ status: 409 });
  });

  it("editar deja el valor de la persona con fuente persona; descartar no cambia nada", async () => {
    const c = await prisma.client.create({ data: { name: "Empresa 2 (test)" } });
    const luis = await persona("Luis Vega");
    const a = await proponerDato({ clientId: c.id, clave: "segmento", valor: "corporativo", fuente: "investigacion" });
    await decidirPropuesta({ clientId: c.id, propuestaId: a[0].propuestaId!, decision: { accion: "editar", valor: "gobierno" }, decidePorId: luis.id });
    expect(await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { segmento: true, segmentoFuente: true } })).toEqual({ segmento: "gobierno", segmentoFuente: "persona" });

    const b = await proponerDato({ clientId: c.id, clave: "segmento", valor: "estandar", fuente: "reunion" });
    expect(b[0].veredicto.accion).toBe("proponer");
    await decidirPropuesta({ clientId: c.id, propuestaId: b[0].propuestaId!, decision: { accion: "descartar" }, decidePorId: luis.id });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { segmento: true } })).segmento).toBe("gobierno");
    expect((await propuestasDe(c.id)).map((p) => p.estado)).toEqual(["editada", "descartada"]);
  });

  it("un valor que no es una opción no se guarda", async () => {
    const c = await prisma.client.create({ data: { name: "Empresa 3 (test)" } });
    await expect(proponerDato({ clientId: c.id, clave: "trafico", valor: "muchísimo", fuente: "persona", puedeDecidir: true })).rejects.toBeInstanceOf(ErrorDeDato);
  });

  it("lo que una persona corrigió no lo pisa HubSpot ni la IA: lo proponen", async () => {
    const c = await prisma.client.create({ data: { name: "Empresa 4 (test)" } });
    const yo = await persona("Ana Rojas");
    await proponerDato({ clientId: c.id, clave: "empleados", valor: 310, fuente: "persona", autorId: yo.id, puedeDecidir: true });
    const r = await proponerDato({ clientId: c.id, clave: "empleados", valor: 240, fuente: "hubspot" });
    expect(r[0].veredicto.accion).toBe("proponer");
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { empleados: true } })).empleados).toBe(310);
  });

  it("quien no puede decidir propone, y su propuesta nueva reemplaza la anterior", async () => {
    const c = await prisma.client.create({ data: { name: "Empresa 5 (test)" } });
    const mk = await persona("Marta Marketing");
    await proponerDato({ clientId: c.id, clave: "trafico", valor: "50k_200k", fuente: "persona", autorId: mk.id, puedeDecidir: false });
    await proponerDato({ clientId: c.id, clave: "trafico", valor: "200k_1m", fuente: "persona", autorId: mk.id, puedeDecidir: false });
    expect((await propuestasDe(c.id)).map((p) => [p.estado, p.valor])).toEqual([
      ["reemplazada", "50k_200k"],
      ["pendiente", "200k_1m"],
    ]);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { trafico: true } })).trafico).toBeNull();
  });

  it("la industria de Smarteam deriva la edición de la escala; otra industria vuelve a la general", async () => {
    const c = await prisma.client.create({ data: { name: "Hotel (test)" } });
    await proponerDato({ clientId: c.id, clave: "industriaSmarteam", valor: "Turismo", fuente: "persona", puedeDecidir: true });
    expect(await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { edicionEscala: true, edicionEscalaFuente: true } })).toEqual({ edicionEscala: "turismo", edicionEscalaFuente: "nexus" });
    await proponerDato({ clientId: c.id, clave: "industriaSmarteam", valor: "Software", fuente: "persona", puedeDecidir: true });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { edicionEscala: true } })).edicionEscala).toBeNull();
  });

  it("con empleados, Nexus calcula el TAM v1 y guarda cómo; si una persona lo corrige, el recálculo solo propone", async () => {
    const c = await prisma.client.create({ data: { name: "Tienda (test)" } });
    await proponerDato({ clientId: c.id, clave: "empleados", valor: 310, fuente: "hubspot" });
    const fila = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { tamUsd: true, tamFuente: true, tamCalculo: true } });
    expect(Number(fila.tamUsd)).toBeGreaterThan(0);
    expect(fila.tamFuente).toBe("nexus");
    expect(fila.tamCalculo).toMatchObject({ version: "v1", edicion: "professional" });

    const yo = await persona("Pedro Ventas");
    await proponerDato({ clientId: c.id, clave: "tamUsd", valor: 50_000, fuente: "persona", autorId: yo.id, puedeDecidir: true });
    await proponerDato({ clientId: c.id, clave: "estructura", valor: "casa_matriz", fuente: "persona", autorId: yo.id, puedeDecidir: true });
    const despues = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { tamUsd: true, tamFuente: true, tamCalculo: true } });
    expect(Number(despues.tamUsd)).toBe(50_000);
    expect(despues.tamFuente).toBe("persona");
    expect(despues.tamCalculo).toBeNull();
    const pendientes = await prisma.propuestaDeDato.findMany({ where: { clientId: c.id, campo: "tamUsd", estado: "pendiente" } });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].fuente).toBe("nexus");

    // Usar lo que propone Nexus le devuelve el TAM, con su cálculo.
    await decidirPropuesta({ clientId: c.id, propuestaId: pendientes[0].id, decision: { accion: "usar" }, decidePorId: yo.id });
    const usado = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { tamFuente: true, tamCalculo: true } });
    expect(usado.tamFuente).toBe("nexus");
    expect(usado.tamCalculo).toMatchObject({ version: "v1" });
  });
});

describe("lo que decidió una persona no lo pisa nadie", () => {
  it("usar la propuesta de la investigación protege el dato: HubSpot después solo propone", async () => {
    const c = await prisma.client.create({ data: { name: "Protegida (test)" } });
    const andrea = await persona("Andrea Protege");
    await proponerDato({ clientId: c.id, clave: "empleados", valor: 240, fuente: "hubspot" });
    const r = await proponerDato({ clientId: c.id, clave: "empleados", valor: 310, fuente: "investigacion", cita: "LinkedIn" });
    expect(r[0].veredicto.accion).toBe("proponer");
    await decidirPropuesta({ clientId: c.id, propuestaId: r[0].propuestaId!, decision: { accion: "usar" }, decidePorId: andrea.id });
    const otraVez = await proponerDato({ clientId: c.id, clave: "empleados", valor: 240, fuente: "hubspot" });
    expect(otraVez[0].veredicto.accion).toBe("proponer");
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { empleados: true, empleadosFuente: true } }))).toEqual({ empleados: 310, empleadosFuente: "persona" });
  });

  it("cuando una persona aplica un valor, las propuestas que esperaban sobre ese dato se cierran", async () => {
    const c = await prisma.client.create({ data: { name: "Cierra pendientes (test)" } });
    const yo = await persona("Lucía Decide");
    await proponerDato({ clientId: c.id, clave: "segmento", valor: "corporativo", fuente: "investigacion" });
    await proponerDato({ clientId: c.id, clave: "segmento", valor: "gobierno", fuente: "reunion" });
    expect(await prisma.propuestaDeDato.count({ where: { clientId: c.id, campo: "segmento", estado: "pendiente" } })).toBe(2);
    await proponerDato({ clientId: c.id, clave: "segmento", valor: "estandar", fuente: "persona", autorId: yo.id, puedeDecidir: true });
    expect(await prisma.propuestaDeDato.count({ where: { clientId: c.id, campo: "segmento", estado: "pendiente" } })).toBe(0);
    expect(await prisma.propuestaDeDato.count({ where: { clientId: c.id, campo: "segmento", estado: "reemplazada" } })).toBe(2);
  });

  it("la edición que eligió el vendedor en la preventa no la borra la industria: Nexus la propone", async () => {
    const c = await prisma.client.create({ data: { name: "Banco (test)" } });
    await proponerDato({ clientId: c.id, clave: "edicionEscala", valor: "banca", fuente: "preventa" });
    await proponerDato({ clientId: c.id, clave: "industriaSmarteam", valor: "Servicios", fuente: "persona", puedeDecidir: true });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { edicionEscala: true } })).edicionEscala).toBe("banca");
  });
});

describe("lo que encontró la investigación", () => {
  it("llena lo vacío que manda HubSpot, propone lo de persona, y el tamaño estimado cuenta como empleados", async () => {
    const c = await prisma.client.create({ data: { name: "Investigada (test)" } });
    const n = await proponerLoEncontrado(c.id, {
      datos: [
        { clave: "pais", valor: "Costa Rica", cita: "San José", url: "https://a.com" },
        { clave: "perfilCierre", valor: "transaccional", cita: "tienda en línea", url: "https://a.com" },
        { clave: "industriaSmarteam", valor: "no es una industria", cita: "x", url: "https://a.com" },
      ],
      tamanoEstimado: { empleados: 310, rango: "201-500", cita: "201-500 empleados", url: "https://linkedin.com/x" },
    });
    expect(n).toBe(3);
    const fila = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { pais: true, paisFuente: true, perfilCierre: true, empleados: true, empleadosFuente: true } });
    expect(fila).toEqual({ pais: "Costa Rica", paisFuente: "investigacion", perfilCierre: null, empleados: 310, empleadosFuente: "investigacion" });
    const pendiente = await prisma.propuestaDeDato.findFirst({ where: { clientId: c.id, campo: "perfilCierre", estado: "pendiente" } });
    expect(pendiente).toMatchObject({ fuente: "investigacion", cita: "tienda en línea", enlace: "https://a.com" });
  });
});

describe("los valores de antes (sin fuente)", () => {
  it("un TAM viejo que alguien escribió a mano no lo pisa el cálculo de Nexus: lo propone", async () => {
    const c = await prisma.client.create({ data: { name: "Con TAM viejo (test)", tamUsd: 36_000 } });
    const r = await proponerDato({ clientId: c.id, clave: "empleados", valor: 310, fuente: "hubspot" });
    expect(r.find((x) => x.clave === "tamUsd")?.veredicto.accion).toBe("proponer");
    expect(Number((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { tamUsd: true } })).tamUsd)).toBe(36_000);
  });
});

describe("una empresa de HubSpot es de una sola ficha (R7b)", () => {
  it("el índice no deja dos fichas con el mismo id, y NULL no choca", async () => {
    await prisma.client.create({ data: { name: "A (test)", hubspotCompanyId: "111" } });
    await expect(prisma.client.create({ data: { name: "B (test)", hubspotCompanyId: "111" } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.client.createMany({ data: [{ name: "Sin empresa 1 (test)" }, { name: "Sin empresa 2 (test)" }] });
  });

  it("asignar una empresa que ya es de otra ficha no escribe y dice cuál es", async () => {
    const a = await prisma.client.create({ data: { name: "Areyá (test)", hubspotCompanyId: "222" } });
    const b = await prisma.client.create({ data: { name: "Areyas (test)" } });
    expect(await asignarEmpresaDeHubspot(b.id, "222")).toEqual({ ok: false, ficha: { id: a.id, name: "Areyá (test)", kind: "CLIENTE" } });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: b.id } })).hubspotCompanyId).toBeNull();
    expect(await asignarEmpresaDeHubspot(a.id, "222")).toEqual({ ok: true });
  });

  it("dos altas a la vez de la misma empresa dejan una sola ficha", async () => {
    const crear = () => prisma.client.create({ data: { name: "Carrera (test)", hubspotCompanyId: "333" }, select: { id: true } });
    const [x, y] = await Promise.all([crearOReusarFicha("333", crear), crearOReusarFicha("333", crear)]);
    expect(x.clientId).toBe(y.clientId);
    expect([x.creado, y.creado].filter(Boolean)).toHaveLength(1);
    expect(await prisma.client.count({ where: { hubspotCompanyId: "333" } })).toBe(1);
  });
});
