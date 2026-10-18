/**
 * lib/servicios/catalogo.test.ts — el catálogo de servicios recurrentes y lo que sale de él (iniciativas 3 y 4 de «La
 * siguiente serie»): la propuesta, la guía, «Pasar a recurrente» y la propuesta interna de los clientes de hoy.
 */
import { describe, expect, it } from "vitest";
import { CADENCIAS, CATALOGO_DE_SERVICIOS, servicioDelCatalogo, servicioDelProyecto, servicioParaLaPropuesta } from "./catalogo";
import { SERVICIOS_RECURRENTES } from "./index";
import { ETAPAS_DEL_CICLO, ETIQUETA_DE_ETAPA } from "./ciclo";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { BC_TYPE_CATALOG, esTipoRecurrente, SERVICIO_RECURRENTE_TYPE_ID, seedTagsFor, resolveBcType } from "@/lib/business-cases/case-types";
import { BC_TEMPLATES } from "@/components/landing/configs/templates.defs";
import { KEYS_DEL_CATALOGO } from "@/components/landing/configs/recurrente.defs";
import { casosDeLaPropuesta, seccionesDelServicio, urlDelAltaDelServicio } from "./propuesta";
import { arcoEntre, estadoDeLaEtapa, puntosDelCirculo } from "./circulo";
import { esClienteVedado, planDeLaPropuestaInterna } from "./propuesta-interna";
import { isBlank } from "@/lib/landing/is-blank";

const smartloop = servicioDelCatalogo("smartloop")!;
const sitio = servicioDelCatalogo("sitio-web")!;

describe("El catálogo de servicios", () => {
  it("trae los cuatro servicios de hoy, con claves estables y sin repetir", () => {
    const claves = CATALOGO_DE_SERVICIOS.map((s) => s.clave);
    expect(claves).toEqual(["smartloop", "sitio-web", "soporte-hubspot", "contenido"]);
    expect(new Set(claves).size).toBe(claves.length);
    for (const c of claves) expect(c, "una clave va en la URL y en la base: minúsculas y guiones").toMatch(/^[a-z0-9-]+$/);
  });

  it("cada servicio declara qué incluye, su cadencia, sus rutinas y su nivel de servicio", () => {
    for (const s of CATALOGO_DE_SERVICIOS) {
      expect(s.incluye.length, s.clave).toBeGreaterThan(0);
      expect(s.cadencia.trim(), s.clave).not.toBe("");
      expect(s.reuniones.length, `${s.clave}: sin una reunión fija no hay cadencia con el cliente`).toBeGreaterThan(0);
      expect(s.nivelDeServicio.length, s.clave).toBeGreaterThan(0);
      for (const r of s.reuniones) expect(CADENCIAS).toContain(r.cada);
      for (const t of s.tareas) expect(CADENCIAS).toContain(t.cada);
      const rutinas = [...s.reuniones.map((r) => r.clave), ...s.tareas.map((t) => `t:${t.clave}`)];
      expect(new Set(rutinas).size, `${s.clave}: claves de rutina repetidas`).toBe(rutinas.length);
      // El pipeline de destino existe en la tabla de pipelines.
      expect(PROJECT_PIPELINES.some((p) => p.key === s.enHubspot.pipeline), s.clave).toBe(true);
    }
  });

  it("la cadencia y las rutinas siguen a validar con Elías (paso 7): la guía lo dice", () => {
    expect(CATALOGO_DE_SERVICIOS.every((s) => s.validado === false)).toBe(true);
  });

  it("solo SmartLoop avanza por ciclos, con sus cinco etapas y la guía de siempre", () => {
    expect(CATALOGO_DE_SERVICIOS.filter((s) => s.ciclo).map((s) => s.clave)).toEqual(["smartloop"]);
    expect(smartloop.ciclo!.paraLaPropuesta.map((e) => e.titulo)).toEqual(ETAPAS_DEL_CICLO.map((e) => ETIQUETA_DE_ETAPA[e]));
    expect(smartloop.ciclo!.guia).toBe(SERVICIOS_RECURRENTES.smartloop);
    // El pipeline de SmartLoop apunta a este servicio.
    expect(PROJECT_PIPELINES.find((p) => p.servicioRecurrente)?.servicioRecurrente).toBe(smartloop.ciclo!.servicio);
  });

  it("el servicio de un proyecto: el elegido en Nexus manda; si no, el del pipeline; una clave rara no rompe", () => {
    expect(servicioDelProyecto({ servicioRecurrente: "contenido", servicioDelPipeline: "smartloop" })?.clave).toBe("contenido");
    expect(servicioDelProyecto({ servicioRecurrente: null, servicioDelPipeline: "smartloop" })?.clave).toBe("smartloop");
    expect(servicioDelProyecto({ servicioRecurrente: "no-existe", servicioDelPipeline: null })).toBeNull();
    expect(servicioDelProyecto({})).toBeNull();
  });

  it("lo que llega al agente de la propuesta nombra el servicio y le prohíbe inventar los tiempos", () => {
    const t = servicioParaLaPropuesta(smartloop);
    expect(t).toContain("SmartLoop");
    expect(t).toContain("Diagnóstico → Planificación → Implementación → Adopción → Aprendizaje");
    expect(t).toMatch(/no los inventes/);
    expect(servicioParaLaPropuesta(sitio)).not.toContain("ciclos de cinco etapas");
  });
});

