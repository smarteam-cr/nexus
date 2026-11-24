/**
 * lib/exploraciones/escala-con-nexus.ts — LA PÁGINA DE LA ESCALA EN PIEZAS, para «✨ Pedirle a Nexus» (23 nov, etapa 3 del
 * plan maestro de «Hablar con Nexus»; el contrato, lib/pedirle-a-nexus/contrato.ts). PURO y client-safe.
 *
 * Arma, desde la MISMA página que ve el cliente (`PaginaParaElCse`, el cálculo de /external/escala), la lista de lo que
 * se puede cambiar, con el nombre que tiene en la pantalla y lo que acepta:
 *   · el Resumen: el titular, el resumen debajo (o la bajada, si no hay), el problema principal, las etiquetas, el alcance y el tamaño, los puntos clave,
 *     el recorrido, cada equipo (quiénes son, lo que funciona, el reto principal, lo que lo causa, sus cifras y lo que
 *     falta), lo que falta validar, y un lugar para AGREGAR en cada lista que acepta una pieza nueva;
 *   · la página de un área: la descripción de «Resultado general», lo que dice la tarjeta de cada parte medida, los
 *     títulos, «Por dónde empezar», los casos y los riesgos.
 * Y, para cada pieza, la operación con que se escribe: la MISMA que usa la edición a mano (`resumenDeLaEscala`,
 * `textoDeLaPagina`, `textoDelRadar`, `descripcionDeLaEscala` de ./contenido.ts). No hay un segundo camino.
 *
 * Lo que la página no deja editar a mano (los niveles, lo que sale del Resumen en la página del área, la pérdida que validó
 * la empresa) tampoco está acá.
 *
 * Cada pieza dice su SECCIÓN con el nombre de lib/external/secciones-de-la-escala.ts, el mismo que manda el botón «✨ Mejorar
 * con IA» del encabezado de esa sección (24 nov): `piezasDeLaSeccion` da las que se le pasan al modelo.
 */
