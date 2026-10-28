/**
 * lib/tests-diagnostico/formulario.ts — EL FORMULARIO de la portada del test público: sus listas y su revisión, campo a
 * campo. PURO (lo usa la página, del lado del navegador).
 *
 * Es el formulario de la aplicación vieja (Elías, 28 oct: «que se vea igual»): nombre y apellido, correo de trabajo,
 * dominio, teléfono con su país, cómo gestionan hoy a sus clientes, industria y el área, todos obligatorios, con los mismos mensajes. Dos cambios a
 * propósito: la industria es la lista de Smarteam (decide la edición de las preguntas; la vieja tenía 52 de texto libre),
 * y el área la eligen las tarjetas del mismo formulario. Las pruebas: formulario.test.ts.
 */

/**
 * Las opciones de «¿Cómo gestionan actualmente a sus clientes?»: los valores EXACTOS, en su orden, de la propiedad de
 * contacto `como_gestionan_actualmente_a_sus_clientes` de HubSpot (en ella el valor y la etiqueta son el mismo texto). Desde
 * el 2026-10-28 reemplaza al «Puesto» de la aplicación vieja (Elías: dice más del prospecto que su cargo).
 */
export const USOS_DE_CRM = [
  "HubSpot",
  "Salesforce",
  "Otro CRM (Zoho, Pipedrive, RD Station, Monday, Odoo)",
  "Hojas de cálculo (Excel, Google Sheets)",
  "En proceso de buscar un CRM",
  "Aún no usamos ninguna herramienta",
  "No lo sé",
] as const;
export type UsoDeCrm = (typeof USOS_DE_CRM)[number];

/** La propiedad del contacto en HubSpot donde viaja (ya existe allá; no se crea). */
export const PROPIEDAD_DEL_USO_DE_CRM = "como_gestionan_actualmente_a_sus_clientes";

/** Los códigos de país del teléfono (Costa Rica primero, la de por defecto). */
export const PAISES: readonly { codigo: string; etiqueta: string }[] = [
  { codigo: "+506", etiqueta: "Costa Rica +506" },
  { codigo: "+52", etiqueta: "México +52" },
  { codigo: "+1", etiqueta: "Estados Unidos / Canadá +1" },
  { codigo: "+502", etiqueta: "Guatemala +502" },
  { codigo: "+503", etiqueta: "El Salvador +503" },
  { codigo: "+504", etiqueta: "Honduras +504" },
  { codigo: "+505", etiqueta: "Nicaragua +505" },
  { codigo: "+507", etiqueta: "Panamá +507" },
  { codigo: "+1", etiqueta: "Rep. Dominicana +1" },
  { codigo: "+1", etiqueta: "Puerto Rico +1" },
  { codigo: "+57", etiqueta: "Colombia +57" },
  { codigo: "+58", etiqueta: "Venezuela +58" },
  { codigo: "+593", etiqueta: "Ecuador +593" },
  { codigo: "+51", etiqueta: "Perú +51" },
  { codigo: "+591", etiqueta: "Bolivia +591" },
  { codigo: "+56", etiqueta: "Chile +56" },
  { codigo: "+54", etiqueta: "Argentina +54" },
  { codigo: "+598", etiqueta: "Uruguay +598" },
  { codigo: "+595", etiqueta: "Paraguay +595" },
  { codigo: "+55", etiqueta: "Brasil +55" },
  { codigo: "+34", etiqueta: "España +34" },
];
export const PAIS_POR_DEFECTO = PAISES[0].etiqueta;

/** Los dominios de correo personal: es una herramienta para empresas, así que se pide el correo del trabajo. */
export const DOMINIOS_PERSONALES: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.es", "hotmail.co.uk", "hotmail.fr", "hotmail.it", "hotmail.com.mx", "hotmail.com.ar",
  "outlook.com", "outlook.es", "outlook.com.ar",
  "live.com", "live.com.mx", "live.com.ar", "live.mx",
  "msn.com",
  "yahoo.com", "yahoo.es", "yahoo.com.mx", "yahoo.com.ar", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com",
  "protonmail.com", "proton.me", "pm.me",
  "gmx.com", "gmx.es", "gmx.net",
  "zoho.com", "mail.com", "email.com", "usa.com", "inbox.com",
  "yandex.com", "yandex.ru",
  "hey.com", "fastmail.com", "tutanota.com", "tuta.io",
  "web.de", "t-online.de", "libero.it",
  "racsa.co.cr", "ice.co.cr",
]);

