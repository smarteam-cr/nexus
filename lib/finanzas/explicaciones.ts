/**
 * lib/finanzas/explicaciones.ts — qué mide y de dónde sale cada número de Finanzas (2026-11-13, pedido de Finanzas 10:
 * «cada número de esta pantalla con su explicación en pantalla»).
 *
 * El texto vive acá y no en cada componente por dos razones: un mismo número sale en varias piezas de la pantalla (lo
 * facturado está en la barra de arriba, en el mes a mes, en «De la venta a la caja» y en «Contra el gasto») y su
 * explicación tiene que decir lo mismo en las cuatro; y otra sección de Finanzas que quiera el ⓘ solo agrega su grupo
 * acá y usa `components/finanzas/QueMide.tsx`. Una prueba exige que toda explicación diga las dos cosas.
 *
 * Copy: tuteo y las palabras de Finanzas (facturado, cobrado, gasto, piso, provisión), sin nombres de tablas.
 */

export interface Explicacion {
  /** Qué es el número, en una o dos frases: lo que alguien se pregunta al verlo. */
  queMide: string;
  /** De qué sistema y de qué datos sale, y cuándo se actualiza. */
  deDondeSale: string;
}

/** Las del punto de equilibrio. La clave es la del número, no la de la pieza donde aparece. */
export const EXPLICACIONES_EQUILIBRIO = {
  vendido: {
    queMide:
      "Lo que se vendió: los negocios ganados, por su monto, en el mes en que se ganaron. Es lo que después se factura; no es plata que entró y no suma a los ingresos.",
    deDondeSale:
      "HubSpot, de todos los pipelines de negocios (el de ventas, las ventas compartidas con HubSpot e Insider One), también lo que vende Customer Success. Se copia una vez por día. Cada negocio cuenta una sola vez, el mes en que se ganó: una renovación es un negocio nuevo, y lo que se cobra mes a mes de un contrato no vuelve a sumar. Un negocio sin monto cuenta como cero.",
  },
  porFacturar: {
    queMide: "Las cuotas del mes que todavía no tienen factura. Es trabajo pendiente de facturar, no ingreso.",
    deDondeSale: "Cobranza: las cuotas programadas de cada servicio que todavía no tienen fecha de factura.",
  },
  facturado: {
    queMide:
      "Lo facturado a clientes, sin IVA y sin las licencias que se revenden (solo el servicio de Smarteam). Es lo que se compara con el gasto y con el piso.",
    deDondeSale:
      "Cobranza, al día con Odoo (lo local y kölbi) y Mercury (lo internacional). Lo ya cobrado cuenta en el mes en que entró la plata; lo que está por cobrar, en el mes de la factura. Sale en dos tandas: a inicio de mes lo internacional y lo de Mercury; después kölbi y la segunda quincena.",
  },
  cobrado: {
    queMide: "Lo que los clientes ya pagaron, sin IVA y sin licencias revendidas, en el mes en que entró la plata.",
    deDondeSale: "Cobranza: las cuotas marcadas como cobradas, con el día en que entró la plata según Odoo y Mercury.",
  },
  aliados: {
    queMide: "Las comisiones de aliados (HubSpot, Atom Chat…) con monto confirmado, cobradas o no. Las estimadas no suman.",
    deDondeSale: "Finanzas › Aliados: cada comisión con su fecha. Pasa a contar cuando alguien confirma el monto.",
  },
  ingresos: {
    queMide: "Lo facturado más lo de los aliados, cuando dirección decidió que los aliados cuentan para cubrir el piso.",
    deDondeSale: "La suma de lo facturado y las comisiones confirmadas. Si los aliados no cuentan, es igual a lo facturado.",
  },
  gasto: {
    queMide:
      "Lo que costó operar el mes: planilla, herramientas, costos fijos, gastos financieros y la provisión del aguinaldo. Es real cuando Alex cierra el mes.",
    deDondeSale:
      "Hasta septiembre de 2026, el Excel de egresos; desde octubre, Nexus: la planilla pagada, los recurrentes y los gastos del mes. Al cerrar el mes (Finanzas › Cierre del mes) queda confirmado con quién lo cerró y cuándo.",
  },
  gastoProyectado: {
    queMide:
      "Lo que va a costar el mes, desde el día 1, con lo fijo que ya se conoce. Así a inicio de mes el gasto no parece bajo solo porque falta anotar la segunda quincena.",
    deDondeSale:
      "Rubro por rubro, lo que diga el piso de hoy (la planilla y los recurrentes vigentes, más la provisión del aguinaldo) o lo ya anotado del mes, lo que sea más. Pasa a real cuando se cierra el mes.",
  },
  piso: {
    queMide:
      "El mínimo exacto: lo que cuesta operar un mes con los salarios y costos de hoy. Facturar menos que esto es perder plata.",
    deDondeSale:
      "Los recurrentes vigentes de Nexus (planilla, herramientas y costos fijos; lo anual dividido entre 12), más la provisión mensual del aguinaldo. Cambia cuando se da de alta, se cambia o se termina un recurrente.",
  },
  pisoColchon: {
    queMide:
      "El mínimo con colchón: el piso más un margen de seguridad, para que un mes flojo o un gasto que no estaba no deje en rojo. El rango acordado es de 10 % a 15 %.",
    deDondeSale: "El piso × (1 + el colchón). El colchón lo eliges en esta pantalla; arranca en 15 % y se recuerda en tu navegador.",
  },
  aguinaldo: {
    queMide:
      "La provisión del aguinaldo: lo que se aparta cada mes para pagarlo en diciembre. Es un gasto fijo mensual, aunque nadie haya movido esa plata.",
    deDondeSale:
      "El aguinaldo del año de cada persona (lo pagado de diciembre a noviembre, con las quincenas que faltan proyectadas), dividido entre 12. El pago de diciembre no se suma otra vez: ya está en la provisión.",
  },
  promedioFacturado: {
    queMide: "Lo facturado por mes, en promedio, en los meses del año que ya terminaron. Es lo que se compara con el piso.",
    deDondeSale: "Lo facturado de cada mes terminado (sin IVA ni licencias revendidas), sumado y dividido entre esos meses.",
  },
  margen: {
    queMide: "Cuánto quedó entre lo que entró y lo que costó operar, en los meses que ya pasaron con el gasto completo.",
    deDondeSale:
      "Los ingresos (facturado y aliados que cuentan) menos el gasto de esos meses. Un mes sin todo el gasto anotado no entra: inflaría el margen.",
  },
  caja: {
    queMide: "Lo que entró al banco en esos mismos meses: lo cobrado, las comisiones cobradas y lo que entró sin ser venta.",
    deDondeSale: "Cobranza, Aliados e Ingresos variables, con la fecha en que entró la plata.",
  },
  loQueViene: {
    queMide: "Lo que ya está facturado o programado para lo que queda del año, contra el piso de esos meses.",
    deDondeSale: "Cobranza: lo facturado y las cuotas programadas desde el mes en curso. El piso es el de hoy, una vez por mes.",
  },
  sinRespaldo: {
    queMide: "Ventas ganadas que no tienen plan de cobro, o que facturan menos de lo vendido.",
    deDondeSale: "Cruce de los negocios ganados de HubSpot con los servicios y cuotas de Cobranza de cada cliente.",
  },
  programadoSinFactura: {
    queMide: "Cuotas programadas que todavía no tienen factura. Las de meses que ya terminaron debieron facturarse.",
    deDondeSale: "Cobranza: las cuotas sin fecha de factura, por el mes en que estaban programadas.",
  },
  facturadoSinCobrar: {
    queMide: "Lo facturado que el cliente todavía no paga, y cuánto de eso ya pasó su plazo de crédito.",
    deDondeSale: "Cobranza: las facturas emitidas sin cobrar, con el crédito de cada cuenta (o el de siempre).",
  },
  cobranzaPorMoneda: {
    queMide: "Lo facturado del año en cada moneda, qué parte ya se cobró y cuánto está vencido, sin pasar a dólares.",
    deDondeSale: "Cobranza, en la moneda de cada factura: así un tipo de cambio no esconde lo que falta cobrar en colones.",
  },
  porServicio: {
    queMide: "Lo facturado del año repartido por tipo de servicio.",
    deDondeSale: "Cobranza: cada cuota sale del servicio que la genera (implementación, SmartLoop, desarrollo…).",
  },
  contraElGasto: {
    queMide: "Lo facturado y lo cobrado de cada mes al lado de lo que costó operar ese mes: si lo que entra alcanza.",
    deDondeSale: "Lo facturado y lo cobrado de Cobranza; el gasto, real si el mes está cerrado y proyectado si está en curso o por venir.",
  },
} as const satisfies Record<string, Explicacion>;

export type ClaveDeExplicacion = keyof typeof EXPLICACIONES_EQUILIBRIO;
