/**
 * lib/tests-diagnostico/variantes.ts — LAS PREGUNTAS SEGÚN CÓMO GESTIONAN HOY A SUS CLIENTES. PURO y CLIENT-SAFE.
 *
 * Quien marcó HubSpot no debería leer «No hay un CRM», y quien usa Excel no debería leer «Hay un CRM». Cada pregunta y
 * cada opción del banco pueden llevar una variante por grupo (`con-crm`, `sin-crm`) con solo lo que cambia; sin variante,
 * sale la base. «No lo sé» no es un grupo: ve la base.
 *
 * LO QUE NO SE NEGOCIA (Elías, 2026-10-31):
 *   · Una variante mide EXACTAMENTE el nivel de su base: cambia las palabras, nunca el id ni el nivel de la opción, así
 *     que el puntaje, la medición por pregunta y la nota de HubSpot no se enteran.
 *   · Siempre salen las 5 respuestas. El nivel se define por lo que hace el equipo (todo disperso · en un lugar, a mano ·
 *     pasa solo · conectado · lo decide la IA), no por la marca de la herramienta: un nivel que un grupo casi no alcanza
 *     queda escrito sin nombrar lo que ese grupo dice no tener, y quien lo elija cuenta igual. Tener CRM no significa
 *     usarlo bien: quien lo tiene sigue viendo el nivel más bajo (dice que casi no se usa).
 *
 * Las variantes se escriben en ./variantes-de-crm.datos.ts y `conVariantes` las cuelga del banco por texto EXACTO de la
 * base: una entrada sirve para todas las industrias que comparten ese texto, y si la escala cambia la base la entrada
 * queda sin uso, en vez de seguir saliendo vieja. `problemasDeLasVariantes` es el seguro: lo corre la prueba contra la
 * escala del repo y lo pide la pantalla antes de aprobar. La revisión de sentido, contra el nivel, es la skill
 * `revisar-banco-del-test`.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { USOS_DE_CRM, type UsoDeCrm } from "./formulario";
import { GRUPOS_DE_CRM, type GrupoDeCrm, type OpcionDelBanco, type PreguntaDelBanco } from "./tipos";

export const ETIQUETA_DEL_GRUPO: Record<GrupoDeCrm, string> = { "con-crm": "Tiene CRM", "sin-crm": "No tiene CRM" };

/** Dónde va el nombre de la herramienta en una variante. */
export const MARCA_DE_LA_HERRAMIENTA = "{crm}";

const SIN_CRM_SIN_HOJAS = "el lugar donde hoy anotan a tus clientes";

/** A qué grupo cae cada respuesta del formulario y cómo se nombra lo que usa. `grupo: null` = ve la base. */
const POR_USO: Record<UsoDeCrm, { grupo: GrupoDeCrm | null; herramienta: string }> = {
  HubSpot: { grupo: "con-crm", herramienta: "HubSpot" },
  Salesforce: { grupo: "con-crm", herramienta: "Salesforce" },
  "Otro CRM (Zoho, Pipedrive, RD Station, Monday, Odoo)": { grupo: "con-crm", herramienta: "tu CRM" },
  "Hojas de cálculo (Excel, Google Sheets)": { grupo: "sin-crm", herramienta: "tus hojas de cálculo" },
  "En proceso de buscar un CRM": { grupo: "sin-crm", herramienta: SIN_CRM_SIN_HOJAS },
  "Aún no usamos ninguna herramienta": { grupo: "sin-crm", herramienta: SIN_CRM_SIN_HOJAS },
  "No lo sé": { grupo: null, herramienta: "" },
};

const delUso = (uso: string | null | undefined) => (uso && (USOS_DE_CRM as readonly string[]).includes(uso) ? POR_USO[uso as UsoDeCrm] : null);

/** El grupo de lo que marcó la persona; null = ve la base (no lo sabe, o un intento sin el dato). */
export const grupoDeCrm = (uso: string | null | undefined): GrupoDeCrm | null => delUso(uso)?.grupo ?? null;

