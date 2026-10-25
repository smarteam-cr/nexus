import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  armarSaludDeLasReuniones,
  conAlguienDeFuera,
  cuantoEspera,
  direccionDeLaSalud,
  leerVistaDeLaSalud,
  vencioSinEmpresa,
  type PersonaDelEquipo,
  type ReunionParaLaSalud,
} from "./salud-de-las-reuniones";

/**
 * lib/sessions/salud-de-las-reuniones.test.ts — EL TABLERO DE SALUD DE LAS REUNIONES (T1) arma lo que dice la pantalla.
 *
 * Lo que se cuida: qué reuniones entran (con alguien de fuera, ya ocurridas; sin empresa solo si tienen texto), cómo se
 * cuentan los números y el porcentaje (sobre las que tienen empresa), quién ve qué con «solo las tuyas», los motivos
 * agrupados por quién lo arregla y el orden de las sin empresa.
 */

const AHORA = new Date("2026-10-25T18:00:00Z");
const hace = (horas: number) => new Date(+AHORA - horas * 3_600_000);
const PROPIOS = new Set(["smarteamcr.com"]);
const LIZ = "liz@smarteamcr.com";
const MARCO = "marco@smarteamcr.com";
const EQUIPO = new Map<string, PersonaDelEquipo>([
  [LIZ, { email: LIZ, nombre: "Liz Navarro", detalle: "Customer Success" }],
  [MARCO, { email: MARCO, nombre: "Marco Rojas", detalle: "Ventas" }],
]);

let n = 0;
function reunion(p: Partial<ReunionParaLaSalud> = {}): ReunionParaLaSalud {
  n++;
  return {
    id: `r${n}`,
    titulo: `Reunión ${n}`,
    fecha: hace(72),
    duracion: 60,
    organizador: LIZ,
    participantes: [LIZ, "ana@cliente.test"],
    empresaId: "c1",
    empresa: "Cemaco",
    clase: "transcripcion",
    leida: true,
    enrichedAt: hace(70),
    enrichAttempts: 1,
    enrichError: null,
    googleDocId: "doc",
    tieneNotas: false,
    canceladaEn: null,
    ...p,
  };
}

const armar = (filas: ReunionParaLaSalud[], soloDe: string | null = null) =>
  armarSaludDeLasReuniones(filas, { ahora: AHORA, propios: PROPIOS, equipo: EQUIPO, encargadas: new Map([["c1", "Liz Navarro"]]), soloDe });

