/**
 * lib/external/acceso-por-proyecto.test.ts — la dirección nombra el proyecto, y un navegador
 * recuerda varios.
 *
 * ── EL INCIDENTE (2026-09-10) ────────────────────────────────────────────────
 * A Elías le pasaron `/external/cronograma` con el código de Judesur y vio el cronograma de Wherex.
 * No era caché: la dirección no decía de qué proyecto era, y el navegador guardaba UNA credencial
 * —la del último enlace abierto—, así que la página mostraba ese. Medido en producción: el acceso de
 * Wherex marcó uso a la hora exacta en que Elías abrió la dirección.
 *
 * Qué congela este archivo, y la edición que pone en rojo cada parte:
 *   1. La dirección lleva el id del ACCESO, nunca el token. → armar la ruta con el token.
 *   2. El resolver no devuelve un proyecto que la dirección no nombra. → sacar `access.id !== accesoId`.
 *   3. La lista del navegador suma, no pisa; tiene tope, vencimiento por entrada y se poda de muertos.
 *      → volver a una sola credencial, o que el verify no LEA la lista que ya tenía.
 *   4. Ningún nombre de otro cliente a la vista sin pedirlo: «Ver otros proyectos» no sale del
 *      cliente, y la página que elige proyecto pliega la lista si mezcla clientes. → sacar los filtros.
 *   5. Las direcciones sin proyecto no pintan contenido, nadie escribe la cookie de una credencial, y
 *      solo el formulario de Nexus canjea una contraseña.
 *   6. Cada superficie tiene su página por proyecto que le pasa el id al chokepoint, y la franja del
 *      kickoff se escribe en el proyecto de la página.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PUBLISH_SURFACES } from "@/lib/projects/publish-surfaces";
import { armarCredencial } from "./credencial";
import { esIdDeAcceso, rutaDeSuperficie, superficieDeNext } from "./rutas";
import {
  MAX_ACCESOS_RECORDADOS,
  VIGENCIA_DE_UN_ACCESO_MS,
  credencialesDelNavegador,
  leerListaDeAccesos,
  podarListaDeAccesos,
  sumarALaListaDeAccesos,
} from "./lista-de-accesos";
import { nombreVisibleDelProyecto } from "./nombre-visible";
import {
  elegirAcceso,
  hayProyectosAbiertos,
  opcionesParaDireccionSinProyecto,
  otrosProyectosDelMismoCliente,
  tituloDeLaPestana,
  type ProyectoAbierto,
} from "./selector-de-proyectos";
import { resolveActiveAccess, resolverAccesosDelNavegador } from "./access";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { projectExternalAccess: db } }));

const RAIZ = process.cwd();
const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, "/");
const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), "utf8");

/** Mencionar no es usar: el comentario que explica una regla no puede cumplirla ni violarla. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
    }
  };
  rec(path.join(RAIZ, dir));
  return out;
}

/** Un token de 64 hex armado con un solo carácter. */
const T = (c: string) => c.repeat(64);
const CUID_A = "cmfacc0000aaaaaaaaaaaaaaa";
const CUID_B = "cmfacc0000bbbbbbbbbbbbbbb";
const CUID_C = "cmfacc0000ccccccccccccccc";
const CUID_D = "cmfacc0000ddddddddddddddd";
const UUID = "3f2a6c1e-8b7d-4e21-9a0c-5d6e7f8a9b0c";
const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 8, 10, 22, 0, 0);

