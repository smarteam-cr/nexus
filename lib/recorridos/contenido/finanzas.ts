/**
 * Recorridos de Finanzas: una pantalla por sección del menú, más las cuatro que se abren desde
 * Planilla. Quién ve cada una sale de `nav-config.tsx` (vista REGISTRA = Asistente administrativo;
 * SUPERVISA y DIRECCION = SUPER_ADMIN, que además ve todos los recorridos).
 *
 * ⚠ Los títulos de pantalla no siempre son los del menú: «Comisiones de aliados» se titula
 * «Comisiones de partner», «Otros ingresos» se titula «Ingresos variables». Los textos de acá
 * hablan de lo que se ve, no del nombre del menú.
 */
import type { PasoDelRecorrido, Recorrido } from "../tipos";

const REGISTRA = ["ADMIN", "SUPER_ADMIN"] as const;
const DIRECCION = ["SUPER_ADMIN"] as const;

const VOLVER_A_VERLO: PasoDelRecorrido = {
  ancla: "recorrido.boton",
  titulo: "Vuélvelo a ver cuando quieras",
  texto: "Cada pantalla de Finanzas tiene su recorrido en este botón. Todos los tuyos están en tu menú, en «Recorridos».",
  lado: "bottom-end",
};

/** Arma un recorrido de una pantalla de Finanzas (la dirección es la pantalla misma). */
function pantalla(r: {
  id: string;
  titulo: string;
  descripcion: string;
  ruta: RegExp;
  ejemplo: string;
  roles: readonly ("ADMIN" | "SUPER_ADMIN")[];
  invitacion: string;
  pasos: PasoDelRecorrido[];
  conBoton?: boolean;
}): Recorrido {
  return {
    id: r.id,
    version: 1,
    titulo: r.titulo,
    descripcion: r.descripcion,
    rotulo: `Recorrido · ${r.titulo}`,
    invitacion: { titulo: `¿Te muestro cómo se usa ${r.invitacion}?`, texto: `${r.descripcion}. Menos de un minuto.` },
    ruta: r.ruta,
    ejemplo: r.ejemplo,
    irA: { href: r.ejemplo },
    grupo: "finanzas",
    roles: r.roles,
    pasos: r.conBoton === false ? r.pasos : [...r.pasos, VOLVER_A_VERLO],
  };
}

export const FINANZAS_PENDIENTES = pantalla({
  id: "finanzas-pendientes",
  titulo: "Pendientes",
  descripcion: "Lo que te toca en Finanzas, lo más urgente primero",
  invitacion: "tu lista de pendientes",
  ruta: /^\/finanzas\/pendientes\/?$/,
  ejemplo: "/finanzas/pendientes",
  roles: REGISTRA,
  pasos: [
    { ancla: "fin.pendientes.pago", titulo: "Registrar un pago", texto: "El atajo para anotar un pago que entró.", lado: "bottom-end" },
    {
      ancla: "fin.pendientes.lista",
      titulo: "Lo que te toca",
      texto: "Las tareas de hoy y de la semana, lo más urgente primero. Cada una te lleva a la pantalla donde se hace.",
      lado: "right-start",
    },
    {
      ancla: "fin.pendientes.devuelto",
      titulo: "Lo que te devolvieron",
      texto: "Lo que quien supervisa te pidió corregir, con su motivo.",
      lado: "left-start",
    },
    {
      ancla: "fin.pendientes.esperan",
      titulo: "Lo que resuelve quien supervisa",
      texto: "Diferencias que no te tocan a ti. Se muestran para que sepas que están pendientes.",
      lado: "left-start",
    },
  ],
});

