/**
 * lib/feedback/mutations.ts — las escrituras del feedback. SERVIDOR.
 *
 * Cada escritura que le importa a otra persona deja un aviso en «Para ti» (lib/para-ti): el reporte
 * nuevo a quien revisa, la respuesta y el cambio de estado a quien reportó. `avisar()` nunca lanza: un
 * aviso perdido no deshace lo que la persona hizo.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { anclarALaEscala, conLaFilaDelManual } from "./escala-server";
import { ErrorDeFeedback } from "./http";
import { COLUMNA, esUrgente, estadoParaElAutor, numeroDeReporte, TIPO, type Columna } from "./reglas";
import type { CrearReporte, Decidir } from "./schema";

const recorte = (t: string, max = 90) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** El path de una captura es nuestro: `feedback/<archivo>`, sin subcarpetas ni `..`. */
export function esPathDeCaptura(path: string): boolean {
  return /^feedback\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(path);
}

export async function crearReporte(datos: CrearReporte, autor: { email: string; nombre: string; rol: string | null }) {
  if (datos.capturaPath && !esPathDeCaptura(datos.capturaPath)) {
    throw new ErrorDeFeedback("Esa captura no es de este lugar.", 400);
  }
  let pedidoId: string | null = null;
  if (datos.pedidoId) {
    const pedido = await prisma.feedbackPedido.findUnique({ where: { id: datos.pedidoId }, select: { id: true, paraEmail: true } });
    // Solo se responde lo que le pidieron a uno; lo demás se ignora (el reporte entra igual).
    if (pedido && pedido.paraEmail.toLowerCase() === autor.email.toLowerCase()) pedidoId = pedido.id;
  }
  const meFrena = datos.tipo === "falla" && datos.meFrena;
  // Desde un criterio de la escala: el reporte se ancla a lo que se leía, y su «pantalla» y su dirección
  // pasan a ser las del criterio (lib/feedback/escala.ts).
  const enLaEscala = datos.escala ? await anclarALaEscala(datos.escala) : null;
  const reporte = await prisma.$transaction(async (tx) => {
    const r = await tx.feedbackReporte.create({
      data: {
        autorEmail: autor.email.toLowerCase(),
        tipo: datos.tipo,
        cuerpo: datos.cuerpo,
        meFrena,
        pantalla: enLaEscala?.pantalla ?? datos.pantalla,
        ruta: enLaEscala?.ruta ?? datos.ruta,
        ...(enLaEscala ? { escalaAncla: enLaEscala.escalaAncla, escalaArea: enLaEscala.escalaArea, escala: enLaEscala.escala } : {}),
        rol: autor.rol,
        navegador: datos.navegador ?? null,
        ventana: datos.ventana ?? null,
        version: datos.version ?? null,
        errores: datos.errores?.length ? datos.errores : undefined,
        capturaPath: datos.capturaPath ?? null,
        marcas: datos.marcas?.length ? datos.marcas : undefined,
        pedidoId,
        autorLeyoAt: new Date(),
      },
      select: { id: true, numero: true, tipo: true, meFrena: true },
    });
    if (pedidoId) {
      await tx.feedbackPedido.update({ where: { id: pedidoId }, data: { estado: "respondido", respondidoAt: new Date() } });
    }
    return r;
  });

  const urgente = esUrgente(reporte);
  const pantalla = enLaEscala?.pantalla ?? datos.pantalla;
  const aviso = {
    tipo: "feedback.nuevo",
    titulo: urgente
      ? `Urgente: a ${autor.nombre} algo le frena el trabajo en «${pantalla}»`
      : enLaEscala
        ? `${TIPO[datos.tipo].nombre} en la Escala, en ${enLaEscala.escalaAncla} · ${autor.nombre}`
        : `${TIPO[datos.tipo].nombre} en «${pantalla}» · ${autor.nombre}`,
    detalle: recorte(datos.cuerpo, 280),
    href: `/feedback?reporte=${reporte.id}`,
    actorEmail: autor.email,
    dedupeKey: `feedback.nuevo:${reporte.id}`,
  };
  await avisar({ ...aviso, frente: "FEEDBACK" });
  // Lo de la escala, también a quien lleva la Escala (la misma clave: quien lleva los dos frentes lo recibe una vez).
  if (enLaEscala) await avisar({ ...aviso, frente: "ESCALA" });
  return { id: reporte.id, numero: reporte.numero, urgente };
}

