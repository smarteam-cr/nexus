/**
 * Los recorridos guiados: el registro, la cookie de lo visto y el filtro por rol.
 *
 * Lo que frena el merge (DECISIONS §Recorridos):
 *  · un ancla citada que no existe en el código (el paso se caería en silencio de cada recorrido);
 *  · un `recorrido="…"` en una cabecera que no está en el registro (el botón no se pintaría);
 *  · un rol que no existe, un id que la cookie no puede guardar, un texto en voseo o largo de más.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TeamRole } from "@prisma/client";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";
import { formasDeVoseo } from "@/lib/ui/voseo";
import { RECORRIDOS, recorridoPorId } from "./registro";
import { escribirVistos, estadoDe, leerVistos, marcarVisto } from "./vistos";
import { pasosDelRol, recorridoActual, recorridoDeLaRuta, recorridosDelRol } from "./filtro";
import { accionesDelPaso, type Recorrido } from "./tipos";

const FUENTES = [...listarTsx("app"), ...listarTsx("components")];
const CODIGO = FUENTES.map((rel) => ({ rel, texto: fs.readFileSync(path.join(RAIZ, rel), "utf8") }));

/** La forma de un ancla: minúsculas, números y guiones, separados por puntos (`preventa.escala.areas`, `que-sigue`). */
const FORMA_DE_ANCLA = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/**
 * Las anclas que el código declara: `data-recorrido="x"` o `data-recorrido={cond ? "x" : …}`. De la
 * condición no se cuentan los literales con que se compara (`titulo === "Contacto"`): no son anclas, y
 * si contaran, un paso que citara «Contacto» pasaría por bueno sin existir.
 */
function anclasDelCodigo(): Set<string> {
  const out = new Set<string>();
  for (const { texto } of CODIGO) {
    for (const m of texto.matchAll(/data-recorrido=(?:"([^"]+)"|\{([^}]*)\})/g)) {
      if (m[1] && FORMA_DE_ANCLA.test(m[1])) out.add(m[1]);
      if (m[2]) {
        const cond = m[2];
        for (const q of cond.matchAll(/"([^"]*)"/g)) {
          const fin = (q.index ?? 0) + q[0].length;
          const comparado = /[!=]==?\s*$/.test(cond.slice(0, q.index)) || /^\s*[!=]==?/.test(cond.slice(fin));
          if (!comparado && FORMA_DE_ANCLA.test(q[1])) out.add(q[1]);
        }
      }
    }
  }
  return out;
}

function rolesDelSchema(): TeamRole[] {
  const schema = fs.readFileSync(path.join(RAIZ, "prisma", "schema.prisma"), "utf8");
  const bloque = schema.match(/enum TeamRole \{([^}]*)\}/);
  if (!bloque) throw new Error("No encontré enum TeamRole en el schema");
  return bloque[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean) as TeamRole[];
}

describe("el registro de recorridos", () => {
  it("cada recorrido tiene un id que la cookie puede guardar, único, y una versión entera", () => {
    const ids = RECORRIDOS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RECORRIDOS) {
      expect(r.id, r.id).toMatch(/^[a-z0-9-]+$/);
      expect(Number.isInteger(r.version) && r.version >= 1, `${r.id}: versión`).toBe(true);
      expect(r.pasos.length, `${r.id}: sin pasos`).toBeGreaterThan(0);
    }
  });

  it("las anclas del código son solo anclas: los literales de las condiciones no cuentan", () => {
    const anclas = anclasDelCodigo();
    // Las que se ponen con una condición (PasoPreparacion, Identificacion, el mapa de la escala).
    for (const a of ["preventa.preparacion.contacto", "preventa.preparacion.conexion", "preventa.escala.edicion", "escala.nivel"]) {
      expect(anclas.has(a), a).toBe(true);
    }
    for (const literal of ["Contacto", "Conexión", "Escala", "Áreas en juego", "F"]) {
      expect(anclas.has(literal), `«${literal}» es de una condición, no un ancla`).toBe(false);
    }
  });

  it("cada ancla que cita un paso existe en el código", () => {
    const anclas = anclasDelCodigo();
    const faltan = RECORRIDOS.flatMap((r) => r.pasos.filter((p) => !anclas.has(p.ancla)).map((p) => `${r.id} → ${p.ancla}`));
    expect(faltan, `Agrega data-recorrido="…" al elemento que explica cada paso:\n${faltan.join("\n")}`).toEqual([]);
  });

  it("cada `recorrido` que pasa una cabecera está en el registro", () => {
    const usados = new Set<string>();
    for (const { texto } of CODIGO) {
      for (const m of texto.matchAll(/(?<![\w-])recorrido=(?:"([a-z0-9-]+)"|\{[^}]*?"([a-z0-9-]+)"[^}]*\})/g)) usados.add(m[1] ?? m[2]);
    }
    expect(usados.size, "ninguna pantalla usa un recorrido").toBeGreaterThan(0);
    const huerfanos = [...usados].filter((id) => !recorridoPorId(id));
    expect(huerfanos, "Hay cabeceras que piden un recorrido que no existe").toEqual([]);
  });

  it("cada acción que pide un recorrido la escucha alguna pantalla", () => {
    const eventos = new Set(RECORRIDOS.flatMap((r) => [...(r.alArrancar ?? []), ...r.pasos.flatMap((p) => accionesDelPaso(p))]).map((a) => a.evento));
    const sinQuien = [...eventos].filter((ev) => !CODIGO.some(({ texto }) => texto.includes("EVENTO_DEL_RECORRIDO") && texto.includes(`"${ev}"`)));
    expect(sinQuien, "Ninguna pantalla escucha estos eventos del recorrido (EVENTO_DEL_RECORRIDO)").toEqual([]);
  });

  it("los roles existen en el schema", () => {
    const validos = new Set(rolesDelSchema());
    for (const r of RECORRIDOS) {
      const roles = [...(r.roles === "todos" ? [] : r.roles), ...r.pasos.flatMap((p) => p.roles ?? [])];
      for (const rol of roles) expect(validos.has(rol), `${r.id}: rol ${rol}`).toBe(true);
    }
  });

  it("la ruta calza con su ejemplo y el ejemplo de otra pantalla no", () => {
    for (const r of RECORRIDOS) {
      expect(r.ruta.test(r.ejemplo), `${r.id}: ${r.ejemplo}`).toBe(true);
      expect(r.ruta.test(r.irA.href) && r.irA.href !== r.ejemplo, `${r.id}: «Ver» lleva a la misma pantalla que debe arrancar`).toBe(false);
    }
  });

  it("los textos están en tuteo y son cortos", () => {
    const textos = RECORRIDOS.flatMap((r) => [
      r.titulo,
      r.descripcion,
      r.rotulo,
      r.invitacion.titulo,
      r.invitacion.texto,
      r.irA.aviso ?? "",
      ...r.pasos.flatMap((p) => [p.titulo, p.texto]),
    ]);
    const voseo = textos.flatMap((t) => formasDeVoseo(t).map((w) => `«${w}» en «${t}»`));
    expect(voseo, "Pasa al tuteo").toEqual([]);
    for (const r of RECORRIDOS) {
      for (const p of r.pasos) {
        expect(p.titulo.length, `${r.id}: título largo «${p.titulo}»`).toBeLessThanOrEqual(60);
        expect(p.texto.length, `${r.id}: texto largo «${p.titulo}»`).toBeLessThanOrEqual(220);
      }
    }
  });
});

