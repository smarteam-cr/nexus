/**
 * lib/exploraciones/escala-interna-editable.test.ts — La escala interna editable (8 nov; Elías: «la página de resultados
 * debe verse igual externo que interno, pero interno debe funcionar como un artefacto que se puede editar»).
 *
 * Lo que se cuida:
 *   · las dos operaciones nuevas (`textoDelRadar`, `contextoDeLaEscala`) escriben, borran y rechazan lo que no existe,
 *     sobreviven a la lectura estricta del Json y no pisan lo que otra persona cambió (reintento);
 *   · lo que una persona escribió para una tarjeta sale en la página SOLO mientras la parte siga en ese nivel (una regla);
 *   · ⛔ el contexto de un área NO llega al cliente: lo lee el agente de la descripción;
 *   · la pantalla interna pide todas las áreas, y su ruta pasa la guardia antes;
 *   · el arrastre y el dibujo del radar hablan del mismo radar;
 *   · ⛔ la página pública no recibe nada de la edición: ni `edicion`, ni las piezas que editan.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { radioSobreElEje } from "@/lib/escala/arrastre-del-radar";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { COMPACTO, GRANDE } from "@/lib/escala/radar-de-una-empresa";
import { detallesDelResultado } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type EstimadoGuardado, type Validez } from "./contenido";
import { escalaParaElLienzo } from "./escala-del-lienzo";
import { resultadosDeLaEscala, textoVigenteDelRadar } from "./escala-para-el-cliente";
import { CambiosSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { sePuedeReintentar } from "./reintento";

const RAIZ = process.cwd();
const VALIDEZ: Validez = {
  dimensiones: new Set(["1.1", "1.2", "1.3"]),
  criterios: new Set(),
  areas: new Set(["1", "2", "3"]),
  ediciones: new Set(),
  escalaVersion: "9.0.0",
};
const base = (): EstadoDeExploracion => ({
  contenido: contenidoVacio(),
  propuesta: propuestaVacia(),
  areas: ["1"],
  edicion: null,
  perfilCierre: "con equipo",
  perfilDespues: "continua",
  responsableEmail: null,
  archivada: false,
});
const aplicar = (e: EstadoDeExploracion, ops: Parameters<typeof aplicarOperaciones>[1]) => aplicarOperaciones(e, ops, VALIDEZ, VALIDADOR_ESTRICTO);

describe("las operaciones de la página", () => {
  it("el texto de una tarjeta se escribe con su nivel, se borra con null y no existe para una dimensión inventada", () => {
    const r = aplicar(base(), [{ op: "textoDelRadar", dimensionId: "1.2", valor: { texto: "  Lo que le pasa  ", nivel: "I" } }]);
    expect(r.ok && r.estado.contenido.textosDelRadar).toEqual({ "1.2": { texto: "Lo que le pasa", nivel: "I" } });
    const sin = r.ok ? aplicar(r.estado, [{ op: "textoDelRadar", dimensionId: "1.2", valor: null }]) : r;
    expect(sin.ok && sin.estado.contenido.textosDelRadar).toEqual({});
    expect(aplicar(base(), [{ op: "textoDelRadar", dimensionId: "9.9", valor: { texto: "x", nivel: "I" } }]).ok).toBe(false);
    // Un texto en blanco es borrarlo.
    const blanco = aplicar(base(), [{ op: "textoDelRadar", dimensionId: "1.2", valor: { texto: "   ", nivel: "I" } }]);
    expect(blanco.ok && blanco.estado.contenido.textosDelRadar).toEqual({});
  });

  it("el contexto de un área se escribe, se borra con null o vacío y no existe para un área inventada", () => {
    const r = aplicar(base(), [{ op: "contextoDeLaEscala", areaId: "2", texto: "Hablamos con su gerente" }]);
    expect(r.ok && r.estado.contenido.contextoDeLaEscala).toEqual({ "2": "Hablamos con su gerente" });
    const vacio = r.ok ? aplicar(r.estado, [{ op: "contextoDeLaEscala", areaId: "2", texto: "" }]) : r;
    expect(vacio.ok && vacio.estado.contenido.contextoDeLaEscala).toEqual({});
    expect(aplicar(base(), [{ op: "contextoDeLaEscala", areaId: "7", texto: "x" }]).ok).toBe(false);
  });

  it("el esquema estricto acepta las dos operaciones, con sus topes, y la lectura del Json las conserva", () => {
    const ok = CambiosSchema.safeParse({
      version: 1,
      operaciones: [
        { op: "textoDelRadar", dimensionId: "1.2", valor: { texto: "a", nivel: "F" } },
        { op: "contextoDeLaEscala", areaId: "1", texto: null },
      ],
    });
    expect(ok.success).toBe(true);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "textoDelRadar", dimensionId: "1.2", valor: { texto: "a", nivel: "Z" } }] }).success).toBe(
      false,
    );
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "contextoDeLaEscala", areaId: "1", texto: "x".repeat(5000) }] }).success).toBe(false);
    const leido = leerContenido({
      textosDelRadar: { "1.2": { texto: "a", nivel: "F" }, malo: { texto: "b", nivel: "F" } },
      contextoDeLaEscala: { "1": "c", x: "d" },
    });
    expect(leido.textosDelRadar).toEqual({ "1.2": { texto: "a", nivel: "F" } });
    expect(leido.contextoDeLaEscala).toEqual({ "1": "c" });
    expect(leerContenido({}).textosDelRadar).toBeUndefined();
  });
});

describe("dos personas editan lo mismo a la vez", () => {
  const con = (texto: string) => ({
    ...base(),
    contenido: { ...contenidoVacio(), textosDelRadar: { "1.2": { texto, nivel: "I" as const } }, contextoDeLaEscala: { "1": texto } },
  });
  it("se reintenta solo si lo que se veía no cambió; si alguien lo cambió, no se pisa", () => {
    const texto = [{ op: "textoDelRadar" as const, dimensionId: "1.2", valor: { texto: "nuevo", nivel: "I" as const } }];
    const contexto = [{ op: "contextoDeLaEscala" as const, areaId: "1", texto: "nuevo" }];
    expect(sePuedeReintentar(texto, con("viejo"), con("viejo"))).toBe(true);
    expect(sePuedeReintentar(texto, con("viejo"), con("de otra persona"))).toBe(false);
    expect(sePuedeReintentar(contexto, con("viejo"), con("viejo"))).toBe(true);
    expect(sePuedeReintentar(contexto, con("viejo"), con("de otra persona"))).toBe(false);
  });
});

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
const area = lienzo.areas[0];
const [a, b] = area.dimensiones.filter((d) => d.aplica);
const conChequeo = (extra: Partial<EstadoDeExploracion["contenido"]> = {}) => ({
  areas: [area.id],
  contenido: {
    ...contenidoVacio(),
    chequeo: { [a.id]: { nivel: "I", fuente: "reunion" } as EstimadoGuardado, [b.id]: { nivel: "F", fuente: "vendedor" } as EstimadoGuardado },
    ...extra,
  },
});
const pestaña = (r: { areaId: string; areaNombre: string }) => ({ id: r.areaId, nombre: r.areaNombre, href: "#" });

describe("lo escrito llega a la página", () => {
  it("UNA regla para el texto de una tarjeta: vale solo en el nivel para el que se escribió", () => {
    const textos = { [a.id]: { texto: "T", nivel: "I" as const } };
    expect(textoVigenteDelRadar(textos, { id: a.id, preguntada: true, nivel: "I" })).toBe("T");
    expect(textoVigenteDelRadar(textos, { id: a.id, preguntada: true, nivel: "F" })).toBeNull();
    expect(textoVigenteDelRadar(textos, { id: a.id, preguntada: false, nivel: "I" })).toBeNull();
    expect(textoVigenteDelRadar(undefined, { id: a.id, preguntada: true, nivel: "I" })).toBeNull();
  });

  it("el texto de una tarjeta sale en la página solo mientras la parte siga en ese nivel", () => {
    const [x] = resultadosDeLaEscala(
      escala,
      lienzo,
      conChequeo({ textosDelRadar: { [a.id]: { texto: "ESCRITO PARA INICIAL", nivel: "I" }, [b.id]: { texto: "ESCRITO PARA OPTIMO", nivel: "O" } } }),
    );
    const detalles = detallesDelResultado(escala, x.resultado);
    expect(detalles[a.id]?.impacto).toBe("ESCRITO PARA INICIAL");
    // La otra está en Funcional y el texto era para Óptimo: vuelve el de la escala.
    expect(detalles[b.id]?.impacto).not.toBe("ESCRITO PARA OPTIMO");
    expect(detalles[b.id]?.impacto).toBeTruthy();
  });

  it("⛔ el contexto de un área no llega a la página del cliente (lo lee el agente de la descripción)", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, conChequeo({ contextoDeLaEscala: { [area.id]: "CONTEXTO PARA EL AGENTE" } }));
    expect(JSON.stringify(x)).not.toContain("CONTEXTO PARA EL AGENTE");
    const html = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r: x.resultado,
        empresa: "Una empresa",
        agenda: "",
        deLaEscala: { areas: [pestaña(x.resultado)], porExplorar: x.porExplorar },
      }),
    );
    expect(html).not.toContain("CONTEXTO PARA EL AGENTE");
    expect(html).not.toMatch(/rd-editable|no la ve el cliente|Solo lo ves tú|Arrastra/);
    // La página pública sigue con su título y su <main>.
    expect(html).toMatch(/<h1 class="rd-nivel"/);
    expect(html).toContain("<main");
  });

  it("la pantalla interna pide todas las áreas: las que no ve el cliente salen «En medición»", () => {
    const todas = resultadosDeLaEscala(
      escala,
      lienzo,
      conChequeo(),
      lienzo.areas.map((x) => x.id),
    );
    expect(todas.map((x) => x.resultado.areaId)).toEqual(lienzo.areas.map((x) => x.id));
    expect(resultadosDeLaEscala(escala, lienzo, conChequeo()).map((x) => x.resultado.areaId)).toEqual([area.id]);
    expect(todas[1].resultado.preguntadas).toBe(0);
  });

  it("con `edicion`: pestañas como botones, la oculta lo dice, el texto de la tarjeta en su lugar, su pie, y sin otro h1 ni <main>", () => {
    const todas = resultadosDeLaEscala(
      escala,
      lienzo,
      conChequeo(),
      lienzo.areas.map((x) => x.id),
    );
    const html = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r: todas[0].resultado,
        empresa: "Una empresa",
        agenda: "",
        deLaEscala: { areas: todas.map((x, i) => ({ ...pestaña(x.resultado), oculta: i > 0 })) },
        edicion: {
          alElegirArea: () => undefined,
          pieDeLaTarjeta: (id: string) => createElement("span", null, `PIE ${id}`),
          textoDeLaTarjeta: (id: string) => createElement("span", null, `EDITABLE ${id}`),
          ayudaDelRadar: "AYUDA INTERNA",
        },
      }),
    );
    expect(html).toContain("rd-editable");
    expect(html).toContain("no la ve el cliente");
    expect(html).toContain(`PIE ${a.id}`);
    expect(html).toContain(`EDITABLE ${a.id}`);
    expect(html).toContain("AYUDA INTERNA");
    expect(html).not.toMatch(/<a [^>]*rd-btn/);
    expect(html).not.toMatch(/<h1|<main/);
  });

  it("mientras se arrastra, el radar dibuja el nivel que va a quedar (también en una parte sin medir)", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, conChequeo());
    const sinMedir = x.resultado.dimensiones.find((d) => !d.preguntada)!;
    const vista = (nivelesEnVivo?: Record<string, "E">) =>
      renderToStaticMarkup(
        createElement(ResultadoDelTestVista, {
          r: x.resultado,
          empresa: "Una empresa",
          agenda: "",
          deLaEscala: { areas: [pestaña(x.resultado)] },
          edicion: { alElegirArea: () => undefined, nivelesEnVivo },
        }),
      );
    const nombreE = escala.niveles.find((n) => n.letra === "E")!.nombre.toLowerCase();
    const etiqueta = (html: string) => html.match(/aria-label="Radar de [^"]*"/)?.[0] ?? "";
    expect(etiqueta(vista())).not.toContain(`${sinMedir.nombre}, ${nombreE}`);
    expect(etiqueta(vista({ [sinMedir.id]: "E" }))).toContain(`${sinMedir.nombre}, ${nombreE}`);
  });
});

describe("el arrastre y el dibujo del radar hablan del mismo radar", () => {
  it("cada eje es una line.rde-eje con su data-d en un svg.rde-interactivo, y sale del centro de las medidas (grande y compacto)", () => {
    const [x] = resultadosDeLaEscala(escala, lienzo, conChequeo());
    const html = renderToStaticMarkup(
      createElement(RadarDeUnaEmpresa, {
        area: "Ventas",
        dimensiones: x.resultado.dimensiones.map((d) => ({
          clave: d.id,
          nombre: d.nombre,
          capa: d.capa,
          preguntada: d.preguntada,
          nivel: d.nivel,
          puntaje: d.puntaje,
        })),
        capas: x.resultado.capas.map((c) => ({ clave: c.clave, nombre: c.nombre, nivel: c.nivel, puntaje: c.puntaje })),
        niveles: escala.niveles,
      }),
    );
    for (const [caja, m] of [
      ["rde-grande", GRANDE],
      ["rde-compacto", COMPACTO],
    ] as const) {
      const parte = html.slice(html.indexOf(`class="${caja}"`));
      const svg = parte.slice(0, parte.indexOf("</svg>"));
      expect(svg).toMatch(/<svg[^>]*class="rde-svg rde-interactivo"/);
      const ejes = [...svg.matchAll(/<line class="rde-eje" data-d="([^"]+)" x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)];
      expect(ejes.length).toBe(x.resultado.dimensiones.length);
      for (const e of ejes) {
        const [x1, y1, x2, y2] = e.slice(2).map(Number);
        // El extremo del eje cae a rEjeHasta del centro de las medidas: la regla del arrastre mide desde ahí.
        expect(radioSobreElEje(m, [x2, y2], { desde: [x1, y1], hasta: [x2, y2] })).toBeCloseTo(m.rEjeHasta, 0);
      }
    }
  });
});

describe("⛔ la página pública no edita, y la interna no se lee sin guardia", () => {
  const archivosDe = (dir: string, acc: string[] = []): string[] => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && !e.name.startsWith(".")) archivosDe(rel, acc);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(rel.split(path.sep).join("/"));
    }
    return acc;
  };

  it("app/external no pasa `edicion` ni monta las piezas que editan", () => {
    const archivos = archivosDe("app/external");
    const mal = archivos.filter((f) =>
      /\bedicion=|PaginaDeLaEscala|TextoEditableDeLaPagina|ArrastreDelRadar|paginaParaElCse|contextoDeLaEscala/.test(
        fs.readFileSync(path.join(RAIZ, f), "utf8"),
      ),
    );
    expect(mal).toEqual([]);
    expect(archivos.some((f) => f.includes("escala"))).toBe(true);
  });

  it("la puerta pública no pide las áreas de la pantalla interna", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/exploraciones/escala-para-el-cliente-server.ts"), "utf8");
    expect(fuente).toMatch(/export async function escalaParaElCliente[\s\S]*?armarLaPagina\(exploracionId, \{ publica: true \}\)/);
  });

  it("`paginaParaElCse` (todas las áreas) solo la llama su ruta, y la ruta pasa la guardia de la exploración antes", () => {
    const usan = ["app", "lib", "components"]
      .flatMap((d) => archivosDe(d))
      .filter((f) => f !== "lib/exploraciones/escala-para-el-cliente-server.ts")
      .filter((f) => /\bpaginaParaElCse\s*\(/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")));
    expect(usan).toEqual(["app/api/sales/exploraciones/[id]/pagina-de-la-escala/route.ts"]);
    const ruta = fs.readFileSync(path.join(RAIZ, usan[0]), "utf8");
    const guardia = ruta.search(/await guardDeLaExploracion\(id, "read"\);\s*if \(guard instanceof NextResponse\) return guard;/);
    expect(guardia).toBeGreaterThan(-1);
    expect(guardia).toBeLessThan(ruta.indexOf("await paginaParaElCse("));
  });
});