describe("1 · la dirección nombra el proyecto y nunca lleva el token", () => {
  it("una dirección por superficie declarada, con el id del acceso al final", () => {
    for (const s of PUBLISH_SURFACES) {
      const ruta = rutaDeSuperficie(CUID_A, s.key);
      expect(ruta).toBe(`/external/${s.key}/${CUID_A}`);
      expect(/[a-f0-9]{64}/i.test(ruta), "un token terminó en una dirección").toBe(false);
    }
  });

  it("el id acepta cuid y UUID, y rechaza un token", () => {
    /* La edición que lo pone en rojo: ensanchar el regex a 64 — entraría un token como id, y
       el token volvería a quedar en la barra y en los historiales. */
    expect(esIdDeAcceso(CUID_A)).toBe(true);
    expect(esIdDeAcceso(UUID)).toBe(true);
    expect(esIdDeAcceso(T("a")), "un token no puede pasar por id").toBe(false);
    expect(esIdDeAcceso("../../api")).toBe(false);
    expect(esIdDeAcceso("")).toBe(false);
    expect(esIdDeAcceso(undefined)).toBe(false);
    expect(() => rutaDeSuperficie(T("a"), "cronograma")).toThrow();
  });

  it("?next= es una lista cerrada: lo desconocido cae al kickoff", () => {
    expect(superficieDeNext("cronograma")).toBe("cronograma");
    expect(superficieDeNext("entrega")).toBe("entrega");
    expect(superficieDeNext(undefined)).toBe("kickoff");
    expect(superficieDeNext("https://otro.sitio")).toBe("kickoff");
    expect(superficieDeNext("../api")).toBe("kickoff");
  });
});

/** Una fila de ProjectExternalAccess como la devuelve el select de access.ts. */
function fila(id: string, token: string, passwordHash: string, extra: Record<string, unknown> = {}, proyecto: Record<string, unknown> = {}) {
  return {
    id,
    accessToken: token,
    revokedAt: null as Date | null,
    passwordHash,
    project: {
      id: `p_${id}`,
      name: `Proyecto ${id}`,
      clientId: "cli_1",
      kickoffPublishedAt: null,
      timelinePublishedAt: new Date("2026-08-04T00:00:00Z"),
      desarrolloPublishedAt: null,
      entregaPublishedAt: null,
      hubspotPipelineId: null,
      proyectoInterno: false,
      hermanoCsProjectId: null,
      altaEstado: null,
      client: { name: "JUDESUR", logoUrl: null, logoDarkUrl: null, logoScale: null },
      ...proyecto,
    },
    ...extra,
  };
}