/** Un mensaje en la conversación. Quien escribe deja leído hasta acá; al otro lado le llega el aviso. */
export async function responder(reporteId: string, quien: { email: string; esRevisor: boolean }, cuerpo: string) {
  const r = await prisma.feedbackReporte.findUnique({ where: { id: reporteId }, select: { id: true, autorEmail: true, numero: true, pantalla: true } });
  if (!r) throw new ErrorDeFeedback("Ese reporte no existe.", 404);
  const esAutor = r.autorEmail.toLowerCase() === quien.email.toLowerCase();
  if (!esAutor && !quien.esRevisor) throw new ErrorDeFeedback("Ese reporte no existe.", 404);

  const ahora = new Date();
  const mensaje = await prisma.$transaction(async (tx) => {
    const m = await tx.feedbackMensaje.create({ data: { reporteId, autorEmail: quien.email.toLowerCase(), cuerpo } });
    await tx.feedbackReporte.update({
      where: { id: reporteId },
      data: esAutor ? { autorLeyoAt: ahora } : { revisorLeyoAt: ahora },
    });
    return m;
  });

  if (esAutor) {
    await avisar({
      frente: "FEEDBACK",
      tipo: "feedback.respuesta",
      titulo: `Respondieron al reporte ${numeroDeReporte(r.numero)} sobre «${r.pantalla}»`,
      detalle: recorte(cuerpo, 280),
      href: `/feedback?reporte=${r.id}`,
      actorEmail: quien.email,
      dedupeKey: `feedback.respuesta:${mensaje.id}`,
    });
  } else {
    await avisar({
      para: r.autorEmail,
      tipo: "feedback.respuesta",
      titulo: `Te respondieron tu reporte sobre «${r.pantalla}»`,
      detalle: recorte(cuerpo, 280),
      href: `/para-ti?feedback=${r.id}`,
      actorEmail: quien.email,
      dedupeKey: `feedback.respuesta:${mensaje.id}`,
    });
  }
  return { id: mensaje.id };
}

/**
 * Quien revisa decide qué hacer con un reporte. Ver las tres salidas en reglas.ts. Un reporte de la
 * escala (lib/feedback/escala.ts) llega a la hoja de ruta con la fila de «Cambios pendientes» del
 * manual: qué cambiaría, el caso y —obligatorio— qué decisión con el cliente cambiaría.
 */