import type { PiezaDelDocumento } from "@/lib/pedirle-a-nexus/contrato";
import type { Letra } from "@/lib/escala/documento/tipos";
import {
  BAJADA_DEL_RESUMEN,
  claveAtadaDelResumen,
  conclusionDelSubequipo,
  MAX_ETIQUETAS,
  MAX_LINEAS_DEL_MAPA,
  MAX_PARRAFOS_DE_LA_PORTADA,
  titularDelResumen,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  TOPE_DEL_TITULO_DEL_PUNTO,
  TOPE_DEL_TITULO_DEL_RECORRIDO,
  type CifraDeLaPagina,
  type ListaDeLaPagina,
  type PiezaDeLaPagina,
  type ResumenDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
import {
  cejaDeLoQueCuesta,
  CLAVES,
  MAX_TEXTO_DE_LA_PAGINA,
  pieDelArea,
  quitadaDeLaPagina,
  textoDeLaPagina,
  textoDeLaPrioridad,
  tituloDeEmpezar,
  TITULOS_DEL_AREA,
  type TextosDeLaPagina,
} from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { esDeLaSeccion, SECCIONES_DEL_AREA as A, SECCIONES_DEL_RESUMEN as R, seccionDelEquipo } from "@/lib/external/secciones-de-la-escala";
import { MAX_TEXTO_DEL_RADAR, type Operacion, type TextoDelRadar } from "./contenido";
import { TOPE_DE_LA_DESCRIPCION_A_MANO } from "./descripcion-de-la-escala";
import { textoVigenteDelRadar } from "./escala-para-el-cliente";

/** Dónde se pide: el Resumen o la página de un área. Lo pone el botón y lo verifica el servidor. */
export type LugarEnLaEscala = { pagina: "resumen" } | { pagina: "area"; areaId: string };

/** Cómo se escribe una pieza: la operación de la edición a mano. */
export type ComoSeEscribe =
  | { via: "resumen"; clave: string }
  | { via: "texto"; clave: string; original: string }
  | { via: "radar"; dimensionId: string; nivel: Letra }
  | { via: "descripcion"; areaId: string };

export interface PiezaDeLaEscala extends PiezaDelDocumento {
  escribe: ComoSeEscribe;
}

/** El nombre del lugar, para el chip y el historial: «Resumen» o el nombre del área. */
export function nombreDelLugar(lugar: LugarEnLaEscala, areas: readonly { id: string; nombre: string }[]): string {
  return lugar.pagina === "resumen" ? "Resumen" : (areas.find((a) => a.id === lugar.areaId)?.nombre ?? "Área");
}

type Opciones = { tope?: number; quitable?: boolean; noLaVeElCliente?: boolean };

/** Una pieza del Resumen que guarda el agente (`resumenDeLaEscala`). */
function delResumen(clave: string, valor: string | null, nombre: string, seccion: string, p: Pick<PiezaDeLaPagina, "mano" | "citas"> | null, o: Opciones = {}): PiezaDeLaEscala {
  return {
    clave: `r/${clave}`,
    nombre,
    seccion,
    valor,
    tope: o.tope ?? TOPE_A_MANO,
    agregar: valor === null,
    quitable: !!o.quitable,
    aMano: !!p?.mano,
    conCita: (p?.citas?.length ?? 0) > 0,
    escribe: { via: "resumen", clave },
    ...(o.noLaVeElCliente ? { noLaVeElCliente: true } : {}),
  };
}

/** Un texto fijo de la página (`textoDeLaPagina`): el de siempre, o el cambiado para esta empresa. */
function fijo(clave: string, original: string, nombre: string, seccion: string, textos: TextosDeLaPagina | null | undefined, o: Opciones = {}): PiezaDeLaEscala {
  return {
    clave: `t/${clave}`,
    nombre,
    seccion,
    valor: textoDeLaPagina(textos, clave, original),
    tope: o.tope ?? MAX_TEXTO_DE_LA_PAGINA,
    agregar: false,
    quitable: !!o.quitable,
    aMano: textos?.[clave] !== undefined,
    conCita: false,
    escribe: { via: "texto", clave, original },
  };
}

/** Las piezas de una lista y su lugar para agregar. */
function deLaLista(l: ListaDeLaPagina, nombre: string, seccion: string, o: { nueva?: boolean; quitable?: boolean; tope?: number; nombreNueva?: string } = {}): PiezaDeLaEscala[] {
  const r = l.piezas.map((p) => delResumen(p.clave, p.texto, nombre, seccion, p, { quitable: o.quitable ?? true, tope: o.tope }));
  if (l.nueva && o.nueva !== false) r.push(delResumen(l.nueva, null, o.nombreNueva ?? `${nombre} (nueva)`, seccion, null, { tope: o.tope }));
  return r;
}

/**
 * Las partes de una cifra: el número, qué es y su nota. «Qué significa» no se quita: en la edición a mano, quitarlo quita la
 * cifra entera. Una cifra que el cliente no ve (su cita no la sostiene) va marcada.
 */
function deLaCifra(c: CifraDeLaPagina, seccion: string, que: string): PiezaDeLaEscala[] {
  const oculta = { noLaVeElCliente: !!c.noSale };
  const r = [
    delResumen(`${c.clave}:cifra`, c.cifra, `${que}: la cifra`, seccion, c, { tope: TOPE_DE_LA_CIFRA, ...oculta }),
    delResumen(`${c.clave}:texto`, c.texto, `${que}: qué significa ${c.cifra}`, seccion, c, oculta),
  ];
  if (c.conNota) r.push(delResumen(`${c.clave}:nota`, c.nota, `${que}: su base o lo que falta validar`, seccion, c, { quitable: !!c.nota, ...oculta }));
  return r;
}

/** Las piezas del Resumen, en el orden de la página. */
export function piezasDelResumen(res: ResumenDeLaPagina, textos: TextosDeLaPagina | null | undefined): PiezaDeLaEscala[] {
  // Sin Resumen armado no hay nada que mejorar con Nexus (ni versión a la que volver): primero se arma.
  if (!res.at) return [];
  const out: PiezaDeLaEscala[] = [];
  const parte = (tipo: string): ListaDeLaPagina => res.negocio?.find((p) => p.tipo === tipo)?.lista ?? { piezas: [], nueva: null };
  // El título es el nombre del entregable (24 nov), con los equipos explorados, como lo pinta la página.
  const titular = res.hicimos ? titularDelResumen(res.tarjetas.filter((t) => !t.porExplorar).map((t) => t.nombre), textos) : null;
  if (titular) {
    const p = fijo(titular.clave, titular.original, "El título (arriba de todo)", R.arriba, textos);
    out.push({ ...p, valor: titular.valor });
  }
  // El resumen debajo del título (24 nov); sin él, la página muestra la bajada de siempre.
  const portada = parte("portada");
  if (portada.piezas.length)
    out.push(...deLaLista({ piezas: portada.piezas, nueva: portada.piezas.length < MAX_PARRAFOS_DE_LA_PORTADA ? portada.nueva : null }, "Un párrafo del resumen, debajo del título", R.arriba));
  else {
    out.push(fijo(claveAtadaDelResumen("bajada", BAJADA_DEL_RESUMEN), BAJADA_DEL_RESUMEN, "La bajada, debajo del titular", R.arriba, textos));
    if (portada.nueva) out.push(delResumen(portada.nueva, null, "El resumen, debajo del título (uno o dos párrafos)", R.arriba, null));
  }

  const tesis = parte("tesis");
  const enElProblema = R.problema;
  // La tesis es obligatoria para publicar: se cambia, no se quita.
  out.push(...deLaLista({ piezas: tesis.piezas.slice(0, 1), nueva: tesis.piezas.length ? null : tesis.nueva }, "El problema principal (la tesis)", enElProblema, { quitable: false }));
  const etiquetas = parte("etiquetas");
  out.push(...deLaLista(etiquetas, "Una etiqueta del negocio", enElProblema, { nueva: etiquetas.piezas.length < MAX_ETIQUETAS, tope: TOPE_DE_UN_NOMBRE }));
  const abarca = parte("abarca");
  const fuera = parte("fuera");
  out.push(...deLaLista(abarca, "Qué abarca este diagnóstico", R.arriba, { nueva: !abarca.piezas.length }));
  out.push(...deLaLista(fuera, "Qué queda fuera", R.arriba, { nueva: !fuera.piezas.length }));
  if (res.tamano) {
    out.push(
      delResumen(res.tamano.clave, [res.tamano.valor, res.tamano.rotulo].filter(Boolean).join(" "), "El tamaño del negocio (número y unidad)", enElProblema, { citas: res.tamano.citas }, {
        quitable: true,
        noLaVeElCliente: !!res.tamano.noSale,
      }),
    );
  } else if (parte("tamano").nueva) {
    out.push(delResumen(parte("tamano").nueva!, null, "El tamaño del negocio («500 clientes activos»)", enElProblema, null));
  }

  const puntos = res.puntos ?? [];
  if (puntos.length || res.puntoNuevo) out.push(fijo(CLAVES.delResumen("titulo.puntos"), "Lo más crítico hoy.", "Título de los puntos clave", R.puntos, textos));
  puntos.forEach((p, i) => {
    // Quitar el título quita el punto entero (como «Quitar este punto» en la página); lo que explica se cambia, no se quita.
    out.push(delResumen(`${p.clave}:titulo`, p.titulo, `Título del punto clave ${i + 1}`, R.puntos, p, { tope: TOPE_DEL_TITULO_DEL_PUNTO, quitable: true }));
    out.push(delResumen(`${p.clave}:texto`, p.texto || null, `Qué explica el punto clave ${i + 1} («${p.titulo}»)`, R.puntos, p));
  });
  if (res.puntoNuevo) out.push(delResumen(res.puntoNuevo, null, "Un punto clave nuevo (su título)", R.puntos, null, { tope: TOPE_DEL_TITULO_DEL_PUNTO }));

  if (res.claveDelTituloDelRecorrido)
    out.push(
      delResumen(res.claveDelTituloDelRecorrido, res.tituloDelRecorrido ?? "Cómo pasa un cliente por tus áreas.", "Título del recorrido", R.operacion, null, { tope: TOPE_DEL_TITULO_DEL_RECORRIDO }),
    );
  for (const e of res.recorrido ?? []) {
    const que = e.continuo ? "el paso que acompaña" : "el paso";
    out.push(delResumen(`${e.clave}:nombre`, e.nombre, `Nombre de ${que} «${e.nombre}»`, R.operacion, e, { tope: TOPE_DE_UN_NOMBRE }));
    out.push(delResumen(`${e.clave}:texto`, e.texto || null, `El detalle de «${e.nombre}»`, R.operacion, e));
    out.push(delResumen(`${e.clave}:friccion`, e.friccion, `Lo que se traba en «${e.nombre}»`, R.operacion, e, { quitable: true }));
  }
  if (res.etapaNueva) out.push(delResumen(res.etapaNueva, null, "Un paso nuevo (su nombre)", R.operacion, null, { tope: TOPE_DE_UN_NOMBRE }));

  // Quién es quién (24 nov), arriba de las filas de los equipos: la única parte con nombres.
  const quienes = parte("quienes");
  // Va en «Equipos y hallazgos»: sin ningún equipo en la página, esa sección no sale (y no hay dónde verlo).
  if (res.tarjetas.length && (quienes.piezas.length || quienes.nueva))
    out.push(...deLaLista({ piezas: quienes.piezas, nueva: quienes.piezas.length < MAX_LINEAS_DEL_MAPA ? quienes.nueva : null }, "Una línea de quién es quién («Marketing: Catalina y Verónica»)", R.equipos));
  for (const t of res.tarjetas) {
    if (t.porExplorar) continue;
    for (const x of t.subequipos) {
      const sec = seccionDelEquipo(x.nombre);
      const enDinero = x.costo !== undefined;
      if (x.claveDelNombre) out.push(delResumen(x.claveDelNombre, x.nombre, `Nombre del equipo «${x.nombre}»`, sec, null, { tope: TOPE_DE_UN_NOMBRE }));
      if (x.costo && !x.costo.dePerdida) out.push(...deLaCifra(x.costo, sec, `Cuánto le cuesta a ${x.nombre}`));
      out.push(...deLaLista(x.frena, `El reto principal de ${x.nombre}`, sec, { nueva: !x.frena.piezas.length }));
      out.push(...deLaLista(x.retos, enDinero ? `Lo que causa el reto de ${x.nombre}` : `Un reto de ${x.nombre}`, sec));
      out.push(...deLaLista(x.organizacion, `Quiénes son o qué hacen en ${x.nombre}`, sec));
      out.push(...deLaLista(x.bien, `Lo que ya funciona en ${x.nombre}`, sec));
      x.cifras.forEach((c, i) => out.push(...deLaCifra(c, sec, `Cifra ${i + 1} de ${x.nombre}`)));
      if (x.cifraNueva) out.push(delResumen(x.cifraNueva, null, `Una cifra nueva de ${x.nombre}`, sec, null, { tope: TOPE_DE_LA_CIFRA }));
      if (x.claveDeLaFalta) out.push(delResumen(x.claveDeLaFalta, x.falta, enDinero ? `Qué falta para saber cuánto le cuesta a ${x.nombre}` : `Qué dato falta de ${x.nombre}`, sec, null, { quitable: !!x.falta }));
    }
  }

  for (const p of res.pendientes) if (p.clave) out.push(delResumen(p.clave, p.texto, "Lo que falta validar", R.falta, p, { quitable: true }));
  if (res.pendienteNuevo) out.push(delResumen(res.pendienteNuevo, null, "Algo nuevo por validar", R.falta, null));
  // Lo que no se edita a mano en la página (formato 1: datos rojos y hallazgos sueltos) tampoco se pide acá.
  return out;
}

/** Lo que la página del área necesita además de su resultado: lo escrito por el equipo y lo que la página arma sola. */
export interface EscritoDelArea {
  textos: TextosDeLaPagina | null | undefined;
  textosDelRadar: Record<string, TextoDelRadar> | null | undefined;
  /** La descripción guardada del área (null: la de respaldo, sin IA). */
  descripcion: { origen: "agente" | "mano" | "respaldo" } | null;
  /** El detalle de cada parte (`detalles[id]`): lo que dice su tarjeta cuando nadie lo cambió y qué priorizar. */
  detalle: (dimensionId: string) => { impacto: string | null; siguiente: { nombre: string; prioridad: string } | null } | null;
  /** Si la página muestra «Lo que más le cuesta» (sale del Resumen: se cambia allá; aquí solo su ceja). */
  conLoQueCuesta: boolean;
  /** Cuándo se midió (el pie de la página). */
  fecha: string | null;
}

/**
 * Las piezas de la página de un área, en el orden de la página: TODO lo que hoy se edita a mano en ella (23 nov, la
 * coordinadora: «Mejorar con IA» cubre las subpáginas igual que el Resumen). Lo único que no entra: quitar un caso entero
 * (su botón usa otra clave que su título; se quita a mano) y lo que sale del Resumen («Lo que más le cuesta», que se cambia
 * en el Resumen).
 */
export function piezasDelArea(r: ResultadoDelTest, e: EscritoDelArea): PiezaDeLaEscala[] {
  const area = r.areaId;
  const out: PiezaDeLaEscala[] = [];
  out.push({
    clave: `desc/${area}`,
    nombre: "Descripción de «Resultado general»",
    seccion: A.resultado,
    valor: r.sintesis || null,
    tope: TOPE_DE_LA_DESCRIPCION_A_MANO,
    agregar: false,
    quitable: e.descripcion?.origen === "mano",
    aMano: e.descripcion?.origen === "mano",
    conCita: false,
    escribe: { via: "descripcion", areaId: area },
  });
  const titulo = (k: keyof typeof TITULOS_DEL_AREA, seccion: string) => fijo(CLAVES.delArea(area, k), TITULOS_DEL_AREA[k].texto, TITULOS_DEL_AREA[k].nombre, seccion, e.textos);
  // La escalera sale solo con un nivel (como en la página: ResultadoDelTestVista); el radar, con algo medido.
  if (r.preguntadas > 0 && r.nivel) out.push(titulo("titulo.escalera", A.escalera));
  if (r.preguntadas > 0) out.push(titulo("titulo.radar", A.radar));
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const escrito = textoVigenteDelRadar(e.textosDelRadar ?? undefined, d);
    const valor = escrito ?? e.detalle(d.id)?.impacto ?? null;
    if (!valor) continue;
    out.push({
      clave: `radar/${d.id}`,
      nombre: `Lo que dice la tarjeta de ${d.nombre}`,
      seccion: A.radar,
      valor,
      tope: MAX_TEXTO_DEL_RADAR,
      agregar: false,
      quitable: false,
      aMano: escrito !== null,
      conCita: false,
      escribe: { via: "radar", dimensionId: d.id, nivel: d.nivel },
    });
  }
  if (e.conLoQueCuesta) out.push(fijo(CLAVES.delArea(area, "ceja.cuesta"), cejaDeLoQueCuesta(r.areaNombre), "Ceja de lo que más le cuesta", A.cuesta, e.textos));
  const rec = r.recomendacion;
  if (rec) {
    if (rec.tipo === "trabajar") {
      const t = tituloDeEmpezar(rec.dimensionNombre, rec.objetivoNombre);
      out.push(fijo(CLAVES.calculado(area, "empezar.titulo", t), t, "Título de «Por dónde empezar»", A.empezar, e.textos));
    }
    out.push(fijo(CLAVES.calculado(area, "empezar.razon", rec.razon), rec.razon, "Por qué empezar por ahí", A.empezar, e.textos));
    if (rec.tipo === "trabajar" && rec.costoDeQuedarse)
      out.push(fijo(CLAVES.calculado(area, "costo", rec.costoDeQuedarse), rec.costoDeQuedarse, "Lo que cuesta quedarse así", A.empezar, e.textos));
  }
  if (r.casos.some((x) => !quitadaDeLaPagina(e.textos, CLAVES.caso(area, x.id)))) out.push(titulo("titulo.casos", A.casos));
  // Un caso quitado para el cliente no sale en su página: tampoco se le pide a Nexus (se vuelve a mostrar a mano).
  for (const c of r.casos.filter((x) => !quitadaDeLaPagina(e.textos, CLAVES.caso(area, x.id)))) {
    out.push(fijo(CLAVES.caso(area, c.id, "titulo"), c.titulo, `Título del caso «${c.titulo}»`, A.casos, e.textos));
    out.push(fijo(CLAVES.caso(area, c.id, "promesa"), c.promesa, `Qué logra el caso «${c.titulo}»`, A.casos, e.textos));
    if (c.razon) out.push(fijo(CLAVES.calculado(area, `caso.${c.id}.razon`, c.razon), c.razon, `Qué parte sube con «${c.titulo}»`, A.casos, e.textos));
  }
  if (r.nivel && r.riesgos.length) out.push(titulo("titulo.riesgos", A.riesgos));
  if (r.nivel)
    for (const x of r.riesgos)
      out.push(fijo(CLAVES.calculado(area, "riesgo", x), x, "Un riesgo", A.riesgos, e.textos, { quitable: true }));
  if (r.preguntadas > 0) {
    out.push(titulo("titulo.partes", A.partes));
    for (const d of r.dimensiones) {
      const det = d.preguntada && d.nivel ? e.detalle(d.id) : null;
      if (!det) continue;
      const original = textoDeLaPrioridad(det).texto;
      out.push(fijo(CLAVES.detalle(d.id, original), original, `Qué priorizar en ${d.nombre}`, A.partes, e.textos));
    }
  }
  const pie = pieDelArea(e.fecha);
  out.push(fijo(CLAVES.calculado(area, "pie", pie), pie, "El pie de la página", A.abajo, e.textos));
  return out;
}

