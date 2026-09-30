/**
 * lib/cobranza/odoo/transporte.ts
 *
 * El PUERTO por el que Nexus lee Odoo. Módulo puro: sin red, sin Prisma, sin reloj — acá
 * viven la forma del contrato, los dominios y la lista de campos, que es lo único que se
 * puede probar sin un ERP del otro lado.
 *
 * ── POR QUÉ HAY UNA INTERFAZ Y NO UN CLIENTE A SECAS ────────────────────────────
 * El transporte se eligió por un PERMISO, no por gusto: el módulo REST de Cybrosys autentica
 * bien pero devuelve 403 en los nueve modelos porque necesita leer `ir.model` para su propia
 * configuración y el usuario `direct` no puede. Destrabarlo exige darle permisos de
 * administrador del ERP. XML-RPC funciona hoy sin habilitar nada.
 *
 * Ese permiso puede cambiar sin avisarnos. Con el transporte detrás de esta interfaz, cambiar
 * de protocolo es escribir otra implementación y nada aguas arriba se entera.
 *
 * ⚠ NADIE fuera de `transporte-xmlrpc.ts` puede importar `node:https`. Lo vigila
 * `transporte.test.ts`, porque la forma en que este tipo de capa se pudre es que alguien
 * necesite un campo más y llame al ERP desde el motor.
 *
 * Ver docs/odoo-integracion-plan.md §5 y docs/odoo-decisiones.md.
 */

/* ── Qué se lee ─────────────────────────────────────────────────────────────────── */

/**
 * Los tres `move_type` que le facturan a un cliente. Medido en la base real: 304 facturas de
 * cliente y 44 notas de crédito, contra 972 asientos y 100 facturas de proveedor que a
 * cobranza no le sirven de nada.
 *
 * ⚠ `out_receipt` está en la lista aunque hoy haya cero: el día que alguien emita un
 * recibo, la alternativa es que el espejo lo ignore en silencio.
 */
export const ODOO_MOVE_TYPES_VENTA = ["out_invoice", "out_refund", "out_receipt"] as const;

/**
 * Los campos de `account.move` que el espejo necesita. Explícitos y no `[]`: pedir todos los
 * campos de 348 facturas trae los cuerpos de las notas en HTML y multiplica el peso de la
 * respuesta sin que nadie lo note hasta que el job tarda.
 */
export const ODOO_CAMPOS_FACTURA = [
  "id",
  "name",
  "move_type",
  "state",
  "payment_state",
  "invoice_date",
  "invoice_date_due",
  "amount_untaxed",
  "amount_total",
  "amount_residual",
  "amount_tax",
  /* ⚠ En la moneda de la COMPAÑÍA (colones) aunque la factura sea en dólares. Se guarda solo como
     evidencia del tipo de cambio (`montoMonedaCompania`); el total con signo NO sale de acá, sale
     del tipo de documento (`montoConSigno` en espejo.ts). */
  "amount_total_signed",
  "currency_id",
  "partner_id",
  "write_date",
] as const;

/** Los de `res.partner` que la pantalla de emparejado necesita para mostrar evidencia. */
export const ODOO_CAMPOS_PARTNER = [
  "id",
  "name",
  "vat",
  "email",
  "customer_rank",
  "country_id",
  "write_date",
] as const;

/* ── Dominios ───────────────────────────────────────────────────────────────────── */

/** Un dominio de Odoo: `["campo", "operador", valor]` o los conectores `"&"` / `"|"`. */
export type OdooDominio = unknown[];

/**
 * Las facturas de venta PUBLICADAS. `state != draft` importa: un borrador todavía no le
 * cobra nada a nadie, y espejarlo pondría en la mesa del CFO facturas que no existen.
 *
 * ⚠ Las canceladas SÍ entran. Una factura que se anuló después de emitida es justamente el
 * caso que hay que ver al lado del cobro: si Nexus la creía cobrada, ahí está la diferencia.
 * Medido: 3 canceladas, y 2 de ellas son notas de crédito con número y fecha.
 *
 * ⚠⚠ Pero la tercera NO. `name = "/"` es el marcador de Odoo para «todavía sin numerar»: un
 * documento que se armó, nunca se publicó, y se descartó. No tiene número ni `invoice_date`
 * porque **nunca existió como factura**, y ponerlo en la mesa del CFO sería pedirle que
 * concilie algo que no se emitió. Medido: excluye exactamente 1 de 348 (la 991, AMVAC,
 * USD 3.696).
 */