describe("Propuesta: proyecto o servicio recurrente", () => {
  it("el tipo «Servicio recurrente» tiene un subtipo por servicio del catálogo y su plantilla", () => {
    const t = resolveBcType(SERVICIO_RECURRENTE_TYPE_ID);
    expect(esTipoRecurrente(t)).toBe(true);
    expect(t.subtypes?.map((s) => s.id)).toEqual(CATALOGO_DE_SERVICIOS.map((s) => s.clave));
    expect(BC_TEMPLATES[t.templateId]).toBeDefined();
    // Afirma solo la modalidad: el nombre del servicio no afirma una plataforma.
    expect(seedTagsFor(t, "smartloop")).toEqual(["recurrente"]);
    // Los demás tipos son proyectos.
    expect(BC_TYPE_CATALOG.filter((x) => esTipoRecurrente(x)).map((x) => x.id)).toEqual([SERVICIO_RECURRENTE_TYPE_ID]);
  });

  it("la plantilla recurrente tiene las secciones que se vendieron a mano a Cayalá y a Grupo Inve", () => {
    const keys = BC_TEMPLATES[resolveBcType(SERVICIO_RECURRENTE_TYPE_ID).templateId].sections.map((d) => d.key);
    expect(keys).toEqual([
      "hero", "antes_despues", "acuerdo", "operacion", "metodologia", "casos_de_uso", "nivel_servicio", "inversion", "forma_de_pago", "partner", "cta",
    ]);
  });

  it("lo que es compromiso lo escribe Nexus desde el catálogo, nunca el agente", () => {
    const defs = BC_TEMPLATES[resolveBcType(SERVICIO_RECURRENTE_TYPE_ID).templateId].sections;
    for (const k of KEYS_DEL_CATALOGO) expect(defs.find((d) => d.key === k)?.agentGenerated, k).toBe(false);
    const d = seccionesDelServicio(smartloop);
    expect(d.metodologia.etapas.map((e) => e.titulo)).toEqual(ETAPAS_DEL_CICLO.map((e) => ETIQUETA_DE_ETAPA[e]));
    expect(d.nivel_servicio.niveles[0]).toEqual({ prioridad: "Crítica", tiempo: "4 h", detalle: expect.any(String) });
    expect(d.operacion.rutinas.map((r) => r.titulo)).toEqual(smartloop.reuniones.map((r) => r.titulo));
    // Sin ciclo, la sección del ciclo queda vacía: vacía = no se muestra.
    expect(isBlank(seccionesDelServicio(sitio).metodologia)).toBe(true);
    for (const k of KEYS_DEL_CATALOGO.filter((x) => x !== "metodologia")) expect(isBlank(seccionesDelServicio(sitio)[k]), k).toBe(false);
  });

  it("los casos de uso de una propuesta: sin precio, sin repetidos, sin vacíos y como mucho 20", () => {
    const data = {
      items: [
        { title: "Contact center", detail: "Conversaciones en un solo lugar", price: "USD 1.200" },
        { title: "contact center", detail: "repetido" },
        { title: " ", detail: "vacío" },
        { title: "Data room" },
        ...Array.from({ length: 30 }, (_, i) => ({ title: `Caso ${i}` })),
      ],
    };
    const c = casosDeLaPropuesta(data);
    expect(c[0]).toEqual({ titulo: "Contact center", resultado: "Conversaciones en un solo lugar" });
    expect(c[1]).toEqual({ titulo: "Data room", resultado: null });
    expect(c).toHaveLength(20);
    expect(casosDeLaPropuesta(null)).toEqual([]);
    expect(casosDeLaPropuesta({ items: "x" })).toEqual([]);
  });

  it("el alta del servicio lleva el pipeline del servicio, la empresa y la propuesta", () => {
    const u = new URL(`https://x${urlDelAltaDelServicio({ servicio: smartloop, dominio: "faco.com", propuestaId: "bc1" })}`);
    expect(u.pathname).toBe("/clients");
    expect(u.searchParams.get("alta")).toBe("smartloop");
    expect(u.searchParams.get("dominio")).toBe("faco.com");
    expect(u.searchParams.get("propuesta")).toBe("bc1");
    expect(new URL(`https://x${urlDelAltaDelServicio({ servicio: sitio, dominio: null, propuestaId: "b" })}`).searchParams.get("alta")).toBe("customer-success");
  });
});

