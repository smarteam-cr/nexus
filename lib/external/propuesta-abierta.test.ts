/**
 * lib/external/propuesta-abierta.test.ts — los candados de la propuesta SIN contraseña.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Desde el 2026-08-20 una propuesta se comparte por defecto sin contraseña: la URL ES el
 * secreto, y esa URL lleva precios. Todo lo que la protege se reduce a cuatro cosas
 * frágiles, cada una a un descuido de distancia:
 *
 *   1. Que el token se resuelva SIEMPRE por el chokepoint. Un quinto archivo que consulte
 *      `businessCaseExternalAccess` por `accessToken` es un quinto lugar donde acordarse de
 *      revocado + publicado + caducado. Es exactamente la falla que ya se pagó del lado de
 *      proyectos (ver lib/projects/publicable.test.ts, candado 2).
 *   2. Que las páginas con token en la URL sean `force-dynamic`. Sin eso Next cachea el
 *      segmento y **revocar el link no surte efecto**.
 *   3. Que TODA página con token declare `noindex` (A-14: antes solo la abierta). La URL
 *      circula por correo y no tiene otra puerta detrás.
 *   4. Que TODA la superficie externa salga con `Referrer-Policy: no-referrer`. Estas URLs
 *      llevan el token en el path y las páginas pintan imágenes de otro origen (el logo del
 *      cliente vive en Supabase Storage): sin la política, el `Referer` de esa imagen se
 *      lleva el token puesto a un tercero.
 *      ⚠ Se exige como HEADER de `next.config.ts` y NO como `metadata.referrer` de la
 *      página: el `<meta name="referrer">` que emite Next lo hoistea React 19 durante la
 *      hidratación y desincroniza el recorrido de una página con formulario (se pagó:
 *      "Hydration failed", reportado sobre el <main> del shell, lejísimos de la causa).
 *
 * Ninguna de las cuatro se rompe con un error visible: se rompen en silencio y la propuesta
 * de un cliente queda indexable, cacheada o filtrada. Por eso son test y no comentario.
 *
 * ── Y LA PUERTA CON CONTRASEÑA (candados 5 y 6, A-10, auditoría 2026-09-03) ─────────────
 *   5. La contraseña CUSTOM del enlace de un proyecto pasa por `evaluarContrasena`: 12+ y sin
 *      diccionario ni el nombre del cliente. Con 8 y sin filtro, «smarteam2026» era válida y el
 *      bcrypt y el rate-limit protegían nada.
 *   6. Los fallos de verify-access se cuentan por TOKEN y por IP: contar solo por token dejaba
 *      gratis probar una contraseña contra miles de tokens.
 *   7. La cookie lleva la VERSIÓN de la contraseña (A-11): cambiarla expulsa a quien ya entró.
 *      Antes la cookie valía 30 días pasara lo que pasara.
 *   8. El token no viaja a Sentry (A-12): cada error en una página externa se llevaba la URL
 *      —con la llave adentro— a un tercero, en el cliente y en el servidor.
 *   9. (candado 4, ampliado por A-13) Toda la app sale con `X-Frame-Options: DENY`, `nosniff`
 *      y una CSP en report-only. Sin ellas, cualquier sitio puede enmarcar la propuesta.
 *  10. (candado 9, A-21) La propuesta se aprueba UNA sola vez: la condición va en el `where`
 *      de la escritura. Con check-then-act, dos aprobaciones a la vez registraban a la última.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluarContrasena, LARGO_MINIMO_CONTRASENA } from "@/lib/external/politica-de-contrasena";
import { claveDeIp, POLITICA_POR_IP, POLITICA_POR_TOKEN } from "@/lib/external/verify-rate-limit";
import { armarCredencial, credencialVigente, leerCredencial, versionDeCredencial } from "@/lib/external/credencial";
import { tacharTokensDelEvento } from "@/lib/observability/scrub";
import { CABECERAS_DE_SEGURIDAD, politicaCsp, reportUriDesdeDsn } from "@/lib/observability/csp";
import { aprobarUnaSolaVez, type BaseDeAprobacion } from "@/lib/business-cases/aprobacion";

// verify-rate-limit toca prisma al REGISTRAR; acá solo se usan sus partes puras (clave y políticas).
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const RAIZ = process.cwd();

/** Igual que en publicable.test.ts: mencionar un símbolo en un comentario no es usarlo. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function archivosDe(dir: string, ext = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (ext.some((x) => e.name.endsWith(x)) && !e.name.includes(".test.")) out.push(p);
    }
  };
  rec(path.join(RAIZ, dir));
  return out;
}

const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, "/");

const PAGINA_ABIERTA = path.join(RAIZ, "app/external/propuesta/[token]/page.tsx");

/** Descubre `app/external/**\/[token]/page.tsx` — sin lista que mantener. */
const paginasConToken = (): string[] =>
  archivosDe("app/external").filter(
    (f) => f.endsWith("page.tsx") && path.basename(path.dirname(f)) === "[token]",
  );

