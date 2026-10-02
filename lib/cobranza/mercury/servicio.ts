/**
 * lib/cobranza/mercury/servicio.ts
 *
 * La orquestación de Cobranza › Mercury: Prisma de un lado, las funciones puras del módulo del otro. Server-only.
 *
 * ── QUÉ ESCRIBE ───────────────────────────────────────────────────────────────────
 * - El emparejado: `ClienteMercury.cuentaId` (y su vía y firma), o «no es cliente nuestro». Al emparejar, el cliente
 *   queda además como SOCIEDAD de Mercury de la cuenta (`agregarSociedadTx`), que es lo que eligen los cobros al
 *   marcarse facturados. Cada cambio deja su línea en la bitácora de la cuenta.
 * - Las marcas «Está bien así» de las líneas MERCURY-*, por las funciones de marcas.ts de Odoo (la misma tabla).
 * ⛔ No escribe en Mercury (el token no puede), ni en ningún cobro: la lista lleva a la persona al cobro.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { agregarSociedadTx, SociedadError } from "../sociedades-servicio";
import { decidirMarcas, montosPorMoneda, type FilaPedida, type MarcaDeFila, type MontoEnMoneda } from "../odoo/diferencias";
import { MARCA_BIEN_ASI, deshacerMarcasTx, marcarFilasTx } from "../odoo/marcas";
import { copiaRecienHecha } from "../odoo/espejo";
import { esEntradaDeCliente } from "./espejo";
import { cuentasSinClienteDeMercury, proponerCuentas, type PropuestaMercury, type ViaMercury } from "./emparejado";
import { detectarDiferenciasMercury, medidoMercury, type EstadoMercury } from "./diferencias";
import { sincronizarMercury, ultimaCorridaMercury, ultimaCorridaOkMercury } from "./sync";

export class MercuryServicioError extends Error {
  readonly status: number;
  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "MercuryServicioError";
    this.status = status;
  }
}

const isoDia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/* ── 1. Emparejar ───────────────────────────────────────────────────────────────── */

export interface ClienteMercuryEnPantalla {
  mercuryCustomerId: string;
  nombre: string;
  pais: string | null;
  cuentaId: string | null;
  cuentaNombre: string | null;
  via: string | null;
  ignorado: boolean;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  /** Ya no viene de Mercury: se muestra para poder desvincularlo. */
  desaparecido: boolean;
  facturas: number;
  ultimaFactura: string | null;
  /** Lo que Mercury le da sin pagar, por moneda. */
  porCobrar: MontoEnMoneda[];
  propuestas: PropuestaMercury[];
}

export interface EstadoEmparejadoMercury {
  clientes: ClienteMercuryEnPantalla[];
  /** Todas las cuentas de Nexus, para el selector. */
  cuentas: Array<{ cuentaId: string; nombre: string; via: string }>;
  /** Las cuentas que facturan por Mercury y no tienen cliente de Mercury. */
  cuentasSinCliente: Array<{ cuentaId: string; nombre: string }>;
  conteos: { clientes: number; emparejados: number; sinEmparejar: number; ignorados: number; cuentasSinCliente: number };
}

