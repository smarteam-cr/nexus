/**
 * lib/para-ti/frentes.ts — «Lo que llevas»: los FRENTES de cada persona (2026-10-04). PURO y CLIENT-SAFE.
 *
 * El ROL responde «qué puedes ver y hacer» (lib/auth/roles.ts + la matriz de permisos). El FRENTE responde otra
 * pregunta: «qué te toca seguir». Tres personas con el mismo acceso (los Super Admin) no siguen lo mismo: dirección,
 * finanzas, la Escala. Por eso un frente NO da acceso a nada: solo decide qué le llega a la persona en «Para ti».
 *
 * ⛔ Y al revés tampoco: un frente que la persona lleva pero cuyas pantallas no puede abrir (`puedeLlevar` en false)
 * se CALLA entero — ni pendientes ni avisos, ni montos ni textos — hasta que tenga el permiso (Elías, 2026-10-05).
 * Lo aplican `fuentesQueAplican` (lib/para-ti/medir-server.ts) y `quienesLlevan` (lib/para-ti/avisos-server.ts).
 *
 * Lo PERSONAL llega sin frente: un proyecto donde eres encargado, una preventa que llevas, una propuesta que creaste,
 * algo que te devolvieron. Los frentes son para lo que no tiene una persona escrita en el dato (las alertas del vigía,
 * los comentarios de la Escala, los pendientes del área de finanzas…).
 *
 * ── LA REGLA DEL DEFAULT ───────────────────────────────────────────────────────
 * `TeamMember.frentesEditadosAt` null = nadie los eligió todavía → salen del ROL (`FRENTES_POR_DEFECTO`). Con fecha, la
 * lista guardada manda, aunque esté vacía (vacía = «solo lo mío», una decisión). Mismo criterio que `logoScale` y
 * `tamUsd`: null no es lo mismo que «alguien eligió esto».
 *
 * Un frente que todavía no tiene nada detrás (`activo: false`) no se ofrece en Equipo: un interruptor que no hace nada
 * es peor que no tenerlo (misma doctrina que `enforced:false` en el registro de permisos).
 */

export const CLAVES_DE_FRENTE = [
  "LIDERAR_CS",
  "VENTAS",
  "FINANZAS_REGISTRAR",
  "FINANZAS_SUPERVISAR",
  "DIRECCION",
  "MARKETING",
  "ESCALA",
  "DOCUMENTACION",
  "SISTEMA",
  "FEEDBACK",
] as const;

export type ClaveDeFrente = (typeof CLAVES_DE_FRENTE)[number];

/** Lo que hace falta para poder ABRIR las pantallas de un frente. Se evalúa contra el acceso real de la persona. */
export type Requisito =
  | { tipo: "ninguno" }
  | { tipo: "roles"; roles: readonly string[] }
  | { tipo: "permiso"; seccion: string; accion: string };

export interface Frente {
  clave: ClaveDeFrente;
  nombre: string;
  /** Qué le llega a quien lo lleva, en una frase. */
  queLlega: string;
  requisito: Requisito;
  /** Explicación del requisito, para el aviso de Equipo. */
  requisitoTexto: string;
  /** false = reservado: todavía no hay nada que avise por este frente. No se ofrece en Equipo. */
  activo: boolean;
}

