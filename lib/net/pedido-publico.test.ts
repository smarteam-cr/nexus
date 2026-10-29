/**
 * lib/net/pedido-publico.test.ts — el servidor no se deja usar de puente hacia adentro (SSRF).
 *
 * Cubre las reglas puras (direccion-publica.ts) y el pedido con DNS y redirecciones (pedido-publico.ts),
 * con el DNS y la conexión simulados, más cómo se lo cuenta a la persona `fetchWebPage` y cómo lee
 * `leerSitioWeb` el sitio de una empresa. La conexión de verdad (a la IP fija) se prueba en transporte.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dns = vi.hoisted(() => ({ tabla: {} as Record<string, string[]> }));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => {
    if (host === "lento.com") return new Promise(() => {});
    const ips = dns.tabla[host];
    if (!ips) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  },
}));

const red = vi.hoisted(() => ({
  pedir: null as null | ((url: URL, ips: string[], init?: { headers?: HeadersInit; signal?: AbortSignal }) => Promise<Response>),
}));
vi.mock("./transporte", () => ({
  pedirConIpFija: (url: URL, ips: string[], init?: { headers?: HeadersInit; signal?: AbortSignal }) => {
    if (!red.pedir) throw new Error("sin red simulada");
    return red.pedir(url, ips, init);
  },
}));

import { hostPublicoValido, ipInterna, motivoUrlNoPublica } from "./direccion-publica";
import { leerCuerpoHasta, PedidoRechazado, pedirUrlPublica } from "./pedido-publico";
import { fetchWebPage, WebFetchError } from "@/lib/documents/fetch-web-page";
import { leerSitioWeb } from "@/lib/exploraciones/sitio-web";

describe("qué IP es interna", () => {
  it("las IPv4 privadas, de loopback, CGNAT, link-local, metadatos, reservadas y multicast", () => {
    for (const ip of [
      "0.0.0.0", "0.1.2.3", "10.0.0.1", "127.0.0.1", "127.255.255.254", "100.64.0.1", "100.127.255.255",
      "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.0.0.8", "192.0.2.1",
      "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
    ]) {
      expect(ipInterna(ip), ip).toBe(true);
    }
  });

  it("las IPv4 de internet no", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "104.18.2.1", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1", "192.169.0.1"]) {
      expect(ipInterna(ip), ip).toBe(false);
    }
  });

  it("las IPv6 internas, y las que llevan una IPv4 interna adentro", () => {
    for (const ip of [
      "::", "::1", "0:0:0:0:0:0:0:1", "fd00::1", "fc12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "ff02::1",
      "::ffff:10.0.0.1", "::ffff:a00:1", "::FFFF:127.0.0.1", "::ffff:169.254.169.254", "::ffff:0.0.0.0", "::127.0.0.1",
      "::ffff:0:127.0.0.1", "::ffff:0:10.0.0.1", "::ffff:0:169.254.169.254", "::1:0:0:1",
      "64:ff9b::a9fe:a9fe", "64:ff9b::10.1.2.3", "64:ff9b:1::1", "2002:c0a8:0101::1", "2002:7f00:1::",
      "2001::1", "2001:db8::1", "100::1", "[::1]",
    ]) {
      expect(ipInterna(ip), ip).toBe(true);
    }
  });

  it("las IPv6 de internet no", () => {
    for (const ip of ["2606:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:0808:0808::1"]) {
      expect(ipInterna(ip), ip).toBe(false);
    }
  });

  it("lo que no es una IP cuenta como interno", () => {
    for (const x of ["", "localhost", "999.1.1.1", "1:2:3", "::g"]) expect(ipInterna(x), x).toBe(true);
  });
});

describe("qué URL tiene forma de internet", () => {
  it("acepta http(s) con un dominio de verdad", () => {
    for (const u of ["https://acme.com/propuesta", "http://www.acme.co.cr/a?b=1", "https://acme.com:443/", "https://xn--pea-hqa.com/"]) {
      expect(motivoUrlNoPublica(new URL(u)), u).toBeNull();
    }
  });

  it("rechaza otros protocolos, credenciales, puertos, IPs escritas y nombres locales", () => {
    const casos: [string, string][] = [
      ["ftp://acme.com/", "PROTOCOLO"],
      ["file:///etc/passwd", "PROTOCOLO"],
      ["https://user:x@acme.com/", "CREDENCIALES"],
      ["https://acme.com:8443/", "PUERTO"],
      ["http://acme.com:443/", "PUERTO"],
      ["http://127.0.0.1/", "HOST"],
      ["http://2130706433/", "HOST"],
      ["http://0x7f.1/", "HOST"],
      ["http://8.8.8.8/", "HOST"],
      ["http://[::ffff:10.0.0.1]/", "HOST"],
      ["http://localhost/", "HOST"],
      ["http://api.localhost/", "HOST"],
      ["http://servidor.local/", "HOST"],
      ["http://metadata.google.internal/", "HOST"],
      ["http://intranet/", "HOST"],
    ];
    for (const [u, motivo] of casos) expect(motivoUrlNoPublica(new URL(u)), u).toBe(motivo);
  });

  it("un host válido tiene forma de dominio", () => {
    expect(hostPublicoValido("acme.com")).toBe(true);
    expect(hostPublicoValido("propuesta_cliente.acme.com")).toBe(true);
    expect(hostPublicoValido("-acme.com")).toBe(false);
    expect(hostPublicoValido("acme..com")).toBe(false);
  });
});

/** Una red simulada: cada URL responde lo que diga la tabla. Anota a qué IP se conectó cada pedido. */
function simularFetch(respuestas: Record<string, () => Response>) {
  const pedidas: string[] = [];
  const ips: string[][] = [];
  const fn = vi.fn(async (entrada: URL, ipsDelPedido: string[], init?: { headers?: HeadersInit; signal?: AbortSignal }) => {
    init?.signal?.throwIfAborted();
    const url = entrada.toString();
    pedidas.push(url);
    ips.push(ipsDelPedido);
    const r = respuestas[url];
    if (!r) throw new TypeError(`fetch failed: ${url}`);
    return r();
  });
  red.pedir = fn;
  return { pedidas, ips, fn };
}