/** Para buscar en una lista sin que importen las tildes ni las mayúsculas. */
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las opciones de una lista que contienen lo escrito (todas si no hay nada escrito). */
export function filtrar(opciones: readonly string[], escrito: string): string[] {
  const f = normalizar(escrito);
  return f ? opciones.filter((o) => normalizar(o).includes(f)) : [...opciones];
}

/** La opción de la lista que es lo escrito (sin importar tildes ni mayúsculas), o null. */
export function opcionExacta(opciones: readonly string[], escrito: string): string | null {
  const f = normalizar(escrito);
  return (f && opciones.find((o) => normalizar(o) === f)) || null;
}

/** El dominio limpio, como viaja a HubSpot y a la base: sin protocolo, sin «www», sin ruta. */
export const limpiarDominio = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];

/** El teléfono en E.164 (código del país + solo los dígitos del número), o vacío si no escribió número. */
export function telefonoE164(pais: string, numero: string): string {
  const codigo = PAISES.find((p) => normalizar(p.etiqueta) === normalizar(pais))?.codigo ?? "";
  const digitos = numero.replace(/\D/g, "");
  return digitos ? `${codigo}${digitos}` : "";
}

export interface ValoresDelFormulario {
  nombre: string;
  apellido: string;
  email: string;
  dominio: string;
  pais: string;
  telefono: string;
  /** Cómo gestionan hoy a sus clientes (una de `USOS_DE_CRM`). */
  crm: string;
  /** Lo que se ve en el campo: la etiqueta de la industria. */
  industria: string;
  /** El slug del área (`ventas`, `marketing`, `servicio`), o vacío. */
  area: string;
}

export const VALORES_VACIOS: ValoresDelFormulario = {
  nombre: "",
  apellido: "",
  email: "",
  dominio: "",
  pais: PAIS_POR_DEFECTO,
  telefono: "",
  crm: "",
  industria: "",
  area: "",
};

export type CampoDelFormulario = keyof ValoresDelFormulario;
export type ErroresDelFormulario = Partial<Record<CampoDelFormulario, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMINIO_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Qué le falta o qué está mal en cada campo, con las palabras de la aplicación vieja. Vacío = se puede empezar. */
export function erroresDelFormulario(v: ValoresDelFormulario, industrias: readonly string[], areas: readonly string[]): ErroresDelFormulario {
  const e: ErroresDelFormulario = {};
  if (!v.nombre.trim()) e.nombre = "Escribe tu nombre.";
  else if (v.nombre.trim().length < 2) e.nombre = "Escribe tu nombre completo.";
  if (!v.apellido.trim()) e.apellido = "Escribe tu apellido.";
  const email = v.email.trim().toLowerCase();
  if (!email) e.email = "Escribe tu correo de trabajo.";
  else if (!EMAIL_RE.test(email)) e.email = "Ese correo no parece válido (revisa el formato, p. ej. tu@empresa.com).";
  else if (DOMINIOS_PERSONALES.has(email.split("@")[1])) {
    e.email = "Necesitamos tu correo corporativo (el de tu empresa). Los correos personales como Gmail, Hotmail u Outlook no se aceptan.";
  }
  const dominio = limpiarDominio(v.dominio);
  if (!dominio) e.dominio = "Escribe el dominio de tu empresa (p. ej. empresa.com).";
  else if (!DOMINIO_RE.test(dominio)) e.dominio = "Ese dominio no parece válido. Escríbelo como empresa.com (sin «www» ni «https»).";
  else if (DOMINIOS_PERSONALES.has(dominio)) e.dominio = "Ese es un dominio de correo personal. Pon el dominio de tu empresa (p. ej. empresa.com).";
  const telefono = telefonoE164(v.pais, v.telefono);
  if (!v.telefono.replace(/\D/g, "")) e.telefono = "Escribe tu número de teléfono.";
  else if (!/^\+\d{8,16}$/.test(telefono)) e.telefono = "Ese teléfono no parece válido. Revisa el código de país y el número (solo dígitos).";
  if (!v.crm.trim()) e.crm = "Elige cómo gestionan hoy a sus clientes.";
  else if (!opcionExacta(USOS_DE_CRM, v.crm)) e.crm = "Elige una opción de la lista.";
  if (!v.industria.trim()) e.industria = "Selecciona tu industria.";
  else if (!opcionExacta(industrias, v.industria)) e.industria = "Elige tu industria de la lista.";
  if (!areas.includes(v.area)) e.area = "Elige el área a diagnosticar.";
  return e;
}
