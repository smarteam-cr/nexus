/**
 * lib/cobranza/odoo/transporte-xmlrpc.ts
 *
 * La ÚNICA implementación de `OdooTransport`, y el único archivo de `lib/cobranza/odoo/` que
 * tiene permitido importar `node:https`. Lo vigila `transporte.test.ts`.
 *
 * Se porta de `scripts/odoo-diagnostico.ts`, que ya midió este camino contra el ERP real: no
 * se reescribió nada de la parte que funcionó.
 *
 * ── DOS PROTOCOLOS, UN SOLO CLIENTE ─────────────────────────────────────────────
 * `authenticate` va por XML-RPC (`/xmlrpc/2/common`) porque es lo que Odoo expone sin
 * autenticar. Todo lo demás va por JSON-RPC (`/jsonrpc`), que es la MISMA capa —mismo uid,
 * misma contraseña— pero contesta JSON y ahorra tener que parsear XML. Se midió: funciona.
 *
 * ⚠ Y los errores llegan como errores. Por REST llegaban como HTTP 200 con un cuerpo HTML,
 * que es la forma más cara de fallar: el código de arriba cree que le fue bien.
 */
import https from "node:https";
import {
  OdooError,
  clasificarFalloOdoo,
  type OdooDominio,
  type OdooLeerOpciones,
  type OdooTransport,
} from "./transporte";

export interface OdooConfig {
  host: string;
  db: string;
  login: string;
  password: string;
  /** Corta la espera. Sin esto un socket colgado se queda con el lock del cron todo el día. */
  timeoutMs: number;
}

/**
 * Los valores medidos contra el ERP de la empresa. Se dejan como default —y no como
 * variables obligatorias— para que encender el sync no requiera configurar cuatro cosas: hoy
 * el `.env` solo tiene `ODOO_PASSWORD`, y esa es la única que de verdad es un secreto.
 */
export const ODOO_DEFAULTS = {
  host: "erp.smarteamcr.com",
  db: "smarteamcr",
  login: "direct",
  timeoutMs: 60_000,
} as const;

/**
 * Lee la configuración del entorno. Falla fuerte si falta la contraseña: un transporte sin
 * secreto autenticaría con string vacío, y `authenticate()` devuelve `false` igual que con
 * una contraseña mala — o sea que el fallo se vería como «credenciales rechazadas» y alguien
 * pasaría una tarde revisando el ERP.
 *
 * ⚠ Cada intento fallido cuenta para el cooldown de Odoo (5 por IP, 60 s). Nunca se prueba
 * un secreto que no tenemos.
 */
export function configDesdeEntorno(env: NodeJS.ProcessEnv = process.env): OdooConfig {
  const password = env.ODOO_PASSWORD ?? "";
  if (!password.trim()) {
    throw new OdooError(
      "AUTENTICACION",
      "Falta ODOO_PASSWORD en el entorno. No se intenta autenticar sin secreto: un intento en vano cuenta para el bloqueo por IP de Odoo.",
    );
  }
  return {
    host: env.ODOO_HOST?.trim() || ODOO_DEFAULTS.host,
    db: env.ODOO_DB?.trim() || ODOO_DEFAULTS.db,
    login: env.ODOO_LOGIN?.trim() || ODOO_DEFAULTS.login,
    password,
    timeoutMs: Number(env.ODOO_TIMEOUT_MS) || ODOO_DEFAULTS.timeoutMs,
  };
}

/* ── HTTP crudo ─────────────────────────────────────────────────────────────────── */

interface Respuesta {
  status: number;
  texto: string;
}

function pedir(cfg: OdooConfig, path: string, contentType: string, cuerpo: string): Promise<Respuesta> {
  return new Promise((res, rej) => {
    const req = https.request(
      {
        hostname: cfg.host,
        path,
        method: "POST",
        headers: { "Content-Type": contentType, "Content-Length": String(Buffer.byteLength(cuerpo)) },
        timeout: cfg.timeoutMs,
      },
      (r) => {
        const trozos: Buffer[] = [];
        r.on("data", (c: Buffer) => trozos.push(c));
        r.on("end", () => res({ status: r.statusCode ?? 0, texto: Buffer.concat(trozos).toString("utf8") }));
        r.on("error", (e) => rej(new OdooError("RED", `Se cortó la respuesta de Odoo: ${e.message}`)));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      rej(new OdooError("RED", `Odoo no respondió en ${cfg.timeoutMs} ms.`));
    });
    req.on("error", (e: Error) => rej(new OdooError("RED", `No se pudo llegar a Odoo: ${e.message}`)));
    req.write(cuerpo);
    req.end();
  });
}