describe("2 · el resolver no devuelve un proyecto que la dirección no nombra", () => {
  beforeEach(() => {
    db.findUnique.mockReset();
    db.findMany.mockReset();
  });

  it("⭐ la credencial de Wherex no abre la dirección de Judesur", async () => {
    /* La edición que lo pone en rojo: sacar `if (access.id !== accesoId) return null` de
       resolveActiveAccess. Es el incidente entero: una credencial VÁLIDA, de otro proyecto. */
    const tokenW = T("a");
    const hashW = "$2b$12$wherex";
    db.findUnique.mockResolvedValue(fila(CUID_A, tokenW, hashW));
    const credW = armarCredencial(tokenW, hashW);
    expect(await resolveActiveAccess(credW, CUID_A), "precondición: la credencial vale para SU acceso").not.toBeNull();
    expect(await resolveActiveAccess(credW, CUID_B), "sirvió un proyecto que la dirección no nombra").toBeNull();
  });

  it("la lista del navegador descarta lo revocado, lo canjeado con otra contraseña y lo no publicable", async () => {
    db.findMany.mockResolvedValue([
      fila(CUID_A, T("a"), "$h1"),
      fila(CUID_B, T("b"), "$h2", { revokedAt: new Date() }),
      fila(CUID_C, T("c"), "$h3"),
      // Un alta sin terminar no admite mirones de afuera, tampoco por el camino del lote.
      fila(CUID_D, T("d"), "$h4", {}, { altaEstado: "pendiente_crm" }),
    ]);
    const abiertos = await resolverAccesosDelNavegador([
      armarCredencial(T("a"), "$h1"),
      armarCredencial(T("b"), "$h2"),
      armarCredencial(T("c"), "$contraseñaAnterior"),
      armarCredencial(T("d"), "$h4"),
      "basura",
    ]);
    expect(abiertos.map((a) => a.accessId)).toEqual([CUID_A]);
    expect(abiertos[0].credencial).toBe(armarCredencial(T("a"), "$h1"));
    expect(db.findMany).toHaveBeenCalledTimes(1);
  });

  it("sin credenciales no toca la base", async () => {
    expect(await resolverAccesosDelNavegador([])).toEqual([]);
    expect(await resolverAccesosDelNavegador(["basura", T("a")])).toEqual([]);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});

describe("3 · el navegador recuerda varios proyectos: suma, no pisa", () => {
  const cred = (c: string, hash = "$h") => armarCredencial(T(c), hash);

  it("abrir un segundo proyecto conserva el primero", () => {
    /* La edición que lo pone en rojo: que sumarALaListaDeAccesos devuelva solo la credencial
       nueva — es exactamente la cookie de antes, la que pisaba el primer proyecto. */
    const v1 = sumarALaListaDeAccesos(undefined, cred("a"), AHORA);
    const v2 = sumarALaListaDeAccesos(v1, cred("b"), AHORA + 1000);
    expect(leerListaDeAccesos(v2, AHORA + 2000)).toEqual([cred("b"), cred("a")]);
  });

  it("volver a abrir el mismo proyecto no lo duplica, y gana la contraseña nueva", () => {
    let v = sumarALaListaDeAccesos(undefined, cred("a", "$vieja"), AHORA);
    v = sumarALaListaDeAccesos(v, cred("b"), AHORA + 1000);
    v = sumarALaListaDeAccesos(v, cred("a", "$nueva"), AHORA + 2000);
    expect(leerListaDeAccesos(v, AHORA + 3000)).toEqual([cred("a", "$nueva"), cred("b")]);
  });

  it("tiene tope: se cae el más viejo, y la cookie cabe holgada en la cabecera", () => {
    let v: string | undefined;
    "0123456789".split("").forEach((c, i) => {
      v = sumarALaListaDeAccesos(v, cred(c), AHORA + i * 1000);
    });
    const lista = leerListaDeAccesos(v, AHORA + 20_000);
    expect(lista).toHaveLength(MAX_ACCESOS_RECORDADOS);
    expect(lista[0]).toBe(cred("9"));
    expect(lista).not.toContain(cred("0"));
    expect(v!.length, "sin tope la cabecera Cookie crece hasta que nginx la rechaza").toBeLessThan(800);
  });

  it("cada entrada vence a los 30 días de SU emisión, aunque la lista se reescriba después", () => {
    let v = sumarALaListaDeAccesos(undefined, cred("a"), AHORA);
    v = sumarALaListaDeAccesos(v, cred("b"), AHORA + 29 * DIA);
    expect(leerListaDeAccesos(v, AHORA + 29 * DIA)).toEqual([cred("b"), cred("a")]);
    expect(leerListaDeAccesos(v, AHORA + VIGENCIA_DE_UN_ACCESO_MS), "la de hace 30 días ya no vale").toEqual([
      cred("b"),
    ]);
  });

  it("podar saca las entradas muertas sin tocar la fecha de las vivas", () => {
    /* Sin podar, un token regenerado del mismo acceso deja una entrada muerta 30 días ocupando
       lugar en el tope, y el noveno enlace saca de la lista a un proyecto VIVO. */
    let v = sumarALaListaDeAccesos(undefined, cred("a"), AHORA);
    v = sumarALaListaDeAccesos(v, cred("b"), AHORA + 1000);
    const podada = podarListaDeAccesos(v, (c) => c === cred("a"), AHORA + 2000);
    expect(leerListaDeAccesos(podada, AHORA + 2000)).toEqual([cred("a")]);
    expect(leerListaDeAccesos(podada, AHORA + VIGENCIA_DE_UN_ACCESO_MS), "podar no le alarga la vida").toEqual([]);
    expect(podarListaDeAccesos(v, () => false, AHORA)).toBeUndefined();
  });

  it("lo que no se entiende se ignora: basura, un token pelado, una credencial sin fecha", () => {
    const v = sumarALaListaDeAccesos(undefined, cred("a"), AHORA);
    expect(leerListaDeAccesos(`basura~${T("f")}~${cred("e")}~${v}`, AHORA)).toEqual([cred("a")]);
    expect(() => sumarALaListaDeAccesos(undefined, T("a"), AHORA), "un token pelado no es una credencial").toThrow();
  });

  it("la cookie vieja cuenta como un proyecto más, sin duplicar uno que ya está en la lista", () => {
    expect(credencialesDelNavegador([cred("a")], cred("b"))).toEqual([cred("a"), cred("b")]);
    expect(credencialesDelNavegador([cred("a", "$nueva")], cred("a", "$vieja"))).toEqual([cred("a", "$nueva")]);
    expect(credencialesDelNavegador([], T("c")), "un token pelado de antes de A-11 no cuenta").toEqual([]);
    expect(credencialesDelNavegador([], undefined)).toEqual([]);
  });
});

describe("4 · ningún nombre de otro cliente a la vista sin pedirlo", () => {
  it("el nombre del proyecto frente al cliente: se saca el tramo que repite al cliente", () => {
    expect(nombreVisibleDelProyecto("JUDESUR  | MEJORA WEB | CONSULTA DE SALDOS", "JUDESUR")).toBe(
      "MEJORA WEB · CONSULTA DE SALDOS",
    );
    expect(nombreVisibleDelProyecto("Integración con Odoo | Visual Branding", "Visual Branding")).toBe(
      "Integración con Odoo",
    );
    expect(nombreVisibleDelProyecto("Wherex - Migración CRM + integraciones operativas", "Wherex")).toBe(
      "Migración CRM + integraciones operativas",
    );
    expect(nombreVisibleDelProyecto("Visual Branding", "Visual Branding")).toBe("Visual Branding");
    expect(nombreVisibleDelProyecto("Sitio web | Areyá", "Areya"), "sin tildes también es el cliente").toBe("Sitio web");
    expect(nombreVisibleDelProyecto("E-commerce Wherex", "Wherex"), "un guion pegado no separa").toBe("E-commerce Wherex");
  });

  const abierto = (
    accessId: string,
    clientId: string,
    cliente: string,
    nombre: string,
    publicado: { kickoff?: boolean; cronograma?: boolean } = { cronograma: true },
  ): ProyectoAbierto => ({
    accessId,
    project: {
      name: nombre,
      clientId,
      kickoffPublishedAt: publicado.kickoff ? new Date() : null,
      timelinePublishedAt: publicado.cronograma ? new Date() : null,
      desarrolloPublishedAt: null,
      entregaPublishedAt: null,
      client: { name: cliente },
    },
  });
  const vbA = abierto("cmfvb00000aaaaaaaaaaaaaaa", "cli_vb", "Visual Branding", "Visual Branding");
  const vbB = abierto("cmfvb00000bbbbbbbbbbbbbbb", "cli_vb", "Visual Branding", "Integración con Odoo | Visual Branding");
  const vbSinCrono = abierto("cmfvb00000ccccccccccccccc", "cli_vb", "Visual Branding", "Otro | Visual Branding", {
    kickoff: true,
  });
  const wherex = abierto("cmfwx00000aaaaaaaaaaaaaaa", "cli_wx", "Wherex", "Wherex - Migración CRM");
  const wherexSinCrono = abierto("cmfwx00000bbbbbbbbbbbbbbb", "cli_wx", "Wherex", "Wherex - Otro", { kickoff: true });

  it("⭐ «Ver otros proyectos» lista solo OTROS proyectos del MISMO cliente con esa superficie publicada", () => {
    /* La edición que lo pone en rojo: sacar el filtro por clientId. El navegador de un CSE tiene
       abiertos proyectos de varios clientes, y proyecta estas páginas en reuniones. */
    const otros = otrosProyectosDelMismoCliente([vbA, vbB, vbSinCrono, wherex], vbA, "cronograma");
    expect(otros).toEqual([
      { nombre: "Integración con Odoo", cliente: "Visual Branding", href: `/external/cronograma/${vbB.accessId}` },
    ]);
  });

  it("con un solo proyecto de ese cliente no hay nada que ofrecer", () => {
    expect(otrosProyectosDelMismoCliente([vbA, wherex], vbA, "cronograma")).toEqual([]);
  });

  it("⭐ la dirección sin proyecto avisa cuando lo abierto mezcla clientes, y cuenta solo lo publicado", () => {
    /* La edición que lo pone en rojo: que variosClientes deje de contar los clientes. La página que
       elige proyecto también puede estar en la pantalla de una reunión. */
    const mezcla = opcionesParaDireccionSinProyecto([vbA, vbSinCrono, wherex], "cronograma");
    expect(mezcla.opciones.map((o) => o.href)).toEqual([
      `/external/cronograma/${vbA.accessId}`,
      `/external/cronograma/${wherex.accessId}`,
    ]);
    expect(mezcla.variosClientes, "dos clientes: los nombres no pueden quedar a la vista").toBe(true);
    const unCliente = opcionesParaDireccionSinProyecto([vbA, vbB, vbSinCrono], "cronograma");
    expect(unCliente.variosClientes).toBe(false);
    expect(unCliente.opciones).toHaveLength(2);
    // Un Wherex SIN cronograma publicado no se lista, así que tampoco cuenta como otro cliente.
    expect(opcionesParaDireccionSinProyecto([vbA, wherexSinCrono], "cronograma").variosClientes).toBe(false);
    expect(opcionesParaDireccionSinProyecto([], "cronograma")).toEqual({ opciones: [], variosClientes: false });
  });

  it("el componente pliega la lista cuando mezcla clientes", () => {
    const comp = sinComentarios(leer("components/external/DireccionSinProyecto.tsx"));
    expect(comp).toContain("opcionesParaDireccionSinProyecto(accesos, superficie)");
    expect(comp, "con varios clientes la lista va detrás de un clic").toMatch(/variosClientes\s*\?[\s\S]{0,900}<details/);
  });

  it("elegirAcceso devuelve el acceso que nombra la dirección, o nada", () => {
    /* Es lo único que separa la acción de franjas del proyecto equivocado: sin esto, un cambio que
       la hiciera devolver «el primero» no lo cazaría ningún test de comportamiento. */
    expect(elegirAcceso([vbA, vbB], vbB.accessId)).toBe(vbB);
    expect(elegirAcceso([vbA, vbB], wherex.accessId), "un id que el navegador no tiene").toBeNull();
    expect(elegirAcceso([vbA], T("a")), "un token no es un id").toBeNull();
    expect(elegirAcceso([], vbA.accessId)).toBeNull();
  });

  it("la pestaña nombra el proyecto solo si el navegador lo tiene y la superficie está publicada", () => {
    expect(tituloDeLaPestana(vbB, "cronograma")).toBe("Cronograma · Integración con Odoo · Smarteam");
    expect(tituloDeLaPestana(null, "cronograma"), "sin acceso, el título no cuenta de qué proyecto es").toBe(
      "Cronograma · Smarteam",
    );
    expect(tituloDeLaPestana(vbSinCrono, "cronograma")).toBe("Cronograma · Smarteam");
    expect(hayProyectosAbiertos([vbSinCrono], "cronograma")).toBe(false);
    expect(hayProyectosAbiertos([vbSinCrono, wherex], "cronograma")).toBe(true);
  });
});

describe("5 · las direcciones sin proyecto no pintan contenido, y solo Nexus canjea contraseñas", () => {
  it.each(PUBLISH_SURFACES.map((s) => s.key))("app/external/%s/page.tsx solo ofrece elegir", (key) => {
    /* La edición que lo pone en rojo: volver a renderizar la superficie en la dirección sin
       proyecto «para no romper favoritos». Es la dirección que se reenvió en el incidente. */
    const src = sinComentarios(leer(`app/external/${key}/page.tsx`));
    expect(src).toContain(`<DireccionSinProyecto superficie="${key}"`);
    expect(/lib\/external\/[a-z-]+-view/.test(src), "la dirección sin proyecto volvió a leer contenido").toBe(false);
    expect(/ClientView|TimelineLanding/.test(src)).toBe(false);
    expect(src).toMatch(/export const dynamic\s*=\s*"force-dynamic"/);
  });

  it("el componente que decide tampoco pinta contenido ni elige por la persona", () => {
    const comp = sinComentarios(leer("components/external/DireccionSinProyecto.tsx"));
    expect(/lib\/external\/[a-z-]+-view/.test(comp), "leyó contenido de una superficie").toBe(false);
    expect(/ClientView|TimelineLanding/.test(comp)).toBe(false);
    expect(/\b(permanentRedirect|redirect)\(/.test(comp), "la dirección sin proyecto eligió por la persona").toBe(false);
    expect(comp.includes(".credencial"), "una credencial llegó a un componente").toBe(false);
  });

  it("nadie escribe la cookie de UNA credencial, ni vuelve a declarar su nombre", () => {
    const culpables: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const f of archivosDe(dir)) {
        const r = rel(f);
        const src = sinComentarios(fs.readFileSync(f, "utf8"));
        if (/cookies\.set\(/.test(src) && src.includes("COOKIE_HEREDADA")) culpables.push(r);
        // El nombre literal vive en UN solo lugar: re-declararlo es la forma de volver a escribirla.
        if (r !== "lib/external/lista-de-accesos.ts" && /["'`]nexus_ext_access["'`]/.test(src)) culpables.push(r);
      }
    }
    expect(culpables, "volver a escribir la cookie de una sola credencial es volver al incidente").toEqual([]);
    expect(fs.existsSync(path.join(RAIZ, "app/api/external/verify-access/route.ts"))).toBe(false);
  });

  it("el verify LEE la lista que tenía el navegador, la poda, y le SUMA la credencial nueva", () => {
    /* La edición que lo pone en rojo: pasarle `undefined` en vez de la lista previa — vuelve a una
       sola credencial y todo lo demás seguiría verde. */
    const src = sinComentarios(leer("app/external/verify-access/route.ts"));
    expect(src).toContain("const previa = req.cookies.get(COOKIE_DE_ACCESOS)?.value");
    expect(src).toMatch(
      /value:\s*sumarALaListaDeAccesos\(\s*podarListaDeAccesos\(\s*previa,[\s\S]{0,80}armarCredencial\(token, access\.passwordHash\)/,
    );
    expect(src, "la poda se decide contra la base, no a ciegas").toContain("resolverAccesosDelNavegador(leerListaDeAccesos(previa, now))");
    expect(src).toContain("name: COOKIE_DE_ACCESOS");
    expect(src).toContain('path: "/external"');
    expect(src, "el formulario necesita el id para armar la dirección").toContain("acceso: access.id");
  });

  /* Hasta el 2026-09-10 también estaba acá el verify de la PROPUESTA: se borró junto con su modo con
     contraseña (candado 11 de lib/external/propuesta-abierta.test.ts), y ya no queda contraseña de
     propuesta que alguien pueda hacer gastar desde otro sitio. */
  it.each(["app/external/verify-access/route.ts"])(
    "%s solo acepta el formulario de Nexus (JSON y mismo sitio), antes de leer nada",
    (ruta) => {
      /* La edición que lo pone en rojo: sacar el chequeo — un formulario de otro sitio vuelve a
         poder gastarle intentos al token y a la IP del cliente. */
      const src = sinComentarios(leer(ruta));
      const chequeo = src.indexOf('req.headers.get("sec-fetch-site")');
      expect(chequeo, "falta el chequeo de origen").toBeGreaterThan(-1);
      expect(src).toContain('startsWith("application/json")');
      expect(chequeo, "el chequeo tiene que ir ANTES de leer el cuerpo").toBeLessThan(src.indexOf("await req.json()"));
    },
  );

  it("la dirección vieja del verify redirige a la nueva, conservando el POST", () => {
    const cfg = sinComentarios(leer("next.config.ts"));
    expect(cfg).toMatch(
      /source:\s*"\/api\/external\/verify-access",\s*destination:\s*"\/external\/verify-access",\s*permanent:\s*false/,
    );
  });

  it("el formulario lleva a la dirección del proyecto, nunca a una sin proyecto", () => {
    const src = sinComentarios(leer("app/external/verify/[token]/VerifyForm.tsx"));
    expect(src).toContain('fetch("/external/verify-access"');
    expect(src).toContain("rutaDeSuperficie(data.acceso, superficieDeNext(next))");
    expect(src.includes("SURFACE_PATHS"), "volvió la lista de destinos sin proyecto").toBe(false);
    expect(/location\.assign\(\s*["'`]\/external\//.test(src)).toBe(false);
  });
});

describe("6 · cada superficie tiene su página por proyecto, y la franja se escribe en ese proyecto", () => {
  const GETTER: Record<string, string> = {
    kickoff: "getPublishedKickoffForToken",
    cronograma: "getPublishedTimelineForToken",
    desarrollo: "getDesarrolloForToken",
    entrega: "getEntregaForToken",
  };

  it("hay un chokepoint por superficie declarada", () => {
    expect(Object.keys(GETTER).sort()).toEqual(PUBLISH_SURFACES.map((s) => s.key).sort());
  });

  it.each(PUBLISH_SURFACES.map((s) => s.key))("app/external/%s/[acceso]/page.tsx le pasa el id al chokepoint", (key) => {
    /* La edición que lo pone en rojo: llamar al chokepoint sin el id, o armar el menú con las
       opciones de la dirección sin proyecto (que no se filtran por cliente). */
    const src = sinComentarios(leer(`app/external/${key}/[acceso]/page.tsx`));
    expect(src).toMatch(/export const dynamic\s*=\s*"force-dynamic"/);
    expect(src).toMatch(/robots:\s*\{[^}]*index:\s*false/);
    expect(src).toContain("elegirAcceso(accesos, acceso)");
    expect(src, "sin el id, el chokepoint no puede negarse a servir otro proyecto").toContain(
      `${GETTER[key]}(actual.credencial, acceso)`,
    );
    expect(src, "el menú de una página se limita al mismo cliente").toContain(
      `otrosProyectosDelMismoCliente(accesos, actual, "${key}")`,
    );
    expect(src.includes("opcionesParaDireccionSinProyecto"), "el menú de una página listaría otros clientes").toBe(false);
    expect(src, "la pestaña nombra el proyecto").toContain(`tituloDeLaPestana(elegirAcceso(await accesosDelNavegador(), acceso), "${key}")`);
    expect(src, "sin callejón: ofrece los otros proyectos abiertos").toContain(`hayProyectosAbiertos(accesos, "${key}")`);
  });

  it("cada chokepoint exige el id y se lo pasa al resolver", () => {
    for (const f of [
      "lib/external/kickoff-view.ts",
      "lib/external/timeline-view.ts",
      "lib/external/desarrollo-view.ts",
      "lib/external/entrega-view.ts",
    ]) {
      expect(sinComentarios(leer(f)), f).toContain("resolveActiveAccess(credencial, accesoId)");
    }
    expect(sinComentarios(leer("lib/external/access.ts"))).toContain("if (access.id !== accesoId) return null");
  });

  it("la acción de franjas queda atada al proyecto de la página", () => {
    /* La edición que lo pone en rojo: pasar la acción sin `.bind`, o que vuelva a resolver «la
       cookie que haya». Una pestaña del proyecto A escribiría contra B. */
    const pagina = sinComentarios(leer("app/external/kickoff/[acceso]/page.tsx"));
    expect(pagina).toContain("assignHorarioAction.bind(null, acceso)");
    const accion = sinComentarios(leer("app/external/kickoff/actions.ts"));
    expect(accion).toMatch(/export async function assignHorarioAction\(\s*acceso: string,/);
    expect(accion).toContain("elegirAcceso(await accesosDelNavegador(), acceso)");
    expect(accion).toContain("assignKickoffHorario(actual.project.id,");
  });
});
