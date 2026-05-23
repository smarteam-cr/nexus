"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  organizerEmail: string | null;
  firefliesUrl: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

interface Props {
  clientId: string;
  domain?: string;
  company?: string;
  /** "team" = auto-selecciona equipo Ventas; "name" = muestra filtro por nombre de sesión */
  filterMode?: "team" | "name";
  /** Tags que se activan automáticamente al montar (solo en modo "name") */
  defaultTags?: string[];
  /** Rol del equipo que se preselecciona automáticamente al cargar (ej: "Ventas") */
  preselectRole?: string;
}

// Tags sugeridos para filtro por nombre
const SUGGESTED_TAGS = [
  "Kick off", "Entrevista", "Focus group", "Seguimiento", "Demo", "Onboarding",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza un string para comparaciones: quita tildes y pasa a minúsculas */
function normalizeForCompare(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function initials(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function nameInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-brand-light", "bg-blue-400", "bg-green-400", "bg-purple-400",
  "bg-pink-400", "bg-cyan-400", "bg-yellow-400", "bg-red-400",
];
function avatarColor(str: string): string {
  let hash = 0;
  for (const c of str) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientSessionCards({
  clientId,
  domain,
  company,
  filterMode = "name",
  defaultTags,
  preselectRole,
}: Props) {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Emails del equipo seleccionados para filtrar
  const [selectedTeam, setSelectedTeam] = useState<Set<string>>(new Set());

  // Tags activos para filtro por nombre (modo "name") — inicializados con defaultTags
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set(defaultTags ?? []));
  const [tagInput, setTagInput] = useState("");

  // Participante individual (chips de Fireflies)
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Estados para sesiones nuevas en Fireflies ──────────────────────────────
  const [newSessions, setNewSessions] = useState<{ id: string; title: string; date: number; participants: string[] }[]>([]);
  const [checkingNew, setCheckingNew] = useState(false);
  const [syncingNew, setSyncingNew] = useState(false);
  const [newSessionsDismissed, setNewSessionsDismissed] = useState(false);

  // ── Cargar miembros del equipo ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d: { members?: TeamMember[] }) => {
        const members = d.members ?? [];
        setTeamMembers(members);
        // Pre-seleccionar miembros del rol indicado (ej: Ventas en Análisis inicial)
        if (preselectRole) {
          const roleEmails = members
            .filter((m) => m.role?.toLowerCase() === preselectRole.toLowerCase())
            .map((m) => normalizeForCompare(m.email));
          if (roleEmails.length > 0) setSelectedTeam(new Set(roleEmails));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, preselectRole]);

  // ── Cerrar dropdown al clickar fuera ──────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTeamDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Fetch sesiones ─────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (domain)  params.set("domain",  domain);
      if (company) params.set("company", company);

      const res = await fetch(`/api/clients/${clientId}/sessions?${params.toString()}`);
      if (!res.ok) throw new Error("api_error");

      const data = await res.json() as {
        sessions: Session[];
        participants: string[];
        error?: string;
      };

      if (data.error === "no_key") { setError("no_key"); return; }

      setAllSessions(data.sessions);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [clientId, domain, company]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Check sesiones nuevas en background (después de que carguen las principales) ──
  useEffect(() => {
    if (loading) return;
    setCheckingNew(true);
    fetch("/api/integrations/fireflies/check-new")
      .then((r) => r.json())
      .then((data: { newSessions?: { id: string; title: string; date: number; participants: string[] }[] }) => {
        if (data.newSessions && data.newSessions.length > 0) setNewSessions(data.newSessions);
      })
      .catch(() => {})
      .finally(() => setCheckingNew(false));
  }, [loading]);

  // ── Handler: agregar sesiones nuevas al cache DB y refrescar ──────────────
  async function handleAddNewSessions() {
    setSyncingNew(true);
    try {
      await fetch("/api/integrations/fireflies/sync-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: newSessions.map((s) => s.id) }),
      });
      setNewSessions([]);
      setNewSessionsDismissed(false);
      fetchSessions();
    } finally {
      setSyncingNew(false);
    }
  }

  // ── Filtrado en tres pasos ─────────────────────────────────────────────────

  // Paso 1: filtrar por equipo (normalizar diacríticos para comparar emails con/sin tildes)
  const teamFilteredSessions = selectedTeam.size > 0
    ? allSessions.filter((s) =>
        s.participants.some((p) => selectedTeam.has(normalizeForCompare(p)))
      )
    : allSessions;

  // Paso 2: filtrar por tags de nombre (solo en modo "name")
  // Si defaultTags fue provisto (incluso vacío), requerir al menos un tag activo
  const requiresTags = filterMode === "name" && defaultTags !== undefined;
  const tagFilteredSessions = (filterMode === "name" && activeTags.size > 0)
    ? teamFilteredSessions.filter((s) =>
        [...activeTags].some((tag) => s.title.toLowerCase().includes(tag.toLowerCase()))
      )
    : requiresTags && activeTags.size === 0
    ? []  // no mostrar nada hasta que el usuario seleccione al menos un tag
    : teamFilteredSessions;

  // Chips de participantes: de las sesiones ya filtradas por equipo + tags
  const chipParticipants = Array.from(
    new Set(tagFilteredSessions.flatMap((s) => s.participants))
  )
    .filter((email) => !selectedTeam.has(normalizeForCompare(email)))
    .sort();

  // Paso 3: filtrar por participante individual
  const visibleSessions = selectedParticipant
    ? tagFilteredSessions.filter((s) =>
        s.participants.some(
          (p) => p.toLowerCase() === selectedParticipant.toLowerCase()
        )
      )
    : tagFilteredSessions;

  // ── Toggles ────────────────────────────────────────────────────────────────
  function toggleTeamMember(email: string) {
    const e = normalizeForCompare(email);
    setSelectedTeam((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
    setSelectedParticipant(null);
  }

  function toggleParticipant(email: string) {
    setSelectedParticipant((prev) => (prev === email ? null : email));
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setSelectedParticipant(null);
  }

  function addCustomTag() {
    const t = tagInput.trim();
    if (!t) return;
    setActiveTags((prev) => new Set([...prev, t]));
    setTagInput("");
    setSelectedParticipant(null);
  }

  function clearAllFilters() {
    setSelectedTeam(new Set());
    setSelectedParticipant(null);
    setActiveTags(new Set());
  }

  // ── Agrupar miembros por equipo (role), Ventas primero ────────────────────
  const teamByRole = teamMembers.reduce((acc, m) => {
    const role = m.role ?? "Equipo";
    if (!acc[role]) acc[role] = [];
    acc[role].push(m);
    return acc;
  }, {} as Record<string, TeamMember[]>);

  const roles = Object.keys(teamByRole).sort((a, b) => {
    if (a === "Ventas") return -1;
    if (b === "Ventas") return 1;
    return a.localeCompare(b);
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error === "no_key") return null;
  if (loading && allSessions.length === 0) return <SessionsSkeleton />;

  const teamFilterActive = selectedTeam.size > 0;
  const anyNonTeamFilter = activeTags.size > 0 || !!selectedParticipant;

  // Tags personalizados (no están en los predefinidos)
  const customActiveTags = [...activeTags].filter((t) => !SUGGESTED_TAGS.includes(t));

  return (
    <div className="mb-5">
      {/* ── Header con conteo + dropdown de equipo ── */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-brand-light/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
            Sesiones
          </span>
          {visibleSessions.length > 0 && (
            <span className="text-2xs text-gray-700 ml-0.5">
              ({visibleSessions.length}{allSessions.length !== visibleSessions.length ? ` de ${allSessions.length}` : ""})
            </span>
          )}
          {loading && (
            <span className="text-2xs text-gray-600 ml-1 animate-pulse">actualizando…</span>
          )}
          {!loading && checkingNew && (
            <span className="text-2xs text-gray-700 ml-1 animate-pulse">verificando…</span>
          )}
        </div>

        {/* Dropdown de equipo */}
        {teamMembers.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setTeamDropdownOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                teamFilterActive
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-400"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Equipo
              {teamFilterActive && (
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {selectedTeam.size}
                </span>
              )}
              <svg className={`w-2.5 h-2.5 transition-transform ${teamDropdownOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {teamDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-60 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">Filtrar por equipo</p>
                  {teamFilterActive && filterMode !== "team" && (
                    <button
                      onClick={() => setSelectedTeam(new Set())}
                      className="text-2xs text-gray-400 hover:text-gray-600"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {roles.map((role) => (
                    <div key={role}>
                      {roles.length > 1 && (
                        <p className="px-3 pt-2 pb-0.5 text-2xs font-semibold text-gray-400 uppercase tracking-wider">
                          {role}
                        </p>
                      )}
                      {teamByRole[role].map((m) => {
                        const checked = selectedTeam.has(m.email.toLowerCase());
                        return (
                          <label
                            key={m.id}
                            className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTeamMember(m.email)}
                              className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
                            />
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${avatarColor(m.email)}`}>
                              {nameInitials(m.name)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{m.name}</p>
                              <p className="text-2xs text-gray-400 truncate">{m.email.split("@")[0]}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Banner de sesiones nuevas en Fireflies ── */}
      {!newSessionsDismissed && newSessions.length > 0 && (
        <div className="mb-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand/5 border border-brand/20 text-xs">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse flex-shrink-0" />
          <span className="flex-1 text-gray-300">
            {newSessions.length === 1
              ? `Nueva sesión en Fireflies: "${newSessions[0].title}"`
              : `${newSessions.length} sesiones nuevas en Fireflies`}
          </span>
          <button
            onClick={handleAddNewSessions}
            disabled={syncingNew}
            className="px-2.5 py-1 rounded-lg bg-brand text-white font-medium hover:bg-brand-light disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {syncingNew ? "Agregando…" : "Agregar"}
          </button>
          <button
            onClick={() => setNewSessionsDismissed(true)}
            className="text-gray-600 hover:text-gray-400 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Filtro por nombre de sesión (solo en modo "name") ── */}
      {filterMode === "name" && (
        <div className="mb-2.5 flex flex-wrap gap-1.5 items-center">
          {SUGGESTED_TAGS.map((tag) => {
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium transition-all ${
                  active
                    ? "bg-brand/10 border-brand/40 text-brand-light"
                    : "border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400"
                }`}
              >
                {tag}
                {active && <X className="w-2.5 h-2.5" />}
              </button>
            );
          })}

          {/* Tags personalizados activos */}
          {customActiveTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md border bg-brand/10 border-brand/40 text-brand-light text-xs font-medium"
            >
              {tag}
              <X className="w-2.5 h-2.5" />
            </button>
          ))}

          {/* Input para tag personalizado */}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCustomTag();
              }
            }}
            placeholder="+ filtrar por nombre…"
            className="text-xs text-gray-500 bg-transparent border-none outline-none placeholder-gray-700 min-w-[130px]"
          />
        </div>
      )}

      {/* ── Chips de participantes de Fireflies (filtro individual) ── */}
      {chipParticipants.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2.5 -mx-1 px-1 scrollbar-hide">
          {chipParticipants.map((email) => {
            const active = selectedParticipant === email;
            return (
              <button
                key={email}
                onClick={() => toggleParticipant(email)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                  active
                    ? "bg-brand border-brand text-white"
                    : "bg-white border-gray-200 text-gray-500 hover:border-brand/50 hover:text-brand-light"
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ${
                  active ? "bg-white/30" : avatarColor(email)
                }`}>
                  {initials(email)}
                </span>
                <span className="truncate max-w-[120px]">{email.split("@")[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && visibleSessions.length === 0 && (
        <div className="py-5 text-center">
          <p className="text-xs text-gray-500">
            {requiresTags && activeTags.size === 0
              ? "Selecciona o agrega etiquetas para buscar sesiones."
              : activeTags.size > 0
              ? "Sin sesiones que coincidan con las etiquetas."
              : teamFilterActive
              ? "Sin sesiones con los miembros del equipo seleccionados."
              : selectedParticipant
              ? `Sin sesiones para ${selectedParticipant.split("@")[0]}.`
              : "Sin sesiones grabadas aún."}
          </p>
          {anyNonTeamFilter && activeTags.size > 0 && (
            <button
              onClick={clearAllFilters}
              className="mt-1.5 text-xs text-brand-light hover:text-brand-light"
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      {/* ── Row de cards ── */}
      {visibleSessions.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {visibleSessions.map((session) => (
            <SessionCard key={session.id} session={session} selectedTeam={selectedTeam} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card individual ───────────────────────────────────────────────────────────

function SessionCard({ session, selectedTeam }: { session: Session; selectedTeam: Set<string> }) {
  const MAX_AVATARS = 3;
  const extra = session.participants.length - MAX_AVATARS;

  return (
    <a
      href={session.firefliesUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0 w-[160px] rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-brand/30 transition-all duration-150 overflow-hidden group"
    >
      {/* Thumbnail */}
      <div className="relative w-full h-[90px] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center shadow-sm group-hover:bg-white/90 transition-colors">
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <span className="absolute bottom-1.5 right-1.5 text-2xs font-medium bg-green-500/90 text-white px-1.5 py-0.5 rounded-md leading-none">
          {formatDuration(session.duration)}
        </span>
        <span className="absolute top-1.5 left-2 text-xs font-black text-gray-300/70 leading-none">ff</span>
        <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/5 transition-colors" />
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2 group-hover:text-brand transition-colors mb-1.5" title={session.title}>
          {session.title}
        </p>
        <p className="text-2xs text-gray-400 mb-2">{formatDate(session.date)}</p>

        {/* Avatares — resaltar miembros del equipo seleccionado */}
        <div className="flex items-center gap-0.5">
          {session.participants.slice(0, MAX_AVATARS).map((email) => {
            const isTeam = selectedTeam.size > 0 && selectedTeam.has(normalizeForCompare(email));
            return (
              <span
                key={email}
                title={email}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ring-1 ${
                  isTeam ? "ring-blue-400 ring-2" : "ring-white"
                } ${avatarColor(email)}`}
              >
                {initials(email)}
              </span>
            );
          })}
          {extra > 0 && (
            <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500 ring-1 ring-white">
              +{extra}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SessionsSkeleton() {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Skeleton className="w-16 h-2.5" />
      </div>
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-shrink-0 w-[160px] rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
            <Skeleton className="w-full h-[90px] rounded-none" delay={i * 60} />
            <div className="px-3 py-2.5 space-y-1.5">
              <Skeleton className="h-2.5 w-4/5" delay={i * 60} />
              <Skeleton className="h-2 w-1/2" delay={i * 60} />
              <div className="flex gap-0.5 mt-1">
                {[1, 2].map((j) => <Skeleton key={j} className="w-5 h-5" rounded="full" delay={i * 60} />)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