/* ── Autenticación ──────────────────────────────────────────────────────────────── */

const xmlStr = (v: string) => `<value><string>${escaparXml(v)}</string></value>`;

/** La contraseña viaja dentro de un XML. Un `&` sin escapar rompe el documento entero. */
function escaparXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function autenticar(cfg: OdooConfig): Promise<number> {
  const xml =
    `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>` +
    `<param>${xmlStr(cfg.db)}</param><param>${xmlStr(cfg.login)}</param><param>${xmlStr(cfg.password)}</param>` +
    `<param><value><struct></struct></value></param></params></methodCall>`;
  const r = await pedir(cfg, "/xmlrpc/2/common", "text/xml", xml);
  const uid = r.texto.match(/<value><int>(\d+)<\/int><\/value>/)?.[1];
  if (uid) return Number(uid);

  /* ⚠ `authenticate()` devuelve `false` para contraseña mala, 2FA activo, usuario archivado
     y cooldown por IP. Por el valor de retorno NO se distinguen, así que el mensaje los
     nombra a los cuatro en vez de afirmar el que suena más probable. */
  const fault = r.texto.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/)?.[1];
  throw new OdooError(
    "AUTENTICACION",
    fault
      ? `Odoo rechazó la autenticación: ${fault.slice(0, 300)}`
      : `Odoo rechazó al usuario «${cfg.login}» sin decir por qué. Devuelve lo mismo si la contraseña cambió, si hay verificación en dos pasos, si el usuario está archivado, o si la IP está bloqueada por intentos fallidos.`,
  );
}

/* ── El transporte ──────────────────────────────────────────────────────────────── */

/**
 * ⚠ El uid se cachea por instancia, no en un módulo: dos corridas no comparten sesión, y una
 * instancia larga no se queda con un uid de un usuario que ya no existe. Autenticar cuesta
 * una llamada por corrida, que contra 348 facturas no se nota.
 */
export function crearTransporteXmlRpc(cfg: OdooConfig): OdooTransport {
  let uid: number | null = null;

  async function llamar(modelo: string, metodo: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    uid ??= await autenticar(cfg);
    const cuerpo = JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [cfg.db, uid, cfg.password, modelo, metodo, args, kwargs],
      },
      id: 1,
    });
    const r = await pedir(cfg, "/jsonrpc", "application/json", cuerpo);

    /* Un cuerpo que empieza con `<` es HTML: un proxy delante, o el ERP caído devolviendo su
       propia página de error. Parsearlo como JSON tiraría un SyntaxError que no le dice nada
       a nadie. */
    if (r.texto.trimStart().startsWith("<")) {
      throw new OdooError("PROTOCOLO", `Odoo devolvió HTML en vez de JSON (status ${r.status}). ¿Hay un proxy delante?`);
    }

    let j: { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
    try {
      j = JSON.parse(r.texto);
    } catch {
      throw new OdooError("PROTOCOLO", `Respuesta ilegible de Odoo (status ${r.status}): ${r.texto.slice(0, 200)}`);
    }
    if (j.error) {
      const nombre = j.error.data?.name ?? j.error.message ?? "";
      const msg = j.error.data?.message ?? j.error.message ?? "";
      throw new OdooError(clasificarFalloOdoo(nombre, msg), `${modelo}.${metodo}: ${msg.slice(0, 300) || nombre}`);
    }
    return j.result;
  }

  return {
    async buscarYLeer(modelo, dominio: OdooDominio, campos, opts: OdooLeerOpciones = {}) {
      const kw: Record<string, unknown> = { fields: [...campos] };
      if (opts.limit !== undefined) kw.limit = opts.limit;
      if (opts.offset !== undefined) kw.offset = opts.offset;
      if (opts.order !== undefined) kw.order = opts.order;
      const r = await llamar(modelo, "search_read", [dominio], kw);
      return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
    },

    async contar(modelo, dominio: OdooDominio) {
      const r = await llamar(modelo, "search_count", [dominio]);
      return typeof r === "number" ? r : 0;
    },

    async agrupar(modelo, dominio: OdooDominio, campos, por) {
      const r = await llamar(modelo, "read_group", [dominio, [...campos], [...por]], { lazy: false });
      return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
    },
  };
}
