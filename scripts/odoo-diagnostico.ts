/**
 * scripts/odoo-diagnostico.ts — SONDA DESCARTABLE. No es código de producción.
 *
 * Mide el API de Odoo de Smarteam antes de planificar la integración. NO escribe nada:
 * ni en Odoo (que además solo expone GET) ni en Nexus. Solo lee y cuenta.
 *
 *   $env:ODOO_PASSWORD = "…"           # PowerShell, solo esta sesión
 *   npx tsx scripts/odoo-diagnostico.ts --json docs/odoo-diagnostico.json
 *
 * ⚠ La contraseña se lee de ODOO_PASSWORD y NO se escribe en ningún archivo ni se
 * imprime. La API key tampoco: solo se registra su LARGO.
 *
 * ⚠⚠ SIN ODOO_PASSWORD NO SE INTENTA NINGÚN LOGIN. Odoo 17 corta por IP a los 5 fallos
 * (`base.login_cooldown_after`) durante 60 s (`base.login_cooldown_duration`), y si el
 * servidor está detrás de un proxy sin `proxy_mode`, ese cooldown lo comparten TODOS los
 * clientes legítimos. Sondear con credenciales inventadas no es gratis.
 *
 * Todo error se ANOTA, no se arregla: un modelo que no responde es un hallazgo.
 *
 * ── EL CONTRATO REAL DEL MÓDULO (leído del fuente, CybroOdoo/CybroAddons rama 17.0) ──
 *   · Dos rutas: /odoo_connect y /send_request. Nada más.
 *   · /send_request acepta SOLO los query params `model` e `Id`. No hay domain, limit,
 *     offset ni order. Traer la tabla entera es la única opción.
 *   · `fields` es OBLIGATORIO y va en el CUERPO — incluso en un GET. Sin cuerpo, el
 *     `json.loads` corre FUERA del try y revienta con 500.
 *   · El header de la clave es `api-key` CON GUION.
 *   · La api-key NO reemplaza la contraseña: /send_request llama `session.authenticate`
 *     con los headers login/password en CADA petición.
 *   · Ningún error devuelve status HTTP correcto: todos son 200 con un cuerpo `<html>`.
 */
import "dotenv/config";
import https from "node:https";
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db/prisma";
/**
 * Se REUSA el matcher de `respaldo-de-factura`, afinado contra estos mismos nombres. Su
 * regla —todas las palabras distintivas del nombre corto tienen que estar en el largo—
 * nació de un defecto real: pedir UNA palabra en común hacía que "Amvac Latam" emparejara
 * con "Forestales LATAM". Reinventarlo acá sería repetir ese error.
 */
import { palabrasDistintivas, seParecen } from "@/lib/ventas/respaldo-de-factura";

const BASE = "erp.smarteamcr.com";
const DB = "smarteamcr";
const LOGIN = "direct";
const PASSWORD = process.env.ODOO_PASSWORD ?? "";

const MODELOS = [
  "res.partner",
  "account.move",
  "account.move.line",
  "account.payment",
  "res.currency",
  "account.tax",
  "res.company",
  "account.journal",
  "account.bank.statement.line",
] as const;

const R: Record<string, unknown> = {};
const anotar = (k: string, v: unknown) => {
  R[k] = v;
};
const linea = (s = "") => console.log(s);
const titulo = (s: string) => {
  linea();
  linea("=".repeat(78));
  linea(s);
  linea("=".repeat(78));
};
const err = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

async function medir<T>(fn: () => Promise<T>): Promise<{ ms: number; ok: boolean; valor?: T; error?: string }> {
  const t = process.hrtime.bigint();
  try {
    const valor = await fn();
    return { ms: Math.round(Number(process.hrtime.bigint() - t) / 1e6), ok: true, valor };
  } catch (e) {
    return { ms: Math.round(Number(process.hrtime.bigint() - t) / 1e6), ok: false, error: err(e) };
  }
}

/* ── TRANSPORTE ──────────────────────────────────────────────────────────────
   ⚠ `fetch` de Node 22 RECHAZA cuerpo en GET: `TypeError: Request with GET/HEAD
   method cannot have body.` — verificado, y no se salta con duplex ni dispatcher.
   `node:https` sí lo manda, PERO no pone Content-Length solo en un GET: sin ese
   header el cuerpo viaja sin delimitador y Werkzeug lee 0 bytes. Acá va explícito.
   ────────────────────────────────────────────────────────────────────────────── */

interface Respuesta {
  status: number;
  ctype: string;
  bytes: number;
  texto: string;
  cookies: string[];
}

function crudo(
  path: string,
  headers: Record<string, string>,
  cuerpo?: string,
  metodo = "GET",
  topeBytes = Infinity,
): Promise<Respuesta> {
  return new Promise((res, rej) => {
    const h: Record<string, string> = { ...headers };
    if (cuerpo !== undefined) {
      h["Content-Type"] = h["Content-Type"] ?? "application/json";
      h["Content-Length"] = String(Buffer.byteLength(cuerpo)); // imprescindible en GET
    }
    const req = https.request({ hostname: BASE, path, method: metodo, headers: h }, (r) => {
      let bytes = 0;
      const trozos: Buffer[] = [];
      r.on("data", (c: Buffer) => {
        bytes += c.length;
        // Se CUENTA todo lo que llega pero solo se guarda el principio: account.move.line
        // podría ser cientos de MB y el byte count sigue siendo el número real.
        if (bytes <= topeBytes) trozos.push(c);
      });
      r.on("end", () =>
        res({
          status: r.statusCode ?? 0,
          ctype: String(r.headers["content-type"] ?? ""),
          bytes,
          texto: Buffer.concat(trozos).toString("utf8"),
          cookies: (r.headers["set-cookie"] ?? []) as string[],
        }),
      );
      r.on("error", rej);
    });
    req.on("error", rej);
    if (cuerpo !== undefined) req.write(cuerpo);
    req.end();
  });
}