describe("El ciclo como círculo", () => {
  it("la primera etapa va arriba y las demás en el sentido del reloj", () => {
    const p = puntosDelCirculo(5, 100, 0, 0);
    expect(p[0]).toMatchObject({ x: 0, y: -100, angulo: 0 });
    expect(p[1].x).toBeGreaterThan(0); // la segunda, a la derecha
    expect(p[4].x).toBeLessThan(0); // la última, a la izquierda
    expect(puntosDelCirculo(0, 10, 0, 0)).toEqual([]);
  });

  it("cada arco va de una etapa a la siguiente y el último vuelve a la primera", () => {
    expect(arcoEntre(0, 5, 100, 0, 0)).toMatch(/^M [-\d.]+ [-\d.]+ A 100 100 0 0 1 [-\d.]+ [-\d.]+$/);
    expect(arcoEntre(4, 5, 100, 0, 0)).toMatch(/^M /);
  });

  it("hecha, actual y por venir; sin ciclo, todas por venir", () => {
    expect([0, 1, 2].map((i) => estadoDeLaEtapa(i, 1))).toEqual(["hecha", "actual", "por-venir"]);
    expect(estadoDeLaEtapa(0, null)).toBe("por-venir");
  });
});

describe("La propuesta interna de los clientes que ya compraron a mano", () => {
  const firmada = {
    id: "bc-firmada",
    nombre: "Cayalá - Acuerdo Macro",
    aprobadaEl: "2026-09-30",
    casosData: { items: [{ title: "WhatsApp + Contact Center", detail: "Centralizar conversaciones" }] },
    inversionData: { moneda: "USD", lineas: [{ concepto: "RevOps continuo", monto: "$3,000", recurrencia: "mensual" }] },
    personalizadas: ["¿Qué contiene el acuerdo?", "SLA: Cayalá + Smarteam"],
  };

  it("refleja lo vendido sin tocar la firmada: copia sus casos y su inversión, y lo demás sale del catálogo", () => {
    const p = planDeLaPropuestaInterna({ cliente: "Grupo Cayalá", servicio: smartloop, firmada, proyecto: { id: "p1", nombre: "Cayalá · SmartLoop", servicioRecurrente: null } });
    expect(p.nombre).toBe("SmartLoop — Grupo Cayalá · interna");
    expect(p.secciones.casos_de_uso).toEqual({ items: [{ title: "WhatsApp + Contact Center", detail: "Centralizar conversaciones", price: "" }] });
    expect(p.secciones.inversion).toBe(firmada.inversionData);
    expect(p.secciones.nivel_servicio).toEqual(seccionesDelServicio(smartloop).nivel_servicio);
    expect(p.proyecto).toEqual({ id: "p1", nombre: "Cayalá · SmartLoop" });
    expect(p.avisos.join(" ")).toContain("SLA: Cayalá + Smarteam");
  });

  it("no le cambia el servicio a un proyecto que ya tiene otro, y sin firmada lo avisa", () => {
    const p = planDeLaPropuestaInterna({ cliente: "Colby", servicio: smartloop, firmada: null, proyecto: { id: "p", nombre: "Colby", servicioRecurrente: "soporte-hubspot" } });
    expect(p.proyecto).toBeNull();
    expect(p.secciones.casos_de_uso).toBeUndefined();
    expect(p.avisos.some((a) => a.includes("No se encontró una propuesta"))).toBe(true);
    expect(p.avisos.some((a) => a.includes("ya es otro servicio"))).toBe(true);
  });

  it("Wherex nunca entra", () => {
    expect(esClienteVedado("Wherex")).toBe(true);
    expect(esClienteVedado("WHEREX Chile")).toBe(true);
    expect(esClienteVedado("Grupo Inve")).toBe(false);
  });
});
