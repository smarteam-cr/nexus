/**
 * lib/planificacion/lo-del-cliente.test.ts — lo que el cliente puede escribir en el enlace de la Planificación (L4 etapa 6,
 * 2026-10-27). La frontera: solo su lista, solo sus campos, lo nuevo marcado, y nada más de la sección se toca.
 */
import { describe, it, expect } from "vitest";
import {
  MARCAS_DE_FUERA,
  MARCA_EL_CLIENTE_EDITA,
  aplicarLoDelCliente,
  conLasSeccionesDelCliente,
  CLAVE_QUITADAS_POR_EL_EQUIPO,
  conservarMarcas,
  filasPorRevisar,
  marcarQuitadasPorElEquipo,
  marcarRevisado,
  puedeEscribirElCliente,
  reconciliarConElCliente,
} from "./lo-del-cliente";
import { readFileSync } from "node:fs";
import { CLAVE_DE_CONSTRUCCION } from "./construccion";
import { canalesVacia, fichaVacia, usuariosVacia } from "./brief";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";

const AHORA = "2026-10-27T15:00:00.000Z";
const id = () => "clnuevo";

const usuarios = {
  clienteLaLlena: "si",
  intro: "Quién entra",
  equipos: [{ id: "e1", nombre: "Ventas", permisos: { contactos: { ver: "todo" } } }],
  usuarios: [{ id: "u1", nombre: "Ana", correo: "ana@x.com", autor: "persona" }],
  construccion: { "usuario:u1": { estado: "construido" } },
};

describe("lo que escribe el cliente", () => {
  it("una fila nueva nace del cliente, por revisar, con id del servidor; lo demás no cambia", () => {
    const r = aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "Luis", correo: "luis@x.com", equipoId: "e1" } }, AHORA, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nueva = (r.data.usuarios as Array<Record<string, unknown>>)[1];
    expect(nueva).toMatchObject({ nombre: "Luis", correo: "luis@x.com", equipoId: "e1", autor: "cliente", porRevisar: "si", id: "clnuevo" });
    expect(r.data.equipos).toBe(usuarios.equipos);
    expect(r.data.intro).toBe(usuarios.intro);
    expect(r.data.construccion).toBe(usuarios.construccion);
  });

  it("no puede escribir campos que no son suyos ni tocar los permisos", () => {
    const r = aplicarLoDelCliente(
      usuarios,
      { seccion: "usuarios_permisos", op: "guardar", fila: { id: "u1", nombre: "Ana", autor: "persona", permisos: "todo", origen: "acordado" } },
      AHORA,
      id,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = (r.data.usuarios as Array<Record<string, unknown>>)[0];
    expect(u.permisos).toBeUndefined();
    expect(u.origen).toBeUndefined();
    expect(u.autor).toBe("persona"); // el autor no cambia: sigue siendo de quien la escribió
    expect(u.porRevisar).toBe("si");
  });

  it("solo quita lo suyo, y no inventa equipos", () => {
    expect(aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "quitar", id: "u1" }, AHORA, id)).toMatchObject({ ok: false });
    expect(aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "X", equipoId: "e9" } }, AHORA, id)).toMatchObject({ ok: false });
    expect(aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "X", superAdmin: "tal vez" } }, AHORA, id)).toMatchObject({ ok: false });
    const con = aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "Luis" } }, AHORA, id);
    if (!con.ok) throw new Error("debió guardar");
    const sin = aplicarLoDelCliente(con.data, { seccion: "usuarios_permisos", op: "quitar", id: "clnuevo" }, AHORA, id);
    expect(sin.ok && (sin.data.usuarios as unknown[]).length).toBe(1);
  });

  it("en la ficha solo toca las personas de su lado", () => {
    const ficha = { clienteLaLlena: "si", hubs: [{ hub: "Sales Hub", incluido: "si" }], participantes: [{ id: "p1", nombre: "Caroline", lado: "smarteam" }] };
    expect(aplicarLoDelCliente(ficha, { seccion: "ficha_proyecto", op: "guardar", fila: { id: "p1", nombre: "Otra" } }, AHORA, id)).toMatchObject({ ok: false });
    const r = aplicarLoDelCliente(ficha, { seccion: "ficha_proyecto", op: "guardar", fila: { nombre: "Marta", cargo: "Gerente" } }, AHORA, id);
    expect(r.ok && (r.data.participantes as Array<Record<string, unknown>>)[1]).toMatchObject({ nombre: "Marta", lado: "cliente", autor: "cliente" });
    expect(r.ok && r.data.hubs).toBe(ficha.hubs);
  });

  it("sin nombre no se guarda, y el texto se recorta", () => {
    expect(aplicarLoDelCliente({}, { seccion: "canales_entrada", op: "guardar", fila: { responsable: "Ana" } }, AHORA, id)).toMatchObject({ ok: false });
    const r = aplicarLoDelCliente({}, { seccion: "canales_entrada", op: "guardar", fila: { canal: "x".repeat(500) } }, AHORA, id);
    expect(r.ok && ((r.data.canales as Array<Record<string, string>>)[0].canal.length)).toBe(300);
  });

  it("el CSE marca revisado lo del cliente", () => {
    const r = aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "Luis" } }, AHORA, id);
    if (!r.ok) throw new Error("debió guardar");
    expect(filasPorRevisar(r.data, "usuarios_permisos")).toBe(1);
    expect(filasPorRevisar(marcarRevisado(r.data, "usuarios_permisos"), "usuarios_permisos")).toBe(0);
  });
});