export async function decidir(reporteId: string, d: Decidir, revisorEmail: string) {
  const r = await prisma.feedbackReporte.findUnique({
    where: { id: reporteId },
    select: { id: true, autorEmail: true, pantalla: true, cuerpo: true, estado: true, escalaAncla: true, escala: true },
  });
  if (!r) throw new ErrorDeFeedback("Ese reporte no existe.", 404);
  const ahora = new Date();
  const revisor = revisorEmail.toLowerCase();

  if (d.accion === "deshacer") {
    await prisma.feedbackReporte.update({
      where: { id: reporteId },
      data: { estado: "sin_revisar", temaId: null, motivoCierre: null, decididoAt: null, decididoPorEmail: null },
    });
    return { estado: "sin_revisar" };
  }

  if (d.accion === "llevar") {
    if (!d.temaId && !d.nuevo) throw new ErrorDeFeedback("Elige un tema o crea uno nuevo.", 400);
    if (r.escalaAncla && !d.cambio) {
      throw new ErrorDeFeedback("Es de la escala: completa la fila del manual (qué cambiaría y qué decisión con el cliente cambiaría).", 400);
    }
    const filaDelManual = r.escalaAncla && d.cambio ? { escala: conLaFilaDelManual(r.escala, r.escalaAncla, d.cambio) } : {};
    const tema = await prisma.$transaction(async (tx) => {
      let t: { id: string; titulo: string; columna: string };
      if (d.temaId) {
        const existente = await tx.feedbackTema.findUnique({ where: { id: d.temaId }, select: { id: true, titulo: true, columna: true } });
        if (!existente) throw new ErrorDeFeedback("Ese tema ya no existe.", 404);
        t = existente;
      } else {
        const nuevo = d.nuevo!;
        t = await tx.feedbackTema.create({
          data: {
            titulo: nuevo.titulo,
            detalle: nuevo.detalle ?? null,
            pantalla: r.pantalla,
            columna: nuevo.columna,
            origen: "reporte",
            origenReporteId: r.id,
            creadoPorEmail: revisor,
            movidoAt: ahora,
            listoAt: nuevo.columna === "listo" ? ahora : null,
          },
          select: { id: true, titulo: true, columna: true },
        });
      }
      await tx.feedbackReporte.update({
        where: { id: reporteId },
        data: { estado: "en_hoja", temaId: t.id, motivoCierre: null, decididoAt: ahora, decididoPorEmail: revisor, revisorLeyoAt: ahora, ...filaDelManual },
      });
      return t;
    });
    if (d.avisar) {
      const visible = estadoParaElAutor({ estado: "en_hoja", tema });
      await avisar({
        para: r.autorEmail,
        tipo: "feedback.estado",
        titulo: `Tu reporte sobre «${r.pantalla}» está en la hoja de ruta: ${visible.texto}`,
        detalle: `Tema: ${tema.titulo}`,
        href: `/para-ti?feedback=${r.id}`,
        actorEmail: revisor,
        dedupeKey: `feedback.estado:${r.id}:${ahora.getTime()}`,
      });
    }
    return { estado: "en_hoja", temaId: tema.id };
  }

  if (d.accion === "responder") {
    await prisma.$transaction(async (tx) => {
      await tx.feedbackMensaje.create({ data: { reporteId, autorEmail: revisor, cuerpo: d.respuesta } });
      await tx.feedbackReporte.update({
        where: { id: reporteId },
        data: { estado: "respondido", temaId: null, decididoAt: ahora, decididoPorEmail: revisor, revisorLeyoAt: ahora },
      });
    });
    await avisar({
      para: r.autorEmail,
      tipo: "feedback.respuesta",
      titulo: `Te respondieron tu reporte sobre «${r.pantalla}»`,
      detalle: recorte(d.respuesta, 280),
      href: `/para-ti?feedback=${r.id}`,
      actorEmail: revisor,
      dedupeKey: `feedback.respuesta:${r.id}:${ahora.getTime()}`,
    });
    return { estado: "respondido" };
  }

  // no_se_hara
  await prisma.feedbackReporte.update({
    where: { id: reporteId },
    data: { estado: "no_se_hara", temaId: null, motivoCierre: d.motivo, decididoAt: ahora, decididoPorEmail: revisor, revisorLeyoAt: ahora },
  });
  await avisar({
    para: r.autorEmail,
    tipo: "feedback.estado",
    titulo: `Tu reporte sobre «${r.pantalla}» no se hará`,
    detalle: recorte(d.motivo, 280),
    href: `/para-ti?feedback=${r.id}`,
    actorEmail: revisor,
    dedupeKey: `feedback.estado:${r.id}:${ahora.getTime()}`,
  });
  return { estado: "no_se_hara" };
}

/** Quien lo abre deja leído hasta ahora (el punto de «hay algo nuevo» se apaga). */
export async function marcarLeido(reporteId: string, lado: "autor" | "revisor") {
  await prisma.feedbackReporte.update({
    where: { id: reporteId },
    data: lado === "autor" ? { autorLeyoAt: new Date() } : { revisorLeyoAt: new Date() },
  });
}

