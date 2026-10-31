/**
 * lib/landing/por-que-vacia.test.ts — el porqué de una sección vacía (2026-10-29) y por qué el cliente nunca lo ve.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isBlank } from "./is-blank";
import {
  CLAVE_POR_QUE_VACIA,
  LARGO_DEL_POR_QUE,
  alEditar,
  avisoDeLaSeccion,
  conPorQueVacia,
  esSoloElPorQue,
  porQueVacia,
  sinPorQueVacia,
} from "./por-que-vacia";
import { POR_QUE_DE_LAS_CURADAS, porQueQuedoVacia, type LoQueSeLeyo } from "@/lib/planificacion/por-que-vacia";
import { PLANIFICACION_SECTION_DEFS } from "@/components/landing/configs/planificacion.defs";
import { sinLosAvisosDelEquipo } from "@/lib/external/planificacion-view";
import { seccionesParaLaFoto } from "@/lib/projects/publicar-documento";
import { SKIP_KEYS } from "@/lib/canvas/print-vocab";

const PIPELINES_VACIOS = { intro: "", pipelines: [] };
const RAZON = "No encontré en las reuniones con qué llenar los pipelines.";

describe("el porqué en la data de la sección", () => {
  it("una sección vacía con su porqué SIGUE vacía: el cliente y el PDF la omiten", () => {
    const d = conPorQueVacia(PIPELINES_VACIOS, RAZON);
    expect(porQueVacia(d)).toBe(RAZON);
    expect(isBlank(d)).toBe(true);
  });

  it("sin razón (o con una vacía) la clave se va; lo demás no se toca", () => {
    const d = conPorQueVacia({ ...PIPELINES_VACIOS, [CLAVE_POR_QUE_VACIA]: "viejo" }, null);
    expect(d).toEqual(PIPELINES_VACIOS);
    expect(conPorQueVacia(PIPELINES_VACIOS, "   ")).toEqual(PIPELINES_VACIOS);
    expect(sinPorQueVacia(conPorQueVacia(PIPELINES_VACIOS, RAZON))).toEqual(PIPELINES_VACIOS);
  });

  it("es una línea, con tope", () => {
    const d = conPorQueVacia({}, `uno\n  dos ${"x".repeat(400)}`);
    const r = porQueVacia(d)!;
    expect(r.startsWith("uno dos")).toBe(true);
    expect(r.length).toBe(LARGO_DEL_POR_QUE);
    expect(r.endsWith("…")).toBe(true);
  });

  it("el aviso se ve solo mientras la sección sigue vacía", () => {
    const d = conPorQueVacia(PIPELINES_VACIOS, RAZON);
    expect(avisoDeLaSeccion(d, true)).toBe(RAZON);
    expect(avisoDeLaSeccion(d, false)).toBeNull();
    expect(avisoDeLaSeccion(PIPELINES_VACIOS, true)).toBeNull();
  });

  it("la primera edición con contenido lo saca; una edición que la deja vacía lo conserva", () => {
    const d = conPorQueVacia(PIPELINES_VACIOS, RAZON);
    const conContenido = alEditar({ ...d, intro: "El pipeline de ventas" }, isBlank);
    expect(porQueVacia(conContenido)).toBeNull();
    expect(conContenido.intro).toBe("El pipeline de ventas");
    expect(porQueVacia(alEditar({ ...d, intro: "  " }, isBlank))).toBe(RAZON);
  });

  it("⛔ el enlace del cliente no lo recibe: se saca de la data antes de mandarla", () => {
    const rows = sinLosAvisosDelEquipo([{ key: "pipelines", blocks: [{ blockType: "CARD", data: conPorQueVacia(PIPELINES_VACIOS, RAZON) }] }]);
    expect(rows[0].blocks[0].data).toEqual(PIPELINES_VACIOS);
  });

  it("⛔ el chokepoint del enlace del cliente los saca, y la publicación ni los congela", () => {
    const vista = fs.readFileSync(path.join(process.cwd(), "lib/external/planificacion-view.ts"), "utf8");
    expect(vista).toMatch(/rows: sinLosAvisosDelEquipo\(rows\)/);
    const foto = seccionesParaLaFoto([
      { key: "pipelines", blocks: [{ data: conPorQueVacia(PIPELINES_VACIOS, RAZON) }] },
      { key: "brief_importado", blocks: [{ data: { titulo: "Brief" } }] },
    ]);
    expect(foto).toEqual([{ key: "pipelines", blocks: [{ data: PIPELINES_VACIOS }] }]);
  });

  it("toda sección arranca abierta: colapsar es un control aparte de ocultar", () => {
    const motor = fs.readFileSync(path.join(process.cwd(), "components/landing/LandingView.tsx"), "utf8");
    expect(motor).toContain("const collapsed = editable && colapsadas.has(def.key);");
    expect(motor).toContain('{hidden ? "Mostrar al cliente" : "Ocultar"}');
  });

  it("la tarjeta que solo trae el porqué se reconoce, y la ruta la usa en vez de crear otra al lado", () => {
    expect(esSoloElPorQue(conPorQueVacia({}, RAZON))).toBe(true);
    expect(esSoloElPorQue(conPorQueVacia(PIPELINES_VACIOS, RAZON))).toBe(true);
    expect(esSoloElPorQue(conPorQueVacia({ intro: "Algo" }, RAZON))).toBe(false);
    expect(esSoloElPorQue(PIPELINES_VACIOS)).toBe(false);
    const ruta = fs.readFileSync(path.join(process.cwd(), "app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/route.ts"), "utf8");
    expect(ruta).toContain("esSoloElPorQue(primera.data)");
  });

  it("no llega al papel", () => {
    expect(SKIP_KEYS.has(CLAVE_POR_QUE_VACIA)).toBe(true);
  });

  it("el motor lo pinta solo en edición y con «Quitar»", () => {
    const motor = fs.readFileSync(path.join(process.cwd(), "components/landing/LandingView.tsx"), "utf8");
    expect(motor).toMatch(/const avisoDeVacia = editable \? avisoDeLaSeccion\(raw, estaVacia\) : null;/);
    expect(motor).toContain("onSectionChange(def.key, sinPorQueVacia(data))");
    expect(motor).toContain("alEditar(d, vaciaDe)");
  });
});

describe("por qué quedó vacía cada sección de la Planificación", () => {
  const base: LoQueSeLeyo = { porQueDelAgente: {}, hayDiagnostico: true, leyoReuniones: true };

  it("las curadas dicen quién las llena, aunque el agente diga otra cosa", () => {
    const r = porQueQuedoVacia({ key: "usuarios_permisos", label: "Usuarios y permisos", agentGenerated: false }, { ...base, porQueDelAgente: { usuarios_permisos: "otra" } });
    expect(r).toBe(POR_QUE_DE_LAS_CURADAS.usuarios_permisos);
  });

  it("cada curada de la Planificación tiene su línea", () => {
    const curadas = PLANIFICACION_SECTION_DEFS.filter((d) => d.agentGenerated === false && !d.soloInterna && d.key !== "cierre" && !["politica_rectora", "roadmap", "metricas_exito"].includes(d.key));
    expect(curadas.map((d) => d.key).sort()).toEqual(Object.keys(POR_QUE_DE_LAS_CURADAS).sort());
  });

  it("las acciones en detalle sin diagnóstico, y el despliegue con adopción directa, dicen su motivo", () => {
    expect(porQueQuedoVacia({ key: "acciones_en_detalle", label: "Las acciones", agentGenerated: true }, { ...base, hayDiagnostico: false })).toMatch(/no hay diagnóstico/);
  });

  it("la frase del agente gana a la genérica; sin ella, la genérica dice qué se leyó", () => {
    const s = { key: "pipelines", label: "Tus pipelines", agentGenerated: true };
    expect(porQueQuedoVacia(s, { ...base, porQueDelAgente: { pipelines: RAZON } })).toBe(RAZON);
    expect(porQueQuedoVacia(s, base)).toBe("No encontré en las reuniones, el handoff ni el diagnóstico con qué llenar «Tus pipelines».");
    expect(porQueQuedoVacia(s, { ...base, leyoReuniones: false })).toMatch(/no leyó ninguna reunión/);
  });

  it("el agente recibe la instrucción de `__vacias` y el runner la guarda", () => {
    // En el mensaje de la corrida y no en el agentIntro: «Mejorar con IA» también lee el agentIntro, y ahí no aplica.
    const defs = fs.readFileSync(path.join(process.cwd(), "components/landing/configs/planificacion.defs.ts"), "utf8");
    expect(defs).not.toContain("__vacias");
    const runner = fs.readFileSync(path.join(process.cwd(), "lib/canvas/planificacion-generate.ts"), "utf8");
    expect(runner).toContain("porQueDelAgente: gen.porQueVacias");
    expect(runner).toContain('\\"__vacias\\"');
    const agente = fs.readFileSync(path.join(process.cwd(), "lib/business-cases/canvas-agent.ts"), "utf8");
    expect(agente).toContain('porQueVacias: stringMapFor(obj["__vacias"], validKeys)');
  });
});