/**
 * Las piezas de una sección (24 nov: «✨ Mejorar con IA» va por sección, el botón de su encabezado). La sección es la de
 * lib/external/secciones-de-la-escala.ts; «Equipos y hallazgos» abarca la de cada equipo.
 */
export function piezasDeLaSeccion<P extends Pick<PiezaDeLaEscala, "seccion">>(piezas: readonly P[], seccion: string): P[] {
  return piezas.filter((p) => esDeLaSeccion(p.seccion, seccion));
}

/** La operación que escribe un cambio en una pieza: la MISMA de la edición a mano. `despues` null: quitarla. */
export function operacionDelCambio(p: PiezaDeLaEscala, despues: string | null): Operacion {
  const e = p.escribe;
  switch (e.via) {
    case "resumen":
      return { op: "resumenDeLaEscala", clave: e.clave, texto: despues };
    case "texto": {
      // Como la edición a mano (TextoFijo): el de siempre vuelve a ser el de siempre; vacío, la pieza no sale.
      const t = despues?.trim() ?? "";
      if (!t) return { op: "textoDeLaPagina", clave: e.clave, texto: p.quitable ? "" : null };
      return { op: "textoDeLaPagina", clave: e.clave, texto: t === e.original.trim() ? null : t };
    }
    case "radar":
      return { op: "textoDelRadar", dimensionId: e.dimensionId, valor: despues ? { texto: despues, nivel: e.nivel } : null };
    case "descripcion":
      return { op: "descripcionDeLaEscala", areaId: e.areaId, texto: despues };
  }
}