describe("lo visto, en la cookie", () => {
  const rec: Pick<Recorrido, "id" | "version"> = { id: "ficha-cliente", version: 2 };

  it("ida y vuelta", () => {
    const v = marcarVisto(marcarVisto({}, rec, "v"), { id: "bienvenida", version: 1 }, "s");
    expect(leerVistos(escribirVistos(v))).toEqual(v);
    expect(escribirVistos(v)).toBe("ficha-cliente.2.v~bienvenida.1.s");
  });

  it("nuevo, cambió o visto", () => {
    expect(estadoDe(rec, {})).toBe("nuevo");
    expect(estadoDe(rec, { "ficha-cliente": { version: 1, como: "v" } })).toBe("cambio");
    expect(estadoDe(rec, { "ficha-cliente": { version: 2, como: "s" } })).toBe("visto");
  });

  it("una cookie rota o codificada no rompe nada", () => {
    expect(leerVistos(null)).toEqual({});
    expect(leerVistos("basura~x.y.z~ficha-cliente.0.v~OTRO.1.v")).toEqual({});
    expect(leerVistos("ficha-cliente.3.v%7Ebienvenida.1.s")).toEqual({
      "ficha-cliente": { version: 3, como: "v" },
      bienvenida: { version: 1, como: "s" },
    });
    expect(leerVistos("%E0%A4%A")).toEqual({});
  });
});

describe("el filtro por rol", () => {
  const prueba: Recorrido = {
    ...RECORRIDOS[0],
    id: "prueba",
    roles: ["CSE", "CSL"],
    pasos: [
      { ancla: "a", titulo: "Uno", texto: "Para todos." },
      { ancla: "b", titulo: "Dos", texto: "Solo CSL.", roles: ["CSL"] },
    ],
  };

  it("sin rol no hay recorridos; con rol, los suyos", () => {
    expect(recorridosDelRol(null, [prueba])).toEqual([]);
    expect(recorridosDelRol("VENTAS", [prueba])).toEqual([]);
    expect(recorridosDelRol("CSE", [prueba])).toEqual([prueba]);
  });

  it("los pasos de otro rol no salen", () => {
    expect(pasosDelRol(prueba, "CSE").map((p) => p.ancla)).toEqual(["a"]);
    expect(pasosDelRol(prueba, "CSL").map((p) => p.ancla)).toEqual(["a", "b"]);
  });

  it("dirección ve todos los recorridos y todos sus pasos, para poder revisarlos", () => {
    expect(recorridosDelRol("SUPER_ADMIN", [prueba])).toEqual([prueba]);
    expect(pasosDelRol(prueba, "SUPER_ADMIN").map((p) => p.ancla)).toEqual(["a", "b"]);
  });

  it("una pieza abierta manda sobre el recorrido de la dirección", () => {
    const ficha = { ...prueba, id: "ficha", ruta: /^\/clients\/[^/]+$/, porPantalla: undefined };
    const pieza = { ...prueba, id: "pieza", ruta: /^\/clients\/[^/]+$/, porPantalla: true };
    expect(recorridoActual("/clients/x", null, [pieza, ficha])?.id).toBe("ficha");
    expect(recorridoActual("/clients/x", "pieza", [pieza, ficha])?.id).toBe("pieza");
    expect(recorridoActual("/sales", "pieza", [pieza, ficha])).toBeNull();
  });

  it("la ficha del cliente es su ruta y no la configuración del cliente", () => {
    const ficha = recorridoPorId("ficha-cliente")!;
    expect(recorridoDeLaRuta("/clients/abc", [ficha])).toBe(ficha);
    expect(recorridoDeLaRuta("/clients/abc/settings", [ficha])).toBeNull();
    expect(recorridoDeLaRuta("/clients", [ficha])).toBeNull();
  });
});
