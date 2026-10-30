/**
 * lib/contexto/reuniones-de-la-planificacion.int.test.ts — LA PLANIFICACIÓN LEE LAS REUNIONES DEL PROYECTO, contra una
 * base REAL (2026-10-29, Elías con la de SmartAgro de Liliana).
 *
 * El caso: una planificación nueva no leía ninguna reunión hasta que alguien tocaba «Usar» en cada una (etapa 7, «solo las
 * elegidas»), y salía de la memoria y del handoff. Liliana la vio vacía y la llenó sacando y volviendo a poner las
 * reuniones, que es lo que las elige. Ahora entran solas, como en el diagnóstico, las del proyecto CON EL CLIENTE que
 * dejaron texto (`reunionesQueEntranSolasALaPlanificacion`). Lo que se prueba con filas reales, por el chokepoint:
 *   · entran la de transcripción y la de solo notas de Gemini, sin que nadie las elija;
 *   · no entran la sacada («Sacar» = `false`), la futura, la que no dejó texto, la de puertas adentro (espera un «Usar»)
 *     ni ⛔ la de OTRO cliente colgada del proyecto;
 *   · el material de la planificación las lee (y sin ellas, el de antes no leía ninguna);
 *   · leer no escribe: ningún vínculo pasa a `true` solo.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega VACÍA a cada caso.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));

import { prisma } from "@/lib/db/prisma";
import { reunionesQueEntranSolasALaPlanificacion } from "./sugerencias-del-documento-server";
import { cargarMaterialDelDocumento } from "./material-del-documento";
import { documentoConContexto } from "./documento";

const AHORA = new Date(Date.UTC(2026, 9, 29, 18));
/** El texto repetido hasta `n` caracteres. */
const largo = (t: string, n: number) => Array.from({ length: Math.ceil(n / (t.length + 1)) }, () => t).join(" ");

async function mundo() {
  await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteamcr.com"] } });
  const agro = await prisma.client.create({ data: { name: "Agro (test)", emailDomains: ["agro.test"] } });
  const otro = await prisma.client.create({ data: { name: "Otro (test)", emailDomains: ["otro.test"] } });
  const proyecto = await prisma.project.create({ data: { clientId: agro.id, name: "Agro - Implementación" } });
  const conElCliente = ["heilyn@agro.test", "csm@smarteamcr.com"];
  const reunion = (id: string, dia: number, extra: { transcript?: string; summary?: string; participants?: string[]; clientId?: string } = {}) =>
    prisma.firefliesSession.create({
      data: {
        id,
        title: `Reunión ${id}`,
        date: new Date(Date.UTC(2026, 9, dia, 15)),
        participants: extra.participants ?? conElCliente,
        resolvedClientId: extra.clientId ?? agro.id,
        // Con texto de verdad: el predicado único (lib/sessions/tiene-texto.ts) pide 200 caracteres de transcripción o 400
        // de notas de Gemini (`summary.overview`).
        transcript: extra.transcript ? largo(extra.transcript, 300) : null,
        summary: extra.summary ? { overview: largo(extra.summary, 450) } : undefined,
      },
    });
  await Promise.all([
    reunion("ses-transcripcion", 20, { transcript: "Heilyn: el pipeline de diagnóstico técnico tiene cuatro etapas." }),
    reunion("ses-solo-notas", 22, { summary: "Se acordó separar la compra de pruebas en su propio pipeline." }),
    reunion("ses-sin-texto", 23),
    reunion("ses-interna", 24, { transcript: "Revisión interna del precio.", participants: ["csm@smarteamcr.com", "pm@smarteamcr.com"] }),
    reunion("ses-sacada", 25, { transcript: "Una reunión que el equipo sacó." }),
    reunion("ses-futura", 31, { transcript: "Todavía no pasó." }),
    reunion("ses-de-otro", 26, { transcript: "Lo que dijo otro cliente.", clientId: otro.id, participants: ["ana@otro.test", "csm@smarteamcr.com"] }),
  ]);
  await prisma.sessionProject.createMany({
    data: [
      { sessionId: "ses-transcripcion", projectId: proyecto.id },
      { sessionId: "ses-solo-notas", projectId: proyecto.id },
      { sessionId: "ses-sin-texto", projectId: proyecto.id },
      { sessionId: "ses-interna", projectId: proyecto.id },
      { sessionId: "ses-sacada", projectId: proyecto.id, planningOverride: false },
      { sessionId: "ses-futura", projectId: proyecto.id },
      // El vínculo envenenado: una reunión de otro cliente colgada del proyecto.
      { sessionId: "ses-de-otro", projectId: proyecto.id },
    ],
  });
  return { proyecto };
}

describe("la planificación lee las reuniones del proyecto con texto (2026-10-29) — DB real", () => {
  it("entran solas la de transcripción y la de solo notas; nada de lo que no va", async () => {
    const { proyecto } = await mundo();
    const solas = await reunionesQueEntranSolasALaPlanificacion(proyecto.id, AHORA);
    expect(solas).toEqual(["ses-solo-notas", "ses-transcripcion"]);
  });

  it("el material de la planificación las lee; sin ellas no leía ninguna (lo que le pasó a SmartAgro)", async () => {
    const { proyecto } = await mundo();
    const doc = documentoConContexto("planning")!;
    const antes = await cargarMaterialDelDocumento(proyecto.id, doc);
    expect(antes.sesionesUsadas).toEqual([]);
    expect(antes.avisoSinReuniones).not.toBe("");

    const solas = await reunionesQueEntranSolasALaPlanificacion(proyecto.id, AHORA);
    const material = await cargarMaterialDelDocumento(proyecto.id, doc, { sumarReuniones: solas });
    expect(new Set(material.sesionesUsadas)).toEqual(new Set(["ses-transcripcion", "ses-solo-notas"]));
    expect(material.avisoSinReuniones).toBe("");
    expect(material.reuniones).toContain("cuatro etapas");
    expect(material.reuniones).not.toContain("otro cliente");
  });

  it("⛔ una de otro cliente nunca entra, aunque venga en la lista de las que se suman", async () => {
    const { proyecto } = await mundo();
    const material = await cargarMaterialDelDocumento(proyecto.id, documentoConContexto("planning")!, { sumarReuniones: ["ses-de-otro"] });
    expect(material.sesionesUsadas).not.toContain("ses-de-otro");
  });

  it("leer no escribe: ningún vínculo pasa a `true` solo", async () => {
    const { proyecto } = await mundo();
    await reunionesQueEntranSolasALaPlanificacion(proyecto.id, AHORA);
    const elegidas = await prisma.sessionProject.count({ where: { projectId: proyecto.id, planningOverride: true } });
    expect(elegidas).toBe(0);
  });
});
