/**
 * components/canvas/kickoff-sections/types.ts
 *
 * Shapes de la `data` (Json de CanvasBlock) de las 3 secciones CURADAS del Kickoff
 * (equipo / horarios / canales) + normalizadores que coercen `unknown` a un shape
 * seguro con defaults. Los defaults de siembra viven en lib/canvas/canvas-defs.ts
 * (KICKOFF_CANALES_DEFAULT); acá solo se garantiza que el render nunca reviente con
 * data vieja/parcial.
 */

// ── Equipo ──────────────────────────────────────────────────────────────────
export interface EquipoMember {
  /** Id del TeamMember origen (para des/seleccionar); la foto/nombre se snapshotean. */
  teamMemberId: string;
  name: string;
  /** Rol/área mostrado bajo el nombre (ej. "CSE", "Marketing"). */
  role: string;
  /** URL de la foto (snapshot al seleccionar) o null → iniciales. */
  photoUrl: string | null;
}
export interface EquipoData {
  members: EquipoMember[];
}

export function normalizeEquipo(data: unknown): EquipoData {
  const d = (data ?? {}) as Partial<EquipoData>;
  const members = Array.isArray(d.members) ? d.members : [];
  return {
    members: members
      .filter((m): m is EquipoMember => !!m && typeof (m as EquipoMember).teamMemberId === "string")
      .map((m) => ({
        teamMemberId: m.teamMemberId,
        name: typeof m.name === "string" ? m.name : "",
        role: typeof m.role === "string" ? m.role : "",
        photoUrl: typeof m.photoUrl === "string" ? m.photoUrl : null,
      })),
  };
}

// ── Horarios recurrentes ────────────────────────────────────────────────────
export interface HorarioOption {
  id: string;
  /** Franja que ofrece el equipo, ej. "Martes 11:00". */
  label: string;
}
export interface HorarioSession {
  id: string;
  /** Tipo de sesión, ej. "Marketing Hub". */
  label: string;
  /** Franja asignada (HorarioOption.id) o null si aún sin asignar. */
  optionId: string | null;
}
export interface HorariosData {
  intro?: string;
  options: HorarioOption[];
  sessions: HorarioSession[];
}

export function normalizeHorarios(data: unknown): HorariosData {
  const d = (data ?? {}) as Partial<HorariosData>;
  const options = (Array.isArray(d.options) ? d.options : [])
    .filter((o): o is HorarioOption => !!o && typeof (o as HorarioOption).id === "string")
    .map((o) => ({ id: o.id, label: typeof o.label === "string" ? o.label : "" }));
  const optionIds = new Set(options.map((o) => o.id));
  const sessions = (Array.isArray(d.sessions) ? d.sessions : [])
    .filter((s): s is HorarioSession => !!s && typeof (s as HorarioSession).id === "string")
    .map((s) => ({
      id: s.id,
      label: typeof s.label === "string" ? s.label : "",
      // Si la franja asignada ya no existe (se borró), cae a null.
      optionId: typeof s.optionId === "string" && optionIds.has(s.optionId) ? s.optionId : null,
    }));
  return { intro: typeof d.intro === "string" ? d.intro : "", options, sessions };
}

// ── Canales de atención ─────────────────────────────────────────────────────
export interface CanalesData {
  horario: string;
  canales: string[];
  soporteEmail: string;
}

export function normalizeCanales(data: unknown): CanalesData {
  const d = (data ?? {}) as Partial<CanalesData>;
  return {
    horario: typeof d.horario === "string" ? d.horario : "",
    canales: Array.isArray(d.canales) ? d.canales.filter((c): c is string => typeof c === "string") : [],
    soporteEmail: typeof d.soporteEmail === "string" ? d.soporteEmail : "",
  };
}

// ── Prosa (objetivos/alcance/tu_rol/metricas_exito/proximos_pasos) ───────────
export interface ProseComparison {
  hoy: string[];
  conSistema: string[];
}
export interface ProseItem {
  title: string;
  detail?: string;
}
export interface ProseData {
  intro?: string;
  items: ProseItem[];
  /** Comparación "Hoy vs con el sistema" (opcional, en bienvenida/objetivos). */
  compara?: ProseComparison;
  /** Fallback: markdown legacy (bloque TEXT viejo) inyectado por el adaptador cuando
   *  no hay data tipada. El componente lo renderiza con <Prose> si no hay items. */
  __legacyMd?: string | null;
}

function normalizeComparison(c: unknown): ProseComparison | undefined {
  if (!c || typeof c !== "object") return undefined;
  const cc = c as Partial<ProseComparison>;
  const hoy = Array.isArray(cc.hoy) ? cc.hoy.filter((s): s is string => typeof s === "string") : [];
  const conSistema = Array.isArray(cc.conSistema) ? cc.conSistema.filter((s): s is string => typeof s === "string") : [];
  if (!hoy.length && !conSistema.length) return undefined;
  return { hoy, conSistema };
}