describe("qué reuniones entran", () => {
  it("solo con alguien de fuera: una de puertas adentro, o sin nadie de fuera, no", () => {
    expect(conAlguienDeFuera({ organizador: LIZ, participantes: [LIZ, MARCO] }, PROPIOS)).toBe(false);
    expect(conAlguienDeFuera({ organizador: LIZ, participantes: [LIZ, "sala@resource.calendar.google.com"] }, PROPIOS)).toBe(false);
    expect(conAlguienDeFuera({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"] }, PROPIOS)).toBe(true);
  });

  it("una sin empresa y sin texto no entra (no hay contexto que se pierda); una futura tampoco", () => {
    const s = armar([reunion({ empresaId: null, empresa: null, clase: "nada" }), reunion({ fecha: new Date(+AHORA + 3_600_000) })]);
    expect(s.reuniones).toEqual([]);
  });
});

describe("los números", () => {
  it("el porcentaje es de las reuniones CON empresa; las sin empresa con texto van aparte", () => {
    const s = armar([
      reunion({ clase: "transcripcion", leida: true }),
      reunion({ clase: "solo_notas", leida: false }),
      reunion({ clase: "nada", leida: false }),
      reunion({ clase: "nada", leida: false }),
      reunion({ empresaId: null, empresa: null, clase: "transcripcion", enrichedAt: hace(72) }),
      reunion({ empresaId: null, empresa: null, clase: "solo_notas", enrichedAt: hace(5) }),
    ]);
    expect(s.totales).toMatchObject({ conEmpresa: 4, transcripcion: 1, soloNotas: 1, sinNada: 2, conTexto: 2, leidas: 1, sinEmpresa: 2, sinEmpresaVencidas: 1, porcentaje: 50 });
  });

  it("sin reuniones con empresa, el porcentaje es null (no un 0 que asusta)", () => {
    expect(armar([]).totales.porcentaje).toBeNull();
  });
});

describe("por persona y por empresa", () => {
  it("cada persona cuenta las que organizó o a las que la invitaron; primero quien dejó menos texto", () => {
    const s = armar([
      reunion({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"], clase: "transcripcion" }),
      reunion({ organizador: MARCO, participantes: [MARCO, LIZ, "ana@cliente.test"], clase: "nada" }),
      reunion({ organizador: MARCO, participantes: [MARCO, "ana@cliente.test"], clase: "nada" }),
    ]);
    expect(s.personas.map((p) => [p.nombre, p.total, p.porcentaje])).toEqual([
      ["Marco Rojas", 2, 0],
      ["Liz Navarro", 2, 50],
    ]);
    expect(s.empresas).toHaveLength(1);
    expect(s.empresas[0]).toMatchObject({ nombre: "Cemaco", detalle: "Liz Navarro", total: 3 });
    expect(s.personas[0].reuniones.map((r) => r.delEquipo)).toContainEqual(["Marco Rojas"]);
  });

  it("«solo las tuyas» filtra todo, también los números", () => {
    const s = armar(
      [reunion({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"] }), reunion({ organizador: MARCO, participantes: [MARCO, "ana@cliente.test"], clase: "nada" })],
      LIZ,
    );
    expect(s.reuniones).toHaveLength(1);
    expect(s.totales).toMatchObject({ conEmpresa: 1, porcentaje: 100 });
    expect(s.personas.map((p) => p.nombre)).toEqual(["Liz Navarro"]);
  });
});

describe("sin texto: por qué", () => {
  it("cada una con su motivo, agrupadas por quién lo arregla (Google primero, lo que se resuelve solo al final)", () => {
    const s = armar([
      reunion({ clase: "nada", googleDocId: null }), // no_se_grabo → Google Workspace
      reunion({ clase: "nada", googleDocId: null, canceladaEn: hace(80) }), // cancelada → nada que hacer
      reunion({ clase: "nada", googleDocId: "doc" }), // documento vacío → Google Workspace
    ]);
    expect(s.motivos.map((g) => [g.dueno, g.cuantas])).toEqual([
      ["google_workspace", 2],
      ["nada", 1],
    ]);
    const nada = s.reuniones.filter((r) => r.estado === "nada");
    expect(nada.every((r) => !!r.motivo)).toBe(true);
    expect(nada.every((r) => r.leida === null)).toBe(true);
  });
});

describe("sin empresa", () => {
  it("primero las que llevan más esperando; marca las de más de 48 horas y dice quién de fuera estuvo", () => {
    const s = armar([
      reunion({ empresaId: null, empresa: null, enrichedAt: hace(10), participantes: [LIZ, "ana@cliente.test"] }),
      reunion({ empresaId: null, empresa: null, clase: "solo_notas", enrichedAt: hace(100), participantes: [MARCO, "pablo@datasur.io", "eva@datasur.io"], organizador: MARCO }),
    ]);
    expect(s.sinEmpresa.map((r) => [r.horasEsperando, r.vencida, r.texto])).toEqual([
      [100, true, "solo_notas"],
      [10, false, "transcripcion"],
    ]);
    expect(s.sinEmpresa[0].deFuera).toEqual({ primero: "pablo@datasur.io", cuantos: 2, dominios: ["datasur.io"] });
    expect(s.sinEmpresa[0].organizo).toBe("Marco Rojas");
    expect(s.sinEmpresa[0].motivo).toContain("Lleva 4 días");
  });

  it("cuánto espera, en palabras", () => {
    expect(cuantoEspera(1)).toBe("1 hora");
    expect(cuantoEspera(30)).toBe("30 horas");
    expect(cuantoEspera(100)).toBe("4 días");
  });
});

describe("la dirección de cada vista", () => {
  it("el periodo y la vista viven en la URL; lo de siempre no se escribe", () => {
    expect(direccionDeLaSalud("personas", 14)).toBe("/sessions/salud");
    expect(direccionDeLaSalud("motivos", 30)).toBe("/sessions/salud?vista=motivos&dias=30");
    expect(leerVistaDeLaSalud({ vista: "sin-empresa", dias: "90" })).toEqual({ vista: "sin-empresa", dias: 90 });
    expect(leerVistaDeLaSalud({ vista: "otra", dias: "7" })).toEqual({ vista: "personas", dias: 14 });
  });
});

describe("lo que la revisión pidió cuidar", () => {
  it("«solo las tuyas» incluye las reuniones a las que te invitaron sin organizarlas", () => {
    const s = armar([reunion({ organizador: MARCO, participantes: [MARCO, LIZ, "ana@cliente.test"] })], LIZ);
    expect(s.reuniones).toHaveLength(1);
    expect(s.totales.conEmpresa).toBe(1);
  });

  it("una reunión de puertas adentro no entra a los números aunque tenga empresa y texto", () => {
    const s = armar([reunion({ organizador: LIZ, participantes: [LIZ, MARCO] }), reunion()]);
    expect(s.totales.conEmpresa).toBe(1);
    expect(s.reuniones).toHaveLength(1);
  });

  it("sin reuniones con empresa, la persona va al final; los motivos, del más común al menos", () => {
    const s = armar([
      reunion({ organizador: MARCO, participantes: [MARCO, "ana@cliente.test"], empresaId: null, empresa: null }),
      reunion({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"], clase: "nada", googleDocId: "doc" }),
      reunion({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"], clase: "nada", googleDocId: null }),
      reunion({ organizador: LIZ, participantes: [LIZ, "ana@cliente.test"], clase: "nada", googleDocId: null }),
    ]);
    expect(s.personas.map((p) => p.nombre)).toEqual(["Liz Navarro", "Marco Rojas"]);
    expect(s.motivos[0].motivos.map((m) => [m.motivo, m.cuantas])).toEqual([
      ["no_se_grabo", 2],
      ["documento_vacio", 1],
    ]);
  });

  it("las 48 horas: la MISMA regla que INV47 (desde que llegó el texto; a las 48 en punto ya vence)", () => {
    expect(vencioSinEmpresa({ enrichedAt: hace(48) }, AHORA)).toBe(true);
    expect(vencioSinEmpresa({ enrichedAt: hace(47.9) }, AHORA)).toBe(false);
    expect(vencioSinEmpresa({ enrichedAt: null }, AHORA)).toBe(false);
    const inv47 = fs.readFileSync(path.resolve(__dirname, "../invariantes/reuniones.ts"), "utf8");
    expect(inv47).toContain('import { HORAS_SIN_EMPRESA, vencioSinEmpresa } from "@/lib/sessions/salud-de-las-reuniones";');
    expect(inv47).toContain("vencioSinEmpresa(s, ahora)");
  });

  it("una reunión de una empresa que quien mira no abre va sin enlace; con «Ver todas» se abre la fila entera", () => {
    const filas = Array.from({ length: 25 }, () => reunion());
    const s = armarSaludDeLasReuniones(filas, { ahora: AHORA, propios: PROPIOS, equipo: EQUIPO, empresasQueNoAbre: new Set(["c1"]), verTodas: LIZ });
    expect(s.reuniones.every((r) => r.enlace === false)).toBe(true);
    expect(s.personas.find((p) => p.clave === LIZ)?.reuniones).toHaveLength(25);
    expect(s.empresas[0].reuniones).toHaveLength(20);
  });

  it("⛔ la página: solo la líder de CS y dirección ven a todo el equipo; el resto, solo las suyas", () => {
    const pagina = fs.readFileSync(path.resolve(__dirname, "../../app/(shell)/sessions/salud/page.tsx"), "utf8");
    expect(pagina).toContain("const veTodo = esLiderDeCs(ctx.role);");
    expect(pagina).toContain("soloDe: veTodo ? null : email");
    expect(pagina).toContain("teamMemberId: ctx.teamMember.id");
  });
});

describe("T3 y T4 en el tablero (2026-10-25)", () => {
  it("una sin empresa trae la propuesta de Nexus con su porqué, y quién la puede decidir", () => {
    const sin = reunion({ id: "faco", empresaId: null, empresa: null, organizador: MARCO, participantes: [MARCO, "pablo@facocr.com"] });
    const ctx = { ahora: AHORA, propios: PROPIOS, equipo: EQUIPO, propuestas: new Map([["faco", { tipo: "HUBSPOT" as const, clientId: null, hubspotCompanyId: "hs-faco", nombre: "FACO", dominio: "facocr.com" }]]) };
    const deMarco = armarSaludDeLasReuniones([sin], { ...ctx, quien: { email: MARCO, veTodo: false } }).sinEmpresa[0];
    expect(deMarco.propuesta).toMatchObject({ tipo: "HUBSPOT", nombre: "FACO" });
    expect(deMarco.propuesta?.porque).toMatch(/@facocr\.com/);
    expect(deMarco.puedeDecidir).toBe(true);
    expect(armarSaludDeLasReuniones([sin], { ...ctx, quien: { email: LIZ, veTodo: false } }).sinEmpresa[0].puedeDecidir).toBe(false);
    expect(armarSaludDeLasReuniones([sin], { ...ctx, quien: { email: LIZ, veTodo: true } }).sinEmpresa[0].puedeDecidir).toBe(true);
    expect(armarSaludDeLasReuniones([sin], { ...ctx, quien: null }).sinEmpresa[0]).toMatchObject({ propuesta: expect.anything(), puedeDecidir: false });
  });
  it("el motivo guardado manda sobre el de ahora", () => {
    const nada = reunion({ clase: "nada", googleDocId: null, motivoSinTexto: "documento_vacio" });
    const s = armar([nada]);
    expect(s.motivos.flatMap((g) => g.motivos.map((m) => m.motivo))).toEqual(["documento_vacio"]);
    expect(armar([{ ...nada, motivoSinTexto: "basura" }]).motivos.flatMap((g) => g.motivos.map((m) => m.motivo))).toEqual(["no_se_grabo"]);
  });
});
