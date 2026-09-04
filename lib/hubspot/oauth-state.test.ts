/**
 * lib/hubspot/oauth-state.test.ts — NADIE SIN SESIÓN VUELVE A REEMPLAZAR LA CUENTA DE HUBSPOT.
 *
 * Es la guarda del único hallazgo CRÍTICO de la auditoría del 2026-09-03: las dos rutas del OAuth
 * eran públicas y el `state` iba en base64 sin firma, así que cualquiera podía completar el flujo
 * con su portal y el callback lo tomaba por bueno — borrando la cuenta de sistema de Smarteam.
 *
 * Tres capas, y cada una tiene su assert: la FIRMA (un state forjado o alterado no verifica), el
 * NONCE (un state legítimo no vale desde otro navegador), y el CABLEADO (las rutas exigen sesión,
 * el middleware ya no las exime, y el callback verifica ANTES de canjear el código). Sin la tercera
 * capa, las dos primeras son una función pura que nadie llama — que es la clase de guarda
 * decorativa que este repo ya cazó una docena de veces.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { firmarState, verificarState, nuevoNonce } from "./oauth-state";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const SECRETO = "secreto-de-prueba";

describe("la firma: un state que no firmamos nosotros no vale", () => {
  it("⭐ lo que se firma se recupera igual", () => {
    const nonce = nuevoNonce();
    const state = firmarState({ system: true }, nonce, SECRETO);
    expect(verificarState(state, nonce, SECRETO)).toEqual({ system: true });
  });

  it("⛔ el formato VIEJO —base64 pelado, sin firma— es exactamente el ataque, y se rechaza", () => {
    /* Es lo que mandaba la ruta antes: `Buffer.from(JSON.stringify({system:true})).toString("base64")`.
       Con eso, cualquiera reemplazaba la cuenta de sistema. */
    const forjado = Buffer.from(JSON.stringify({ system: true })).toString("base64");
    expect(verificarState(forjado, nuevoNonce(), SECRETO)).toBeNull();
  });

  it("⛔ alterar el cuerpo después de firmar lo invalida", () => {
    const nonce = nuevoNonce();
    const legitimo = firmarState({ clientId: "cliente-a" }, nonce, SECRETO);
    const [, firma] = legitimo.split(".");
    const alterado = `${Buffer.from(JSON.stringify({ system: true })).toString("base64url")}.${firma}`;
    expect(verificarState(alterado, nonce, SECRETO)).toBeNull();
  });

  it("⛔ con otro secreto no verifica", () => {
    const nonce = nuevoNonce();
    const state = firmarState({ system: true }, nonce, SECRETO);
    expect(verificarState(state, nonce, "otro")).toBeNull();
  });

  it("⛔ y sin secreto no se firma: degradar a base64 pelado reabriría el agujero", () => {
    expect(() => firmarState({ system: true }, nuevoNonce(), "")).toThrow();
    expect(verificarState("a.b", nuevoNonce(), undefined)).toBeNull();
  });
});

describe("el nonce: un state legítimo no vale desde otro navegador", () => {
  it("⭐ el mismo state con otro nonce se rechaza", () => {
    const state = firmarState({ system: true }, nuevoNonce(), SECRETO);
    expect(verificarState(state, nuevoNonce(), SECRETO)).toBeNull();
  });

  it("y sin cookie (nonce ausente) se rechaza aunque la firma sea buena", () => {
    const nonce = nuevoNonce();
    const state = firmarState({ system: true }, nonce, SECRETO);
    expect(verificarState(state, undefined, SECRETO)).toBeNull();
    expect(verificarState(state, "", SECRETO)).toBeNull();
  });

  it("los nonces no se repiten", () => {
    const vistos = new Set(Array.from({ length: 50 }, () => nuevoNonce()));
    expect(vistos.size).toBe(50);
  });
});

describe("⛔ el cableado: sin esto, lo de arriba es una función que nadie llama", () => {
  it("⭐ el middleware ya NO exime a las dos rutas del OAuth", () => {
    /* La edición que la pone en rojo: volver a poner los prefijos «para que el callback no pida
       sesión». Es literalmente el agujero. */
    const src = leer("middleware.ts");
    const i = src.indexOf("const PUBLIC_PREFIXES");
    expect(i, "se movió PUBLIC_PREFIXES: la guarda no mira nada").toBeGreaterThan(0);
    const lista = src.slice(i, src.indexOf("];", i));
    expect(lista, "volvió a ser pública la ruta que ARRANCA el OAuth").not.toContain('"/api/auth/hubspot"');
    expect(lista, "volvió a ser pública la ruta que RECIBE el OAuth").not.toContain('"/api/auth/callback"');
  });

  it("⭐ las dos rutas exigen usuario interno antes de cualquier otra cosa", () => {
    const arranque = leer("app/api/auth/hubspot/route.ts");
    const cuerpo = arranque.slice(arranque.indexOf("export async function GET"));
    expect(cuerpo.indexOf("guardInternalUser(")).toBeGreaterThan(0);
    expect(cuerpo.indexOf("guardInternalUser(")).toBeLessThan(cuerpo.indexOf("firmarState("));

    const vuelta = leer("app/api/auth/callback/route.ts");
    const cuerpoV = vuelta.slice(vuelta.indexOf("export async function GET"));
    expect(cuerpoV.indexOf("requireInternalUser(")).toBeGreaterThan(0);
  });

  it("⭐ el callback verifica el state ANTES de canjear el código y ANTES de tocar la base", () => {
    /* Si el canje fuera primero, un state inválido ya habría gastado el `code` y —peor— si el
       upsert fuera primero, el rechazo llegaría con la cuenta ya reemplazada. */
    const src = leer("app/api/auth/callback/route.ts");
    const cuerpo = src.slice(src.indexOf("export async function GET"));
    const verifica = cuerpo.indexOf("verificarState(");
    expect(verifica, "el callback dejó de verificar el state").toBeGreaterThan(0);
    expect(verifica).toBeLessThan(cuerpo.indexOf("exchangeCodeForTokens("));
    expect(verifica).toBeLessThan(cuerpo.indexOf("prisma."));
  });

  it("⛔ y el permiso se vuelve a preguntar en el callback: la variante `system` exige `configuracion.manage`", () => {
    /* El state firmado dice QUÉ se pidió, no QUIÉN puede. La sesión que completa el flujo no tiene
       por qué ser la que lo arrancó. */
    const src = leer("app/api/auth/callback/route.ts");
    expect(src).toContain('can(ctx.teamMember, "configuracion", "manage")');
    expect(src).toContain("requireAccessToClient(clientIdPedido)");
    const arranque = leer("app/api/auth/hubspot/route.ts");
    expect(arranque).toContain('guardPermission("configuracion", "manage")');
    expect(arranque).toContain("guardAccessToClient(clientId)");
  });

  it("el nonce viaja en cookie httpOnly acotada al callback, y se borra al volver", () => {
    const arranque = leer("app/api/auth/hubspot/route.ts");
    expect(arranque).toContain("httpOnly: true");
    expect(arranque).toContain("path: PATH_COOKIE_NONCE_OAUTH");
    const vuelta = leer("app/api/auth/callback/route.ts");
    expect(vuelta, "el callback no borra el nonce: un state valdría más de una vez").toContain("maxAge: 0");
  });
});