describe("candado 1 — solo el chokepoint resuelve un token de PROPUESTA", () => {
  /* Los cuatro que pueden tocar la tabla por token, y por qué:
     - el chokepoint (el resolver de las dos puertas),
     - verify-access (canjea contraseña por cookie; NO pasa por el resolver),
     - external-access (panel interno, gateado con guardSalesAccess; no sirve contenido),
     - mutations (crea/rota el acceso; tampoco sirve contenido). */
  const SANCIONADOS = [
    "lib/external/business-case-view.ts",
    "app/api/external/business-case/verify-access/route.ts",
    "app/api/business-cases/[id]/external-access/route.ts",
    "lib/business-cases/mutations.ts",
  ];

  it("nadie más consulta businessCaseExternalAccess por accessToken", () => {
    const culpables: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const f of archivosDe(dir)) {
        if (SANCIONADOS.includes(rel(f))) continue;
        const src = sinComentarios(fs.readFileSync(f, "utf8"));
        if (src.includes("businessCaseExternalAccess") && /where:\s*\{\s*accessToken/.test(src)) {
          culpables.push(rel(f));
        }
      }
    }
    expect(
      culpables,
      "Un quinto lugar que canjea un token de PROPUESTA es un quinto lugar donde hay que " +
        "acordarse de revocado + publicado + caducado. Si tiene que existir, primero movelo " +
        "a lib/external/business-case-view.ts.",
    ).toEqual([]);
  });
});