export async function crearTema(
  datos: { titulo: string; detalle?: string; pantalla?: string; columna: Columna; aNombreDe?: string },
  revisorEmail: string,
) {
  const ahora = new Date();
  return prisma.feedbackTema.create({
    data: {
      titulo: datos.titulo,
      detalle: datos.detalle ?? null,
      pantalla: datos.pantalla ?? null,
      columna: datos.columna,
      origen: "mano",
      aNombreDe: datos.aNombreDe ?? null,
      creadoPorEmail: revisorEmail.toLowerCase(),
      movidoAt: ahora,
      listoAt: datos.columna === "listo" ? ahora : null,
    },
    select: { id: true },
  });
}

/** Mover o editar un tema. Al pasar a «Listo», a cada persona que lo pidió le llega el aviso. */
export async function cambiarTema(id: string, cambios: { columna?: Columna; titulo?: string; detalle?: string }, revisorEmail: string) {
  const t = await prisma.feedbackTema.findUnique({ where: { id }, select: { id: true, titulo: true, columna: true } });
  if (!t) throw new ErrorDeFeedback("Ese tema ya no existe.", 404);
  const ahora = new Date();
  const mueve = !!cambios.columna && cambios.columna !== t.columna;
  await prisma.feedbackTema.update({
    where: { id },
    data: {
      ...(cambios.titulo ? { titulo: cambios.titulo } : {}),
      ...(cambios.detalle !== undefined ? { detalle: cambios.detalle || null } : {}),
      ...(mueve ? { columna: cambios.columna, movidoAt: ahora, listoAt: cambios.columna === "listo" ? ahora : null } : {}),
    },
  });
  if (mueve && (cambios.columna === "listo" || cambios.columna === "curso")) {
    const reportes = await prisma.feedbackReporte.findMany({ where: { temaId: id }, select: { id: true, autorEmail: true, pantalla: true } });
    const nombre = COLUMNA[cambios.columna].nombre;
    await Promise.all(
      reportes.map((r) =>
        avisar({
          para: r.autorEmail,
          tipo: "feedback.estado",
          titulo: cambios.columna === "listo" ? `Ya está: ${cambios.titulo ?? t.titulo}` : `${nombre}: ${cambios.titulo ?? t.titulo}`,
          detalle: cambios.columna === "listo" ? `Lo que pediste sobre «${r.pantalla}» ya está en Nexus.` : `Lo que pediste sobre «${r.pantalla}» se está haciendo.`,
          href: `/para-ti?feedback=${r.id}`,
          actorEmail: revisorEmail,
          dedupeKey: `feedback.estado:${r.id}:${cambios.columna}:${ahora.getTime()}`,
        }),
      ),
    );
  }
}

export async function crearPedidos(
  datos: { paraEmails: string[]; pantalla: string; ruta: string; pregunta: string; hasta?: string },
  revisorEmail: string,
) {
  const hasta = datos.hasta ? new Date(`${datos.hasta}T12:00:00`) : null;
  const creados = await prisma.$transaction(
    datos.paraEmails.map((email) =>
      prisma.feedbackPedido.create({
        data: { paraEmail: email.toLowerCase(), pantalla: datos.pantalla, ruta: datos.ruta, pregunta: datos.pregunta, hasta, creadoPorEmail: revisorEmail.toLowerCase() },
        select: { id: true },
      }),
    ),
  );
  return creados.length;
}

/** Quien recibió el pedido lo vio o dijo «Ahora no». */
export async function marcarPedido(id: string, email: string, accion: "visto" | "ahora_no") {
  const p = await prisma.feedbackPedido.findUnique({ where: { id }, select: { id: true, paraEmail: true, estado: true } });
  if (!p || p.paraEmail.toLowerCase() !== email.toLowerCase()) throw new ErrorDeFeedback("Ese pedido no existe.", 404);
  if (p.estado !== "abierto") return;
  await prisma.feedbackPedido.update({
    where: { id },
    data: accion === "visto" ? { vistoVeces: { increment: 1 } } : { estado: "descartado", descartadoAt: new Date() },
  });
}