export const FRENTES: readonly Frente[] = [
  {
    clave: "LIDERAR_CS",
    nombre: "Liderar Customer Success",
    queLlega: "Las alertas del vigía, los proyectos sin encargado y los cronogramas que esperan de más en el equipo.",
    requisito: { tipo: "roles", roles: ["CSL", "SUPER_ADMIN"] },
    requisitoTexto: "Éxito del cliente es solo de la CSL y de Super Admin.",
    activo: true,
  },
  {
    clave: "VENTAS",
    nombre: "Ventas",
    queLlega: "Los pedidos de clientes fuera del alcance que pueden ser venta.",
    requisito: { tipo: "permiso", seccion: "ventas", accion: "read" },
    requisitoTexto: "Necesita ver Ventas.",
    activo: true,
  },
  {
    clave: "FINANZAS_REGISTRAR",
    nombre: "Finanzas: registrar",
    queLlega: "Lo que hoy está en Finanzas › Pendientes: facturar, registrar pagos, conciliar y anotar gastos.",
    requisito: { tipo: "permiso", seccion: "cobranza", accion: "read" },
    requisitoTexto: "Necesita ver Cobranza.",
    activo: true,
  },
  {
    clave: "FINANZAS_SUPERVISAR",
    nombre: "Finanzas: supervisar",
    queLlega: "Lo que espera tu revisión, las decisiones de Conciliación y el cierre del mes.",
    requisito: { tipo: "roles", roles: ["SUPER_ADMIN"] },
    requisitoTexto: "Supervisión es solo de Super Admin.",
    activo: true,
  },
  {
    clave: "DIRECCION",
    nombre: "Dirección",
    queLlega: "Lo que pasa en la empresa: propuestas aprobadas, meses cerrados y cómo va cada área.",
    requisito: { tipo: "ninguno" },
    requisitoTexto: "",
    activo: true,
  },
  {
    clave: "MARKETING",
    nombre: "Marketing",
    queLlega: "Las publicaciones y las ideas de campaña que esperan revisión.",
    requisito: { tipo: "permiso", seccion: "marketing", accion: "write" },
    requisitoTexto: "Necesita poder aprobar en Marketing.",
    activo: true,
  },
  {
    clave: "ESCALA",
    nombre: "Escala",
    queLlega: "Los comentarios del equipo sobre la Escala de Rendimiento, que se deciden en Feedback.",
    requisito: { tipo: "roles", roles: ["SUPER_ADMIN"] },
    requisitoTexto: "Los comentarios de la Escala se deciden en Feedback, que es de Super Admin.",
    activo: true,
  },
  {
    clave: "DOCUMENTACION",
    nombre: "Documentación",
    queLlega: "Los comentarios abiertos en las páginas de la Documentación.",
    requisito: { tipo: "roles", roles: ["SUPER_ADMIN", "CSL"] },
    requisitoTexto: "Los comentarios los resuelven la CSL y Super Admin.",
    activo: true,
  },
  {
    clave: "SISTEMA",
    nombre: "Sistema",
    queLlega: "Las copias automáticas y los procesos del servidor que fallaron.",
    requisito: { tipo: "permiso", seccion: "configuracion", accion: "read" },
    requisitoTexto: "Necesita ver Integraciones.",
    activo: true,
  },
  {
    clave: "FEEDBACK",
    nombre: "Feedback del equipo",
    queLlega: "Lo que el equipo reporta sobre Nexus: fallas, mejoras y dudas.",
    // Encendido con el módulo (2026-10-04): revisar el feedback es de dirección (lib/feedback/reglas.ts).
    requisito: { tipo: "roles", roles: ["SUPER_ADMIN"] },
    requisitoTexto: "Revisar el feedback es solo de Super Admin.",
    activo: true,
  },
];

const POR_CLAVE = new Map(FRENTES.map((f) => [f.clave, f]));

export function frente(clave: ClaveDeFrente): Frente {
  return POR_CLAVE.get(clave)!;
}

export function esClaveDeFrente(v: unknown): v is ClaveDeFrente {
  return typeof v === "string" && POR_CLAVE.has(v as ClaveDeFrente);
}

/** Los frentes que se ofrecen en Equipo. */
export const FRENTES_ACTIVOS: readonly Frente[] = FRENTES.filter((f) => f.activo);

/**
 * Lo que lleva cada rol mientras nadie elija otra cosa. El CSE no lleva frente: lo suyo (sus proyectos) le llega por
 * ser el encargado. Dev tampoco: las tareas del cronograma no tienen persona.
 */