describe("candado 2 — toda página externa con token en la URL es force-dynamic", () => {
  it("las descubre (la abierta y la de verify, como mínimo)", () => {
    expect(paginasConToken().length).toBeGreaterThanOrEqual(2);
  });

  it("cada una declara force-dynamic", () => {
    const sinDynamic = paginasConToken()
      .filter((f) => !/export const dynamic\s*=\s*"force-dynamic"/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(
      sinDynamic,
      "Sin force-dynamic, Next cachea el segmento y revocar el link deja de surtir efecto.",
    ).toEqual([]);
  });
});

describe("candado 3 — ninguna página con token se indexa ni filtra el token", () => {

  it("la página existe donde el constructor de URLs dice", () => {
    expect(fs.existsSync(PAGINA_ABIERTA)).toBe(true);
  });

  it("TODAS declaran noindex (A-14: también las de verify y la del documento)", () => {
    /* La edicion que lo pone en rojo: crear app/external/<x>/[token]/page.tsx sin metadata, o
       sacarle el robots a una de las de verify. */
    const sinNoindex = paginasConToken()
      .filter((f) => !/robots:\s*\{[^}]*index:\s*false/.test(sinComentarios(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(paginasConToken().length, "la guarda no mira nada").toBeGreaterThanOrEqual(4);
    expect(
      sinNoindex,
      "La URL lleva el token y circula por correo: toda página con token va noindex.",
    ).toEqual([]);
  });

  it("NINGUNA usa metadata.referrer (rompe la hidratación; va por header)", () => {
    const conReferrer = paginasConToken()
      .filter((f) => /referrer:\s*["']no-referrer["']/.test(sinComentarios(fs.readFileSync(f, "utf8"))))
      .map(rel);
    expect(
      conReferrer.length > 0,
      "El <meta name=referrer> que emite Next lo hoistea React 19 en la hidratación y " +
        "rompe el recorrido de esta página (tiene formulario). La política va como header " +
        "en next.config.ts — ver el candado 4.",
    ).toBe(false);
  });
});

describe("candado 4 — /external sale con Referrer-Policy: no-referrer", () => {
  const config = () => sinComentarios(fs.readFileSync(path.join(RAIZ, "next.config.ts"), "utf8"));

  it("next.config.ts declara el header para toda la superficie externa", () => {
    const src = config();
    expect(
      /source:\s*["']\/external\/:path\*["']/.test(src),
      "El header tiene que cubrir TODO /external, no una ruta suelta: las cuatro " +
        "superficies llevan el token en la URL y la quinta que se agregue también.",
    ).toBe(true);
    expect(
      /Referrer-Policy[\s\S]{0,60}no-referrer/.test(src),
      "Sin no-referrer, el logo del cliente (Supabase Storage, otro origen) le entrega el " +
        "token entero a un tercero por el header Referer.",
    ).toBe(true);
  });

  it("y las cabeceras de seguridad para TODA la app (A-13): frame DENY, nosniff, CSP report-only", () => {
    /* La edicion que lo pone en rojo: acotar el bloque a /external, sacar X-Frame-Options, o
       pasar la CSP a modo enforce sin haber leído los reportes. */
    const src = config();
    expect(
      /source:\s*["']\/:path\*["']/.test(src),
      "El bloque tiene que cubrir /:path* — la app entera, no solo /external.",
    ).toBe(true);
    expect(src, "next.config.ts consume el único dueño de las cabeceras").toContain("CABECERAS_DE_SEGURIDAD(");
    const porClave = Object.fromEntries(CABECERAS_DE_SEGURIDAD({}).map((c) => [c.key, c.value]));
    expect(porClave["X-Frame-Options"]).toBe("DENY");
    expect(porClave["X-Content-Type-Options"]).toBe("nosniff");
    expect(porClave["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    expect(
      porClave["Content-Security-Policy"],
      "La CSP nace en report-only: se endurece DESPUÉS de leer los reportes de producción.",
    ).toBeUndefined();
    expect(porClave["Strict-Transport-Security"], "HSTS es de nginx, no de la app").toBeUndefined();
  });

  it("la CSP no declara frame-ancestors, cierra object-src y reporta a Sentry cuando hay DSN", () => {
    /* La edicion que lo pone en rojo: sumar frame-ancestors «porque es lo moderno». */
    expect(politicaCsp(), "el plan lo excluye: XFO ya cubre el framing").not.toContain("frame-ancestors");
    expect(politicaCsp()).toContain("object-src 'none'");
    expect(politicaCsp()).not.toContain("report-uri");
    const uri = reportUriDesdeDsn("https://abc123@o4507.ingest.us.sentry.io/4509");
    expect(uri).toBe("https://o4507.ingest.us.sentry.io/api/4509/security/?sentry_key=abc123");
    expect(politicaCsp({ reportUri: uri })).toContain(`report-uri ${uri}`);
    expect(reportUriDesdeDsn(undefined)).toBeNull();
    expect(reportUriDesdeDsn("no-es-una-url")).toBeNull();
  });
});

describe("candado 5 — la contraseña custom del enlace pasa por la política", () => {
  it("rechaza lo que cualquiera prueba primero, cada cosa por su motivo", () => {
    /* La edicion que lo pone en rojo: sacar el diccionario de evaluarContrasena (o volver a
       validar solo el largo en la ruta, como antes). */
    expect(LARGO_MINIMO_CONTRASENA).toBeGreaterThanOrEqual(12);
    expect(evaluarContrasena("123456")).toMatchObject({ ok: false, motivo: "corta" });
    expect(evaluarContrasena("smarteam2026")).toMatchObject({ ok: false, motivo: "diccionario" });
    expect(evaluarContrasena("Password1234!")).toMatchObject({ ok: false, motivo: "diccionario" });
    expect(evaluarContrasena("Contraseña-12")).toMatchObject({ ok: false, motivo: "diccionario" });
    expect(
      evaluarContrasena("Wherex-Kickoff-2026", ["Implementación HubSpot | Wherex 2026", "Wherex S.A."]),
    ).toMatchObject({ ok: false, motivo: "propia" });
    expect(evaluarContrasena("aaaaaaaaaaaa")).toMatchObject({ ok: false, motivo: "repetitiva" });
    expect(evaluarContrasena("abcdefghijkl")).toMatchObject({ ok: false, motivo: "secuencia" });
    expect(evaluarContrasena("con espacios adentro")).toMatchObject({ ok: false, motivo: "espacios" });
    // Un año en el nombre del proyecto NO convierte a «2026» en palabra prohibida.
    expect(evaluarContrasena("Tr3s-Colinas-Verdes-2026", ["Sitio web 2026"])).toEqual({ ok: true });
  });

  it("la ruta que fija la contraseña la consulta, y no conserva su regla vieja de largo", () => {
    const src = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "app/api/projects/[projectId]/external-access/route.ts"), "utf8"),
    );
    expect(src, "PATCH tiene que pasar la contraseña custom por evaluarContrasena(").toContain("evaluarContrasena(");
    expect(
      src.includes("MIN_PASSWORD_LEN"),
      "La regla de largo vivía inline en la ruta (8 chars). Si vuelve, la política deja de ser la única voz.",
    ).toBe(false);
    expect(
      /evaluarContrasena\(password,\s*\[/.test(src),
      "Sin las palabras propias (nombre del proyecto y del cliente), el nombre del asunto del correo sigue siendo válido.",
    ).toBe(true);
  });
});

describe("candado 6 — los fallos de verify-access se cuentan por token Y por IP", () => {
  const cabeceras = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });

  it("la clave de IP sale del proxy; sin cabecera no hay clave (nadie cae en un balde común)", () => {
    /* La edicion que lo pone en rojo: leer solo x-real-ip, o devolver una clave fija sin cabecera. */
    expect(claveDeIp(cabeceras({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("ip:203.0.113.9");
    expect(claveDeIp(cabeceras({ "x-real-ip": "198.51.100.7" }))).toBe("ip:198.51.100.7");
    expect(claveDeIp(cabeceras({}))).toBeNull();
  });

  it("la política por IP es más laxa que la del token (una oficina comparte IP)", () => {
    expect(POLITICA_POR_IP.maxFallos).toBeGreaterThan(POLITICA_POR_TOKEN.maxFallos);
  });

  it.each([
    // 2026-09-10: el verify de proyectos se mudó de /api/external a /external para poder LEER la
    // lista de proyectos abiertos del navegador (su cookie tiene path /external). Mismas reglas.
    "app/external/verify-access/route.ts",
    "app/api/external/business-case/verify-access/route.ts",
  ])("%s registra cada fallo contra las dos claves", (ruta) => {
    /* La edicion que lo pone en rojo: volver a registerFailure(token, now) en un solo camino. */
    const src = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    expect(src).toContain("claveDeIp(req.headers)");
    expect(src).toContain("bloqueoVigente(token, ip, now)");
    /* Cada bcrypt.compare es un camino que puede fallar (token inexistente con el hash falso,
       revocado, no publicable, contraseña mala) y CADA uno registra contra las dos claves. Se
       exige igualdad, no un piso: con un piso, sacarle la IP a un solo camino seguía verde. */
    const compara = src.match(/bcrypt\.compare\(/g)?.length ?? 0;
    const fallos = src.match(/registrarFallo\(token, ip, now\)/g)?.length ?? 0;
    expect(compara, "la guarda no mira nada").toBeGreaterThanOrEqual(3);
    expect(fallos, "un bcrypt.compare cuyo fallo no se registra contra token E IP").toBe(compara);
    expect(src.includes("registerFailure("), "quedó un fallo contado solo por token").toBe(false);
  });
});

describe("candado 7 — cambiar la contraseña mata las cookies vivas (A-11)", () => {
  const TOKEN = "a".repeat(64);

  it("la cookie lleva la versión del hash; otro hash → otra versión; un token pelado no es credencial", () => {
    /* La edicion que lo pone en rojo: que credencialVigente ignore el hash, o que leerCredencial
       acepte un token sin versión (la cookie de antes de A-11 volvería a valer). */
    const cookie = armarCredencial(TOKEN, "$2b$12$hashViejo");
    const cred = leerCredencial(cookie);
    expect(cred).toEqual({ token: TOKEN, version: versionDeCredencial("$2b$12$hashViejo") });
    expect(credencialVigente(cred!, "$2b$12$hashViejo")).toBe(true);
    expect(
      credencialVigente(cred!, "$2b$12$hashNuevo"),
      "la contraseña cambió y la cookie sigue valiendo",
    ).toBe(false);
    expect(leerCredencial(TOKEN), "un token pelado (cookie vieja) no es una credencial").toBeNull();
    expect(leerCredencial(`${TOKEN}.zzzzzzzz`)).toBeNull();
    expect(leerCredencial(undefined)).toBeNull();
  });

  it("los chokepoints cotejan la versión y los dos verify la escriben en la cookie", () => {
    const lee = (f: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, f), "utf8"));
    const access = lee("lib/external/access.ts");
    expect(access, "el resolver del proyecto parsea la credencial").toContain("leerCredencial(credencial)");
    expect(access, "…y coteja la versión contra el hash vigente").toContain(
      "credencialVigente(cred, access.passwordHash)",
    );
    const bc = lee("lib/external/business-case-view.ts");
    expect(bc).toContain("credencialVigente({ token, version: opts.version }, access.passwordHash)");
    const pagina = lee("app/external/business-case/page.tsx");
    expect(pagina, "la página del BC parsea la cookie y pasa la versión").toContain("{ version: cred.version }");
    // El verify del BC sigue con UNA credencial por cookie: la escribe entera.
    const bcVerify = lee("app/api/external/business-case/verify-access/route.ts");
    expect(bcVerify).toContain("value: armarCredencial(token, access.passwordHash)");
    expect(/value:\s*token\b/.test(bcVerify), "el verify del BC volvió a llevar el token pelado").toBe(false);
    /* El de proyectos SUMA la credencial a una lista (2026-09-10: un navegador recuerda varios
       proyectos, lib/external/lista-de-accesos.ts). Se exige lo mismo que antes sobre la entrada
       nueva: que sea `armarCredencial(token, hash)` —con versión—, nunca el token pelado. */
    const verify = lee("app/external/verify-access/route.ts");
    expect(verify).toMatch(/sumarALaListaDeAccesos\([\s\S]{0,160}armarCredencial\(token, access\.passwordHash\)/);
    expect(/value:\s*token\b/.test(verify), "el verify de proyectos volvió a llevar el token pelado").toBe(false);
  });
});

describe("candado 8 — el token externo no viaja a Sentry (A-12)", () => {
  const TOKEN = "b".repeat(64);

  it("tacha toda cadena de 64 hex en cualquier rincón del evento, sin mutar el original", () => {
    /* La edicion que lo pone en rojo: que tacharToken devuelva el texto tal cual, o que el
       recorrido deje de bajar a breadcrumbs / contexts / extra. */
    const evento = {
      request: {
        url: `https://nexus.smarteamcr.com/external/verify/${TOKEN}`,
        headers: { Referer: `/external/propuesta/${TOKEN}` },
      },
      transaction: `/external/verify/${TOKEN}`,
      contexts: { nextjs: { request_path: `/external/verify/${TOKEN}` } },
      breadcrumbs: [
        { category: "navigation", data: { to: `/external/kickoff?t=${TOKEN}` } },
        { message: `GET /external/propuesta/${TOKEN}` },
      ],
      extra: { anidado: { lista: [`token=${TOKEN}`] } },
      event_id: "0123456789abcdef0123456789abcdef",
    };
    const limpio = tacharTokensDelEvento(evento);
    const json = JSON.stringify(limpio);
    expect(json).not.toContain(TOKEN);
    expect(json.match(/\[token\]/g)?.length, "los 7 lugares donde viajaba").toBe(7);
    expect(limpio.event_id, "un id de 32 hex no es un token").toBe(evento.event_id);
    expect(JSON.stringify(evento), "no muta el evento original").toContain(TOKEN);
  });

  it.each(["instrumentation-client.ts", "instrumentation.ts"])(
    "%s lo cablea en beforeSend y beforeBreadcrumb",
    (archivo) => {
      /* La edicion que lo pone en rojo: sacar beforeSend de un init («total, tracesSampleRate es 0»). */
      const src = sinComentarios(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      expect(src).toContain('from "@/lib/observability/scrub"');
      expect(src, "beforeSend cubre el evento").toContain("beforeSend: tacharTokensDelEvento");
      expect(src, "beforeBreadcrumb cubre la navegación y los fetch").toContain(
        "beforeBreadcrumb: tacharTokensDelEvento",
      );
    },
  );
});

describe("candado 9 — la propuesta se aprueba UNA sola vez, aunque dos la aprueben a la vez (A-21)", () => {
  const ID = "bc-1";

  /** Una base que honra el `where` como Postgres: con `approvedAt: null` solo escribe si sigue libre. */
  function baseFalsa() {
    let fila = {
      publishedAt: new Date("2026-09-01T00:00:00Z"),
      approvedAt: null as Date | null,
      approvedByEmail: null as string | null,
      approvedByName: null as string | null,
      approvedSnapshotAt: null as Date | null,
    };
    const db: BaseDeAprobacion = {
      businessCase: {
        findUnique: async ({ where }) => (where.id === ID ? { ...fila } : null),
        updateMany: async ({ where, data }) => {
          if (where.id !== ID) return { count: 0 };
          const exigeLibre = "approvedAt" in where && where.approvedAt === null;
          if (exigeLibre && fila.approvedAt !== null) return { count: 0 };
          fila = { ...fila, ...data };
          return { count: 1 };
        },
      },
    };
    return { db, fila: () => fila };
  }

  it("la segunda aprobación no pisa a la primera, ni en secuencia ni en carrera", async () => {
    /* La edicion que lo pone en rojo: sacar `approvedAt: null` del where (vuelve el check-then-act),
       o devolver yaEstaba:false sin mirar el count. */
    const uno = baseFalsa();
    const a = await aprobarUnaSolaVez(uno.db, ID, { email: "ana@cliente.com", name: "Ana" });
    const b = await aprobarUnaSolaVez(uno.db, ID, { email: "beto@cliente.com" });
    expect(a).toMatchObject({ yaEstaba: false, approval: { approvedByEmail: "ana@cliente.com", approvedByName: "Ana" } });
    expect(b, "la segunda tiene que ver a la PRIMERA, no pisarla").toMatchObject({
      yaEstaba: true,
      approval: { approvedByEmail: "ana@cliente.com" },
    });
    expect(uno.fila().approvedByEmail).toBe("ana@cliente.com");

    // La carrera de verdad: las dos leen «sin aprobar» ANTES de que ninguna escriba.
    const dos = baseFalsa();
    const [x, y] = await Promise.all([
      aprobarUnaSolaVez(dos.db, ID, { email: "x@cliente.com" }),
      aprobarUnaSolaVez(dos.db, ID, { email: "y@cliente.com" }),
    ]);
    expect([x, y].filter((r) => !r.yaEstaba).length, "exactamente una gana la carrera").toBe(1);
    const ganadora = dos.fila().approvedByEmail;
    expect([x.approval.approvedByEmail, y.approval.approvedByEmail], "las dos ven la MISMA aprobación").toEqual([
      ganadora,
      ganadora,
    ]);
  });

  it("mutations.ts delega en la versión atómica y ya no hace check-then-act", () => {
    const src = sinComentarios(fs.readFileSync(path.join(RAIZ, "lib/business-cases/mutations.ts"), "utf8"));
    expect(src).toContain("aprobarUnaSolaVez(prisma, businessCaseId, input)");
    expect(src.includes("if (bc.approvedAt)"), "volvió el check-then-act").toBe(false);
  });
});

describe("candado 10 — el SDK de Sentry no viaja en el chunk de todas las páginas (C-14)", () => {
  /**
   * Medido el 2026-09-04: 426 KB de los 674 KB que descarga TODA página eran el SDK, con DSN o
   * sin él. En el navegador se carga bajo demanda (lib/observability/sentry-lazy.ts): sin
   * `NEXT_PUBLIC_SENTRY_DSN` nunca; con DSN, en un chunk aparte. Un import ESTÁTICO en cualquier
   * módulo de cliente lo devuelve al chunk raíz sin que nada falle — solo se ve en el peso.
   */
  const caminar = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) caminar(rel, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  };

  it("ningún módulo de cliente importa @sentry/nextjs de forma estática", () => {
    /* La edición que lo pone en rojo: volver a `import * as Sentry from "@sentry/nextjs"` en un
       error.tsx «porque es más simple» — el SDK vuelve al chunk de todas las páginas de ese árbol. */
    const clientes = [
      "instrumentation-client.ts",
      "lib/observability/report-error.ts",
      ...[...caminar("app"), ...caminar("components")].filter((f) => /^\s*"use client"/m.test(fs.readFileSync(path.join(RAIZ, f), "utf8"))),
    ];
    expect(clientes.length, "el escaneo no encontró módulos de cliente").toBeGreaterThan(20);
    const estaticos = clientes.filter((f) => /from\s+"@sentry\/nextjs"/.test(sinComentarios(fs.readFileSync(path.join(RAIZ, f), "utf8"))));
    expect(estaticos, "estos módulos de cliente meten el SDK entero en el chunk raíz").toEqual([]);
  });

  it("el cargador es bajo demanda, gateado por el DSN literal, y el hook de navegación sigue sincrónico", () => {
    const lazy = sinComentarios(fs.readFileSync(path.join(RAIZ, "lib/observability/sentry-lazy.ts"), "utf8"));
    expect(lazy).toContain('import("@sentry/nextjs")');
    expect(lazy, "el DSN tiene que leerse literal para que Next lo inline").toContain("process.env.NEXT_PUBLIC_SENTRY_DSN");
    const cliente = sinComentarios(fs.readFileSync(path.join(RAIZ, "instrumentation-client.ts"), "utf8"));
    expect(cliente).toContain("conSentry(");
    expect(cliente, "Next exige el hook sincrónico y presente al cargar: tiene que ser un wrapper").toMatch(
      /export const onRouterTransitionStart = \(href: string, navigationType: string\): void =>/,
    );
  });
});

describe("candado 5b — el PANEL del CSE no puede prometer un largo distinto del que el servidor exige", () => {
  /**
   * A-10 subió el mínimo del servidor a 12 y el panel siguió validando `>= 8` y diciendo
   * «8–64 caracteres»: el CSE escribía una de 9, el botón se habilitaba, y el servidor contestaba
   * 400. Se arregló el 2026-09-05 haciendo que el panel IMPORTE las mismas constantes.
   *
   * Este candado existe porque ese arreglo era el único de los tres de esa tanda sin guarda: nada
   * impedía que alguien volviera a escribir el número a mano, y la divergencia es invisible hasta
   * que un CSE se come el 400.
   *
   * La edición que lo pone en rojo: cambiar `LARGO_MINIMO_CONTRASENA` por un 12 literal (o el
   * máximo por un 64) en el panel.
   */
  const panel = fs.readFileSync(path.join(process.cwd(), "components/clients/ExternalAccessPanel.tsx"), "utf8");

  it("el panel deriva el largo de la política, no lo transcribe", () => {
    const validacion = panel.slice(panel.indexOf("const validLen"), panel.indexOf("const validLen") + 260);
    expect(validacion.length, "la guarda no mira nada: se movió `validLen`").toBeGreaterThan(60);
    expect(validacion, "el mínimo sale de la política").toContain("LARGO_MINIMO_CONTRASENA");
    expect(validacion, "y el máximo también: era el mismo bug en el otro extremo").toContain("LARGO_MAXIMO_CONTRASENA");
    expect(
      /trimmed\.length\s*[><]=?\s*\d/.test(validacion),
      "el panel volvió a comparar el largo contra un número escrito a mano",
    ).toBe(false);
  });

  it("y el texto que lee el CSE dice los mismos números", () => {
    expect(panel, "el aviso del panel transcribió un largo").not.toMatch(/tener \d+[–-]\d+ caracteres/);
    expect(panel).toContain("{LARGO_MINIMO_CONTRASENA}–{LARGO_MAXIMO_CONTRASENA} caracteres");
  });
});