export async function cargarEmparejadoMercury(): Promise<EstadoEmparejadoMercury> {
  const [clientes, facturas, cuentas, cobros] = await Promise.all([
    prisma.clienteMercury.findMany({
      select: {
        mercuryCustomerId: true,
        nombre: true,
        pais: true,
        cuentaId: true,
        via: true,
        ignorado: true,
        confirmadoPor: true,
        confirmadoEn: true,
        estadoEspejo: true,
        cuenta: { select: { client: { select: { name: true } } } },
      },
      orderBy: { nombre: "asc" },
    }),
    prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: { numero: true, mercuryCustomerId: true, monto: true, moneda: true, estado: true, invoiceDate: true },
    }),
    prisma.cuentaFinanciera.findMany({
      select: {
        id: true,
        viaCobro: true,
        razonSocial: true,
        client: { select: { name: true } },
        vinculosOdoo: { where: { plataforma: "MERCURY" }, select: { odooPartnerNombre: true } },
      },
    }),
    prisma.cobro.findMany({ select: { cuentaId: true, monto: true, moneda: true, numeroFactura: true } }),
  ]);
  const visibles = clientes.filter((c) => c.estadoEspejo === "VIGENTE" || c.cuentaId);
  const fs = facturas.map((f) => ({ ...f, monto: Number(f.monto) }));
  const propuestas = proponerCuentas(
    visibles,
    fs,
    cuentas.map((c) => ({
      cuentaId: c.id,
      nombre: c.client.name,
      razonSocial: c.razonSocial,
      sociedadesMercury: c.vinculosOdoo.map((v) => v.odooPartnerNombre),
      via: c.viaCobro,
    })),
    cobros.map((c) => ({ cuentaId: c.cuentaId, monto: Number(c.monto), moneda: c.moneda, numeroFactura: c.numeroFactura })),
  );
  const lista: ClienteMercuryEnPantalla[] = visibles.map((c) => {
    const suyas = fs.filter((f) => f.mercuryCustomerId === c.mercuryCustomerId);
    const sinPagar = suyas.filter((f) => f.estado === "Unpaid" || f.estado === "Processing");
    return {
      mercuryCustomerId: c.mercuryCustomerId,
      nombre: c.nombre,
      pais: c.pais,
      cuentaId: c.cuentaId,
      cuentaNombre: c.cuenta?.client.name ?? null,
      via: c.via,
      ignorado: c.ignorado,
      confirmadoPor: c.confirmadoPor,
      confirmadoEn: c.confirmadoEn?.toISOString() ?? null,
      desaparecido: c.estadoEspejo !== "VIGENTE",
      facturas: suyas.length,
      ultimaFactura: suyas.map((f) => isoDia(f.invoiceDate)!).sort().slice(-1)[0] ?? null,
      porCobrar: montosPorMoneda(sinPagar),
      propuestas: propuestas.get(c.mercuryCustomerId) ?? [],
    };
  });
  const todas = cuentas.map((c) => ({ cuentaId: c.id, nombre: c.client.name, via: c.viaCobro }));
  const sinCliente = cuentasSinClienteDeMercury(todas, visibles).map((c) => ({ cuentaId: c.cuentaId, nombre: c.nombre }));
  return {
    clientes: lista,
    cuentas: todas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    cuentasSinCliente: sinCliente.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    conteos: {
      clientes: lista.length,
      emparejados: lista.filter((c) => c.cuentaId).length,
      sinEmparejar: lista.filter((c) => !c.cuentaId && !c.ignorado).length,
      ignorados: lista.filter((c) => c.ignorado).length,
      cuentasSinCliente: sinCliente.length,
    },
  };
}

/**
 * Emparejar un cliente de Mercury con una cuenta: queda firmado, su nombre pasa a ser una sociedad de Mercury de la
 * cuenta (la que eligen los cobros) y la cuenta lo anota en su bitácora. Todo en una transacción.
 */
export async function confirmarClienteMercury(
  input: { mercuryCustomerId: string; cuentaId: string; via: ViaMercury },
  actor: string,
): Promise<{ cuentaNombre: string; sociedadNueva: boolean }> {
  const [cliente, cuenta] = await Promise.all([
    prisma.clienteMercury.findUnique({ where: { mercuryCustomerId: input.mercuryCustomerId }, select: { id: true, nombre: true, cuentaId: true } }),
    prisma.cuentaFinanciera.findUnique({ where: { id: input.cuentaId }, select: { id: true, client: { select: { name: true } } } }),
  ]);
  if (!cliente) throw new MercuryServicioError("Ese cliente de Mercury no está en la copia: aprieta «Actualizar desde Mercury».", 404);
  if (!cuenta) throw new MercuryServicioError("La cuenta no existe.", 404);
  if (cliente.cuentaId && cliente.cuentaId !== cuenta.id) {
    throw new MercuryServicioError("Ese cliente de Mercury ya está emparejado con otra cuenta: desvincúlalo primero.", 409);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const s = await agregarSociedadTx(tx, cuenta.id, { plataforma: "MERCURY", nombre: cliente.nombre }, actor, { siYaLeFactura: "usar" });
      await tx.clienteMercury.update({
        where: { id: cliente.id },
        data: { cuentaId: cuenta.id, sociedadId: s.id, via: input.via, ignorado: false, confirmadoPor: actor, confirmadoEn: new Date() },
      });
      await tx.bitacoraCobro.create({
        data: {
          cuentaId: cuenta.id,
          tipo: "NOTA",
          contenido: `${actor} emparejó con esta cuenta el cliente de Mercury «${cliente.nombre}»: sus facturas de Mercury pasan a esta cuenta.`,
          usuarioEmail: actor,
        },
      });
      return { cuentaNombre: cuenta.client.name, sociedadNueva: !s.yaLeFacturaba };
    });
  } catch (e) {
    if (e instanceof SociedadError) throw new MercuryServicioError(e.message, e.status);
    throw e;
  }
}