/** El módulo devuelve errores como HTML con status 200. El status NO sirve para decidir. */
const esError = (t: string) => t.trimStart().startsWith("<");

function comoJson(t: string): { json: unknown; esJson: boolean } {
  try {
    return { json: JSON.parse(t), esJson: true };
  } catch {
    return { json: null, esJson: false };
  }
}

/* ── 1. PROTOCOLO REST ───────────────────────────────────────────────────────── */

let API_KEY = "";
let COOKIE = "";

/** Una llamada a /send_request como el módulo la exige de verdad. */
function sendRequest(modelo: string, campos: string[], id?: number, topeBytes = 8000) {
  const h: Record<string, string> = { login: LOGIN, password: PASSWORD, "api-key": API_KEY };
  if (COOKIE) h["Cookie"] = COOKIE;
  const q = `/send_request?model=${encodeURIComponent(modelo)}${id ? `&Id=${id}` : ""}`;
  return crudo(q, h, JSON.stringify({ fields: campos }), "GET", topeBytes);
}

/** El módulo responde `{"records":[…]}`. Se acepta también un array pelado por las dudas. */
function registrosDe(t: string): unknown[] | null {
  const j = comoJson(t);
  if (Array.isArray(j.json)) return j.json;
  const r = (j.json as { records?: unknown })?.records;
  return Array.isArray(r) ? r : null;
}