/** La respuesta del formulario con la que «Ver como» muestra cada grupo. */
export const EJEMPLO_DEL_GRUPO: Record<GrupoDeCrm, UsoDeCrm> = { "con-crm": "HubSpot", "sin-crm": "Hojas de cálculo (Excel, Google Sheets)" };

/** Pone el nombre de la herramienta; al empezar la oración, con mayúscula («Tu CRM casi no se usa»). */
function conHerramienta(plantilla: string, herramienta: string): string {
  const puesto = plantilla.replaceAll(MARCA_DE_LA_HERRAMIENTA, herramienta);
  return plantilla.startsWith(MARCA_DE_LA_HERRAMIENTA) ? puesto.charAt(0).toUpperCase() + puesto.slice(1) : puesto;
}

/**
 * Las preguntas tal como las ve quien marcó ese uso, con el grupo que vio y sin las variantes: el intento guarda lo que se
 * leyó, y de ahí salen la nota de HubSpot y los textos del resultado.
 */
export function preguntasParaElUso(preguntas: readonly PreguntaDelBanco[], uso: string | null | undefined): (PreguntaDelBanco & { grupo: GrupoDeCrm | null })[] {
  const d = delUso(uso);
  const grupo = d?.grupo ?? null;
  const poner = (variante: string | undefined, base: string) => (variante ? conHerramienta(variante, d?.herramienta ?? "") : base);
  return preguntas.map(({ variantes, ...p }) => {
    const v = grupo ? variantes?.[grupo] : undefined;
    return {
      ...p,
      texto: poner(v?.texto, p.texto),
      ayuda: v?.ayuda ? poner(v.ayuda, "") : p.ayuda,
      opciones: p.opciones.map(({ variantes: vo, ...o }): OpcionDelBanco => ({ ...o, texto: poner(grupo ? vo?.[grupo] : undefined, o.texto) })),
      grupo,
    };
  });
}

/**
 * La pregunta sin la variante de ese texto. Lo pide el editor al cambiar una base: su variante decía otra cosa, y es mejor
 * que salga la base (o que la revisión lo frene) a que el público lea la versión vieja.
 */
export function sinVarianteDelCampo(p: PreguntaDelBanco, campo: "texto" | "ayuda"): Pick<PreguntaDelBanco, "variantes"> {
  const variantes = Object.fromEntries(
    GRUPOS_DE_CRM.flatMap((g) => {
      const queda = { ...p.variantes?.[g] };
      delete queda[campo];
      return Object.keys(queda).length ? [[g, queda]] : [];
    }),
  );
  return { variantes: Object.keys(variantes).length ? variantes : undefined };
}

/** Todos los textos de variante de una pregunta. */
export function textosDeLasVariantes(p: PreguntaDelBanco): string[] {
  return GRUPOS_DE_CRM.flatMap((g) => {
    const v = p.variantes?.[g];
    return [v?.texto, v?.ayuda, ...p.opciones.map((o) => o.variantes?.[g])].filter((t): t is string => !!t);
  });
}

// ── Las entradas del repo ─────────────────────────────────────────────────────

export type CampoDeVariante = "texto" | "ayuda" | Letra;

/** Una variante escrita en el repo: se cuelga de toda pregunta con ese id cuyo campo diga EXACTAMENTE `base`. */
export interface EntradaDeVariante {
  pregunta: string;
  campo: CampoDeVariante;
  base: string;
  "con-crm"?: string;
  "sin-crm"?: string;
}

const claveDeEntrada = (pregunta: string, campo: string, base: string) => `${pregunta}|${campo}|${base}`;