/** Desvincular: el cliente vuelve a «sin cuenta». La sociedad de la cuenta queda (puede tener cobros facturados). */
export async function desvincularClienteMercury(input: { mercuryCustomerId: string }, actor: string): Promise<void> {
  const cliente = await prisma.clienteMercury.findUnique({
    where: { mercuryCustomerId: input.mercuryCustomerId },
    select: { id: true, nombre: true, cuentaId: true },
  });
  if (!cliente?.cuentaId) throw new MercuryServicioError("Ese cliente de Mercury no está emparejado.", 409);
  await prisma.$transaction([
    prisma.clienteMercury.update({
      where: { id: cliente.id },
      data: { cuentaId: null, sociedadId: null, via: null, confirmadoPor: actor, confirmadoEn: new Date() },
    }),
    prisma.bitacoraCobro.create({
      data: {
        cuentaId: cliente.cuentaId,
        tipo: "NOTA",
        contenido: `${actor} desvinculó de esta cuenta el cliente de Mercury «${cliente.nombre}»: sus facturas de Mercury quedan sin cuenta.`,
        usuarioEmail: actor,
      },
    }),
  ]);
}

/** «No es cliente nuestro» y su vuelta atrás. Uno emparejado no se marca: primero se desvincula. */
export async function ignorarClienteMercury(input: { mercuryCustomerId: string; ignorado: boolean }, actor: string): Promise<void> {
  const cliente = await prisma.clienteMercury.findUnique({ where: { mercuryCustomerId: input.mercuryCustomerId }, select: { id: true, cuentaId: true } });
  if (!cliente) throw new MercuryServicioError("Ese cliente de Mercury no está en la copia.", 404);
  if (input.ignorado && cliente.cuentaId) {
    throw new MercuryServicioError("Está emparejado con una cuenta: desvincúlalo primero si no es cliente nuestro.", 409);
  }
  await prisma.clienteMercury.update({
    where: { id: cliente.id },
    data: { ignorado: input.ignorado, confirmadoPor: actor, confirmadoEn: new Date() },
  });
}

/* ── 2. Lo que no cuadra ────────────────────────────────────────────────────────── */

const PREFIJO = "MERCURY-";

