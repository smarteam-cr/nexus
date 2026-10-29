/**
 * lib/net/transporte.test.ts — la conexión va a la IP que se le da, no a la que diga el DNS.
 *
 * Con un servidor de verdad en 127.0.0.1: se pide un dominio que no existe y la respuesta llega igual,
 * porque la conexión no le pregunta al DNS (es lo que cierra el DNS rebinding en pedido-publico.ts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";

vi.mock("server-only", () => ({}));

import { pedirConIpFija } from "./transporte";

let servidor: http.Server;
let puerto = 0;
const vistos: { host?: string; ua?: string }[] = [];

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    vistos.push({ host: req.headers.host, ua: req.headers["user-agent"] });
    if (req.url === "/redirige") {
      res.writeHead(302, { location: "https://otro.com/" }).end();
    } else if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(zlib.gzipSync("<p>comprimida</p>"));
    } else if (req.url === "/deflate") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "deflate" }).end(zlib.deflateSync("<p>deflate</p>"));
    } else if (req.url === "/br") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" }).end(zlib.brotliCompressSync("<p>br</p>"));
    } else if (req.url === "/vacia") {
      res.writeHead(204).end();
    } else {
      res.writeHead(200, { "content-type": "text/html" }).end("<p>hola</p>");
    }
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  puerto = (servidor.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

const url = (ruta: string) => new URL(`http://no-existe.invalid:${puerto}${ruta}`);

describe("pedirConIpFija", () => {
  it("se conecta a la IP dada, con el dominio en Host, sin consultar el DNS", async () => {
    const res = await pedirConIpFija(url("/"), ["127.0.0.1"], { headers: { "User-Agent": "prueba" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>hola</p>");
    expect(vistos.at(-1)).toEqual({ host: `no-existe.invalid:${puerto}`, ua: "prueba" });
  });

  it("si la primera IP no responde, prueba la siguiente", async () => {
    // 127.0.0.2 también es la propia máquina, pero ahí nadie escucha en ese puerto.
    const res = await pedirConIpFija(url("/"), ["127.0.0.2", "127.0.0.1"]);
    expect(await res.text()).toBe("<p>hola</p>");
  });

  it("no sigue redirecciones: devuelve el 3xx con su destino", async () => {
    const res = await pedirConIpFija(url("/redirige"), ["127.0.0.1"]);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://otro.com/");
  });

  it("descomprime gzip y acepta respuestas sin cuerpo", async () => {
    const comprimida = await pedirConIpFija(url("/gzip"), ["127.0.0.1"]);
    expect(comprimida.headers.get("content-encoding")).toBeNull();
    expect(await comprimida.text()).toBe("<p>comprimida</p>");
    expect(await (await pedirConIpFija(url("/deflate"), ["127.0.0.1"])).text()).toBe("<p>deflate</p>");
    expect(await (await pedirConIpFija(url("/br"), ["127.0.0.1"])).text()).toBe("<p>br</p>");
    const vacia = await pedirConIpFija(url("/vacia"), ["127.0.0.1"]);
    expect(vacia.status).toBe(204);
    expect(vacia.body).toBeNull();
  });

  it("un corte de la señal rechaza el pedido", async () => {
    const corte = new AbortController();
    corte.abort();
    await expect(pedirConIpFija(url("/"), ["127.0.0.1"], { signal: corte.signal })).rejects.toThrow();
  });
});
