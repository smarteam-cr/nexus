/**
 * lib/exploraciones/lo-que-confirmo-el-equipo.int.test.ts — «Lo que confirmó el equipo» contra una base REAL (etapa 1 del
 * plan maestro de «Hablar con Nexus», 23 nov): junta las notas de TODAS las preventas de la empresa, nunca las de otra
 * empresa ni un hecho que quedó con otro cliente; la memoria interna las lee enteras y la del cliente solo los hechos que
 * describen a la empresa; los casos de uso las leen cortadas para el cliente.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/lo-que-confirmo-el-equipo.int.test.ts --project integration
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { loConfirmadoParaLosCasos, loQueConfirmoElEquipo } from "./lo-que-confirmo-el-equipo-server";

/* La memoria se importa adentro de cada caso: importarla al cargar el archivo trababa el TRUNCATE de la base de prueba
   (test/setup.integration.ts) por más de 10 s. */
const memoriaDeLaCuenta: typeof import("@/lib/memoria").memoriaDeLaCuenta = async (...a) => (await import("@/lib/memoria")).memoriaDeLaCuenta(...a);

const EMAIL = "liz@smarteam.test";
const S = (que: string) => `SECRETO-${que}`;

async function empresa(nombre: string) {
  return (await prisma.client.create({ data: { name: nombre, kind: "PROSPECTO" }, select: { id: true } })).id;
}

/** Una preventa con una nota de «Lo que sabes del cliente», escrita por Liz en `en`. */
async function preventaConNota(clientId: string, clave: string, texto: string, en: string, o: { archivada?: boolean } = {}) {
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId,
      creadaPor: EMAIL,
      contenido: { notas: { [clave]: texto }, autoresDeLasNotas: { [clave]: { por: EMAIL, en } } },
      ...(o.archivada ? { archivadaEn: new Date() } : {}),
    },
    select: { id: true },
  });
  return e.id;
}

const hecho = (clientId: string, exploracionId: string, notaClave: string, tipo: string, frase: string) => ({
  clientId,
  exploracionId,
  notaClave,
  dichoPorEmail: EMAIL,
  tipo,
  frase,
  cita: frase.slice(0, 30),
  citaFuente: "texto",
  huella: `${tipo}|${frase}`,
  fechaDeLaReunion: new Date("2026-11-21T15:00:00Z"),
});

async function sembrar() {
  await prisma.teamMember.create({ data: { name: "Liz Flores", email: EMAIL } });
  const a = await empresa("Cemaco de prueba");
  const b = await empresa("Otra empresa de prueba");
  const vieja = await preventaConNota(a, "sabido:mi0aaaaa111", `Usan un Excel para cobrar ${S("nota-vieja")}`, "2026-10-01T15:00:00.000Z", { archivada: true });
  const nueva = await preventaConNota(a, "sabido:mi0bbbbb222", `Andrés decide y no confía en HubSpot ${S("nota-nueva")}`, "2026-11-20T15:00:00.000Z");
  const deB = await preventaConNota(b, "sabido:mi0ccccc333", `Nota de la otra empresa ${S("de-otra-empresa")}`, "2026-11-21T15:00:00.000Z");
  await prisma.hechoDeReunion.createMany({
    data: [
      hecho(a, vieja, "sabido:mi0aaaaa111", "proceso_hoy", "Cobran con un Excel compartido"),
      hecho(a, nueva, "sabido:mi0bbbbb222", "cuenta", "Crédito y cobro contacta a 4.800 clientes al mes"),
      hecho(a, nueva, "sabido:mi0bbbbb222", "persona", `Andrés decide la compra ${S("persona")}`),
      hecho(b, deB, "sabido:mi0ccccc333", "cuenta", `La otra empresa tiene 30 sucursales ${S("hecho-de-otra")}`),
      // Un hecho que quedó por error con la empresa B pero colgado de la preventa de A: no se lee en ninguna de las dos.
      hecho(b, nueva, "sabido:mi0bbbbb222", "cuenta", `Cruzado ${S("hecho-cruzado")}`),
    ],
  });
  return { a, b, vieja, nueva };
}

describe("lo que confirmó el equipo de una empresa", () => {
  it("interno: las notas de todas sus preventas, la más nueva primero, con quién y sus hechos; nada de otra empresa", async () => {
    const { a, vieja, nueva } = await sembrar();
    const notas = await loQueConfirmoElEquipo(a, "interno");
    expect(notas.map((n) => n.preventa.id)).toEqual([nueva, vieja]);
    expect(notas.map((n) => n.preventa.archivada)).toEqual([false, true]);
    expect(notas[0].autor).toBe("Liz Flores");
    expect(notas[0].hechos.map((h) => h.tipo).sort()).toEqual(["cuenta", "persona"]);
    expect(notas[1].hechos.map((h) => h.frase)).toEqual(["Cobran con un Excel compartido"]);
    const todo = JSON.stringify(notas);
    expect(todo).not.toContain(S("de-otra-empresa"));
    expect(todo).not.toContain(S("hecho-de-otra"));
    expect(todo).not.toContain(S("hecho-cruzado"));
  });

  it("⛔ cliente: sin el texto de la nota, sin quién la escribió y sin lo que dice de una persona", async () => {
    const { a } = await sembrar();
    const notas = await loQueConfirmoElEquipo(a, "cliente");
    const todo = JSON.stringify(notas);
    expect(todo.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
    expect(todo).not.toContain("Liz Flores");
    expect(notas.flatMap((n) => n.hechos.map((h) => h.frase)).sort()).toEqual(["Cobran con un Excel compartido", "Crédito y cobro contacta a 4.800 clientes al mes"]);
  });

  it("la memoria de la cuenta: entera para el chat de Nexus, cortada para el kickoff, y nada de otra empresa", async () => {
    const { a, b } = await sembrar();
    const interna = (await memoriaDeLaCuenta(a, { lector: "nexus-chat" })).texto;
    expect(interna).toContain("## Lo que confirmó el equipo de Smarteam");
    expect(interna).toContain(S("nota-nueva"));
    expect(interna).toContain(S("persona"));
    expect(interna).not.toContain(S("de-otra-empresa"));

    const kickoff = await memoriaDeLaCuenta(a, { lector: "kickoff" });
    expect(kickoff.texto.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
    expect(kickoff.texto).toContain("- De la cuenta: Crédito y cobro contacta a 4.800 clientes al mes");
    expect(kickoff.partes.find((p) => p.clave === "equipo")?.interno).toBe(false);

    const deB = (await memoriaDeLaCuenta(b, { lector: "nexus-chat" })).texto;
    expect(deB).toContain(S("de-otra-empresa"));
    expect(deB).not.toContain(S("nota-nueva"));
    expect(deB).not.toContain(S("hecho-cruzado"));
  });

  it("el cuestionario no la recibe (lo abre el cliente sin que nadie lo revise)", async () => {
    const { a } = await sembrar();
    const m = await memoriaDeLaCuenta(a, { lector: "cuestionario" });
    expect(m.texto).not.toContain("Lo que confirmó el equipo");
  });

  it("los casos de uso la leen cortada para el cliente", async () => {
    const { a, nueva } = await sembrar();
    const t = await loConfirmadoParaLosCasos(nueva, a);
    expect(t).toContain("Crédito y cobro contacta a 4.800 clientes al mes");
    expect(t).toContain("Cobran con un Excel compartido");
    expect(t.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
  });
});