async function protocoloRest() {
  titulo("1 - PROTOCOLO REST");

  const conn = await medir(() => crudo("/odoo_connect", { db: DB, login: LOGIN, password: PASSWORD }));
  const cuerpo = conn.valor?.texto ?? "";
  const pj = comoJson(cuerpo);
  linea(`/odoo_connect -> status ${conn.valor?.status} | ${conn.ms} ms | ${conn.valor?.bytes} bytes | ${conn.valor?.ctype}`);
  linea(`  cuerpo parseable como JSON: ${pj.esJson ? "si" : "NO"}${pj.esJson ? "" : ` | ${cuerpo.slice(0, 200)}`}`);
  const key = (pj.json as { "api-key"?: string })?.["api-key"] ?? "";
  API_KEY = key;
  COOKIE = (conn.valor?.cookies ?? []).map((c) => c.split(";")[0]).join("; ");
  anotar("odoo_connect", {
    status: conn.valor?.status,
    ms: conn.ms,
    bytes: conn.valor?.bytes,
    contentType: conn.valor?.ctype,
    esJson: pj.esJson,
    clavesDelJson: pj.esJson && pj.json && typeof pj.json === "object" ? Object.keys(pj.json as object) : null,
    cuerpoSiNoEsJson: pj.esJson ? null : cuerpo.slice(0, 400),
    largoDeKey: key.length || null,
    devolvioCookie: (conn.valor?.cookies ?? []).length > 0,
    error: conn.error ?? null,
  });
  if (!key) {
    linea("  [X] Sin API key no hay REST. Se anota y se sigue.");
    return;
  }
  linea(`  [OK] API key de ${key.length} caracteres | cookie: ${COOKIE ? "si" : "no"}`);

  titulo("1.2 - Nombre del header de la clave, y que pasa sin cuerpo");
  const variantes: Record<string, unknown> = {};
  for (const nombre of ["api-key", "api_key", "API-KEY"]) {
    const h: Record<string, string> = { login: LOGIN, password: PASSWORD, [nombre]: API_KEY };
    if (COOKIE) h["Cookie"] = COOKIE;
    const m = await medir(() => crudo("/send_request?model=res.company", h, JSON.stringify({ fields: ["id", "name"] }), "GET", 3000));
    const t = m.valor?.texto ?? "";
    variantes[nombre] = { status: m.valor?.status, ms: m.ms, esError: esError(t), muestra: t.slice(0, 160) };
    linea(`  ${nombre.padEnd(9)} -> ${m.valor?.status} | ${esError(t) ? "ERROR (html)" : "OK (json)"} | ${t.slice(0, 90)}`);
  }
  // El fuente dice que un GET sin cuerpo revienta ANTES del try. Se confirma en vivo.
  const sinCuerpo = await medir(() =>
    crudo(
      "/send_request?model=res.company",
      { login: LOGIN, password: PASSWORD, "api-key": API_KEY, ...(COOKIE ? { Cookie: COOKIE } : {}) },
      undefined,
      "GET",
      3000,
    ),
  );
  linea(`  GET SIN cuerpo -> status ${sinCuerpo.valor?.status} | ${(sinCuerpo.valor?.texto ?? "").slice(0, 120)}`);
  anotar("headerDeClave", variantes);
  anotar("getSinCuerpo", { status: sinCuerpo.valor?.status, muestra: (sinCuerpo.valor?.texto ?? "").slice(0, 300) });

  titulo("1.3 - GET sin Id, y forma de la respuesta");
  const sinId = await medir(() => sendRequest("res.company", ["id", "name", "currency_id"], undefined, 8000));
  const regs = registrosDe(sinId.valor?.texto ?? "");
  const sobre = comoJson(sinId.valor?.texto ?? "");
  linea(`  res.company sin Id -> ${sinId.valor?.status} | ${sinId.ms} ms | ${sinId.valor?.bytes} bytes | ${regs?.length ?? "?"} registros`);
  linea(`  muestra: ${(sinId.valor?.texto ?? "").slice(0, 400)}`);
  anotar("getSinId", {
    status: sinId.valor?.status,
    ms: sinId.ms,
    bytes: sinId.valor?.bytes,
    registros: regs?.length ?? null,
    clavesDelSobre: sobre.json && typeof sobre.json === "object" ? Object.keys(sobre.json as object) : null,
    camposDelPrimero: regs?.[0] && typeof regs[0] === "object" ? Object.keys(regs[0] as object) : null,
  });

  titulo("1.4 - Ignora domain / limit / offset? (el fuente dice que si; se confirma en vivo)");
  const ref = await sendRequest("account.journal", ["id"], undefined, 200_000);
  const nRef = registrosDe(ref.texto)?.length ?? null;
  linea(`  referencia: account.journal con fields=[id] -> ${nRef} registros | ${ref.bytes} bytes`);
  const h2 = () => ({ login: LOGIN, password: PASSWORD, "api-key": API_KEY, ...(COOKIE ? { Cookie: COOKIE } : {}) });
  const intentos = [
    { nombre: "limit=2 en query", path: "/send_request?model=account.journal&limit=2", cuerpo: JSON.stringify({ fields: ["id"] }) },
    { nombre: "offset=1 en query", path: "/send_request?model=account.journal&offset=1", cuerpo: JSON.stringify({ fields: ["id"] }) },
    { nombre: "domain en query", path: `/send_request?model=account.journal&domain=${encodeURIComponent('[["type","=","bank"]]')}`, cuerpo: JSON.stringify({ fields: ["id"] }) },
    { nombre: "limit en cuerpo", path: "/send_request?model=account.journal", cuerpo: JSON.stringify({ fields: ["id"], limit: 2 }) },
    { nombre: "domain en cuerpo", path: "/send_request?model=account.journal", cuerpo: JSON.stringify({ fields: ["id"], domain: [["type", "=", "bank"]] }) },
  ];
  const filtros: Record<string, unknown> = {};
  for (const p of intentos) {
    const m = await medir(() => crudo(p.path, h2(), p.cuerpo, "GET", 200_000));
    const n = registrosDe(m.valor?.texto ?? "")?.length ?? null;
    const respetado = nRef !== null && n !== null && n !== nRef;
    filtros[p.nombre] = { status: m.valor?.status, ms: m.ms, registros: n, loRespeto: respetado };
    linea(`  ${p.nombre.padEnd(20)} -> ${n ?? "?"} registros | ${respetado ? "*** LO RESPETO ***" : "IGNORADO"}`);
  }
  anotar("filtros", { referencia: nRef, intentos: filtros });

  titulo("1.5 - La API key expira o es permanente?");
  const conn2 = await crudo("/odoo_connect", { db: DB, login: LOGIN, password: PASSWORD });
  const key2 = (comoJson(conn2.texto).json as { "api-key"?: string })?.["api-key"] ?? "";
  linea(`  segundo /odoo_connect -> ${key2 === API_KEY ? "MISMA clave (idempotente)" : "clave DISTINTA (rota)"}`);
  anotar("persistenciaDeClave", { mismaEnDosLlamadas: key2 === API_KEY });

  titulo("1.6 - Peso y latencia por modelo (fields=[id]: el costo MINIMO para dimensionar)");
  const porModelo: Record<string, unknown> = {};
  for (const modelo of MODELOS) {
    const m = await medir(() => sendRequest(modelo, ["id"], undefined, 4000));
    const t = m.valor?.texto ?? "";
    const n = registrosDe(t)?.length ?? null;
    porModelo[modelo] = {
      status: m.valor?.status,
      ms: m.ms,
      bytes: m.valor?.bytes,
      registros: n,
      esError: esError(t),
      error: m.error ?? null,
      muestraSiFallo: esError(t) ? t.slice(0, 300) : null,
    };
    linea(
      `  ${modelo.padEnd(28)} ${String(m.valor?.status).padStart(3)} | ${String(m.ms).padStart(6)} ms | ${((m.valor?.bytes ?? 0) / 1048576).toFixed(2).padStart(8)} MB | ${String(n ?? "?").padStart(8)} reg${esError(t) ? "  <-- ERROR" : ""}`,
    );
  }
  anotar("porModelo", porModelo);
}

/* ── 2. XML-RPC / JSON-RPC NATIVO ────────────────────────────────────────────── */

const xmlStr = (v: string) => `<value><string>${v}</string></value>`;

async function xmlrpcAuth(secreto: string) {
  const xml =
    `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>` +
    `<param>${xmlStr(DB)}</param><param>${xmlStr(LOGIN)}</param><param>${xmlStr(secreto)}</param>` +
    `<param><value><struct></struct></value></param></params></methodCall>`;
  const m = await medir(() => crudo("/xmlrpc/2/common", { "Content-Type": "text/xml" }, xml, "POST"));
  const t = m.valor?.texto ?? "";
  const uidMatch = t.match(/<value><int>(\d+)<\/int><\/value>/);
  return {
    ms: m.ms,
    status: m.valor?.status ?? 0,
    uid: uidMatch ? Number(uidMatch[1]) : null,
    devolvioFalse: /<boolean>0<\/boolean>/.test(t),
    fault: t.includes("<fault>")
      ? (t.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/)?.[1] ?? "fault").slice(0, 500)
      : null,
  };
}

