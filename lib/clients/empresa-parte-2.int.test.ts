/**
 * lib/clients/empresa-parte-2.int.test.ts — la empresa, parte 2, contra una base REAL (2026-10-25): lo que falta se
 * pregunta y la respuesta deja el dato (R2 etapa 3); los documentos de la empresa sin proyecto (R3); una persona del
 * cliente desde sus fuentes (R6); el perfil de la empresa que usa Nexus (R13); e INV51. HubSpot no se llama: la bandera
 * de la escritura está apagada en los tests. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { preguntaPendiente, registrarEvento } from "@/lib/encuestas-de-cuenta/servidor";
import { proponerDato } from "./datos-de-la-empresa-server";
import { escribirEnHubspot } from "./escritura-en-hubspot-server";
import { documentoDeLaEmpresa, documentosDeLaEmpresa } from "./documentos-de-la-empresa-server";
import { copiarPersonasDeLaEmpresa, decidirRol, personasDeLaEmpresa } from "./personas-de-la-empresa-server";
import { contextoDeSmarteam, empresaQueUsaNexus } from "@/lib/smarteam/contexto";
import { guardarPerfil, guardarPosicionamiento } from "@/lib/smarteam/perfil-server";
import { PosicionamientoEdicionSchema } from "@/lib/smarteam/posicionamiento-esquema";
import { INV51 } from "@/lib/invariantes/empresa";

async function persona(nombre: string, email?: string) {
  return prisma.teamMember.create({ data: { name: nombre, email: email ?? `${nombre.toLowerCase().replace(/\s+/g, ".")}@test.local` } });
}

describe("lo que falta lo pregunta (R2 etapa 3)", () => {
  it("pregunta lo primero que falta con lo que propone Nexus; la respuesta usa esa propuesta y no se vuelve a preguntar", async () => {
    const c = await prisma.client.create({ data: { name: "Prospecto (test)", kind: "PROSPECTO" } });
    const ana = await persona("Ana Rojas");
    await proponerDato({ clientId: c.id, clave: "industriaSmarteam", valor: "Turismo", fuente: "investigacion", cita: "Opera hoteles en Guanacaste" });

    const q = await preguntaPendiente({ clientId: c.id, email: ana.email, rol: "VENTAS", puedeDecidirDatos: true });
    expect(q).toMatchObject({ clave: "dato:industriaSmarteam", tipo: "dato", pregunta: "¿En qué industria está Prospecto (test)?" });
    expect(q!.propuesta).toMatchObject({ valor: "Turismo", deDonde: "Investigación", cita: "Opera hoteles en Guanacaste" });

    // Sin poder decidir los datos, ni se pregunta.
    expect(await preguntaPendiente({ clientId: c.id, email: ana.email, rol: "VENTAS", puedeDecidirDatos: false })).toBeNull();

    const r = await registrarEvento({ clientId: c.id, email: ana.email, rol: "VENTAS", motivoDeAcceso: "view-all", clave: q!.clave, evento: "respondida", valor: "Turismo", teamMemberId: ana.id, puedeDecidirDatos: true });
    expect(r.guardado).toBe(true);
    expect(r.hubspot).toEqual({ estado: "apagada" });
    const fila = await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { industriaSmarteam: true, industriaSmarteamFuente: true, edicionEscala: true } });
    expect(fila).toEqual({ industriaSmarteam: "Turismo", industriaSmarteamFuente: "persona", edicionEscala: "turismo" });
    expect((await prisma.propuestaDeDato.findFirstOrThrow({ where: { clientId: c.id, campo: "industriaSmarteam", fuente: "investigacion" } })).estado).toBe("usada");

    // La siguiente es otra: la industria ya está confirmada.
    expect((await preguntaPendiente({ clientId: c.id, email: ana.email, rol: "VENTAS", puedeDecidirDatos: true }))?.clave).toBe("dato:aQuienVende");
  });

  it("«No sé» no deja dato; «Ahora no» calla las de datos por unos días; una respuesta que no es una opción no pasa", async () => {
    const c = await prisma.client.create({ data: { name: "Cliente (test)", kind: "CLIENTE" } });
    const luis = await persona("Luis Solano");
    const base = { clientId: c.id, email: luis.email, rol: "CSE", motivoDeAcceso: "hubspot-owner", teamMemberId: luis.id, puedeDecidirDatos: true };
    // La de Sí o No de Customer Success va primero en un cliente de la cartera.
    expect((await preguntaPendiente({ ...base, puedeDecidirDatos: true }))?.clave).toBe("apertura-asesoria");
    await registrarEvento({ ...base, clave: "apertura-asesoria", evento: "respondida", valor: "si" });

    expect((await preguntaPendiente(base))?.clave).toBe("dato:industriaSmarteam");
    await registrarEvento({ ...base, clave: "dato:industriaSmarteam", evento: "respondida", valor: "no_se" });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id }, select: { industriaSmarteam: true } })).industriaSmarteam).toBeNull();
    await expect(registrarEvento({ ...base, clave: "dato:trafico", evento: "respondida", valor: "muchisimo" })).rejects.toMatchObject({ status: 400 });

    await registrarEvento({ ...base, clave: "dato:aQuienVende", evento: "ahora_no" });
    expect(await preguntaPendiente(base)).toBeNull();
  });
});

describe("la escritura en HubSpot con la bandera apagada", () => {
  it("no hace nada y lo dice", async () => {
    const c = await prisma.client.create({ data: { name: "Con HubSpot (test)", hubspotCompanyId: "hs-test-1" } });
    const r = await proponerDato({ clientId: c.id, clave: "trafico", valor: "10k_50k", fuente: "persona", puedeDecidir: true });
    expect(await escribirEnHubspot(c.id, r)).toEqual({ estado: "apagada" });
    expect((await prisma.propuestaDeDato.findFirstOrThrow({ where: { clientId: c.id } })).hubspotEscritaAt).toBeNull();
  });
});

describe("los documentos de la empresa (R3)", () => {
  it("un documento de la empresa sin proyecto: uno por pieza, y la lista junta los tres caminos", async () => {
    const c = await prisma.client.create({ data: { name: "Doc (test)", kind: "PROSPECTO" } });
    const otro = await prisma.client.create({ data: { name: "Otro (test)" } });
    const a = await documentoDeLaEmpresa(c.id, "diagnosis", "Diagnóstico");
    const b = await documentoDeLaEmpresa(c.id, "diagnosis", "Diagnóstico");
    expect(a.creado).toBe(true);
    expect(b).toEqual({ id: a.id, creado: false });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "Proyecto (test)" } });
    await prisma.projectCanvas.create({ data: { projectId: p.id, slug: "kickoff", name: "Kickoff" } });
    await documentoDeLaEmpresa(otro.id, "diagnosis", "Diagnóstico");

    const docs = await documentosDeLaEmpresa(c.id);
    expect(docs.map((d) => [d.slug, d.via]).sort()).toEqual([
      ["diagnosis", "empresa"],
      ["kickoff", "proyecto"],
    ]);
  });

  it("la base no deja un documento de la empresa con proyecto (dos dueños)", async () => {
    const c = await prisma.client.create({ data: { name: "Dos dueños (test)" } });
    const p = await prisma.project.create({ data: { clientId: c.id, name: "P (test)" } });
    await expect(prisma.projectCanvas.create({ data: { clientId: c.id, projectId: p.id, name: "X" } })).rejects.toThrow();
  });
});

describe("una persona del cliente (R6)", () => {
  it("une el contacto y sus reuniones, deja fuera al equipo, y el rol lo pone una persona y la copia no lo pisa", async () => {
    await persona("Eli Equipo", "eli@smarteamcr.com");
    const c = await prisma.client.create({ data: { name: "Acme (test)", emailDomains: ["acme.com"] } });
    await prisma.contactoDeHubspot.create({ data: { clientId: c.id, hubspotId: "1", nombre: "Ana Mora", email: "ana@acme.com", cargo: "Gerente" } });
    await prisma.firefliesSession.create({
      data: { id: "s-acme-1", title: "Acme + Smarteam", date: new Date("2026-10-01T15:00:00Z"), participants: ["ana@acme.com", "luis@acme.com", "eli@smarteamcr.com"], resolvedClientId: c.id },
    });

    const sim = await copiarPersonasDeLaEmpresa(c.id, { apply: false });
    expect(sim.creadas).toBe(2);
    expect(await prisma.personaDeLaEmpresa.count({ where: { clientId: c.id } })).toBe(0);

    await copiarPersonasDeLaEmpresa(c.id, { apply: true });
    const personas = await personasDeLaEmpresa(c.id);
    expect(personas.map((p) => p.correo).sort()).toEqual(["ana@acme.com", "luis@acme.com"]);
    const ana = personas.find((p) => p.correo === "ana@acme.com")!;
    expect(ana).toMatchObject({ nombre: "Ana Mora", cargo: "Gerente", reuniones: 1, origenes: ["hubspot", "reunion"] });

    await decidirRol({ clientId: c.id, personaId: ana.id, rol: "decide" });
    const otraVez = await copiarPersonasDeLaEmpresa(c.id, { apply: true });
    expect(otraVez.creadas).toBe(0);
    expect((await prisma.personaDeLaEmpresa.findUniqueOrThrow({ where: { id: ana.id } })).rol).toBe("decide");
    await expect(decidirRol({ clientId: "otra", personaId: ana.id, rol: "usa" })).rejects.toThrow();

    expect((await INV51.correr(prisma, new Date())).ok).toBe(true);
  });
});

describe("el perfil de la empresa que usa Nexus (R13)", () => {
  it("la única empresa nuestra es la que usa Nexus; su perfil se guarda y el lector junta lo de antes sin empresa", async () => {
    const s = await prisma.client.create({ data: { name: "Smarteam (test)", kind: "INTERNO" } });
    const ref = await prisma.client.create({ data: { name: "Wherex (test)", kind: "CLIENTE" } });
    const prospecto = await prisma.client.create({ data: { name: "Prospecto (test)", kind: "PROSPECTO" } });
    await prisma.icpItem.create({ data: { section: "SIGNAL_FUERTE", label: "Paga HubSpot y no lo usa" } });
    await prisma.buyerPersona.create({ data: { name: "Gerente comercial", description: "Decide la compra." } });
    expect(await empresaQueUsaNexus()).toEqual({ id: s.id, nombre: "Smarteam (test)" });

    const perfil = { propuestaDeValor: "Que HubSpot rinda.", tono: null, servicios: [{ nombre: "SmartLoop", descripcion: null, tarifa: "US$ 1.800 al mes" }], clientesDeReferencia: [{ clientId: ref.id, industria: "Software", porque: null }] };
    await guardarPerfil(s.id, perfil, "elias@test.local");
    await expect(guardarPerfil(ref.id, perfil, "elias@test.local")).rejects.toMatchObject({ status: 409 });
    await expect(guardarPerfil(s.id, { ...perfil, clientesDeReferencia: [{ clientId: prospecto.id, industria: "Software", porque: null }] }, "e@test.local")).rejects.toMatchObject({ status: 400 });

    const ctx = await contextoDeSmarteam();
    expect(ctx!.perfil.propuestaDeValor).toBe("Que HubSpot rinda.");
    expect(ctx!.perfil.clientesDeReferencia).toEqual([{ clientId: ref.id, nombre: "Wherex (test)", industria: "Software", porque: null }]);
    expect(ctx!.clienteIdeal).toEqual([{ seccion: "SIGNAL_FUERTE", etiqueta: "Señales fuertes", items: ["Paga HubSpot y no lo usa"] }]);
    expect(ctx!.buyerPersonas.map((b) => b.nombre)).toEqual(["Gerente comercial"]);
  });

  it("con dos empresas nuestras y ningún perfil no adivina", async () => {
    await prisma.client.create({ data: { name: "Smarteam CR (test)", kind: "INTERNO" } });
    await prisma.client.create({ data: { name: "Smarteam GT (test)", kind: "INTERNO" } });
    expect(await empresaQueUsaNexus()).toBeNull();
    // Sin saber cuál es, sin perfil pero con el cliente ideal y las personas: el agente de ideas no se queda sin contexto.
    expect((await contextoDeSmarteam()).empresa).toBeNull();
  });

  it("K3: el position statement se guarda desde Audiencia y el perfil de la ficha no lo pisa", async () => {
    const s = await prisma.client.create({ data: { name: "Smarteam (test)", kind: "INTERNO" } });
    const ps = PosicionamientoEdicionSchema.parse({
      frase: "Acompañamos a empresas que están creciendo.",
      frentes: [{ nombre: "Activación", herramienta: "Insider One", promesa: "Que miles de clientes compren", titulo: null, queLogra: [{ titulo: "Ver al cliente completo", detalle: null }], cuandoCabe: ["Le vende a personas"], nota: null }],
    });
    await guardarPosicionamiento(s.id, ps, "elias@test.local");
    await guardarPerfil(s.id, { propuestaDeValor: "Que HubSpot rinda.", tono: null, servicios: [], clientesDeReferencia: [] }, "otra@test.local");
    const ctx = await contextoDeSmarteam();
    expect(ctx.perfil.positionStatement).toBe("Acompañamos a empresas que están creciendo.");
    expect(ctx.perfil.frentes.map((f) => [f.clave, f.cuandoCabe])).toEqual([["activacion", ["Le vende a personas"]]]);
    expect(ctx.perfil.propuestaDeValor).toBe("Que HubSpot rinda.");
    const otra = await prisma.client.create({ data: { name: "Cliente (test)", kind: "CLIENTE" } });
    await expect(guardarPosicionamiento(otra.id, ps, "elias@test.local")).rejects.toMatchObject({ status: 409 });
  });
});