const redirige = (location: string, status = 302) => () => new Response(null, { status, headers: { location } });
const html = (cuerpo: string) => () => new Response(cuerpo, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

beforeEach(() => {
  dns.tabla = {
    "acme.com": ["104.18.2.1"],
    "www.acme.com": ["104.18.2.1", "2606:4700::1111"],
    "bit.ly": ["67.199.248.10"],
    "otro.com": ["93.184.216.34"],
    "interno.acme.com": ["10.0.0.5"],
    "mixto.com": ["93.184.216.34", "127.0.0.1"],
    "nube.com": ["169.254.169.254"],
    "v6.com": ["::ffff:192.168.0.10"],
    "casa.com": ["192.168.1.20"],
  };
});

afterEach(() => {
  red.pedir = null;
});

async function rechazo(p: Promise<unknown>): Promise<PedidoRechazado> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(PedidoRechazado);
  return e as PedidoRechazado;
}

describe("el pedido valida el DNS antes de cada salto", () => {
  it("un dominio que resuelve a una IP interna no se pide", async () => {
    const { fn } = simularFetch({});
    for (const host of ["interno.acme.com", "casa.com", "nube.com", "v6.com", "mixto.com"]) {
      const e = await rechazo(pedirUrlPublica(new URL(`https://${host}/`), { maxRedirecciones: 3 }));
      expect(e.motivo, host).toBe("IP_INTERNA");
      expect(e.salto).toBe(0);
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it("un dominio público se pide, una sola vez y sin seguir redirecciones por su cuenta", async () => {
    const { pedidas, ips } = simularFetch({ "https://acme.com/": html("<p>hola</p>"), "https://www.acme.com/": html("<p>hola</p>") });
    const { res, url } = await pedirUrlPublica(new URL("https://acme.com/"), { maxRedirecciones: 3 });
    expect(res.status).toBe(200);
    expect(url.toString()).toBe("https://acme.com/");
    expect(pedidas).toEqual(["https://acme.com/"]);
    // La conexión va a las IPs que se validaron (todas, por si una no responde), no a las que diga el DNS al conectarse.
    expect(ips).toEqual([["104.18.2.1"]]);
    await pedirUrlPublica(new URL("https://www.acme.com/"), { maxRedirecciones: 3 });
    expect(ips[1]).toEqual(["104.18.2.1", "2606:4700::1111"]);
  });

  it("si el DNS no contesta, el corte de la señal lo cubre", async () => {
    simularFetch({});
    const antes = Date.now();
    const e = await pedirUrlPublica(new URL("https://lento.com/"), { maxRedirecciones: 3, signal: AbortSignal.timeout(50) }).then(
      () => null,
      (err: unknown) => err,
    );
    expect((e as Error).name).toBe("TimeoutError");
    expect(Date.now() - antes).toBeLessThan(2_000);
  });

  it("un dominio que no resuelve no se pide", async () => {
    const { fn } = simularFetch({});
    expect((await rechazo(pedirUrlPublica(new URL("https://no-existe.com/"), { maxRedirecciones: 3 }))).motivo).toBe("SIN_DNS");
    expect(fn).not.toHaveBeenCalled();
  });

  it("sigue redirecciones a otro dominio público", async () => {
    const { pedidas } = simularFetch({
      "https://bit.ly/x": redirige("https://otro.com/doc", 301),
      "https://otro.com/doc": redirige("/doc/final"),
      "https://otro.com/doc/final": html("<p>hola</p>"),
    });
    const { res, url } = await pedirUrlPublica(new URL("https://bit.ly/x"), { maxRedirecciones: 3 });
    expect(res.status).toBe(200);
    expect(url.toString()).toBe("https://otro.com/doc/final");
    expect(pedidas).toEqual(["https://bit.ly/x", "https://otro.com/doc", "https://otro.com/doc/final"]);
  });

  it("una redirección a una dirección interna se corta antes de pedirla", async () => {
    for (const destino of ["http://127.0.0.1/admin", "http://10.1.2.3/", "http://192.168.0.1/", "https://casa.com/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "https://interno.acme.com/", "http://localhost:3004/api/health", "https://acme.com:8443/"]) {
      const { pedidas } = simularFetch({ "https://acme.com/": redirige(destino) });
      const e = await rechazo(pedirUrlPublica(new URL("https://acme.com/"), { maxRedirecciones: 3 }));
      expect(["HOST", "IP_INTERNA", "PUERTO"], destino).toContain(e.motivo);
      expect(e.salto).toBe(1);
      expect(pedidas).toEqual(["https://acme.com/"]);
    }
  });

  it("corta tras el máximo de redirecciones, y sin destino", async () => {
    const { pedidas } = simularFetch({ "https://acme.com/": redirige("https://acme.com/"), "https://otro.com/": redirige("") });
    expect((await rechazo(pedirUrlPublica(new URL("https://acme.com/"), { maxRedirecciones: 2 }))).motivo).toBe("DEMASIADAS_REDIRECCIONES");
    // La pedida y dos redirecciones: ni una más.
    expect(pedidas).toHaveLength(3);
    expect((await rechazo(pedirUrlPublica(new URL("https://otro.com/"), { maxRedirecciones: 2 }))).motivo).toBe("REDIRECCION");
  });

  it("quien llama puede acotar a dónde se sigue", async () => {
    simularFetch({ "https://acme.com/": redirige("https://otro.com/") });
    const e = await rechazo(
      pedirUrlPublica(new URL("https://acme.com/"), { maxRedirecciones: 3, permitirSalto: (u) => u.hostname.endsWith("acme.com") }),
    );
    expect(e.motivo).toBe("REDIRECCION");
  });

  it("el cuerpo se lee con tope", async () => {
    const corto = await leerCuerpoHasta(new Response("abc"), 10);
    expect(corto).toEqual({ bytes: Buffer.from("abc"), cortado: false });
    const largo = await leerCuerpoHasta(new Response("x".repeat(50)), 10);
    expect(largo.cortado).toBe(true);
    expect(largo.bytes.length).toBe(10);
  });
});

async function errorDe(p: Promise<unknown>): Promise<WebFetchError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(WebFetchError);
  return e as WebFetchError;
}

describe("fetchWebPage, la página que pega una persona", () => {
  const PAGINA = "<html><head><title>Propuesta Acme</title></head><body><p>Este es el texto de la propuesta comercial.</p></body></html>";

  it("lee una página pública aunque redirija a otro dominio, y se pide como un navegador", async () => {
    const { fn } = simularFetch({ "https://bit.ly/x": redirige("https://otro.com/p"), "https://otro.com/p": html(PAGINA) });
    const pagina = await fetchWebPage("https://bit.ly/x");
    expect(pagina.title).toBe("Propuesta Acme");
    expect(pagina.content).toContain("texto de la propuesta");
    const headers = new Headers(fn.mock.calls[0][2]?.headers);
    expect(headers.get("user-agent")).toMatch(/^Mozilla\/5\.0/);
  });

  it("bloquea lo interno, en la URL pegada o en una redirección, y lo dice", async () => {
    simularFetch({ "https://acme.com/": redirige("http://169.254.169.254/latest/meta-data/") });
    const enRedireccion = await errorDe(fetchWebPage("https://acme.com/"));
    expect(enRedireccion.code).toBe("BLOCKED");
    expect(enRedireccion.message).toMatch(/^La página redirige/);

    const directa = await errorDe(fetchWebPage("https://interno.acme.com/"));
    expect(directa.code).toBe("BLOCKED");
    expect(directa.message).toMatch(/^La URL apunta/);

    for (const u of [
      "http://127.0.0.1/", "http://localhost/", "http://localhost:3004/", "http://10.0.0.1/", "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:10.0.0.1]/", "https://casa.com/",
    ]) {
      expect((await errorDe(fetchWebPage(u))).code, u).toBe("BLOCKED");
    }
    expect((await errorDe(fetchWebPage("ftp://acme.com/"))).code).toBe("INVALID_URL");
    expect((await errorDe(fetchWebPage("no es una url"))).code).toBe("INVALID_URL");
  });

  it("si el sitio rechaza al navegador con un 403, vuelve a pedir con el agente propio", async () => {
    const red403 = vi.fn(async (_u: URL, _ips: string[], init?: { headers?: HeadersInit }) =>
      /^Mozilla/.test(new Headers(init?.headers).get("user-agent") ?? "") ? new Response("no", { status: 403 }) : html(PAGINA)(),
    );
    red.pedir = red403;
    const pagina = await fetchWebPage("https://acme.com/");
    expect(pagina.title).toBe("Propuesta Acme");
    expect(red403).toHaveBeenCalledTimes(2);
    expect(new Headers(red403.mock.calls[1][2]?.headers).get("user-agent")).toMatch(/^NexusBot/);
  });

  it("una página que se pasa del tiempo a mitad del cuerpo dice que tardó demasiado", async () => {
    const reloj = new AbortController();
    const espia = vi.spyOn(AbortSignal, "timeout").mockReturnValue(reloj.signal);
    red.pedir = async () => {
      const cuerpo = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("<html><body>"));
          // Llega el principio y el resto no: el corte rompe el cuerpo con un error sin nombre de corte.
          setTimeout(() => {
            reloj.abort();
            c.error(new TypeError("terminated"));
          }, 10);
        },
      });
      return new Response(cuerpo, { status: 200, headers: { "content-type": "text/html" } });
    };
    try {
      const e = await errorDe(fetchWebPage("https://acme.com/"));
      expect(e.message).toBe("La página tardó demasiado en responder.");
    } finally {
      espia.mockRestore();
    }
  });

  it("un dominio que no existe, un estado de error y una página muy grande", async () => {
    simularFetch({
      "https://acme.com/404": () => new Response("no", { status: 404 }),
      "https://acme.com/grande": () => new Response("x", { status: 200, headers: { "content-type": "text/html", "content-length": String(6 * 1024 * 1024) } }),
    });
    expect((await errorDe(fetchWebPage("https://no-existe.com/"))).code).toBe("FETCH_FAILED");
    const e404 = await errorDe(fetchWebPage("https://acme.com/404"));
    expect(e404.message).toContain("404");
    expect((await errorDe(fetchWebPage("https://acme.com/grande"))).code).toBe("TOO_LARGE");
  });
});