describe("el editor no pierde lo del cliente ni las marcas", () => {
  it("las marcas de fuera vuelven si la sección las omitió, y la clave es la de la construcción", () => {
    expect(MARCAS_DE_FUERA).toContain(CLAVE_DE_CONSTRUCCION);
    expect(conservarMarcas(usuarios, { intro: "x", usuarios: [] })).toMatchObject({ clienteLaLlena: "si", construccion: usuarios.construccion });
    // Cerrar al cliente escribe "no": no se recupera el "si" viejo.
    expect(conservarMarcas(usuarios, { clienteLaLlena: "no" })).toMatchObject({ clienteLaLlena: "no" });
  });

  it("la reconciliación del servidor: lo que el cliente sumó o corrigió no lo pisa un editor viejo", () => {
    const servidor = {
      clienteLaLlena: "si",
      usuarios: [
        { id: "u1", nombre: "Ana", correo: "ana@x.com", porRevisar: "si", editadaPorElClienteEn: "t2" }, // el cliente le puso el correo
        { id: "cl1", nombre: "Luis", autor: "cliente", porRevisar: "si", editadaPorElClienteEn: "t3" }, // la sumó el cliente
      ],
      quitadasPorElCliente: ["cl0"],
    };
    // El editor del CSE se abrió antes: Ana sin correo, y trae una fila que el cliente ya quitó.
    const enviado = { clienteLaLlena: "si", intro: "Nueva intro", usuarios: [{ id: "u1", nombre: "Ana" }, { id: "cl0", nombre: "Vieja", autor: "cliente" }] };
    const r = reconciliarConElCliente(servidor, enviado, "usuarios_permisos") as typeof servidor & { intro: string };
    expect(r.intro).toBe("Nueva intro");
    expect(r.usuarios.map((u) => u.id)).toEqual(["u1", "cl1"]);
    expect(r.usuarios[0]).toMatchObject({ correo: "ana@x.com", porRevisar: "si" });
    expect(r.quitadasPorElCliente).toEqual(["cl0"]);
  });

  it("con la misma marca del cliente, manda el CSE (revisar, corregir); y lo que quitó no vuelve", () => {
    const servidor = { clienteLaLlena: "si", usuarios: [{ id: "cl1", nombre: "Luis", autor: "cliente", porRevisar: "si", editadaPorElClienteEn: "t3" }] };
    const visto = { clienteLaLlena: "si", usuarios: [{ id: "cl1", nombre: "Luis Mora", autor: "cliente", editadaPorElClienteEn: "t3" }] };
    expect((reconciliarConElCliente(servidor, visto, "usuarios_permisos") as typeof servidor).usuarios[0]).toEqual(visto.usuarios[0]);
    // El CSE la quitó: el editor lo anota y el servidor no la vuelve a sumar.
    const quitada = marcarQuitadasPorElEquipo(servidor, { clienteLaLlena: "si", usuarios: [] }, "usuarios_permisos");
    const r = reconciliarConElCliente(servidor, quitada, "usuarios_permisos") as Record<string, unknown>;
    expect(r.usuarios).toEqual([]);
    expect(r[CLAVE_QUITADAS_POR_EL_EQUIPO]).toBeUndefined(); // la nota no se guarda
    // Fuera de una sección abierta, lo que manda el editor tal cual (sin la nota).
    expect(reconciliarConElCliente({ usuarios: [{ id: "x", editadaPorElClienteEn: "t" }] }, { usuarios: [] }, "usuarios_permisos")).toEqual({ usuarios: [] });
  });

  it("lo que quita el cliente queda anotado para que no vuelva", () => {
    const con = aplicarLoDelCliente(usuarios, { seccion: "usuarios_permisos", op: "guardar", fila: { nombre: "Luis" } }, AHORA, id);
    if (!con.ok) throw new Error("debió guardar");
    const sin = aplicarLoDelCliente(con.data, { seccion: "usuarios_permisos", op: "quitar", id: "clnuevo" }, AHORA, id);
    expect(sin.ok && sin.data.quitadasPorElCliente).toEqual(["clnuevo"]);
  });
});