export const FRENTES_POR_DEFECTO: Record<string, readonly ClaveDeFrente[]> = {
  CSE: [],
  VENTAS: ["VENTAS"],
  CSL: ["LIDERAR_CS", "DOCUMENTACION"],
  MARKETING: ["MARKETING"],
  DEV: [],
  ADMIN: ["FINANZAS_REGISTRAR"],
  // SUPER_ADMIN: además, ver `frentesDe` — depende de la vista de Finanzas que ya eligió. Lleva el feedback del
  // equipo por defecto (Elías, 2026-10-04: «que cada feedback nuevo me llegue como aviso»).
  SUPER_ADMIN: ["FEEDBACK"],
};

export interface PersonaConFrentes {
  roleEnum: string | null | undefined;
  email?: string | null;
  frentes?: readonly string[] | null;
  frentesEditadosAt?: Date | string | null;
  vistaFinanzas?: string | null;
  /** Para el default del frente Escala (el responsable fijo de hoy). */
  esResponsableDeLaEscala?: boolean;
}

/**
 * Los frentes EFECTIVOS de una persona. Elegidos en Equipo → esos (filtrando claves que ya no existen). Sin elegir →
 * los del rol. Un Super Admin sin elegir hereda lo que ya decía su vista de Finanzas: «Dirección» si eligió solo los
 * reportes, «Finanzas: supervisar» si no (que es lo que hoy ve al entrar a Finanzas).
 */
export function frentesDe(p: PersonaConFrentes): ClaveDeFrente[] {
  if (p.frentesEditadosAt) {
    return CLAVES_DE_FRENTE.filter((c) => (p.frentes ?? []).includes(c));
  }
  const rol = p.roleEnum ?? "";
  const base = new Set<ClaveDeFrente>(FRENTES_POR_DEFECTO[rol] ?? []);
  if (rol === "SUPER_ADMIN") base.add(p.vistaFinanzas === "DIRECCION" ? "DIRECCION" : "FINANZAS_SUPERVISAR");
  if (p.esResponsableDeLaEscala) base.add("ESCALA");
  return CLAVES_DE_FRENTE.filter((c) => base.has(c));
}

/**
 * La vista de Finanzas que se desprende de los frentes de un Super Admin: con «Finanzas: supervisar», el panel
 * completo (null = SUPERVISA, el default de `vistaFinanzasDe`); sin él, solo los reportes. Para el resto, null.
 * La escribe UNA sola vez quien guarda los frentes, así la vista deja de ser un dato que se elige aparte.
 */
export function vistaFinanzasDeFrentes(roleEnum: string, frentes: readonly string[]): "DIRECCION" | null {
  if (roleEnum !== "SUPER_ADMIN") return null;
  return frentes.includes("FINANZAS_SUPERVISAR") ? null : "DIRECCION";
}

export interface AccesoParaFrentes {
  role: string | null | undefined;
  email: string | null | undefined;
  /** El mapa de permisos EFECTIVO (`{ sections: { [s]: { [a]: bool } } }`). */
  permissions: { sections?: Record<string, Record<string, boolean> | undefined> } | null | undefined;
  esResponsableDeLaEscala: boolean;
}

/**
 * ¿Puede esta persona abrir las pantallas del frente? Si no, Equipo lo avisa en ámbar (no lo prohíbe: puede ser a
 * propósito mientras se ajusta su rol) y el frente se calla: no le llega nada de ese tema hasta que tenga el permiso.
 */
export function puedeLlevar(f: Frente, a: AccesoParaFrentes): boolean {
  const r = f.requisito;
  if (r.tipo === "ninguno") return true;
  if (a.role === "SUPER_ADMIN") return true;
  if (r.tipo === "roles") return !!a.role && r.roles.includes(a.role);
  return a.permissions?.sections?.[r.seccion]?.[r.accion] === true;
}

/** El aviso ámbar de Equipo cuando alguien lleva un frente que no puede abrir. */
export function avisoSinPermiso(f: Frente): string {
  return `${f.requisitoTexto} Mientras no tenga el permiso, no le va a llegar nada de este tema.`.trim();
}