describe("leerSitioWeb, el sitio de una empresa desde HubSpot", () => {
  const PORTADA =
    "<html><head><title>Acme</title></head><body><p>Acme fabrica cajas de cartón para la industria alimentaria en toda la región.</p></body></html>";

  it("lee la portada y sigue una redirección dentro del mismo sitio", async () => {
    const { pedidas } = simularFetch({ "https://acme.com/": redirige("https://www.acme.com/inicio"), "https://www.acme.com/inicio": html(PORTADA) });
    const sitio = await leerSitioWeb("acme.com");
    expect(sitio?.url).toBe("https://www.acme.com/inicio");
    expect(sitio?.texto).toContain("cajas de cartón");
    expect(pedidas).toEqual(["https://acme.com/", "https://www.acme.com/inicio"]);
  });

  it("no sigue una redirección a otro sitio", async () => {
    const { pedidas } = simularFetch({ "https://acme.com/": redirige("https://otro.com/"), "https://otro.com/": html(PORTADA) });
    expect(await leerSitioWeb("acme.com")).toBeNull();
    expect(pedidas).toEqual(["https://acme.com/"]);
  });

  it("no lee lo que no es una página web, ni un sitio que resuelve adentro", async () => {
    simularFetch({ "https://acme.com/": () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }) });
    expect(await leerSitioWeb("acme.com")).toBeNull();
    const { fn } = simularFetch({});
    expect(await leerSitioWeb("interno.acme.com")).toBeNull();
    expect(await leerSitioWeb("localhost")).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("corta tras tres redirecciones dentro del sitio", async () => {
    const { pedidas } = simularFetch({ "https://acme.com/": redirige("https://acme.com/") });
    expect(await leerSitioWeb("acme.com")).toBeNull();
    expect(pedidas).toHaveLength(4);
  });
});