export const FINANZAS_SUPERVISION = pantalla({
  id: "finanzas-supervision",
  titulo: "Supervisión",
  descripcion: "Lo que espera tu decisión y el trabajo del equipo por revisar",
  invitacion: "la supervisión",
  ruta: /^\/finanzas\/supervision\/?$/,
  ejemplo: "/finanzas/supervision",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.sup.resumen",
      titulo: "Lo que espera de ti",
      texto: "Cuántas decisiones, cuánto trabajo del equipo por revisar y cómo va el cierre del mes.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.sup.decisiones",
      titulo: "Necesitan tu decisión",
      texto: "Preguntas de negocio que dejaron las copias de Odoo y Mercury.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.sup.revision",
      titulo: "El trabajo del equipo",
      texto: "Pagos y gastos que registró el equipo. «Está bien» los aprueba; «Devolver» les pide corregir.",
      lado: "top-start",
    },
    {
      ancla: "fin.sup.cobranza",
      titulo: "La cobranza que se complica",
      texto: "Lo vencido de más de 90 días y las promesas de pago incumplidas.",
      lado: "left-start",
    },
  ],
});

export const FINANZAS_CIERRE = pantalla({
  id: "finanzas-cierre",
  titulo: "Cierre del mes",
  descripcion: "Qué falta para cerrar el mes y el tipo de cambio",
  invitacion: "el cierre del mes",
  ruta: /^\/finanzas\/cierre\/?$/,
  ejemplo: "/finanzas/cierre",
  roles: DIRECCION,
  pasos: [
    { ancla: "fin.cierre.boton", titulo: "Cerrar el mes", texto: "Lo cierras o lo reabres. Si todavía no se puede cerrar, dice por qué.", lado: "bottom-end" },
    { ancla: "fin.cierre.anio", titulo: "El año, mes por mes", texto: "Cómo está cada mes: cerrado, abierto o con algo pendiente.", lado: "bottom-start" },
    { ancla: "fin.cierre.falta", titulo: "Lo que falta para cerrar", texto: "Lo que hay que resolver antes de cerrar este mes.", lado: "right-start" },
    { ancla: "fin.cierre.tc", titulo: "El tipo de cambio", texto: "La tasa del mes que hay que confirmar para convertir los montos.", lado: "left-start" },
    { ancla: "que-sigue", titulo: "Lo próximo que te toca", texto: "Lo que conviene resolver primero para poder cerrar.", lado: "left-start" },
  ],
});