/**
 * Lo que acepta una pieza, para el modelo (la guía de su sección en el núcleo de «Mejorar con IA»). El texto de la pieza va
 * aparte, una sola vez: sin citas ni ids de reuniones (las piezas no los traen).
 */
export function guiaDeLaPieza(p: PiezaDeLaEscala): string {
  return [
    p.agregar ? "lugar para AGREGAR una pieza nueva (vacío: aquí se agrega)" : null,
    p.aMano ? "la escribió el equipo" : null,
    p.quitable ? "se puede quitar" : "no se quita",
    p.noLaVeElCliente ? "el cliente no la ve: su cita no sostiene la cifra" : null,
    `hasta ${p.tope} caracteres`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Si la página de un área muestra «Lo que más le cuesta»: la misma regla de la vista (ResultadoDelTestVista › `conclusiones`):
 * su tarjeta del Resumen con el molde del 20 nov y algo que decir (un costo, un reto o lo que lo causa).
 */
export function conLoQueCuestaDelArea(res: Pick<ResumenDeLaPagina, "tarjetas">, areaId: string): boolean {
  const t = res.tarjetas.find((x) => x.areaId === areaId && !x.porExplorar);
  return !!t?.subequipos.some((x) => {
    if (x.costo === undefined) return false;
    const c = conclusionDelSubequipo(x, false);
    return !!c.costo || !!c.reto || c.causas.length > 0;
  });
}