async function jsonrpc(servicio: string, metodo: string, args: unknown[], tope = 50_000_000): Promise<unknown> {
  const r = await crudo(
    "/jsonrpc",
    { "Content-Type": "application/json" },
    JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: servicio, method: metodo, args }, id: 1 }),
    "POST",
    tope,
  );
  const j = JSON.parse(r.texto) as { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
  if (j.error) throw new Error(`${j.error.data?.name ?? j.error.message} | ${(j.error.data?.message ?? "").slice(0, 300)}`);
  return j.result;
}

let UID: number | null = null;
let SECRETO = "";

async function rpcNativo() {
  titulo("2 - XML-RPC / JSON-RPC NATIVO");

  const ver = await medir(() =>
    crudo("/xmlrpc/2/common", { "Content-Type": "text/xml" }, `<?xml version="1.0"?><methodCall><methodName>version</methodName><params/></methodCall>`, "POST"),
  );
  const sv = (ver.valor?.texto ?? "").match(/<name>server_version<\/name>\s*<value><string>([^<]+)/)?.[1] ?? null;
  linea(`  /xmlrpc/2/common version() -> ${ver.valor?.status} | ${ver.ms} ms | server_version=${sv} | SIN autenticacion`);
  anotar("xmlrpcCommon", { status: ver.valor?.status, ms: ver.ms, serverVersion: sv });

  /**
   * ⚠ Solo se prueban los DOS secretos legítimos, nunca inventados: Odoo 17 corta por IP a
   * los 5 fallos durante 60 s y detrás de un proxy mal configurado ese corte lo comparten
   * TODOS. Y authenticate() devuelve `false` para TODO fallo —contraseña mala, 2FA, usuario
   * archivado, cooldown—: por el valor de retorno NO se distingue la causa.
   */
  const conPass = await xmlrpcAuth(PASSWORD);
  linea(`  authenticate(contrasena) -> ${conPass.uid ?? (conPass.devolvioFalse ? "false" : "?")} | ${conPass.ms} ms${conPass.fault ? ` | FAULT ${conPass.fault}` : ""}`);
  anotar("xmlrpcAuthContrasena", conPass);

  let conKey: Awaited<ReturnType<typeof xmlrpcAuth>> | null = null;
  if (API_KEY) {
    conKey = await xmlrpcAuth(API_KEY);
    linea(`  authenticate(api-key del modulo) -> ${conKey.uid ?? (conKey.devolvioFalse ? "false" : "?")} | ${conKey.ms} ms`);
    anotar("xmlrpcAuthApiKey", conKey);
  }

  UID = conPass.uid ?? conKey?.uid ?? null;
  SECRETO = conPass.uid ? PASSWORD : conKey?.uid ? API_KEY : "";
  if (!UID) {
    linea("  [X] Ningun secreto autentica por RPC.");
    linea("      authenticate() devuelve `false` para: contrasena mala | 2FA activo | usuario");
    linea("      archivado | sin contrasena local | IP en cooldown. NO se distinguen desde aca.");
    anotar("rpcUsable", false);
    return;
  }
  linea(`  [OK] uid=${UID} (con ${conPass.uid ? "contrasena" : "api-key"})`);

  // Fault 3 = credencial invalida; Fault 4 = autenticado pero sin permiso sobre el modelo.
  const lect = await medir(() => jsonrpc("object", "execute_kw", [DB, UID, SECRETO, "account.move", "search_count", [[]]]));
  linea(`  execute_kw account.move.search_count -> ${lect.ok ? `${lect.valor}` : `ERROR ${lect.error}`}`);
  anotar("rpcUsable", lect.ok);
  anotar("rpcPrimeraLectura", { ok: lect.ok, valor: lect.valor ?? null, error: lect.error ?? null });
}

/* ── 3. LOS DATOS ────────────────────────────────────────────────────────────── */

const cuenta = (m: string, d: unknown[]) => jsonrpc("object", "execute_kw", [DB, UID, SECRETO, m, "search_count", [d]]);
const agrupar = (m: string, d: unknown[], c: string[], g: string[]) =>
  jsonrpc("object", "execute_kw", [DB, UID, SECRETO, m, "read_group", [d, c, g], { lazy: false }]);
const leer = (m: string, d: unknown[], c: string[], kw: Record<string, unknown> = {}) =>
  jsonrpc("object", "execute_kw", [DB, UID, SECRETO, m, "search_read", [d, c], kw]);

async function seguro<T>(etiqueta: string, fn: () => Promise<T>): Promise<T | null> {
  const m = await medir(fn);
  if (!m.ok) {
    linea(`  ${etiqueta.padEnd(44)} [X] ${m.error}`);
    anotar(`error:${etiqueta}`, m.error);
    return null;
  }
  return m.valor as T;
}

const FACTURAS_VENTA = ["out_invoice", "out_refund", "out_receipt"];