export const FINANZAS_COBRANZA = pantalla({
  id: "finanzas-cobranza",
  titulo: "Cobranza",
  descripcion: "La cola de cobros, los pagos que entran y lo que está vencido",
  invitacion: "la cobranza",
  ruta: /^\/cobranza\/?$/,
  ejemplo: "/cobranza",
  roles: REGISTRA,
  pasos: [
    {
      ancla: "fin.cobranza.pago",
      titulo: "Registrar un pago",
      texto: "Buscas el cobro del cliente y anotas el pago con su fecha. También sirve para un pago que no estaba en la lista.",
      lado: "bottom-end",
    },
    {
      ancla: "fin.cobranza.pestanas",
      titulo: "Cobros, clientes y alertas",
      texto: "La cola de cobros es la de todos los días. En Clientes se configura cada cuenta y en Alertas está lo que pide atención.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.cobranza.tanda",
      titulo: "¿Toca cobrar hoy?",
      texto: "Dice si la tanda de cobro está abierta: del 1 al 5 y del 15 al 20 de cada mes.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.cobranza.totales",
      titulo: "Los totales",
      texto: "Lo vencido, lo de más de 30 días, cuánto tardan en pagar y lo de esta quincena.",
      lado: "bottom-start",
    },
    { ancla: "fin.cobranza.filtros", titulo: "Filtra la cola", texto: "Por cliente, moneda o tipo de cuenta.", lado: "bottom-start" },
    {
      ancla: "fin.cobranza.lista",
      titulo: "Cada cobro",
      texto: "Agrupados por lo que falta hacer: facturar, lo vencido por antigüedad, esta quincena y más adelante. Desde la fila lo facturas o registras el pago.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_COMISIONES_PARTNER = pantalla({
  id: "finanzas-comisiones-partner",
  titulo: "Comisiones de aliados",
  descripcion: "Lo que Smarteam gana con cada aliado y cada cuánto paga",
  invitacion: "las comisiones de aliados",
  ruta: /^\/finanzas\/comisiones-partner\/?$/,
  ejemplo: "/finanzas/comisiones-partner",
  roles: REGISTRA,
  pasos: [
    { ancla: "fin.partner.registrar", titulo: "Registrar una comisión", texto: "Lo que pagó o va a pagar un aliado, con su fecha y su moneda.", lado: "bottom-end" },
    { ancla: "fin.partner.totales", titulo: "Cobrado y por venir", texto: "Lo que ya entró en el año y lo que falta cobrar.", lado: "bottom-start" },
    {
      ancla: "fin.partner.tabla",
      titulo: "Cada comisión con su estado",
      texto: "Por aliado y fecha. Una comisión estimada no suma a los ingresos hasta que se confirma el monto.",
      lado: "top-start",
    },
    {
      ancla: "fin.partner.historial",
      titulo: "El historial de cada aliado",
      texto: "Agrupado al ritmo en que paga cada uno: por trimestre si paga cada tres meses.",
      lado: "top-start",
    },
    { ancla: "fin.partner.aliados", titulo: "Los aliados", texto: "Quién le paga a Smarteam y cada cuánto. Con esa cadencia se ordena el historial.", lado: "top-start" },
  ],
});

export const FINANZAS_INGRESOS = pantalla({
  id: "finanzas-ingresos",
  titulo: "Otros ingresos",
  descripcion: "La plata que entra y no es venta",
  invitacion: "esta pantalla",
  ruta: /^\/finanzas\/ingresos-variables\/?$/,
  ejemplo: "/finanzas/ingresos-variables",
  roles: REGISTRA,
  pasos: [
    {
      ancla: "fin.ingresos.registrar",
      titulo: "Registrar un ingreso",
      texto: "La plata que entró y no es venta: un reembolso, intereses o un aporte de socios. Una venta va en Cobranza.",
      lado: "bottom-end",
    },
    { ancla: "fin.ingresos.que", titulo: "Qué se registra en esta pantalla", texto: "Lo que registras tú y, aparte, los pagos puntuales que vienen de Cobranza.", lado: "bottom-start" },
    { ancla: "fin.ingresos.filtros", titulo: "Filtra por tipo", texto: "El total suma solo lo que estás viendo.", lado: "bottom-start" },
    {
      ancla: "fin.ingresos.sincategoria",
      titulo: "Ingresos sin categoría",
      texto: "Mientras les falte la categoría, aparecen en lo que no cuadra.",
      lado: "bottom-start",
    },
  ],
});

export const FINANZAS_GASTOS = pantalla({
  id: "finanzas-gastos",
  titulo: "Gastos del mes",
  descripcion: "Todo lo que sale en el mes, con su comprobante",
  invitacion: "los gastos del mes",
  ruta: /^\/finanzas\/gastos\/?$/,
  ejemplo: "/finanzas/gastos",
  roles: REGISTRA,
  pasos: [
    { ancla: "fin.gastos.registrar", titulo: "Registrar un gasto", texto: "Los gastos puntuales se anotan con este botón, con su comprobante. Los recurrentes se cargan solos.", lado: "bottom-end" },
    { ancla: "fin.gastos.mes", titulo: "El mes", texto: "Cambia de mes y mira si ya está cerrado.", lado: "bottom-start" },
    { ancla: "fin.gastos.totales", titulo: "Lo que sale en el mes", texto: "Los recurrentes, los puntuales y la planilla, por separado.", lado: "bottom-start" },
    { ancla: "fin.gastos.puntuales", titulo: "Los gastos puntuales", texto: "Cada uno con su fecha, su categoría y su comprobante.", lado: "top-start" },
    {
      ancla: "fin.gastos.recurrentes",
      titulo: "Los recurrentes de este mes",
      texto: "Lo que se cargó solo desde Recurrentes. Si algo cambió, se corrige allá.",
      lado: "left-start",
    },
    {
      ancla: "fin.gastos.avisar",
      titulo: "Avisa cuando están todos",
      texto: "Así quien supervisa sabe que el mes está completo y lo puede cerrar.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_RECURRENTES = pantalla({
  id: "finanzas-recurrentes",
  titulo: "Recurrentes",
  descripcion: "Lo que se paga todos los meses: herramientas y fijos de operación",
  invitacion: "los recurrentes",
  ruta: /^\/finanzas\/recurrentes\/?$/,
  ejemplo: "/finanzas/recurrentes",
  roles: REGISTRA,
  pasos: [
    { ancla: "fin.recurrentes.agregar", titulo: "Agregar un costo", texto: "Una herramienta o un fijo de operación que se paga todos los meses.", lado: "bottom-end" },
    {
      ancla: "fin.recurrentes.categoria",
      titulo: "Cada categoría con su total",
      texto: "Herramientas y fijos de operación, con lo que suman al mes.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.recurrentes.fila",
      titulo: "Cada costo",
      texto: "Lo editas, lo pausas o lo das de baja. Dar de baja no lo borra: queda en la lista de bajas.",
      lado: "bottom-start",
    },
    { ancla: "fin.recurrentes.bajas", titulo: "Los dados de baja", texto: "Lo que se dejó de pagar, con su fecha.", lado: "top-start" },
  ],
});

export const FINANZAS_TARJETAS = pantalla({
  id: "finanzas-tarjetas",
  titulo: "Tarjetas",
  descripcion: "Las tarjetas de la empresa y cuánto queda disponible en cada una",
  invitacion: "las tarjetas",
  ruta: /^\/finanzas\/(costos\/)?tarjetas\/?$/,
  ejemplo: "/finanzas/tarjetas",
  roles: REGISTRA,
  pasos: [
    { ancla: "fin.tarjetas.agregar", titulo: "Agregar una tarjeta", texto: "Con su límite y su moneda.", lado: "bottom-end" },
    { ancla: "fin.tarjetas.tarjeta", titulo: "Cada tarjeta", texto: "Su límite, su saldo y los costos que tiene asignados.", lado: "bottom-start" },
    {
      ancla: "fin.tarjetas.saldo",
      titulo: "Registra el saldo",
      texto: "Con la fecha de corte. Lo disponible es el límite menos el saldo.",
      lado: "bottom-end",
    },
    {
      ancla: "fin.tarjetas.numeros",
      titulo: "Lo disponible y lo cargado",
      texto: "Si lo disponible no alcanza para los cargos del próximo mes, la pantalla te avisa.",
      lado: "bottom-start",
    },
  ],
});

export const FINANZAS_PLANILLA = pantalla({
  id: "finanzas-planilla",
  titulo: "Planilla",
  descripcion: "El costo de cada persona y lo que se calcula de ahí",
  invitacion: "la planilla",
  ruta: /^\/finanzas\/costos\/planillas\/?$/,
  ejemplo: "/finanzas/costos/planillas",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.planilla.atajos",
      titulo: "Calendario, historial, aguinaldo y comisiones",
      texto: "Lo que se pagó de verdad, el año de cada persona y lo que se calcula de ahí.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.planilla.estimado",
      titulo: "Cifras estimadas",
      texto: "Es el costo de cada persona con la configuración de hoy, no lo que se pagó.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.planilla.mostrar",
      titulo: "Los montos arrancan ocultos",
      texto: "Muéstralos solo cuando nadie más está mirando la pantalla.",
      lado: "bottom-end",
    },
    { ancla: "fin.planilla.agregar", titulo: "Agregar a una persona", texto: "Con su costo mensual y su moneda.", lado: "bottom-end" },
    { ancla: "fin.planilla.personas", titulo: "Cada persona", texto: "Su costo al mes, en su moneda.", lado: "top-start" },
  ],
});

export const FINANZAS_PLANILLA_HISTORIAL = pantalla({
  id: "finanzas-planilla-historial",
  titulo: "Historial de planilla",
  descripcion: "Lo que se pagó de verdad, quincena por quincena",
  invitacion: "el historial de planilla",
  ruta: /^\/finanzas\/costos\/planillas\/historial\/?$/,
  ejemplo: "/finanzas/costos/planillas/historial",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.historial.generar",
      titulo: "Generar la quincena",
      texto: "Crea las filas de la quincena con el monto de cada persona. Una quincena pagada no se toca.",
      lado: "bottom-end",
    },
    { ancla: "fin.historial.cobertura", titulo: "Qué tan completo está", texto: "Cuántas quincenas hay registradas y cuáles faltan.", lado: "bottom-start" },
    { ancla: "fin.historial.quincena", titulo: "Cada quincena", texto: "Con su total y lo de cada persona.", lado: "top-start" },
    { ancla: "fin.historial.pagar", titulo: "Registra el pago", texto: "Marca como pagada la quincena de una persona, con su fecha.", lado: "left-start" },
  ],
});