/** Las preguntas con las variantes de las entradas cuya base coincide. Reemplaza las que tuvieran: el repo es la fuente. */
export function conVariantes(preguntas: readonly PreguntaDelBanco[], entradas: readonly EntradaDeVariante[]): PreguntaDelBanco[] {
  const porClave = new Map(entradas.map((e) => [claveDeEntrada(e.pregunta, e.campo, e.base), e]));
  const de = (pregunta: string, campo: CampoDeVariante, base: string | null) => (base ? porClave.get(claveDeEntrada(pregunta, campo, base)) : undefined);
  return preguntas.map((p) => {
    const texto = de(p.id, "texto", p.texto);
    const ayuda = de(p.id, "ayuda", p.ayuda);
    const variantes = Object.fromEntries(
      GRUPOS_DE_CRM.flatMap((g) => {
        const t = texto?.[g];
        const a = ayuda?.[g];
        return t || a ? [[g, { ...(t ? { texto: t } : {}), ...(a ? { ayuda: a } : {}) }]] : [];
      }),
    );
    const opciones = p.opciones.map((o): OpcionDelBanco => {
      const e = de(p.id, o.nivel, o.texto);
      const deLaOpcion = Object.fromEntries(GRUPOS_DE_CRM.flatMap((g) => (e?.[g] ? [[g, e[g]]] : [])));
      return { id: o.id, texto: o.texto, nivel: o.nivel, ...(Object.keys(deLaOpcion).length ? { variantes: deLaOpcion } : {}) };
    });
    return { id: p.id, dimensionId: p.dimensionId, texto: p.texto, ayuda: p.ayuda, opciones, ...(Object.keys(variantes).length ? { variantes } : {}) };
  });
}

/** Las entradas que ya no se cuelgan de ningún banco: la escala cambió esa base y quedaron viejas. */
export function entradasSinUso(bancos: readonly (readonly PreguntaDelBanco[])[], entradas: readonly EntradaDeVariante[]): EntradaDeVariante[] {
  const vistas = new Set<string>();
  for (const preguntas of bancos) {
    for (const p of preguntas) {
      vistas.add(claveDeEntrada(p.id, "texto", p.texto));
      if (p.ayuda) vistas.add(claveDeEntrada(p.id, "ayuda", p.ayuda));
      for (const o of p.opciones) vistas.add(claveDeEntrada(p.id, o.nivel, o.texto));
    }
  }
  return entradas.filter((e) => !vistas.has(claveDeEntrada(e.pregunta, e.campo, e.base)));
}

// ── Lo que cambia, para «Ver como» ────────────────────────────────────────────

export interface CambiosDeLaPregunta {
  id: string;
  dimensionId: string;
  campos: { campo: CampoDeVariante; base: string; variante: string }[];
}

/** Solo lo que un grupo lee distinto de la base, con el nombre de `EJEMPLO_DEL_GRUPO`. */
export function cambiosDelBanco(preguntas: readonly PreguntaDelBanco[], grupo: GrupoDeCrm): CambiosDeLaPregunta[] {
  const vistas = preguntasParaElUso(preguntas, EJEMPLO_DEL_GRUPO[grupo]);
  return preguntas.flatMap((p, i) => {
    const v = vistas[i];
    const campos: CambiosDeLaPregunta["campos"] = [];
    if (v.texto !== p.texto) campos.push({ campo: "texto", base: p.texto, variante: v.texto });
    if (p.ayuda && v.ayuda !== p.ayuda) campos.push({ campo: "ayuda", base: p.ayuda, variante: v.ayuda ?? "" });
    p.opciones.forEach((o, j) => {
      if (v.opciones[j].texto !== o.texto) campos.push({ campo: o.nivel, base: o.texto, variante: v.opciones[j].texto });
    });
    return campos.length ? [{ id: p.id, dimensionId: p.dimensionId, campos }] : [];
  });
}

// ── El seguro ─────────────────────────────────────────────────────────────────

