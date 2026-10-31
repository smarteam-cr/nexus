/**
 * lib/artefactos/compartir.int.test.ts — el ENLACE PROPIO de cada documento de un proyecto (etapa V4 de
 * docs/artefactos-plan.md), de punta a punta contra una base REAL: el enlace de una copia abre solo esa copia, vivo y sin
 * lo interno; dejar de compartir lo cierra; un enlace cruzado de empresa no abre nada; un documento interno no se
 * comparte; y el documento de la empresa sigue abriendo su foto como antes. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { compartirArtefacto, dejarDeCompartirArtefacto, esDocumentoDelProyecto, estadoDelEnlace } from "./compartir-server";
import { artefactoParaElToken } from "@/lib/external/artefacto-view";
import { documentoDeLaEmpresaParaElToken } from "@/lib/external/documento-de-la-empresa-view";
import { compartirDocumentoDeLaEmpresa, crearDocumentoDeLaEmpresa } from "@/lib/clients/documentos-de-la-empresa-compartir";
import { INV64 } from "@/lib/invariantes/documentos-de-la-empresa";
import { INV65 } from "@/lib/invariantes/artefactos";

const tokenDe = (enlace: string | null) => (enlace ?? "").split("/").pop() ?? "";

/** Un documento del proyecto con sus secciones y, en cada una, un bloque con su estado. */
async function documento(
  projectId: string,
  o: { slug?: string; tipoArtefacto?: string; name: string; secciones: Array<{ key: string; estado?: "CONFIRMED" | "DRAFT"; texto?: string }> },
) {
  const canvas = await prisma.projectCanvas.create({
    data: { projectId, slug: o.slug ?? null, tipoArtefacto: o.tipoArtefacto ?? null, name: o.name, sections: o.secciones.map((s) => ({ key: s.key, label: s.key })) },
  });
  for (const [i, s] of o.secciones.entries()) {
    const sec = await prisma.canvasSection.create({ data: { canvasId: canvas.id, key: s.key, label: s.key, order: i } });
    await prisma.canvasBlock.create({
      data: { sectionId: sec.id, blockType: "CARD", data: { intro: s.texto ?? `${o.name} · ${s.key}` }, order: 0, source: "HUMAN", status: s.estado ?? "CONFIRMED" },
    });
  }
  return canvas.id;
}

async function proyecto(nombre: string) {
  const c = await prisma.client.create({ data: { name: `${nombre} (test)`, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: `${nombre} · implementación` } });
  return { clientId: c.id, projectId: p.id };
}

