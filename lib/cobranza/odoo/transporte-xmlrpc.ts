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
import { crearGuardiaDeSesion, type GuardiaDeSesion } from "./sesion";
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
 * ⚠ Cada intento fallido cuenta para el bloqueo por IP de Odoo (`base.login_cooldown_after`,
 * 10 por defecto en Odoo 17; `base.login_cooldown_duration`, 60 s). Nunca se prueba un secreto
 * que no tenemos.
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

/**
 * ⚠⚠ ESTADO DE MÓDULO, Y NO POR COMODIDAD. Odoo **castiga el volumen de logins**: tras N
 * fallos desde una IP corta por un rato, y ese corte lo comparte todo el que salga por esa IP.
 *
 * Medido el 2026-09-02: el sync corrió bien a las 07:17 UTC y media hora después
 * `authenticate` empezó a devolver `false`. La sonda midió **8 ms de sobrecosto sobre la red**
 * — o sea que Odoo ni llegó a evaluar la contraseña, que es lo que cuesta cientos de
 * milisegundos de PBKDF2. Fue un rechazo de cortocircuito, compatible con el bloqueo por IP.
 *
 * Lo provocó este archivo: cada `crearTransporteXmlRpc` autenticaba de cero, y encima
 * `uid ??= await autenticar(cfg)` **no serializaba** — dos lecturas en paralelo con `uid` en
 * null disparaban DOS autenticaciones a la vez. Una carga de pantalla costaba 2, y con el
 * doble render de React en desarrollo, 4.
 *
 * ⛔ Una corrección anterior de este mismo archivo decía que cachear en el módulo era peligroso
 * «para no arrastrar un uid de un usuario que ya no existe». Ese razonamiento estaba
 * incompleto: no pesaba que el costo de re-autenticar no es tiempo, es CUOTA. Y un uid viejo
 * se detecta solo — la operación siguiente falla con su propio error.
 */
let guardia: GuardiaDeSesion | null = null;
let claveDeGuardia = "";

/** Para las pruebas y para cuando alguien arregla la contraseña y no quiere esperar. */
export function olvidarSesionOdoo(): void {
  guardia?.olvidar();
  guardia = null;
  claveDeGuardia = "";
}

/** Cuánto falta para poder reintentar, en ms. 0 = se puede ahora. */
export function esperaRestanteOdooMs(): number {
  return guardia?.esperaRestanteMs() ?? 0;
}

/**
 * ⚠ El guardia se rehace si cambia la configuración —otro host, otro usuario, otra
 * contraseña—: arrastrar el freno de una credencial vieja bloquearía una nueva que sí sirve.
 */
function guardiaDe(cfg: OdooConfig): GuardiaDeSesion {
  const clave = `${cfg.host}|${cfg.db}|${cfg.login}|${cfg.password.length}`;
  if (!guardia || claveDeGuardia !== clave) {
    claveDeGuardia = clave;
    guardia = crearGuardiaDeSesion({
      ahora: () => Date.now(),
      autenticar: () => autenticar(cfg),
      mensajeEspera: (min) =>
        `Odoo rechazó el usuario y se está esperando ${min} min antes de reintentar. Cada intento de más alarga el bloqueo del ERP, así que no sirve recargar.`,
      /* ⚠ Con la clase correcta. Como `Error` pelado, aguas arriba se leía como fallo de
         PROTOCOLO y el cron retenía su turno del día: un bloqueo de un minuto costaba la
         corrida entera. */
      errorDeEspera: (texto) => new OdooError("AUTENTICACION", texto),
    });
  }
  return guardia;
}

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

  /**
   * ⛔⛔ EL FAULT SE MIRA PRIMERO, Y NO ES UNA CORTESÍA.
   *
   * Una respuesta de error de XML-RPC lleva `<name>faultCode</name><value><int>3</int></value>`
   * — y el regex de abajo matchea CUALQUIER `<int>`. O sea que un error de Odoo se leía como un
   * login exitoso con `uid = 3`, que además **reseteaba el freno de reintentos** y dejaba al
   * resto del código operando con un uid inventado.
   */
  if (r.texto.includes("<fault>")) {
    const fault = r.texto.match(/<name>faultString<\/name>\s*<value><string>([\s\S]*?)<\/string>/)?.[1] ?? "";
    throw new OdooError(
      clasificarFalloOdoo(fault, fault),
      `Odoo devolvió un error al autenticar: ${fault.slice(0, 300) || "(sin detalle)"}`,
    );
  }

  const uid = r.texto.match(/<value><int>(\d+)<\/int><\/value>/)?.[1];
  if (uid) return Number(uid);

  /* ⚠ ANTES de concluir «te rechazó»: puede que ni siquiera haya contestado el ERP. Un 502 de
     un proxy, o una página de mantenimiento, no traen un uid — y sin este chequeo el código
     interpretaba ese silencio como credenciales malas y mandaba a alguien a revisar el
     usuario en Odoo por un problema de infraestructura. */
  if (r.status !== 200 || !r.texto.includes("<methodResponse")) {
    throw new OdooError(
      "RED",
      `El servidor de Odoo no contestó una respuesta válida (HTTP ${r.status}). No es que rechace el usuario: no llegó a atender.`,
    );
  }

  /* ⚠ `authenticate()` devuelve `false` para contraseña mala, 2FA activo, usuario archivado
     y cooldown por IP. Por el valor de retorno NO se distinguen, así que el mensaje los
     nombra a los cuatro en vez de afirmar el que suena más probable. */
  /* Llegar acá significa `<boolean>0</boolean>`: Odoo dijo que no, sin decir por qué. */
  throw new OdooError(
    "AUTENTICACION",
    `Odoo rechazó al usuario «${cfg.login}» sin decir por qué. Devuelve lo mismo en cuatro casos: contraseña cambiada, verificación en dos pasos, usuario archivado, o bloqueo temporal por intentos fallidos. Hay que revisarlo en el ERP; desde acá no se distinguen.`,
  );
}

/* ── El transporte ──────────────────────────────────────────────────────────────── */

/**
 * ⚠ El uid se cachea por instancia, no en un módulo: dos corridas no comparten sesión, y una
 * instancia larga no se queda con un uid de un usuario que ya no existe. Autenticar cuesta
 * una llamada por corrida, que contra 348 facturas no se nota.
 */
export function crearTransporteXmlRpc(cfg: OdooConfig): OdooTransport {
  async function llamar(modelo: string, metodo: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
    const uid = await guardiaDe(cfg).uid();
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