async function cargarEstadoMercury(): Promise<EstadoMercury> {
  const [facturas, clientes, cuentas, cobros, movimientos, marcas, copiaOk] = await Promise.all([
    prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: { id: true, numero: true, invoiceDate: true, dueDate: true, monto: true, moneda: true, estado: true, mercuryCustomerId: true, clienteNombre: true, actualizadaEnMercury: true },
    }),
    prisma.clienteMercury.findMany({ select: { mercuryCustomerId: true, nombre: true, cuentaId: true, ignorado: true } }),
    prisma.cuentaFinanciera.findMany({ select: { id: true, viaCobro: true, client: { select: { name: true } } } }),
    prisma.cobro.findMany({
      select: { id: true, cuentaId: true, periodo: true, fechaProgramada: true, fechaEmision: true, monto: true, moneda: true, estado: true, numeroFactura: true },
    }),
    prisma.movimientoMercury.findMany({
      where: { estadoEspejo: "VIGENTE", monto: { gt: 0 } },
      select: { id: true, monto: true, estado: true, tipo: true, contraparteNombre: true, conTarjeta: true, posteadoEn: true, creadoEnMercury: true },
    }),
    prisma.diferenciaOdooMarca.findMany({
      where: { linea: { startsWith: PREFIJO }, tipo: MARCA_BIEN_ASI, deshechaEn: null },
      select: { id: true, linea: true, fila: true, documento: true, huella: true, motivo: true, marcadaPor: true, marcadaEn: true },
    }),
    ultimaCorridaOkMercury(),
  ]);
  return {
    facturas: facturas.map((f) => ({
      id: f.id,
      numero: f.numero,
      invoiceDate: isoDia(f.invoiceDate)!,
      dueDate: isoDia(f.dueDate),
      monto: Number(f.monto),
      moneda: f.moneda,
      estado: f.estado,
      mercuryCustomerId: f.mercuryCustomerId,
      clienteNombre: f.clienteNombre,
      actualizadaEn: isoDia(f.actualizadaEnMercury)!,
    })),
    clientes,
    cuentas: cuentas.map((c) => ({ id: c.id, nombre: c.client.name, via: c.viaCobro })),
    cobros: cobros.map((c) => ({
      id: c.id,
      cuentaId: c.cuentaId,
      periodo: c.periodo,
      fechaProgramada: isoDia(c.fechaProgramada)!,
      fechaEmision: isoDia(c.fechaEmision),
      monto: Number(c.monto),
      moneda: c.moneda,
      estado: c.estado,
      numeroFactura: c.numeroFactura,
    })),
    entradas: movimientos
      .filter((m) => esEntradaDeCliente({ monto: Number(m.monto), estado: m.estado, tipo: m.tipo, contraparteNombre: m.contraparteNombre, conTarjeta: m.conTarjeta }))
      .map((m) => ({ id: m.id, monto: Number(m.monto), fecha: isoDia(m.posteadoEn ?? m.creadoEnMercury)!, quien: m.contraparteNombre ?? "" })),
    marcas: marcas.map(
      (m): MarcaDeFila => ({ id: m.id, linea: m.linea, fila: m.fila, documento: m.documento, huella: m.huella, motivo: m.motivo, marcadaPor: m.marcadaPor, marcadaEn: m.marcadaEn.toISOString() }),
    ),
    copiaAl: isoDia(copiaOk),
  };
}

export async function cargarDiferenciasMercury() {
  const estado = await cargarEstadoMercury();
  return {
    inconsistencias: detectarDiferenciasMercury(estado),
    /* «Ya está anulada» no existe en Mercury: Nexus ve las anulaciones en la copia. */
    anuladas: [],
    medido: { ...medidoMercury(estado), espejoAl: estado.copiaAl },
  };
}

export async function marcarFilasMercury(
  input: { linea: string; motivo: string; filas: readonly FilaPedida[] },
  actor: string,
): Promise<{ marcadas: number; cambiaron: Array<{ clave: string; texto: string | null }>; yaMarcadas: number }> {
  if (!input.linea.startsWith(PREFIJO)) throw new MercuryServicioError("Esa línea no es de Mercury.", 400);
  const estado = await cargarEstadoMercury();
  const linea = detectarDiferenciasMercury(estado).find((l) => l.codigo === input.linea);
  const d = decidirMarcas(linea, input.filas, estado.marcas);
  if (d.aMarcar.length) {
    await prisma.$transaction((tx) => marcarFilasTx(tx, { linea: input.linea, motivo: input.motivo, actor, en: new Date(), filas: d.aMarcar }));
  }
  return { marcadas: d.aMarcar.length, cambiaron: d.cambiaron, yaMarcadas: d.yaMarcadas.length };
}