describe("el enlace propio de un documento del proyecto", () => {
  it("abre solo esa copia, vivo y sin lo interno; dejar de compartir lo cierra y volver a compartir da otro", async () => {
    const { clientId, projectId } = await proyecto("FACO V4");
    const deSiempre = await documento(projectId, { slug: "planning", name: "Planificación", secciones: [{ key: "pipelines", texto: "La de siempre" }] });
    const marketing = await documento(projectId, {
      tipoArtefacto: "planning",
      name: "Planificación — Marketing",
      secciones: [
        { key: "pipelines", texto: "Los pipelines de Marketing" },
        { key: "automatizaciones", estado: "DRAFT", texto: "Una propuesta que nadie aceptó" },
        { key: "formularios", texto: "Los formularios" },
      ],
    });
    const otra = await documento(projectId, { tipoArtefacto: "planning", name: "Planificación — WhatsApp", secciones: [{ key: "pipelines", texto: "Otra copia" }] });

    expect((await estadoDelEnlace(marketing)).enlace).toBeNull();
    const compartido = await compartirArtefacto({ projectId, clientId, canvasId: marketing, porEmail: "ana@smarteam.test" });
    expect(compartido.enlace).toMatch(/\/external\/documento\/[0-9a-f]{64}$/);
    expect(compartido.desde).not.toBeNull();
    const token = tokenDe(compartido.enlace);

    const vista = await artefactoParaElToken(token);
    expect(vista).toMatchObject({ tipo: "planning", nombre: "Planificación — Marketing", clientName: "FACO V4 (test)" });
    // El borrador (DRAFT) no sale; lo confirmado sí, en el orden de la base. Nada de la de siempre ni de la otra copia.
    expect(vista?.rows.map((r) => r.key)).toEqual(["pipelines", "formularios"]);
    const textos = JSON.stringify(vista?.rows);
    expect(textos).toContain("Los pipelines de Marketing");
    expect(textos).not.toContain("La de siempre");
    expect(textos).not.toContain("Otra copia");
    expect(textos).not.toContain("nadie aceptó");
    // Quien lo escribió y el estado de los bloques no viajan.
    expect(textos).not.toMatch(/source|status|HUMAN/);
    // El enlace de la copia no abre las otras: ellas no tienen enlace.
    expect((await estadoDelEnlace(deSiempre)).enlace).toBeNull();
    expect((await estadoDelEnlace(otra)).enlace).toBeNull();
    // Abrirlo deja la última vista.
    expect((await estadoDelEnlace(marketing)).ultimaVista).not.toBeNull();

    // Es VIVO: ocultar después de compartir tiene efecto al recargar, sin volver a compartir.
    await prisma.projectCanvas.update({ where: { id: marketing }, data: { sections: [{ key: "formularios", label: "Formularios", hidden: true }] } });
    expect((await artefactoParaElToken(token))?.rows.map((r) => r.key)).toEqual(["pipelines"]);

    // Dejar de compartir lo cierra; volver a compartir da un enlace nuevo.
    await dejarDeCompartirArtefacto(marketing, projectId);
    expect(await artefactoParaElToken(token)).toBeNull();
    expect((await estadoDelEnlace(marketing)).enlace).toBeNull();
    const otraVez = await compartirArtefacto({ projectId, clientId, canvasId: marketing, porEmail: null });
    expect(tokenDe(otraVez.enlace)).not.toBe(token);
    expect(await artefactoParaElToken(tokenDe(otraVez.enlace))).not.toBeNull();

    // Archivar la copia (disabledAt) la cierra aunque el enlace siga vigente.
    await prisma.projectCanvas.update({ where: { id: marketing }, data: { disabledAt: new Date() } });
    expect(await artefactoParaElToken(tokenDe(otraVez.enlace))).toBeNull();
    await expect(compartirArtefacto({ projectId, clientId, canvasId: marketing, porEmail: null })).rejects.toMatchObject({ status: 409 });

    // El documento de siempre también tiene su enlace propio (para compartir pantalla), aparte de su superficie de siempre.
    const deSiempreCompartido = await compartirArtefacto({ projectId, clientId, canvasId: deSiempre, porEmail: null });
    expect((await artefactoParaElToken(tokenDe(deSiempreCompartido.enlace)))?.rows.map((r) => JSON.stringify(r.blocks))).toEqual([
      expect.stringContaining("La de siempre"),
    ]);
    // Compartir no tocó la foto que usan sus superficies de siempre.
    expect((await prisma.projectCanvas.findUniqueOrThrow({ where: { id: deSiempre }, select: { publishedSnapshot: true } })).publishedSnapshot).toBeNull();

    expect(await artefactoParaElToken("../../etc")).toBeNull();
    expect((await INV64.correr(prisma, new Date())).ok).toBe(true);
    expect((await INV65.correr(prisma, new Date())).ok).toBe(true);
  });

  it("⛔ el porqué de una sección vacía es del equipo: no llega al enlace del cliente", async () => {
    const { clientId, projectId } = await proyecto("Cemaco Aviso");
    const canvasId = await documento(projectId, { tipoArtefacto: "planning", name: "Plan", secciones: [{ key: "pipelines" }] });
    await prisma.canvasBlock.updateMany({ where: { section: { canvasId } }, data: { data: { intro: "Con texto", __porQueVacia: "AVISO DEL EQUIPO" } } });
    const enlace = await compartirArtefacto({ projectId, clientId, canvasId, porEmail: null });
    expect(JSON.stringify(await artefactoParaElToken(tokenDe(enlace.enlace)))).not.toContain("AVISO DEL EQUIPO");
  });

  it("⛔ la entrega de siempre no se comparte por acá; un informe de avance sí, sin lo que el cierre guarda", async () => {
    const { clientId, projectId } = await proyecto("Cemaco Entrega");
    const entrega = await documento(projectId, { slug: "delivery", name: "Entrega", secciones: [{ key: "logros", texto: "Evidencia interna" }] });
    await expect(compartirArtefacto({ projectId, clientId, canvasId: entrega, porEmail: null })).rejects.toMatchObject({ status: 400 });

    const informe = await documento(projectId, {
      tipoArtefacto: "delivery",
      name: "Informe de octubre",
      secciones: [{ key: "logros", texto: "Propuesta sin aceptar" }, { key: "avance_por_frente", texto: "Ventas al día" }],
    });
    const enlace = await compartirArtefacto({ projectId, clientId, canvasId: informe, porEmail: null });
    const vista = await artefactoParaElToken(tokenDe(enlace.enlace));
    expect(vista?.rows.map((r) => r.key)).toEqual(["avance_por_frente"]);
    expect(JSON.stringify(vista?.rows)).not.toContain("Propuesta sin aceptar");
  });

  it("lo que lee el proyecto y la estimación del equipo técnico no salen; un documento interno no se comparte", async () => {
    const { clientId, projectId } = await proyecto("Cemaco V4");
    const integracion = await documento(projectId, {
      tipoArtefacto: "tech-requirements",
      name: "Integración con el ERP",
      secciones: [{ key: "mapa_integracion" }, { key: "estimacion", texto: "40 horas internas" }, { key: "cierre" }],
    });
    const enlace = await compartirArtefacto({ projectId, clientId, canvasId: integracion, porEmail: null });
    const vista = await artefactoParaElToken(tokenDe(enlace.enlace));
    expect(vista?.tipo).toBe("tech-requirements");
    expect(vista?.rows.map((r) => r.key)).toEqual(["mapa_integracion", "cierre"]);
    expect(JSON.stringify(vista?.rows)).not.toContain("40 horas");

    const kickoff = await documento(projectId, {
      tipoArtefacto: "kickoff",
      name: "Kickoff de la fase 2",
      secciones: [{ key: "bienvenida" }, { key: "cronograma", texto: "fases del proyecto" }, { key: "objetivos" }],
    });
    const deKickoff = await artefactoParaElToken(tokenDe((await compartirArtefacto({ projectId, clientId, canvasId: kickoff, porEmail: null })).enlace));
    expect(deKickoff?.rows.map((r) => r.key)).toEqual(["bienvenida", "objetivos"]);

    // La exploración es interna: no se comparte (y un acceso creado a mano tampoco la abre).
    const exploracion = await documento(projectId, { tipoArtefacto: "exploration", name: "Exploración de Marketing", secciones: [{ key: "ya_sabemos" }] });
    await expect(compartirArtefacto({ projectId, clientId, canvasId: exploracion, porEmail: null })).rejects.toMatchObject({ status: 400 });
    const aMano = "b".repeat(64);
    await prisma.accesoAlDocumento.create({ data: { canvasId: exploracion, clientId, accessToken: aMano } });
    expect(await artefactoParaElToken(aMano)).toBeNull();
  });

  it("un enlace cruzado de empresa no abre nada (y pone INV64 en rojo); otro proyecto no puede compartir el documento", async () => {
    const a = await proyecto("Empresa A V4");
    const b = await proyecto("Empresa B V4");
    const deB = await documento(b.projectId, { tipoArtefacto: "planning", name: "Planificación de B", secciones: [{ key: "pipelines" }] });
    // Desde el proyecto de A no se puede compartir un documento de B (no se distingue de uno que no existe).
    await expect(compartirArtefacto({ projectId: a.projectId, clientId: a.clientId, canvasId: deB, porEmail: null })).rejects.toMatchObject({ status: 404 });
    // A mano y cruzado: el enlace dice A, el documento es de un proyecto de B.
    const token = "c".repeat(64);
    await prisma.accesoAlDocumento.create({ data: { canvasId: deB, clientId: a.clientId, accessToken: token } });
    expect(await artefactoParaElToken(token)).toBeNull();
    expect(await documentoDeLaEmpresaParaElToken(token)).toBeNull();
    expect((await INV64.correr(prisma, new Date())).ok).toBe(false);
    // La puerta de la ruta (GET y DELETE): el documento de B no es del proyecto de A, y A no lo puede apagar.
    expect(await esDocumentoDelProyecto(a.projectId, deB)).toBe(false);
    await dejarDeCompartirArtefacto(deB, a.projectId);
    expect((await prisma.accesoAlDocumento.findUniqueOrThrow({ where: { canvasId: deB } })).revokedAt).toBeNull();
  });

  it("un proyecto de prueba no se comparte, y uno que pasa a serlo deja de abrir", async () => {
    const { clientId, projectId } = await proyecto("Prueba V4");
    const c = await documento(projectId, { tipoArtefacto: "planning", name: "Planificación", secciones: [{ key: "pipelines", texto: "x" }] });
    const { enlace } = await compartirArtefacto({ projectId, clientId, canvasId: c, porEmail: null });
    expect(await artefactoParaElToken(tokenDe(enlace))).not.toBeNull();

    await prisma.project.update({ where: { id: projectId }, data: { esPrueba: true } });
    expect(await artefactoParaElToken(tokenDe(enlace))).toBeNull();
    await dejarDeCompartirArtefacto(c, projectId);
    await expect(compartirArtefacto({ projectId, clientId, canvasId: c, porEmail: null })).rejects.toMatchObject({ status: 409 });
  });

  it("la entrega no se comparte por este enlace: guarda en su Json lo que el cliente no ve", async () => {
    const { clientId, projectId } = await proyecto("Entrega V4");
    const c = await documento(projectId, { slug: "delivery", name: "Entrega", secciones: [{ key: "logros", texto: "x" }] });
    await expect(compartirArtefacto({ projectId, clientId, canvasId: c, porEmail: null })).rejects.toMatchObject({ status: 400 });
  });

  it("el kickoff de siempre sale con los horarios que eligió el cliente, y las ocultas fijas viajan", async () => {
    const { clientId, projectId } = await proyecto("Horarios V4");
    const k = await documento(projectId, { slug: "kickoff", name: "Kickoff", secciones: [{ key: "horarios", texto: "semilla" }] });
    await prisma.canvasBlock.updateMany({
      where: { section: { canvasId: k, key: "horarios" } },
      data: { data: { sessions: [{ id: "s1", optionId: "semilla" }] } },
    });
    await prisma.project.update({ where: { id: projectId }, data: { kickoffHorarioAssignments: { s1: "la-elegida" } } });
    await prisma.projectCanvas.update({ where: { id: k }, data: { sections: [{ key: "cierre", label: "Cierre", hidden: true }] } });
    const { enlace } = await compartirArtefacto({ projectId, clientId, canvasId: k, porEmail: null });
    const vista = await artefactoParaElToken(tokenDe(enlace));
    expect(vista?.ocultas).toContain("cierre");
    expect(vista?.rows.map((r) => r.key)).toEqual(["horarios"]);
    expect(vista?.rows[0].blocks[0].data).toEqual({ sessions: [{ id: "s1", optionId: "la-elegida" }] });
  });

  it("un diagnóstico compartido lleva la línea base y la meta de sus resultados, solo esos campos", async () => {
    const { clientId, projectId } = await proyecto("Resultados V4");
    const d = await documento(projectId, { tipoArtefacto: "diagnosis", name: "Diagnóstico de marketing", secciones: [{ key: "objetivos", texto: "x" }] });
    await prisma.canvasBlock.updateMany({ where: { section: { canvasId: d, key: "objetivos" } }, data: { data: { objetivos: [{ id: "OBJ-01", resultado: "R1" }] } } });
    const fila = (id: string) => ({ id, resultado: `Resultado ${id}`, metrica: "m", lineaBase: "10", meta: "20", plazo: "6 meses", quienLoNecesita: "Ana, del equipo" });
    await prisma.project.update({ where: { id: projectId }, data: { handoffResultados: { resultados: [fila("R1"), fila("R2")], generadoAt: "2026-10-29T10:00:00.000Z" } } });
    const { enlace } = await compartirArtefacto({ projectId, clientId, canvasId: d, porEmail: null });
    // Solo el que cita un objetivo que sale, y solo sus campos para el cliente.
    expect((await artefactoParaElToken(tokenDe(enlace)))?.resultados).toEqual([
      { id: "R1", resultado: "Resultado R1", metrica: "m", lineaBase: "10", meta: "20", plazo: "6 meses" },
    ]);
    // Con «Objetivos» oculto no viaja ninguno.
    await prisma.projectCanvas.update({ where: { id: d }, data: { sections: [{ key: "objetivos", label: "Objetivos", hidden: true }] } });
    expect((await artefactoParaElToken(tokenDe(enlace)))?.resultados).toEqual([]);
  });

  it("el documento de la empresa sigue abriendo su foto como antes, y no por la rama del proyecto", async () => {
    const c = await prisma.client.create({ data: { name: "Prospecto V4 (test)", kind: "PROSPECTO" } });
    const { canvasId } = await crearDocumentoDeLaEmpresa(c.id, "diagnosis", null, null);
    const problema = await prisma.canvasSection.findFirstOrThrow({ where: { canvasId, key: "problema" } });
    await prisma.canvasBlock.create({ data: { sectionId: problema.id, blockType: "CARD", data: { intro: "La foto" }, order: 0, source: "HUMAN", status: "CONFIRMED" } });
    const token = tokenDe((await compartirDocumentoDeLaEmpresa(c.id, canvasId, null)).enlace);
    expect((await documentoDeLaEmpresaParaElToken(token))?.rows.map((r) => r.key)).toContain("problema");
    expect(await artefactoParaElToken(token)).toBeNull();
    expect((await INV64.correr(prisma, new Date())).ok).toBe(true);
  });
});