async function datos() {
  titulo("3 - LOS DATOS");
  if (!UID) {
    linea("  (sin RPC no hay agregados; los volumenes crudos estan en 1.6)");
    return;
  }

  const partners = await seguro("res.partner total", () => cuenta("res.partner", []));
  const conVat = await seguro("res.partner con vat", () => cuenta("res.partner", [["vat", "!=", false]]));
  const clientes = await seguro("res.partner customer_rank>0", () => cuenta("res.partner", [["customer_rank", ">", 0]]));
  // customer_rank es un HISTORIAL, no una bandera: un partner con facturas cargadas por
  // importacion puede tener rank 0. El cruce contra account.move es el chequeo real.
  const conFacturas = await seguro("partners con al menos una factura", async () => {
    const g = (await agrupar("account.move", [["move_type", "in", FACTURAS_VENTA]], ["id"], ["partner_id"])) as unknown[];
    return g.length;
  });
  const baseVat = await seguro("esta instalado base_vat?", () =>
    cuenta("ir.module.module", [["name", "=", "base_vat"], ["state", "=", "installed"]]),
  );
  linea(`  res.partner: ${partners} total | ${conVat} con vat | ${clientes} con customer_rank>0 | ${conFacturas} con facturas`);
  linea(`  modulo base_vat instalado: ${baseVat ? "SI (el vat esta validado)" : "NO (vat es texto libre sin validar)"}`);
  anotar("resPartner", { total: partners, conVat, customerRank: clientes, conFacturas, baseVatInstalado: !!baseVat });

  const moves = await seguro("account.move total", () => cuenta("account.move", []));
  const porTipo = await seguro("por move_type", () => agrupar("account.move", [], ["id"], ["move_type"]));
  const porEstado = await seguro("por state", () => agrupar("account.move", [], ["id"], ["state"]));
  linea(`  account.move: ${moves} total`);
  if (Array.isArray(porTipo)) for (const g of porTipo as { move_type: string; __count: number }[]) linea(`    ${String(g.move_type).padEnd(14)} ${g.__count}`);
  if (Array.isArray(porEstado)) for (const g of porEstado as { state: string; __count: number }[]) linea(`    ${String(g.state).padEnd(14)} ${g.__count}`);
  anotar("accountMove", { total: moves, porTipo, porEstado });

  const dom2026: unknown[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["invoice_date", ">=", "2026-01-01"],
    ["invoice_date", "<=", "2026-12-31"],
  ];
  const f2026 = await seguro("out_invoice posted 2026", () => cuenta("account.move", dom2026));
  // amount_total es POSITIVO tanto en factura como en nota de credito. Para netear hay que
  // usar amount_total_signed, que ya lleva el signo.
  const porMoneda = await seguro("2026 por moneda", () => agrupar("account.move", dom2026, ["amount_total", "amount_total_signed"], ["currency_id"]));
  const porPago = await seguro("2026 por payment_state", () => agrupar("account.move", dom2026, ["amount_total_signed", "amount_residual_signed"], ["payment_state"]));
  linea(`  out_invoice posted 2026: ${f2026}`);
  if (Array.isArray(porMoneda)) for (const g of porMoneda as { currency_id: [number, string]; __count: number }[]) linea(`    ${String(g.currency_id?.[1] ?? "?").padEnd(10)} ${g.__count}`);
  if (Array.isArray(porPago)) for (const g of porPago as { payment_state: string; __count: number }[]) linea(`    ${String(g.payment_state).padEnd(18)} ${g.__count}`);
  anotar("facturas2026", { total: f2026, porMoneda, porPago });

  const lineas = await seguro("account.move.line total", () => cuenta("account.move.line", []));
  const porDisplay = await seguro("move.line por display_type", () => agrupar("account.move.line", [], ["id"], ["display_type"]));
  linea(`  account.move.line: ${lineas}  <-- decide si REST alcanza`);
  anotar("accountMoveLine", { total: lineas, porDisplayType: porDisplay });

  const pagos = await seguro("account.payment total", () => cuenta("account.payment", []));
  const primero = (await seguro("pago mas viejo", () => leer("account.payment", [], ["date"], { order: "date asc", limit: 1 }))) as { date?: string }[] | null;
  const ultimo = (await seguro("pago mas nuevo", () => leer("account.payment", [], ["date"], { order: "date desc", limit: 1 }))) as { date?: string }[] | null;
  linea(`  account.payment: ${pagos} | de ${primero?.[0]?.date ?? "?"} a ${ultimo?.[0]?.date ?? "?"}`);
  anotar("accountPayment", { total: pagos, primero: primero?.[0]?.date ?? null, ultimo: ultimo?.[0]?.date ?? null });

  const bsl = await seguro("bank.statement.line total", () => cuenta("account.bank.statement.line", []));
  const bslSin = await seguro("sin conciliar", () => cuenta("account.bank.statement.line", [["is_reconciled", "=", false]]));
  const bslDiario = await seguro("por diario", () => agrupar("account.bank.statement.line", [], ["id"], ["journal_id"]));
  const bslSinDiario = await seguro("sin conciliar por diario", () =>
    agrupar("account.bank.statement.line", [["is_reconciled", "=", false]], ["id"], ["journal_id"]),
  );
  linea(`  account.bank.statement.line: ${bsl} | ${bslSin} sin conciliar`);
  anotar("bankStatementLine", { total: bsl, sinConciliar: bslSin, porDiario: bslDiario, sinConciliarPorDiario: bslSinDiario });

  const diarios = await seguro("account.journal", () => leer("account.journal", [], ["id", "name", "code", "type", "currency_id", "company_id"]));
  if (Array.isArray(diarios))
    for (const d of diarios as { code: string; name: string; type: string; currency_id: [number, string] | false }[])
      linea(`    ${String(d.code).padEnd(8)} ${String(d.name).slice(0, 30).padEnd(31)} ${String(d.type).padEnd(10)} ${d.currency_id ? d.currency_id[1] : "(moneda de la compania)"}`);
  anotar("diarios", diarios);
}