export async function deshacerMarcasMercury(input: { ids: readonly string[] }, actor: string): Promise<number> {
  /* Solo marcas de Mercury: esta ruta no deshace lo que alguien marcó en «Lo que no cuadra» de Odoo. */
  const propias = await prisma.diferenciaOdooMarca.findMany({ where: { id: { in: [...input.ids] }, linea: { startsWith: PREFIJO } }, select: { id: true } });
  const n = propias.length ? await prisma.$transaction((tx) => deshacerMarcasTx(tx, { ids: propias.map((m) => m.id), actor, en: new Date() })) : 0;
  if (n === 0) throw new MercuryServicioError("Esa marca ya estaba deshecha: recarga la lista.", 409);
  return n;
}

export async function ultimoMotivoMercury(actor: string): Promise<string | null> {
  const buscar = (marcadaPor?: string) =>
    prisma.diferenciaOdooMarca.findFirst({
      where: { tipo: MARCA_BIEN_ASI, deshechaEn: null, linea: { startsWith: PREFIJO }, ...(marcadaPor ? { marcadaPor } : {}) },
      orderBy: [{ marcadaEn: "desc" }, { id: "desc" }],
      select: { motivo: true },
    });
  return ((await buscar(actor)) ?? (await buscar()))?.motivo ?? null;
}

/* ── 3. Traer lo último de Mercury, a pedido ────────────────────────────────────── */

const ESPERA_A_PEDIDO_MS = 15_000;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

export interface ResultadoDeActualizarMercury {
  estado: "COPIADO" | "RECIENTE" | "EN_CURSO" | "FALLO";
  mensaje: string;
  corrida: Awaited<ReturnType<typeof ultimaCorridaMercury>>;
  facturas: number;
}

/** «Actualizar desde Mercury»: la misma copia de la mañana, ahora y firmada. Nunca lanza por un fallo de Mercury. */
export async function actualizarDesdeMercury(actor: string, ahora: Date = new Date()): Promise<ResultadoDeActualizarMercury> {
  let estado: ResultadoDeActualizarMercury["estado"];
  let mensaje: string;
  if (copiaRecienHecha(await ultimaCorridaOkMercury(), ahora)) {
    estado = "RECIENTE";
    mensaje = "La copia de Mercury es de hace unos segundos: no se volvió a leer. Si acabas de cambiar algo en Mercury, espera medio minuto y actualiza otra vez.";
  } else {
    const r = await sincronizarMercury({ disparadaPor: actor, esperaMs: ESPERA_A_PEDIDO_MS });
    if (r.enCurso) {
      estado = "EN_CURSO";
      mensaje = "Ya hay una copia de Mercury en curso. Espera unos segundos y actualiza otra vez.";
    } else if (!r.ok) {
      estado = "FALLO";
      mensaje = `No se pudo leer Mercury: ${r.error ?? "sin detalle"} Lo que ves es la copia anterior.`;
    } else {
      estado = "COPIADO";
      const cambios = [
        r.creadas ? plural(r.creadas, "factura nueva", "facturas nuevas") : null,
        r.actualizadas ? plural(r.actualizadas, "con cambios", "con cambios") : null,
        r.desaparecidas ? plural(r.desaparecidas, "que Mercury ya no tiene", "que Mercury ya no tiene") : null,
        r.clientesNuevos ? plural(r.clientesNuevos, "cliente nuevo para emparejar", "clientes nuevos para emparejar") : null,
        r.movimientosNuevos ? plural(r.movimientosNuevos, "movimiento nuevo", "movimientos nuevos") : null,
      ].filter((x): x is string => x !== null);
      mensaje = cambios.length
        ? `Listo: Nexus leyó las ${r.facturasVistas} facturas de Mercury ahora. ${cambios.join(" · ")}.`
        : `Listo: Nexus leyó las ${r.facturasVistas} facturas de Mercury ahora y no cambió nada desde la copia anterior.`;
    }
  }
  const [corrida, facturas] = await Promise.all([ultimaCorridaMercury(ahora), prisma.facturaMercury.count({ where: { estadoEspejo: "VIGENTE" } })]);
  return { estado, mensaje, corrida, facturas };
}