export const FINANZAS_PLANILLA_CALENDARIO = pantalla({
  id: "finanzas-planilla-calendario",
  titulo: "Calendario de planilla",
  descripcion: "El año de cada persona, quincena por quincena",
  invitacion: "el calendario de planilla",
  ruta: /^\/finanzas\/costos\/planillas\/calendario\/?$/,
  ejemplo: "/finanzas/costos/planillas/calendario",
  roles: DIRECCION,
  pasos: [
    { ancla: "fin.calendario.anio", titulo: "El año", texto: "Salarios, historial, aguinaldo y comisiones; o cambia de año.", lado: "bottom-start" },
    {
      ancla: "fin.calendario.aumento",
      titulo: "Cómo funciona un aumento",
      texto: "Lo pagado sale del historial y no se toca; lo que falta se proyecta con el salario que rige en cada fecha.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.calendario.pendientes",
      titulo: "Quincenas sin anotar",
      texto: "Las que ya pasaron y no tienen pago registrado. Haz clic en cada una y escribe lo que se pagó: Nexus recalcula el aguinaldo.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.calendario.persona",
      titulo: "El año de cada persona",
      texto: "Ábrela para ver sus 24 quincenas, llenar las que faltan y editar su salario desde una fecha.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_AGUINALDO = pantalla({
  id: "finanzas-aguinaldo",
  titulo: "Aguinaldo",
  descripcion: "Lo que se le pagó a cada persona en el período, dividido entre 12",
  invitacion: "el aguinaldo",
  ruta: /^\/finanzas\/costos\/aguinaldo\/?$/,
  ejemplo: "/finanzas/costos/aguinaldo",
  roles: DIRECCION,
  pasos: [
    { ancla: "fin.aguinaldo.anio", titulo: "El año", texto: "Elige qué período mirar.", lado: "bottom-end" },
    {
      ancla: "fin.aguinaldo.abierto",
      titulo: "El período sigue abierto",
      texto: "Mientras no termine noviembre, el número sigue creciendo.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.aguinaldo.totales",
      titulo: "Provisionado y estimado",
      texto: "Lo que ya se provisionó y lo que se estima pagar en diciembre.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.aguinaldo.tabla",
      titulo: "Cada colaborador",
      texto: "Lo que se le pagó de diciembre a noviembre, dividido entre 12. Sale del historial de planilla, no de una tasa.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_COMISIONES_VENDEDOR = pantalla({
  id: "finanzas-comisiones-vendedor",
  titulo: "Comisiones de vendedor",
  descripcion: "Lo que se le paga a quien vendió, como porcentaje de lo cobrado",
  invitacion: "las comisiones de vendedor",
  ruta: /^\/finanzas\/costos\/comisiones-vendedor\/?$/,
  ejemplo: "/finanzas/costos/comisiones-vendedor",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.vendedor.regla",
      titulo: "Nueva regla",
      texto: "Qué porcentaje cobra una persona, para todos los clientes o para uno en particular.",
      lado: "bottom-end",
    },
    { ancla: "fin.vendedor.devengado", titulo: "Lo devengado sin liquidar", texto: "Lo que se calcula solo, como porcentaje de lo cobrado.", lado: "bottom-start" },
    {
      ancla: "fin.vendedor.porliquidar",
      titulo: "Por liquidar",
      texto: "Cada vendedor con lo que le toca, agrupado por la planilla en que se paga.",
      lado: "top-start",
    },
    {
      ancla: "fin.vendedor.liquidar",
      titulo: "Liquidar",
      texto: "Congela el monto y lo engancha a la planilla de esa quincena.",
      lado: "left-start",
    },
    { ancla: "fin.vendedor.reglas", titulo: "Las reglas", texto: "Las que están vigentes, con su porcentaje y desde cuándo rigen.", lado: "top-start" },
  ],
});

export const FINANZAS_CONCILIACION = pantalla({
  id: "finanzas-conciliacion",
  titulo: "Conciliación",
  descripcion: "Lo que no cuadra entre Nexus, Odoo y Mercury, en una sola lista",
  invitacion: "la conciliación",
  ruta: /^\/finanzas\/conciliacion\/?$/,
  ejemplo: "/finanzas/conciliacion",
  roles: REGISTRA,
  pasos: [
    {
      ancla: "fin.conciliacion.actualizar",
      titulo: "Actualiza las copias",
      texto: "Trae lo último de Odoo y Mercury, y dice de cuándo es la copia.",
      lado: "bottom-end",
    },
    {
      ancla: "fin.conciliacion.filtros",
      titulo: "Quién lo resuelve y de dónde viene",
      texto: "Filtra la lista por quién tiene que actuar y por la fuente.",
      lado: "bottom-start",
    },
    { ancla: "fin.conciliacion.resumen", titulo: "Cuánto falta por resolver", texto: "Cuántas cosas quedan y cuánta plata mueven.", lado: "bottom-start" },
    {
      ancla: "fin.conciliacion.diferencia",
      titulo: "Cada diferencia",
      texto: "Dice qué no cuadra y dónde se arregla. Lo que se arregla sale solo con la próxima copia.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_EQUILIBRIO = pantalla({
  id: "finanzas-equilibrio",
  titulo: "Punto de equilibrio",
  descripcion: "Qué entra, qué sale y cuánto hay que facturar para no perder plata",
  invitacion: "el punto de equilibrio",
  ruta: /^\/finanzas\/equilibrio\/?$/,
  ejemplo: "/finanzas/equilibrio",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.equilibrio.indicadores",
      titulo: "La respuesta",
      texto: "Si lo que se factura alcanza para lo que cuesta operar, el margen a la fecha y lo que viene. El margen dice por qué todavía es preliminar.",
      lado: "bottom-start",
    },
    {
      ancla: "fin.equilibrio.curva",
      titulo: "El año, mes a mes",
      texto: "Venta, facturado, cobrado y gasto contra el piso, en líneas, barras o tabla. Toca un nombre de la leyenda para resaltarlo y un mes para ver su detalle.",
      lado: "top-start",
    },
    {
      ancla: "fin.equilibrio.cobranza",
      titulo: "La cobranza por moneda",
      texto: "Qué parte de lo facturado ya se cobró, en cada moneda, y cuánto se aparta del Excel.",
      lado: "top-start",
    },
    {
      ancla: "fin.equilibrio.inconsistencias",
      titulo: "Para decidir en la reunión",
      texto: "Lo que no cuadra o falta decidir, con quién lo decide: CEO, CFO o RevOps.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_CAJA_NETA = pantalla({
  id: "finanzas-caja-neta",
  titulo: "Caja neta",
  descripcion: "Lo que entra menos lo que sale, quincena por quincena",
  invitacion: "la caja neta",
  ruta: /^\/finanzas\/caja-neta\/?$/,
  ejemplo: "/finanzas/caja-neta",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.caja.confiable",
      titulo: "Qué tan confiable es",
      texto: "Cuántas cuentas están medidas. Una cuenta sin datos no cuenta como sana.",
      lado: "bottom-start",
    },
    { ancla: "fin.caja.totales", titulo: "El neto y el gasto del mes", texto: "En colones y dólares por separado: nunca se suman.", lado: "bottom-start" },
    { ancla: "fin.caja.grafico", titulo: "Entra contra sale", texto: "Las próximas quincenas, una por una; más adelante, por mes.", lado: "top-start" },
    { ancla: "fin.caja.tabla", titulo: "Período por período", texto: "Lo que entra, lo que sale y el neto de cada uno.", lado: "top-start" },
    {
      ancla: "fin.caja.vencido",
      titulo: "Lo vencido no entra al neto",
      texto: "Se muestra aparte: es plata en riesgo, no plata que viene.",
      lado: "top-start",
    },
  ],
});

export const FINANZAS_INTEGRACIONES = pantalla({
  id: "finanzas-integraciones",
  titulo: "Integraciones de Finanzas",
  descripcion: "Si las copias de Odoo, Mercury y HubSpot están al día",
  invitacion: "las integraciones",
  ruta: /^\/finanzas\/integraciones\/?$/,
  ejemplo: "/finanzas/integraciones",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.integraciones.actualizar",
      titulo: "Actualizar todo",
      texto: "Trae lo último de Odoo, Mercury y HubSpot. Nexus solo lee: nunca escribe en ellos.",
      lado: "bottom-end",
    },
    { ancla: "fin.integraciones.tarjeta", titulo: "Cada fuente", texto: "Si su copia está al día, vieja o falló.", lado: "bottom-start" },
    {
      ancla: "fin.integraciones.falta",
      titulo: "Lo que falta conciliar",
      texto: "Cuánto queda por resolver de esa fuente y quién lo hace.",
      lado: "top-start",
    },
    { ancla: "fin.integraciones.lectura", titulo: "Cómo se lee", texto: "Qué significa cada estado y cada número de las tarjetas.", lado: "top-start" },
  ],
});