export function dominioFacturasVenta(): OdooDominio {
  return [
    ["move_type", "in", [...ODOO_MOVE_TYPES_VENTA]],
    ["state", "!=", "draft"],
    ["name", "!=", "/"],
  ];
}

/**
 * El mismo dominio, pero solo lo que se movió después de `desde`. Es lo que hace que la
 * corrida diaria sea barata: XML-RPC filtra por `write_date` del lado del servidor, cosa que
 * REST no puede hacer ni con el permiso otorgado.
 *
 * ⚠ El corte es `>=`, no `>`: `write_date` tiene resolución de segundo y dos escrituras
 * dentro del mismo segundo son normales cuando alguien concilia un lote. Con `>` la segunda
 * se pierde para siempre. El costo de `>=` es releer un puñado de filas, que el upsert
 * absorbe sin efecto.
 */
export function dominioFacturasDesde(desde: Date): OdooDominio {
  return [...dominioFacturasVenta(), ["write_date", ">=", fechaHoraOdoo(desde)]];
}

/**
 * Las fichas que Odoo marca como cliente: las que tienen alguna factura de venta, y las que alguien creó desde el
 * menú de clientes aunque todavía no se les haya facturado.
 *
 * ⚠ También trae los contactos que Odoo crea solo al mandar una factura a un «correo 2» o «correo 3»: los saca
 * `esContactoYNoCliente` (emparejado.ts), que necesita saber si tienen facturas.
 */
export function dominioClientes(): OdooDominio {
  return [["customer_rank", ">", 0]];
}

/**
 * Las formas en que puede estar escrita una cédula en Odoo, que guarda el texto tal cual lo tecleó alguien:
 * `3101070993` y `3-101-070993` son el mismo contribuyente, y un `ilike` con una no encuentra la otra.
 */
export function variantesDeCedula(texto: string): string[] {
  const d = texto.replace(/\D/g, "");
  if (d.length < 4) return [];
  const formas = [d];
  if (d.length === 10) formas.push(`${d[0]}-${d.slice(1, 4)}-${d.slice(4)}`); // jurídica: 3-101-070993
  if (d.length === 9) formas.push(`${d[0]}-${d.slice(1, 5)}-${d.slice(5)}`); // física: 1-1161-0327
  return [...new Set(formas)];
}

/**
 * Buscar una ficha directamente en Odoo, por nombre o por cédula, tenga o no facturas (2026-09-29).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * La lista guardada trae lo que Odoo marca como cliente (`dominioClientes`). Una empresa creada desde «Contactos» no
 * lleva esa marca hasta su primera factura, y no se podía emparejar antes de facturarle. Esto la encuentra igual.
 *
 * Solo fichas principales (sin las direcciones y contactos que cuelgan de otra) y sin los que son solo proveedores.
 * ⚠ Lo dispara una persona con un botón, nunca una tecla: cada llamada es una consulta al ERP.
 */
export function dominioBuscarFicha(texto: string): OdooDominio {
  const q = texto.trim();
  const condiciones: OdooDominio[] = [
    ["name", "ilike", q],
    ["vat", "ilike", q],
    ...variantesDeCedula(q)
      .filter((c) => c !== q)
      .map((c): OdooDominio => ["vat", "ilike", c]),
  ];
  return [
    "&",
    ["parent_id", "=", false],
    "&",
    "|",
    ["customer_rank", ">", 0],
    ["supplier_rank", "=", 0],
    /* Notación prefija de Odoo: N condiciones unidas por «o» llevan N−1 operadores delante. */
    ...condiciones.slice(1).map(() => "|"),
    ...condiciones,
  ];
}