describe("los candados de la escritura del cliente", () => {
  it("publicada, no oculta y abierta: si falta una, no escribe", () => {
    const abierta = { clienteLaLlena: "si" };
    expect(puedeEscribirElCliente({ publicada: true, oculta: false, data: abierta })).toBe(true);
    expect(puedeEscribirElCliente({ publicada: false, oculta: false, data: abierta })).toBe(false);
    expect(puedeEscribirElCliente({ publicada: true, oculta: true, data: abierta })).toBe(false);
    expect(puedeEscribirElCliente({ publicada: true, oculta: false, data: { clienteLaLlena: "no" } })).toBe(false);
    expect(puedeEscribirElCliente({ publicada: true, oculta: false, data: null })).toBe(false);
  });

  it("la acción del enlace pide los candados y la ruta de los bloques reconcilia", () => {
    const accion = readFileSync("app/external/planificacion/actions.ts", "utf-8");
    expect(accion).toMatch(/elegirAcceso\(await accesosDelNavegador\(\), acceso\)/);
    expect(accion).toMatch(/puedeEscribirElCliente\(\{ publicada: !!actual\.project\.planificacionPublishedAt, oculta: entrada\?\.hidden === true, data: bloque\.data \}\)/);
    expect(accion).toMatch(/FOR UPDATE/);
    expect(accion).toMatch(/aplicarLoDelCliente\(/);
    const bloques = readFileSync("app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/route.ts", "utf-8");
    expect(bloques).toMatch(/reconciliarConElCliente\(vigente\[0\]\?\.data \?\? null, body\.data, key\)/);
    expect(bloques).toMatch(/FOR UPDATE/);
  });
});

describe("el enlace", () => {
  const foto = [
    { key: "planificacion", titleOverride: null, eyebrowOverride: null, blocks: [] },
    { key: "usuarios_permisos", titleOverride: null, eyebrowOverride: null, blocks: [{ blockType: "CARD", content: null, data: { usuarios: [] } }] },
    { key: "cierre", titleOverride: null, eyebrowOverride: null, blocks: [] },
  ];

  it("una sección abierta se lee en vivo con la marca; una cerrada, de la foto", () => {
    const vivas = [
      { key: "usuarios_permisos", titleOverride: "Usuarios", eyebrowOverride: null, data: usuarios },
      { key: "canales_entrada", titleOverride: "Canales", eyebrowOverride: null, data: { canales: [] } },
    ];
    const filas = conLasSeccionesDelCliente(foto, vivas);
    expect(filas.map((f) => f.key)).toEqual(["planificacion", "usuarios_permisos", "cierre"]);
    expect(filas[1].blocks[0].data).toMatchObject({ [MARCA_EL_CLIENTE_EDITA]: true, usuarios: usuarios.usuarios });
  });

  it("una abierta que la foto no tenía entra antes de la aprobación", () => {
    const filas = conLasSeccionesDelCliente(foto, [{ key: "canales_entrada", titleOverride: null, eyebrowOverride: null, data: { clienteLaLlena: "si" } }]);
    expect(filas.map((f) => f.key)).toEqual(["planificacion", "usuarios_permisos", "canales_entrada", "cierre"]);
  });

  it("con la marca, una sección vacía se muestra (el cliente ve dónde escribir); sin ella, no", () => {
    for (const [vacia, def] of [[usuariosVacia, "usuarios_permisos"], [canalesVacia, "canales_entrada"], [fichaVacia, "ficha_proyecto"]] as const) {
      expect(vacia({}), def).toBe(true);
      expect(vacia({ [MARCA_EL_CLIENTE_EDITA]: true }), def).toBe(false);
      // La marca nunca entra al esquema del agente ni del chat: no se guarda.
      const props = (PLANIFICACION_DEF_BY_KEY[def].schema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain(MARCA_EL_CLIENTE_EDITA);
      expect(Object.keys(props)).not.toContain("clienteLaLlena");
    }
  });
});