export const FINANZAS_REPORTES = pantalla({
  id: "finanzas-reportes",
  titulo: "Reportes de cobranza",
  descripcion: "Lo que va a entrar y cómo se mueve lo vencido",
  invitacion: "los reportes de cobranza",
  ruta: /^\/finanzas\/reportes\/?$/,
  ejemplo: "/finanzas/reportes",
  roles: DIRECCION,
  pasos: [
    {
      ancla: "fin.reportes.pestanas",
      titulo: "Proyección, reportes y corte",
      texto: "Lo que viene, cómo se movió lo vencido y la foto de cada quincena.",
      lado: "bottom-start",
    },
    { ancla: "fin.reportes.que", titulo: "Lo que va a entrar", texto: "La proyección de las próximas quincenas y meses, en cada moneda.", lado: "bottom-start" },
    { ancla: "fin.reportes.totales", titulo: "Los totales", texto: "Cuánto se espera cobrar, en colones y dólares por separado.", lado: "bottom-start" },
    { ancla: "fin.reportes.riesgo", titulo: "En riesgo", texto: "Lo vencido va aparte de lo que viene.", lado: "top-start" },
    { ancla: "fin.reportes.linea", titulo: "Período por período", texto: "Cuánto entra en cada quincena y en cada mes.", lado: "top-start" },
  ],
});