/**
 * Odoo habla `YYYY-MM-DD HH:MM:SS` en UTC, sin `T` y sin zona. Mandarle un ISO con la `T` y
 * la `Z` no falla: **filtra mal en silencio**, que es peor.
 */
export function fechaHoraOdoo(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/* ── El contrato ────────────────────────────────────────────────────────────────── */

export interface OdooLeerOpciones {
  limit?: number;
  offset?: number;
  order?: string;
}

export interface OdooTransport {
  /** `search_read`: el dominio filtra, los campos recortan. */
  buscarYLeer(
    modelo: string,
    dominio: OdooDominio,
    campos: readonly string[],
    opts?: OdooLeerOpciones,
  ): Promise<Record<string, unknown>[]>;

  /** `search_count`. Se usa para saber cuántas hay ANTES de traerlas. */
  contar(modelo: string, dominio: OdooDominio): Promise<number>;

  /** `read_group`, con `lazy:false` para que agrupe por todas las claves a la vez. */
  agrupar(
    modelo: string,
    dominio: OdooDominio,
    campos: readonly string[],
    por: readonly string[],
  ): Promise<Record<string, unknown>[]>;
}

/* ── Los errores ────────────────────────────────────────────────────────────────── */

/**
 * Qué clase de fallo fue. Existe porque los cuatro se arreglan en lugares distintos y el
 * mensaje que ve quien cobra tiene que decirle a quién llamar:
 *
 * - `AUTENTICACION` — la contraseña de `direct` cambió, o el usuario tiene 2FA, o la IP
 *   está en el bloqueo por IP (`base.login_cooldown_after`, 10 por defecto en Odoo 17). ⚠ `authenticate()` devuelve `false` para los
 *   cuatro casos: desde acá NO se distinguen, y por eso el mensaje los nombra a todos.
 * - `PERMISO` — autenticó pero el modelo está cerrado (el fault 4 de Odoo). Es lo que le
 *   pasa a REST hoy en los nueve modelos.
 * - `RED` — no hubo respuesta.
 * - `PROTOCOLO` — hubo respuesta y no se entendió. Incluye el caso de que alguien ponga un
 *   proxy delante y devuelva HTML con status 200.
 */
export type OdooFalloClase = "AUTENTICACION" | "PERMISO" | "RED" | "PROTOCOLO";

export class OdooError extends Error {
  readonly clase: OdooFalloClase;

  constructor(clase: OdooFalloClase, mensaje: string) {
    super(mensaje);
    this.name = "OdooError";
    this.clase = clase;
  }
}

/**
 * Odoo marca la falta de permiso con `faultCode` 4 y la credencial inválida con 3, pero por
 * JSON-RPC eso llega como el `name` de la excepción de Python. Se clasifica por ahí, y el
 * texto castellano del ERP es el respaldo.
 */
export function clasificarFalloOdoo(nombreExcepcion: string, mensaje: string): OdooFalloClase {
  const n = `${nombreExcepcion} ${mensaje}`.toLowerCase();
  if (n.includes("accessdenied") || n.includes("acceso denegado")) return "AUTENTICACION";
  if (n.includes("accesserror") || n.includes("no puede acceder") || n.includes("permitida para los siguientes grupos")) {
    return "PERMISO";
  }
  return "PROTOCOLO";
}

/**
 * El texto que se le muestra a quien cobra cuando el sync falla. Va sin jerga: la alerta la
 * lee Alexander, no quien escribió esto.
 */
export function explicarFallo(clase: OdooFalloClase): string {
  switch (clase) {
    case "AUTENTICACION":
      return "Odoo rechazó el usuario. Puede ser que la clave de API venció o la revocaron, que el usuario quedó archivado o le cambiaron el login, que le activaron verificación en dos pasos (con eso solo entra con una clave de API), o un bloqueo de un minuto por intentos fallidos. Odoo no dice cuál.";
    case "PERMISO":
      return "El usuario entró pero Odoo no lo deja leer las facturas. Hay que revisar sus permisos en el ERP.";
    case "RED":
      return "No se pudo llegar al servidor de Odoo.";
    case "PROTOCOLO":
      return "Odoo respondió algo que no se pudo interpretar.";
  }
}
