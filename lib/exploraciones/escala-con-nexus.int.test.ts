/**
 * lib/exploraciones/escala-con-nexus.int.test.ts — «✨ Pedirle a Nexus» en la página de La escala, contra una base REAL
 * (23 nov, etapa 3 del plan maestro de «Hablar con Nexus»).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/escala-con-nexus.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que un cambio aplicado deja su versión («Cambiado con Nexus») y se deshace por el mismo
 * camino; que nunca publica (la foto del cliente y su fecha no cambian); que choca si otra persona editó lo mismo (y no
 * pisa); que agregar una pieza la agrega y deshacerlo la quita; que lo interno que Nexus no tiene de la cuenta no llega aunque el modelo lo escriba; que desde una sección al
 * modelo le llegan solo sus piezas; que la
 * exploración de otra cuenta no existe; y que la página de un área tiene su propio historial, aparte del Resumen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// La escala de la base de pruebas: el archivo del repo, sin publicar en la base.
vi.mock("./servidor", async (original) => {
  const real = await original<typeof import("./servidor")>();
  const { leerArchivoDeLaEscala } = await import("@/lib/escala/documento/archivos");
  const { parsearEscala } = await import("@/lib/escala/documento/parsear");
  const general = parsearEscala(leerArchivoDeLaEscala("escala"));
  return { ...real, escalaParaExplorar: async () => ({ estado: "ok" as const, general, aviso: null }) };
});
// El modelo no se llama: la prueba dice qué devolvió.
vi.mock("@/lib/ai/assist", () => ({ runDocumentAssist: vi.fn() }));

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { MAX_PEDIDO } from "@/lib/pedirle-a-nexus/contrato";
import { runDocumentAssist } from "@/lib/ai/assist";
import { _olvidarElGastoDeNexus } from "@/lib/ai/tope-de-nexus-server";
import { leerContenido } from "./esquemas";
import type { ResumenGuardado } from "./resumen-de-la-escala";
import { aplicarCambios, escalaParaExplorar } from "./servidor";
import { AGENTE_DE_PEDIRLE, antesDePedirleALaEscala, aplicarEnLaEscala, deshacerEnLaEscala, leerLaEscalaParaNexus, proponerEnLaEscala } from "./escala-con-nexus-server";
import { historialDelResumen, huellaDelResumen } from "./versiones-del-resumen-server";
import { historialDelArea } from "./versiones-del-area-server";
import { guardarLaMejoraDeLosCasos } from "./versiones-del-caso-server";
import type { EstadoDeExploracion } from "./contenido";

const CITA = { reunion: "gmeet_r1", fecha: "2026-11-05T16:00:00.000Z", turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano" };
const TESIS = "Los pedidos se anotan en papel. Nadie sabe cuántos entran.";
const RESUMEN: ResumenGuardado = {
  v: 2,
  at: "2026-11-21T15:00:00.000Z",
  por: null,
  modelo: "claude-sonnet-4-6",
  agentRunId: null,
  hicimos: { sesiones: [], personas: 1, texto: null },
  datosRojos: [],
  areas: {},
  entendimos: [],
  falta: [],
  negocio: { tesis: [{ id: "n1", texto: TESIS, citas: [CITA] }] },
  operativas: [],
  puntos: [],
};
const FOTO = { formato: "prueba", lo: "que ve el cliente" };
const QUIEN = { email: "elias@prueba.test" };
const RESUMEN_LUGAR = { pagina: "resumen" as const };

async function sembrar() {
  const c = await prisma.client.create({ data: { name: "Cemaco de prueba", kind: "PROSPECTO" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: { clientId: c.id, creadaPor: "vendedor@prueba.test", areas: ["1"], contenido: { resumenDeLaEscala: RESUMEN } as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  const publicadaEn = new Date("2026-11-20T12:00:00.000Z");
  await prisma.accesoALaEscala.create({ data: { exploracionId: e.id, accessToken: `t${e.id}`.padEnd(64, "0").slice(0, 64), publicada: FOTO, publicadaEn, publicadaPor: "ana@prueba.test" } });
  return { clientId: c.id, exploracionId: e.id, publicadaEn };
}

async function contenido(id: string) {
  const f = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id }, select: { contenido: true, accesoALaEscala: { select: { publicada: true, publicadaEn: true } } } });
  return { c: leerContenido(f.contenido), acceso: f.accesoALaEscala };
}

async function laTesis(d: { clientId: string; exploracionId: string }) {
  const l = await leerLaEscalaParaNexus(QUIEN, { ...d, lugar: RESUMEN_LUGAR });
  if (!l.ok) throw new Error(l.error);
  return { lectura: l, tesis: l.piezas.find((p) => p.seccion === "El problema principal" && !p.agregar)! };
}

beforeEach(() => {
  vi.mocked(runDocumentAssist).mockReset();
  _olvidarElGastoDeNexus();
});

describe("Pedirle a Nexus en La escala, en la base", () => {
  it("un cambio aplicado deja su versión «Cambiado con Nexus» y «Deshacer» vuelve exacto a lo de antes", async () => {
    const d = await sembrar();
    const { tesis } = await laTesis(d);
    expect(tesis.valor).toBe(TESIS);

    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: tesis.clave, antes: TESIS, despues: "Nadie sabe cuántos pedidos entran al mes." }], pedido: "cambia el problema" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aviso).toMatch(/cliente no ve/);
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.negocio?.tesis?.[0].texto).toBe("Nadie sabe cuántos pedidos entran al mes.");

    const h = await historialDelResumen(d.exploracionId);
    const deNexus = h!.versiones.find((v) => v.tipo === "nexus")!;
    expect(deNexus).toMatchObject({ etiqueta: "Cambiado con Nexus", esActual: true, creadaPor: QUIEN.email });
    expect(deNexus.nota).toContain("cambia el problema");
    // Lo de antes también quedó, para volver a él desde el historial.
    expect(h!.versiones.some((v) => v.tipo !== "nexus" && v.id)).toBe(true);

    expect(r.deshacer).not.toBeNull();
    const deshecho = await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...r.deshacer! });
    expect(deshecho.ok).toBe(true);
    // Exacto: el texto, su cita y que lo escribió la IA (no queda como escrito por el equipo).
    const tesisDeVuelta = (await contenido(d.exploracionId)).c.resumenDeLaEscala?.negocio?.tesis?.[0];
    expect(tesisDeVuelta?.texto).toBe(TESIS);
    expect(tesisDeVuelta?.citas).toHaveLength(1);
    expect(tesisDeVuelta?.mano).toBeFalsy();
    expect((await historialDelResumen(d.exploracionId))!.versiones[0]).toMatchObject({ tipo: "restaurado", esActual: true });
  });

  it("nunca publica: la foto del cliente y su fecha no cambian", async () => {
    const d = await sembrar();
    const { tesis } = await laTesis(d);
    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: tesis.clave, antes: TESIS, despues: "Otra tesis para el cliente." }] });
    expect(r.ok).toBe(true);
    const { acceso } = await contenido(d.exploracionId);
    expect(acceso?.publicada).toEqual(FOTO);
    expect(acceso?.publicadaEn?.toISOString()).toBe(d.publicadaEn.toISOString());
  });

  it("choca si otra persona editó lo mismo: no aplica nada y dice qué dice ahora", async () => {
    const d = await sembrar();
    const { tesis } = await laTesis(d);
    // Otra persona la cambia a mano, por la edición de siempre, después de que Nexus la propuso.
    const escala = await escalaParaExplorar();
    if (escala.estado !== "ok") throw new Error("sin escala");
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: d.exploracionId }, select: { version: true } });
    await aplicarCambios(d.exploracionId, fila.version, [{ op: "resumenDeLaEscala", clave: "negocio:tesis:n1", texto: "Lo escribió Ana." }], escala.general, { quienPide: "ana@prueba.test" });

    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: tesis.clave, antes: TESIS, despues: "Lo que propuso Nexus." }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.choques).toEqual([{ clave: tesis.clave, nombre: tesis.nombre, ahora: "Lo escribió Ana." }]);
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.negocio?.tesis?.[0].texto).toBe("Lo escribió Ana.");
  });

  it("agregar una pieza la agrega escrita a mano, y deshacerlo la quita (un punto clave y un paso del recorrido)", async () => {
    const d = await sembrar();
    const { lectura } = await laTesis(d);
    const lugar = lectura.piezas.find((p) => p.agregar && p.seccion === "Puntos clave");
    expect(lugar, "el lugar para agregar un punto clave").toBeTruthy();
    // Un punto nuevo va entero (25 nov): solo el título no se aplica, y no escribe nada.
    const soloElTitulo = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: lugar!.clave, antes: null, despues: "El WhatsApp no deja registro" }] });
    expect(soloElTitulo).toMatchObject({ ok: false, status: 400 });
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.puntos ?? []).toEqual([]);
    const r = await aplicarEnLaEscala(QUIEN, {
      ...d,
      lugar: RESUMEN_LUGAR,
      cambios: [{ clave: lugar!.clave, antes: null, despues: "Título: El WhatsApp no deja registro\nQué pasa: Los pedidos que entran por WhatsApp no quedan en ningún lado." }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const puntos = (await contenido(d.exploracionId)).c.resumenDeLaEscala?.puntos ?? [];
    expect(puntos.map((p) => [p.titulo, p.texto, p.mano])).toEqual([["El WhatsApp no deja registro", "Los pedidos que entran por WhatsApp no quedan en ningún lado.", true]]);
    // Aplicarlo otra vez no lo duplica (segunda revisión del 25 nov): ya hay uno igual.
    const otraVez = await aplicarEnLaEscala(QUIEN, {
      ...d,
      lugar: RESUMEN_LUGAR,
      cambios: [{ clave: lugar!.clave, antes: null, despues: "Título: El WhatsApp no deja registro\nQué pasa: Otra vez." }],
    });
    expect(otraVez).toMatchObject({ ok: false, status: 409 });
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.puntos ?? []).toHaveLength(1);

    expect((await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...r.deshacer! })).ok).toBe(true);
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.puntos ?? []).toEqual([]);

    // Un paso nuevo del recorrido (la revisión del 23 nov: deshacerlo fallaba siempre).
    const { lectura: otra } = await laTesis(d);
    const paso = otra.piezas.find((p) => p.agregar && p.seccion === "Tu operación")!;
    const conPaso = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: paso.clave, antes: null, despues: "Paso: Facturación\nQué pasa: La factura se arma a mano en Excel." }] });
    expect(conPaso.ok).toBe(true);
    if (!conPaso.ok) return;
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.recorrido?.map((e) => [e.nombre, e.texto, e.friccion])).toEqual([["Facturación", "La factura se arma a mano en Excel.", null]]);
    expect((await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...conPaso.deshacer! })).ok).toBe(true);
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.recorrido ?? []).toEqual([]);
  });

  it("antes de pedirle a La escala desde la conversación: el tope del día contado en la base y el largo (25 nov)", async () => {
    const d = await sembrar();
    expect(await antesDePedirleALaEscala(QUIEN.email, "Acóplalo a Fundatec")).toEqual({ ok: true });
    expect(await antesDePedirleALaEscala(QUIEN.email, "x".repeat(MAX_PEDIDO))).toEqual({ ok: true });
    expect(await antesDePedirleALaEscala(QUIEN.email, "x".repeat(MAX_PEDIDO + 1))).toMatchObject({ ok: false, status: 400 });
    await prisma.agentRun.createMany({ data: Array.from({ length: 19 }, () => ({ agentSlug: AGENTE_DE_PEDIRLE, clientId: d.clientId, status: "DONE" as const, triggeredByEmail: QUIEN.email })) });
    expect(await antesDePedirleALaEscala(QUIEN.email)).toEqual({ ok: true });
    await prisma.agentRun.create({ data: { agentSlug: AGENTE_DE_PEDIRLE, clientId: d.clientId, status: "DONE", triggeredByEmail: QUIEN.email } });
    expect(await antesDePedirleALaEscala(QUIEN.email)).toMatchObject({ ok: false, status: 429 });
    // Los de otra persona no cuentan.
    expect(await antesDePedirleALaEscala("otra@prueba.test")).toEqual({ ok: true });
  });

  it("«Deshacer» choca si alguien cambió el Resumen después de Nexus, y no pisa", async () => {
    const d = await sembrar();
    const { tesis } = await laTesis(d);
    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: tesis.clave, antes: TESIS, despues: "Lo que dejó Nexus." }] });
    if (!r.ok) throw new Error(r.error);
    const escala = await escalaParaExplorar();
    if (escala.estado !== "ok") throw new Error("sin escala");
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: d.exploracionId }, select: { version: true } });
    await aplicarCambios(d.exploracionId, fila.version, [{ op: "resumenDeLaEscala", clave: "negocio:tesis:n1", texto: "Lo corrigió Ana después." }], escala.general, { quienPide: "ana@prueba.test" });
    const x = await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...r.deshacer! });
    expect(x).toMatchObject({ ok: false, status: 409 });
    expect((await contenido(d.exploracionId)).c.resumenDeLaEscala?.negocio?.tesis?.[0].texto).toBe("Lo corrigió Ana después.");
  });

  it("el titular y los textos fijos quedan en la versión del Resumen", async () => {
    const d = await sembrar();
    const { lectura } = await laTesis(d);
    const bajada = lectura.piezas.find((p) => p.nombre.startsWith("La bajada"))!;
    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: bajada.clave, antes: bajada.valor, despues: "Así entendimos tu cobranza." }] });
    expect(r.ok).toBe(true);
    const v = await prisma.versionDeDocumento.findFirstOrThrow({ where: { exploracionId: d.exploracionId, pieza: null, tipo: "nexus" }, select: { contenido: true } });
    expect((v.contenido as { textosDelResumen?: Record<string, string> }).textosDelResumen).toEqual({ [bajada.clave.slice(2)]: "Así entendimos tu cobranza." });
    // «Deshacer» (Usar esta versión) devuelve también los textos fijos: la bajada vuelve a la de siempre.
    if (!r.ok) return;
    expect((await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...r.deshacer! })).ok).toBe(true);
    expect((await contenido(d.exploracionId)).c.textosDeLaPagina?.[bajada.clave.slice(2)]).toBeUndefined();
  });

  it("no mete lo interno que Nexus no tiene de la cuenta, aunque se lo pidan (24 nov: si lo tuviera, llegaría marcado): no llega y no se escribe nada", async () => {
    const d = await sembrar();
    const { tesis } = await laTesis(d);
    vi.mocked(runDocumentAssist).mockResolvedValue({
      // Solo lo que el pedido nombra: así se prueba que lo frena la cuenta (sin notas), no el pedido.
      proposal: { [tesis.clave]: { texto: "El gerente no quiere invertir." } },
      summary: [],
      reasoning: "Agregué lo que pediste.",
      warnings: [],
      citations: [],
      usedWebSearch: false,
    });
    const antes = await contenido(d.exploracionId);
    const r = await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "agrega que el gerente no quiere invertir" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.propuesta.cambios).toEqual([]);
    expect(r.propuesta.descartados[0].motivo).toMatch(/no tiene en lo que sabe de la cuenta/);
    // Proponer no escribe; y la corrida queda medida con su origen.
    expect((await contenido(d.exploracionId)).c).toEqual(antes.c);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: r.propuesta.corrida! }, select: { agentSlug: true, status: true, clientId: true } });
    expect(run).toEqual({ agentSlug: "pedirle-a-nexus", status: "DONE", clientId: d.clientId });
    const llamada = vi.mocked(runDocumentAssist).mock.calls[0][0];
    expect(llamada.maxWebSearches).toBe(0);
    expect(JSON.stringify(llamada)).not.toContain("gmeet_r1");
  });

  it("pedido desde una sección (24 nov): al modelo le llegan solo sus piezas; una sección sin piezas es un 409", async () => {
    const d = await sembrar();
    vi.mocked(runDocumentAssist).mockResolvedValue({ proposal: {}, summary: [], reasoning: "Nada que cambiar.", warnings: [], citations: [], usedWebSearch: false });
    const r = await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "hazlo más claro", foco: "El problema principal" });
    expect(r.ok).toBe(true);
    const llamada = vi.mocked(runDocumentAssist).mock.calls[0][0];
    expect(llamada.sections.length).toBeGreaterThan(0);
    for (const s of llamada.sections) expect(s.label).toMatch(/^El problema principal › /);
    expect(llamada.instruction).toContain("«El problema principal»");
    // El Resumen de prueba no tiene puntos clave: desde ahí no hay nada que pedir (y no se llama a la IA).
    const sinPiezas = await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "hazlo más claro", foco: "Una sección que no está" });
    expect(sinPiezas).toMatchObject({ ok: false, status: 409 });
    expect(vi.mocked(runDocumentAssist)).toHaveBeenCalledTimes(1);
  });

  it("«Deshacer» devuelve la bajada aunque la última versión del Resumen sea de antes del 23 nov (sin textos fijos)", async () => {
    const d = await sembrar();
    // Una versión como las de producción del 21 y 22 nov: el Resumen igual, sin `textosDelResumen`.
    await prisma.versionDeDocumento.create({
      data: { exploracionId: d.exploracionId, origen: "Después de rehacerlo con IA", tipo: "ia", huella: huellaDelResumen(RESUMEN)!, secciones: [], contenido: RESUMEN as unknown as Prisma.InputJsonValue },
    });
    const { lectura } = await laTesis(d);
    const bajada = lectura.piezas.find((p) => p.nombre.startsWith("La bajada"))!;
    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, cambios: [{ clave: bajada.clave, antes: bajada.valor, despues: "Así entendimos tu cobranza." }] });
    if (!r.ok) throw new Error(r.error);
    expect((await deshacerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, ...r.deshacer! })).ok).toBe(true);
    expect((await contenido(d.exploracionId)).c.textosDeLaPagina?.[bajada.clave.slice(2)]).toBeUndefined();
  });

  it("el tope por persona: con 20 pedidos de hoy, el siguiente no llama a la IA", async () => {
    const d = await sembrar();
    await prisma.agentRun.createMany({ data: Array.from({ length: 20 }, () => ({ agentSlug: "pedirle-a-nexus", status: "DONE" as const, triggeredByEmail: "tope@prueba.test", clientId: d.clientId })) });
    const r = await proponerEnLaEscala({ email: "tope@prueba.test" }, { ...d, lugar: RESUMEN_LUGAR, pedido: "cambia el titular" });
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(runDocumentAssist).not.toHaveBeenCalled();
    // Otra persona sí puede.
    vi.mocked(runDocumentAssist).mockResolvedValue({ proposal: {}, summary: [], reasoning: "Nada que cambiar.", warnings: [], citations: [], usedWebSearch: false });
    expect((await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "cambia el titular" })).ok).toBe(true);
  });

  it("una respuesta mal armada (texto vacío sin «quitar») no toca la pieza; con «quitar», pasa por la revisión", async () => {
    const d = await sembrar();
    const { tesis: paso } = await laTesis(d);
    vi.mocked(runDocumentAssist).mockResolvedValue({ proposal: { [paso.clave]: { texto: "", quitar: "" } }, summary: [], reasoning: "x", warnings: [], citations: [], usedWebSearch: false });
    const a = await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "mejóralo" });
    expect(a.ok && [a.propuesta.cambios, a.propuesta.descartados]).toEqual([[], []]);
    vi.mocked(runDocumentAssist).mockResolvedValue({ proposal: { [paso.clave]: { texto: "", quitar: "si" } }, summary: [], reasoning: "x", warnings: [], citations: [], usedWebSearch: false });
    const b = await proponerEnLaEscala(QUIEN, { ...d, lugar: RESUMEN_LUGAR, pedido: "quita eso" });
    // La tesis no se quita (es obligatoria): la revisión lo dice.
    expect(b.ok && b.propuesta.descartados.map((x) => x.motivo)).toEqual(["Esta parte no se puede dejar vacía."]);
  });

  it("la exploración de otra cuenta no existe, y un área que no está en la página tampoco", async () => {
    const d = await sembrar();
    const otra = await prisma.client.create({ data: { name: "Otra empresa", kind: "PROSPECTO" }, select: { id: true } });
    const r = await leerLaEscalaParaNexus(QUIEN, { clientId: otra.id, exploracionId: d.exploracionId, lugar: RESUMEN_LUGAR });
    expect(r).toMatchObject({ ok: false, status: 404 });
    const a = await aplicarEnLaEscala(QUIEN, { clientId: otra.id, exploracionId: d.exploracionId, lugar: RESUMEN_LUGAR, cambios: [{ clave: "r/negocio:tesis:n1", antes: TESIS, despues: "x" }] });
    expect(a).toMatchObject({ ok: false, status: 404 });
    expect((await leerLaEscalaParaNexus(QUIEN, { ...d, lugar: { pagina: "area", areaId: "no-existe" } })).ok).toBe(false);
  });

  it("la mejora de un caso de uso deja lo de antes y «Cambiado con Nexus» en el historial del caso, con el pedido", async () => {
    const d = await sembrar();
    const caso = (titulo: string) => ({ titulo, areaId: "1", actividades: [] });
    const estado = (titulo: string) => ({ contenido: { casosDeUso: { "uc-1": caso(titulo) } } }) as unknown as EstadoDeExploracion;
    await guardarLaMejoraDeLosCasos({
      exploracionId: d.exploracionId,
      operaciones: [{ op: "casoDeUso", useCaseId: "uc-1", valor: caso("Después") as never }],
      antes: estado("Antes"),
      despues: estado("Después"),
      instruccion: "suma una actividad de WhatsApp",
      email: QUIEN.email,
    });
    const filas = await prisma.versionDeDocumento.findMany({ where: { exploracionId: d.exploracionId, pieza: "caso:uc-1" }, orderBy: { createdAt: "asc" }, select: { tipo: true, origen: true, creadaPor: true } });
    expect(filas.map((f) => f.tipo)).toEqual(["guardada", "nexus"]);
    expect(filas[1]).toMatchObject({ creadaPor: QUIEN.email, origen: "Pedido: «suma una actividad de WhatsApp»" });
    // No se mezcla con el Resumen.
    expect((await historialDelResumen(d.exploracionId))!.versiones.some((v) => v.tipo === "nexus")).toBe(false);
  });

  it("la página de un área tiene su historial, aparte del Resumen", async () => {
    const d = await sembrar();
    const l = await leerLaEscalaParaNexus(QUIEN, { ...d, lugar: { pagina: "area", areaId: "1" } });
    if (!l.ok) throw new Error(l.error);
    const titulo = l.piezas.find((p) => p.escribe.via === "descripcion")!;
    const r = await aplicarEnLaEscala(QUIEN, { ...d, lugar: { pagina: "area", areaId: "1" }, cambios: [{ clave: titulo.clave, antes: titulo.valor, despues: "Así está tu área hoy." }], pedido: "otra descripción" });
    expect(r.ok).toBe(true);
    const h = await historialDelArea(d.exploracionId, "1");
    expect(h!.versiones[0]).toMatchObject({ tipo: "nexus", esActual: true });
    // Lo de antes quedó aunque nadie hubiera escrito nada en la página: es a la que vuelve «Deshacer».
    expect(h!.versiones.length).toBeGreaterThanOrEqual(2);
    // El Resumen no se enteró: su historial no tiene la versión del área.
    expect((await historialDelResumen(d.exploracionId))!.versiones.some((v) => v.tipo === "nexus")).toBe(false);
    if (!r.ok) return;
    expect((await deshacerEnLaEscala(QUIEN, { ...d, lugar: { pagina: "area", areaId: "1" }, ...r.deshacer! })).ok).toBe(true);
    expect((await contenido(d.exploracionId)).c.descripcionesDeLaEscala?.["1"]).toBeUndefined();
  });
});