/** Lo que un grupo no puede leer, ni en su variante ni en una base que quedó colgada al lado de ella. */
const CONTRADICE: Record<GrupoDeCrm, readonly { patron: RegExp; porque: string }[]> = {
  "con-crm": [
    { patron: /no hay (un |ning[uú]n )?(crm|sistema)\b/i, porque: "le dice que no hay CRM a quien marcó que lo tiene" },
    { patron: /\bsin crm\b/i, porque: "le dice que no hay CRM a quien marcó que lo tiene" },
    { patron: /\btu sistema\b/i, porque: "le habla de «tu sistema» a quien ya dijo cuál usa" },
  ],
  "sin-crm": [
    { patron: /(?<!no hay un )\bcrm\b/i, porque: "le habla de un CRM a quien marcó que no lo tiene" },
    { patron: /\bherramientas?\b/i, porque: "le da por hecha una herramienta a quien pudo marcar que no usa ninguna" },
    { patron: /\btu sistema\b/i, porque: "le habla de «tu sistema» a quien marcó que no lo tiene" },
  ],
};

const MARCA_DESCONOCIDA = /\{(?!crm\})[^}]*\}/;
const PRODUCTO = /\b(hubspot|salesforce|zoho|pipedrive|odoo|excel)\b/i;

/**
 * Qué está mal en las variantes de un banco. Revisa lo que LEE cada grupo, no solo lo escrito: una mención de CRM o de
 * herramienta sin variante, y una opción base colgada al lado de una pregunta adaptada, salen igual que una variante mal
 * escrita. Una variante igual a su base o con el nombre de un producto (va `{crm}`) también es un problema.
 */
export function problemasDeLasVariantes(preguntas: readonly PreguntaDelBanco[]): string[] {
  const problemas: string[] = [];
  preguntas.forEach((p, i) => {
    for (const grupo of GRUPOS_DE_CRM) {
      const quien = `Pregunta ${i + 1} (${ETIQUETA_DEL_GRUPO[grupo]})`;
      const v = p.variantes?.[grupo];
      const lee: { donde: string; base: string | null; variante: string | undefined }[] = [
        { donde: "la pregunta", base: p.texto, variante: v?.texto },
        { donde: "la aclaración", base: p.ayuda, variante: v?.ayuda },
        ...p.opciones.map((o) => ({ donde: `la opción ${o.nivel}`, base: o.texto, variante: o.variantes?.[grupo] })),
      ];
      for (const { donde, base, variante } of lee) {
        const t = variante ?? base ?? "";
        for (const { patron, porque } of CONTRADICE[grupo]) {
          if (patron.test(t.replaceAll(MARCA_DE_LA_HERRAMIENTA, ""))) problemas.push(`${quien}: ${donde} ${porque}.`);
        }
        if (variante === undefined) {
          if (t.includes(MARCA_DE_LA_HERRAMIENTA)) problemas.push(`${quien}: ${donde} trae ${MARCA_DE_LA_HERRAMIENTA} en la base: saldría tal cual.`);
          continue;
        }
        if (variante === base) problemas.push(`${quien}: ${donde} tiene una variante igual a su base.`);
        if (MARCA_DESCONOCIDA.test(t)) problemas.push(`${quien}: ${donde} trae una marca que no existe (solo vale ${MARCA_DE_LA_HERRAMIENTA}).`);
        if (PRODUCTO.test(t)) problemas.push(`${quien}: ${donde} nombra un producto; el nombre lo pone ${MARCA_DE_LA_HERRAMIENTA}.`);
        // Sin CRM el nombre es una frase en plural o con artículo: solo concuerda después de «en».
        if (grupo === "sin-crm" && t.replaceAll(`en ${MARCA_DE_LA_HERRAMIENTA}`, "").includes(MARCA_DE_LA_HERRAMIENTA)) {
          problemas.push(`${quien}: ${donde} usa ${MARCA_DE_LA_HERRAMIENTA} sin «en» delante; con «tus hojas de cálculo» no concuerda.`);
        }
      }
    }
  });
  return problemas;
}