/* ── 4. EMPAREJADO ───────────────────────────────────────────────────────────── */

const SUFIJOS = /\b(s\s?\.?\s?a\s?\.?\s?s?|sociedad\s+anonima|s\s?\.?\s?r\s?\.?\s?l|srl|ltda?|limitada|cia|compania|corp|corporation|inc|llc|ltd|sas|eirl)\b\.?/gi;

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,()\-]/g, " ")
    .replace(SUFIJOS, " ")
    .replace(/[^a-z0-9\s&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ⚠ Odoo NO agrega el prefijo "CR" en Costa Rica, pero SÍ lo normaliza si alguien lo
 * escribió a mano. Las dos formas conviven en la misma base, así que "CR3101098834" y
 * "3101098834" son el mismo contribuyente y hay que quitarle el prefijo antes de comparar.
 */
function soloDigitos(s: string): string {
  const t = (s || "").trim();
  // El prefijo se quita SOLO si lo que sigue son puros digitos: "CR3101098834" si, pero un
  // RFC mexicano como "COAL780221HR9" no es un vat con prefijo de pais y quitarle "CO"
  // fabricaria un numero que no existe.
  const m = t.match(/^([A-Za-z]{2})([\d\s.-]+)$/);
  return (m ? m[2]! : t).replace(/\D/g, "");
}

/** 9 = cédula física · 10 = jurídica o NITE · 11-12 = DIMEX. Otra cosa no es un vat de CR. */
function claseDeCedula(d: string): string {
  if (d.length === 9 && d[0] !== "0") return "fisica(9)";
  if (d.length === 10) return "juridica/NITE(10)";
  if ((d.length === 11 || d.length === 12) && d[0] !== "0") return "DIMEX(11-12)";
  return `fuera-de-norma(${d.length})`;
}

async function emparejado() {
  titulo("4 - EMPAREJADO Odoo <-> Nexus");

  const cuentas = await prisma.cuentaFinanciera.findMany({
    select: { cedulaJuridica: true, client: { select: { name: true } } },
  });
  linea(`  Nexus: ${cuentas.length} CuentaFinanciera | ${cuentas.filter((c) => soloDigitos(c.cedulaJuridica ?? "")).length} con cedula`);
  for (const c of cuentas.filter((x) => (x.cedulaJuridica ?? "").trim()))
    linea(`    ${c.client.name.padEnd(14)} "${c.cedulaJuridica}" -> ${soloDigitos(c.cedulaJuridica!)} (${claseDeCedula(soloDigitos(c.cedulaJuridica!))})`);

  type Socio = { id: number; name: string; vat: string | false; customer_rank?: number; parent_id?: [number, string] | false };
  let socios: Socio[] = [];
  if (UID) {
    socios = ((await seguro("res.partner de Odoo", () => leer("res.partner", [], ["id", "name", "vat", "customer_rank", "parent_id", "is_company"]))) ?? []) as Socio[];
  } else if (API_KEY) {
    const r = await sendRequest("res.partner", ["id", "name", "vat", "customer_rank", "parent_id"], undefined, 50_000_000);
    socios = (registrosDe(r.texto) ?? []) as Socio[];
    linea(`  (sin RPC: res.partner por REST -> ${socios.length} registros, ${r.bytes} bytes)`);
  }
  const soloClientes = socios.filter((s) => (s.customer_rank ?? 0) > 0);
  linea(`  Odoo: ${socios.length} res.partner | ${soloClientes.length} con customer_rank>0`);

  const porVat = new Map<string, Socio[]>();
  for (const s of socios) {
    const v = soloDigitos(String(s.vat ?? ""));
    if (v) porVat.set(v, [...(porVat.get(v) ?? []), s]);
  }
  const dups = [...porVat.entries()].filter(([, v]) => v.length > 1);
  linea();
  linea(`  vat DUPLICADOS en Odoo (un holding facturando con varios nombres): ${dups.length}`);
  for (const [v, ss] of dups.slice(0, 30)) linea(`    ${v} -> ${ss.map((s) => s.name).join(" | ")}`);

  const formas = new Map<string, number>();
  const clases = new Map<string, number>();
  for (const s of socios) {
    const raw = String(s.vat ?? "");
    if (!raw) continue;
    const f = raw.replace(/\d/g, "9").replace(/[A-Za-z]/g, "A");
    formas.set(f, (formas.get(f) ?? 0) + 1);
    const c = claseDeCedula(soloDigitos(raw));
    clases.set(c, (clases.get(c) ?? 0) + 1);
  }
  linea();
  linea(`  formatos crudos de vat: ${[...formas.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}x${n}`).join("  ")}`);
  linea(`  clasificados:           ${[...clases.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}x${n}`).join("  ")}`);

  const porNombre = new Map<string, Socio[]>();
  for (const s of socios) {
    const n = normalizar(s.name ?? "");
    if (n) porNombre.set(n, [...(porNombre.get(n) ?? []), s]);
  }

  const filas = cuentas.map((c) => {
    const ced = soloDigitos(c.cedulaJuridica ?? "");
    const porCed = ced ? (porVat.get(ced) ?? []) : [];
    const exacto = porNombre.get(normalizar(c.client.name)) ?? [];
    /**
     * Categoría propia para el nombre que NO PUEDE emparejar nunca por nombre.
     * `palabrasDistintivas` corta en 4 letras (menos, y entran siglas como "CR", "SA" o
     * "TEC" contra cualquier cosa), así que un nombre hecho solo de siglas cortas se queda
     * sin nada con qué comparar. Meterlo en "sin candidato" lo haría ver como un hueco de
     * Odoo, y es un problema del NOMBRE.
     */
    const dist = palabrasDistintivas(c.client.name);
    const parcial =
      exacto.length || dist.length === 0
        ? []
        : socios.filter((s) => seParecen(c.client.name, s.name ?? "") || seParecen(s.name ?? "", c.client.name));
    const via = porCed.length
      ? "cedula"
      : exacto.length
        ? "nombre-exacto"
        : parcial.length
          ? "dudosa"
          : dist.length === 0
            ? "inemparejable"
            : "sin-candidato";
    return {
      nexus: c.client.name,
      cedulaNexus: c.cedulaJuridica ?? null,
      distintivas: dist,
      via,
      candidatos: [...porCed, ...exacto, ...parcial].slice(0, 6).map((s) => ({ id: s.id, name: s.name, vat: s.vat })),
    };
  });

  const conteo: Record<string, number> = { cedula: 0, "nombre-exacto": 0, dudosa: 0, "sin-candidato": 0, inemparejable: 0 };
  for (const f of filas) conteo[f.via] = (conteo[f.via] ?? 0) + 1;
  linea();
  linea(
    `  RESULTADO: ${conteo.cedula} por cedula | ${conteo["nombre-exacto"]} por nombre exacto | ${conteo.dudosa} dudosas | ${conteo["sin-candidato"]} sin candidato | ${conteo.inemparejable} inemparejables`,
  );
  for (const via of ["cedula", "nombre-exacto", "dudosa", "inemparejable", "sin-candidato"]) {
    const g = filas.filter((f) => f.via === via);
    if (!g.length) continue;
    linea();
    linea(`  -- ${via} (${g.length}) --`);
    for (const f of g) linea(`    ${f.nexus.padEnd(32)} ${f.candidatos.map((c) => `[${c.id}] ${c.name}`).join(" | ") || `[${f.distintivas.join(", ")}]`}`);
  }

  titulo("4.b - Los casos que Elias ya sabe que fallan");
  for (const aguja of ["corrugando", "acccsa", "analisalab", "inve", "tec", "tae", "amvac", "forestales"]) {
    const hits = socios.filter((s) => (s.name ?? "").toLowerCase().includes(aguja));
    linea(`  "${aguja}" -> ${hits.length ? hits.map((h) => `[${h.id}] ${h.name} (vat=${h.vat || "-"}, rank=${h.customer_rank ?? "?"})`).join("  |  ") : "NADA en Odoo"}`);
  }
  anotar("emparejado", {
    conteo,
    filas,
    vatsDuplicados: dups.map(([v, ss]) => ({ vat: v, nombres: ss.map((s) => s.name) })),
    formatosVat: [...formas.entries()],
    clasesVat: [...clases.entries()],
    totalSocios: socios.length,
    sociosCliente: soloClientes.length,
  });
}

/* ── 5. LAS TRAMPAS ──────────────────────────────────────────────────────────── */

async function trampas() {
  titulo("5 - TRAMPAS CONOCIDAS");
  if (!UID) {
    linea("  (necesita RPC para agregar)");
    return;
  }

  /**
   * ⚠ Un 0 en amount_untaxed/amount_tax es LEGÍTIMO para move_type='entry' (los asientos
   * solo acumulan `total`), y los asientos suelen ser el grueso de la tabla. Por eso el
   * recorte es facturas PUBLICADAS: fuera de ahí, el cero es normal y marcarlo genera
   * falsos positivos masivos.
   */
  const pub: unknown[] = [
    ["move_type", "in", FACTURAS_VENTA],
    ["state", "=", "posted"],
  ];
  const tot = (await seguro("facturas de venta publicadas", () => cuenta("account.move", pub))) as number | null;
  const ceros: Record<string, unknown> = {};
  for (const c of ["amount_untaxed", "amount_tax", "amount_total", "amount_residual"]) {
    const n = await seguro(`${c} = 0`, () => cuenta("account.move", [...pub, [c, "=", 0]]));
    ceros[c] = { enCero: n, deUnTotalDe: tot };
    linea(`  ${c.padEnd(18)} en 0 -> ${n} de ${tot}`);
  }
  anotar("camposDeMonto", ceros);

  const refunds = await seguro("out_refund total", () => cuenta("account.move", [["move_type", "=", "out_refund"]]));
  // reversed_entry_id es NULL en la mayoria de NC reales: solo se llena si nacio del
  // asistente de reversion. El enlace de negocio vive en la conciliacion, no aca.
  const ligadas = await seguro("out_refund con reversed_entry_id", () =>
    cuenta("account.move", [["move_type", "=", "out_refund"], ["reversed_entry_id", "!=", false]]),
  );
  linea(`  out_refund: ${refunds} | con reversed_entry_id: ${ligadas} (el resto queda huerfana)`);
  anotar("notasDeCredito", { total: refunds, conEnlace: ligadas });

  const todosLosEstados = await seguro("payment_state de out_invoice", () =>
    agrupar("account.move", [["move_type", "=", "out_invoice"]], ["id"], ["payment_state"]),
  );
  if (Array.isArray(todosLosEstados))
    for (const g of todosLosEstados as { payment_state: string; __count: number }[]) linea(`    payment_state ${String(g.payment_state).padEnd(18)} ${g.__count}`);
  // 'reversed' = saldada SOLO por nota de credito. Una factura saldada mitad pago mitad NC
  // queda en 'paid', asi que este numero SUBCUENTA los casos mixtos.
  const reversed = await seguro("saldadas solo por NC", () =>
    cuenta("account.move", [["move_type", "=", "out_invoice"], ["payment_state", "=", "reversed"]]),
  );
  // 'in_payment' NUNCA se asigna en Community: si aparece, la base vino de Enterprise.
  const inPayment = await seguro("payment_state = in_payment (marcador de migracion)", () =>
    cuenta("account.move", [["payment_state", "=", "in_payment"]]),
  );
  const legacy = await seguro("payment_state = invoicing_legacy", () => cuenta("account.move", [["payment_state", "=", "invoicing_legacy"]]));
  linea(`  saldadas SOLO por NC ('reversed'): ${reversed} | in_payment: ${inPayment} | invoicing_legacy: ${legacy}`);
  anotar("estadosDePago", { todos: todosLosEstados, reversed, inPayment, invoicingLegacy: legacy });

  /**
   * Vencimientos múltiples: el criterio canónico es contar las líneas con
   * display_type='payment_term' de cada factura — son exactamente las cuotas, y son las
   * mismas que el motor usa para el residual.
   * ⚠ Y `invoice_date_due` de la cabecera es el MÁXIMO de los vencimientos: una antigüedad
   * calculada sobre él subestima el vencido de toda factura con cuotas.
   */
  const conTermino = await seguro("facturas con invoice_payment_term_id", () => cuenta("account.move", [...pub, ["invoice_payment_term_id", "!=", false]]));
  const terminos = (await seguro("account.payment.term", () => leer("account.payment.term", [], ["id", "name", "line_ids"]))) as
    | { name: string; line_ids: number[] }[]
    | null;
  const multi = (terminos ?? []).filter((t) => (t.line_ids ?? []).length > 1);
  const cuotasPorFactura = await seguro("lineas payment_term agrupadas por factura", async () => {
    const g = (await agrupar(
      "account.move.line",
      [["display_type", "=", "payment_term"], ["move_id.move_type", "in", FACTURAS_VENTA], ["move_id.state", "=", "posted"]],
      ["id"],
      ["move_id"],
    )) as { __count: number }[];
    return { facturasMedidas: g.length, conMasDeUnVencimiento: g.filter((x) => x.__count > 1).length };
  });
  linea(`  facturas con termino de pago: ${conTermino}`);
  linea(`  terminos definidos: ${terminos?.length ?? "?"} | con MAS DE UNA cuota: ${multi.length}${multi.length ? ` -> ${multi.map((t) => `${t.name}(${t.line_ids.length})`).join(", ")}` : ""}`);
  linea(`  facturas con mas de un vencimiento REAL: ${JSON.stringify(cuotasPorFactura)}`);
  anotar("terminosDePago", { facturasConTermino: conTermino, terminos, conVariasCuotas: multi.map((t) => ({ name: t.name, cuotas: t.line_ids.length })), cuotasPorFactura });
}

/* ───────────────────────────────────────────────────────────────────────────── */

async function main() {
  linea(`Diagnostico Odoo | ${BASE} | db=${DB} | user=${LOGIN}`);
  if (!PASSWORD) {
    linea();
    linea("[X] ODOO_PASSWORD no esta en el entorno.");
    linea("    NO se intenta ningun login: Odoo 17 corta por IP a los 5 fallos durante 60 s,");
    linea("    y detras de un proxy sin proxy_mode ese corte lo comparten TODOS los clientes.");
    linea('    PowerShell:  $env:ODOO_PASSWORD = "..."');
    linea();
    anotar("bloqueado", "ODOO_PASSWORD ausente: no se intento ningun login para no gastar el cooldown");
    await emparejado().catch((e) => anotar("error:emparejado", err(e)));
    await prisma.$disconnect();
    return;
  }

  for (const [nombre, fn] of [
    ["rest", protocoloRest],
    ["rpc", rpcNativo],
    ["datos", datos],
    ["emparejado", emparejado],
    ["trampas", trampas],
  ] as const) {
    await fn().catch((e) => {
      linea(`[X] la seccion ${nombre} aborto: ${err(e)}`);
      anotar(`error:seccion:${nombre}`, err(e));
    });
  }

  const i = process.argv.indexOf("--json");
  if (i > -1 && process.argv[i + 1]) {
    writeFileSync(process.argv[i + 1]!, JSON.stringify(R, null, 2), "utf8");
    linea(`\nJSON crudo -> ${process.argv[i + 1]}`);
  }
  await prisma.$disconnect();
}

// Solo corre si se invoca DIRECTAMENTE. Sin esto, importar `normalizar` desde otro script
// dispara todo el diagnostico — que es exactamente lo que paso la primera vez.
if (process.argv[1]?.includes("odoo-diagnostico")) main();
