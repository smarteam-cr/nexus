import { describe, expect, it } from "vitest";
import { elegirEtapa, ordenarAvisos, queSigueDelIndice, type AvisoDeCartera } from "./indice";
import { nombresAbiertos } from "./resumen-proyectos";
import type { EtapaParaLaUI } from "@/lib/lifecycle/etapa-ui";

const etapa = (label: string, index: number | null, total = 9): EtapaParaLaUI => ({
  id: label,
  label,
  posicion: index === null ? null : { index, total },
  linea: [],
  tituloDeLaLinea: "Etapas",
  curada: false,
  curadaPorque: null,
  razones: [],
});

const aviso = (tipo: AvisoDeCartera["tipo"], empresa: string): AvisoDeCartera => ({
  tipo,
  clientId: empresa,
  empresa,
  projectId: `${empresa}-p`,
  proyecto: "Implementación HubSpot",
  detalle: "Llegó desde el handoff del 2 oct. No se aplica sola.",
  chip: "chip",
  accion: "Revisar",
  href: "/clients/x",
  delAgente: tipo === "propuesta",
});

describe("la etapa de la fila", () => {
  it("sin proyectos de implementación con etapa, no afirma ninguna", () => {
    expect(elegirEtapa([])).toBeNull();
    expect(elegirEtapa([null])).toBeNull();
  });

  it("con uno, es la suya y no cuenta otros", () => {
    expect(elegirEtapa([etapa("Diagnóstico", 3)])).toEqual({ label: "Diagnóstico", posicion: { index: 3, total: 9 }, otros: 0 });
  });

  it("con dos, la del que va MÁS ATRÁS, y dice cuántos más hay", () => {
    const e = elegirEtapa([etapa("Adopción", 6), etapa("Exploración", 2)]);
    expect(e?.label).toBe("Exploración");
    expect(e?.otros).toBe(1);
  });

  it("una etapa fuera de la línea (Bloqueado) gana sobre cualquier posición", () => {
    expect(elegirEtapa([etapa("Handoff", 1), etapa("Bloqueado", null)])?.label).toBe("Bloqueado");
  });

  it("un proyecto sin etapa cuenta como «otro», pero no se elige", () => {
    const e = elegirEtapa([null, etapa("Entrega", 8)]);
    expect(e?.label).toBe("Entrega");
    expect(e?.otros).toBe(1);
  });
});

describe("necesitan atención", () => {
  it("el orden es propuesta → alta → reuniones, y alfabético dentro de cada tipo", () => {
    const orden = ordenarAvisos([aviso("sesiones", "A"), aviso("alta", "B"), aviso("propuesta", "Z"), aviso("propuesta", "C")]);
    expect(orden.map((a) => `${a.tipo}:${a.empresa}`)).toEqual(["propuesta:C", "propuesta:Z", "alta:B", "sesiones:A"]);
  });

  it("el «Qué sigue» es el primer aviso, con su enlace", () => {
    const q = queSigueDelIndice([aviso("alta", "Logística"), aviso("propuesta", "Andina")], "tuyas");
    expect(q.texto).toContain("Andina tiene una propuesta de cronograma");
    expect(q.href).toBe("/clients/x");
    expect(q.enlace).toBe("Abrir su cronograma →");
  });

  it("sin avisos dice «al día», para la persona o para la cartera, y no ofrece enlace", () => {
    expect(queSigueDelIndice([], "tuyas")).toMatchObject({ href: null, enlace: null });
    expect(queSigueDelIndice([], "tuyas").texto).toMatch(/^Tus cuentas están al día/);
    expect(queSigueDelIndice([], "cartera").texto).toMatch(/^La cartera está al día/);
  });
});

describe("los nombres de los proyectos abiertos", () => {
  const p = (name: string, extra: Partial<Parameters<typeof nombresAbiertos>[0][number]> = {}) => ({
    name,
    status: "active",
    serviceType: "implementacion",
    hubspotServiceId: null,
    hubspotPipelineId: null,
    proyectoInterno: false,
    hermanoCsProjectId: null,
    altaEstado: null,
    ...extra,
  });

  it("solo los abiertos, sin el contenedor de «Información del cliente», en orden alfabético", () => {
    expect(
      nombresAbiertos([
        p("Sitio web"),
        p("Información del cliente", { serviceType: "__strategy__" }),
        p("Implementación HubSpot"),
        p("Rescate viejo", { status: "completed" }),
      ]),
    ).toEqual(["Implementación HubSpot", "Sitio web"]);
  });
});