export function normalizeProse(data: unknown): ProseData {
  const d = (data ?? {}) as Partial<ProseData> & { __legacyMd?: string | null };
  const items = (Array.isArray(d.items) ? d.items : [])
    .filter((i): i is ProseItem => !!i && typeof (i as ProseItem).title === "string")
    .map((i) => ({ title: i.title, detail: typeof i.detail === "string" ? i.detail : undefined }));
  return {
    intro: typeof d.intro === "string" ? d.intro : "",
    items,
    compara: normalizeComparison(d.compara),
    __legacyMd: typeof d.__legacyMd === "string" ? d.__legacyMd : null,
  };
}

/** Una ProseData "está vacía" (para decidir el fallback a markdown legacy). */
export function proseIsEmpty(d: ProseData): boolean {
  return !d.items.length && !(d.intro ?? "").trim() && !d.compara;
}

// ── Hero (bienvenida) ─────────────────────────────────────────────────────────
/** Mismo shape que el hero del Business Case (`components/landing/types.ts`), para
 *  poder reusar sus primitivas (`hero-parts.tsx`). `eyebrow`, `brands` y
 *  `coverImageUrl` viven FUERA del schema del agente → los cura el CSE y sobreviven
 *  a las regeneraciones vía `preserveNonSchemaKeys`. */
export interface KickoffHeroData {
  eyebrow?: string;
  headline: string;
  subhead: string;
  tags: string[];
  brands?: string[];
  coverImageUrl?: string | null;
  /** LEGADO: los kickoffs tipados hasta hoy guardan la bajada en `intro`. */
  intro?: string;
  __legacyMd?: string | null;
}
export function normalizeHero(data: unknown): KickoffHeroData {
  const d = (data ?? {}) as Partial<KickoffHeroData> & { __legacyMd?: string | null };
  return {
    eyebrow: typeof d.eyebrow === "string" ? d.eyebrow : "",
    headline: typeof d.headline === "string" ? d.headline : "",
    // COMPATIBILIDAD: kickoffs ya generados traen `{intro}` → mapear a `subhead`
    // (el backfill lo migra en la DB; esto cubre la ventana hasta que corra).
    subhead:
      typeof d.subhead === "string" && d.subhead
        ? d.subhead
        : typeof d.intro === "string"
          ? d.intro
          : "",
    tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [],
    brands: Array.isArray(d.brands) ? d.brands.filter((b): b is string => typeof b === "string") : undefined,
    coverImageUrl: typeof d.coverImageUrl === "string" ? d.coverImageUrl : null,
    __legacyMd: typeof d.__legacyMd === "string" ? d.__legacyMd : null,
  };
}

// ── Comparativo "Hoy vs Con el sistema" (sección propia `hoy_vs_sistema`) ──────
export interface ComparaData {
  subhead?: string;
  hoy: string[];
  conSistema: string[];
}
export function normalizeCompara(data: unknown): ComparaData {
  const d = (data ?? {}) as Partial<ComparaData>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return { subhead: typeof d.subhead === "string" ? d.subhead : "", hoy: list(d.hoy), conSistema: list(d.conSistema) };
}

// ── Cierre / CTA (como el `cta` del Business Case) ──────────────────────────────
export interface CtaData {
  eyebrow?: string;
  headline?: string;
  subhead?: string;
  /** Texto del botón (vacío → sin botón). */
  buttonLabel?: string;
  /** Enlace del botón: URL http(s) o correo (se prefija mailto: si parece email). */
  buttonUrl?: string;
  /** `_self` = misma pestaña. Cualquier otro valor (o ausente) = pestaña nueva. */
  buttonTarget?: string;
  /** Marca SOLO-EDITOR: la sección `cierre` todavía no tiene CanvasSection (kickoff
   *  pre-backfill) → no hay dónde persistir. El componente la muestra en solo-lectura
   *  con un aviso (nunca en read/cliente: lo inyecta el workspace, no el snapshot). */
  __noSection?: boolean;
}
export function normalizeCta(data: unknown): CtaData {
  const d = (data ?? {}) as Partial<CtaData>;
  return {
    eyebrow: typeof d.eyebrow === "string" ? d.eyebrow : "",
    headline: typeof d.headline === "string" ? d.headline : "",
    subhead: typeof d.subhead === "string" ? d.subhead : "",
    buttonLabel: typeof d.buttonLabel === "string" ? d.buttonLabel : "",
    buttonUrl: typeof d.buttonUrl === "string" ? d.buttonUrl : "",
    buttonTarget: typeof d.buttonTarget === "string" ? d.buttonTarget : undefined,
    __noSection: d.__noSection === true ? true : undefined,
  };
}
/** Normaliza el href del botón: correo → mailto:, URL sin esquema → https://. */
export function ctaHref(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return `mailto:${u}`;
  return `https://${u}`;
}

/** Id corto para nuevas franjas/sesiones (solo cliente/editor). */
export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}
