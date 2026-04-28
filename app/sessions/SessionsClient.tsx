"use client";

import { useState, useMemo, useEffect, useRef } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SummarySection {
  title: string;
  content: string;
}

interface SessionSummary {
  keywords?: string[];
  overview?: string;
  action_items?: string[];
  sections?: SummarySection[]; // generado por AI; ausente en resúmenes de Fireflies/Gemini Notes
}

interface SessionTeamMember {
  name: string;
  email: string;
  role: string | null;
}

interface Session {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  source: string;
  hasTranscript: boolean;
  summary: SessionSummary | null;
  enrichedAt: string | null;
  clientId: string | null;
  manualClientId: string | null;
  teamMembers: SessionTeamMember[];
  teamRoles: string[];
}

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface Props {
  sessions: Session[];
  clients: Client[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatDuration(minutes: number) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function memberInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-300",
  "bg-purple-500/20 text-purple-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-brand/20 text-brand-light",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-amber-500/20 text-amber-300",
];

function avatarColor(email: string) {
  return AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length];
}

const ROLE_COLORS: Record<string, string> = {
  Sales:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
  CSE:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Development: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  PM:          "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RevOps:      "bg-brand/10 text-brand-light border-brand/20",
  Admin:       "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${color}`}>
      {role}
    </span>
  );
}

// ── Indicador de estado de transcript ────────────────────────────────────────

function TranscriptDot({ hasTranscript, hasSummary }: { hasTranscript: boolean; hasSummary: boolean }) {
  if (hasTranscript) {
    return <span title="Transcript disponible" className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />;
  }
  if (hasSummary) {
    return <span title="Solo resumen disponible" className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />;
  }
  return <span title="Sin contenido" className="w-1.5 h-1.5 rounded-full bg-gray-700 flex-shrink-0" />;
}

// ── Badge de fuente ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "google_meet") {
    return (
      <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.5 10.5v3l3.5 2v-7l-3.5 2zm-12 5h9v-7h-9v7zm1-6h7v5h-7v-5z"/>
        </svg>
        Meet
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
      Fireflies
    </span>
  );
}

// ── Selector de cliente ───────────────────────────────────────────────────────

function ClientSelector({
  sessionId,
  currentClientId,
  clients,
  onChanged,
}: {
  sessionId: string;
  currentClientId: string | null;
  clients: Client[];
  onChanged: (clientId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al click externo
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentClient = clients.find((c) => c.id === currentClientId);

  async function assign(clientId: string | null) {
    setSaving(true);
    setOpen(false);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualClientId: clientId }),
      });
      onChanged(clientId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50"
      >
        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="truncate max-w-[120px]">
          {saving ? "Guardando…" : currentClient ? currentClient.name : "Sin cliente"}
        </span>
        <svg className="w-2.5 h-2.5 flex-shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            <button
              onClick={() => assign(null)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                !currentClientId ? "text-white bg-gray-800" : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              Sin cliente
            </button>
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => assign(c.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  c.id === currentClientId ? "text-white bg-gray-800" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="block truncate">{c.name}</span>
                {c.company && <span className="block text-gray-600 truncate">{c.company}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Parser de transcript ──────────────────────────────────────────────────────

interface TranscriptBlock {
  speaker: string | null;
  timestamp: string | null;
  text: string;
}

const SPEAKER_PALETTE = [
  { avatar: "bg-blue-500/20 text-blue-300",     border: "border-l-blue-500",    nameColor: "text-blue-300" },
  { avatar: "bg-violet-500/20 text-violet-300", border: "border-l-violet-500",  nameColor: "text-violet-300" },
  { avatar: "bg-emerald-500/20 text-emerald-300", border: "border-l-emerald-500", nameColor: "text-emerald-300" },
  { avatar: "bg-amber-500/20 text-amber-300",   border: "border-l-amber-500",   nameColor: "text-amber-300" },
  { avatar: "bg-rose-500/20 text-rose-300",     border: "border-l-rose-500",    nameColor: "text-rose-300" },
  { avatar: "bg-cyan-500/20 text-cyan-300",     border: "border-l-cyan-500",    nameColor: "text-cyan-300" },
  { avatar: "bg-orange-500/20 text-orange-300", border: "border-l-orange-500",  nameColor: "text-orange-300" },
  { avatar: "bg-pink-500/20 text-pink-300",     border: "border-l-pink-500",    nameColor: "text-pink-300" },
];

const KEYWORD_COLORS = [
  "bg-blue-500/10 text-blue-400 border-blue-500/25",
  "bg-purple-500/10 text-purple-400 border-purple-500/25",
  "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "bg-rose-500/10 text-rose-400 border-rose-500/25",
  "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
  "bg-orange-500/10 text-orange-400 border-orange-500/25",
];

// Caracteres especiales que usa Google Gemini Notes como marcadores/bullets
const GEMINI_BOX_RE = /[□☐■▪▸►•◦‣⁃✓✗→\u25A1\u2610\u25AA\u25AB]+/g;

function stripBox(s: string): string {
  return s.replace(GEMINI_BOX_RE, "").trim();
}

/**
 * Parser principal de transcripts.
 *
 * Soporta dos formatos de Google Gemini Notes:
 *   A) HH:MM:SS □Speaker Name: texto  (formato timestamp-prefijado)
 *   B) Speaker Name: texto             (formato inline sin timestamp)
 */
function parseTranscript(raw: string): TranscriptBlock[] {
  if (!raw.trim()) return [];

  // Normalizar saltos de línea
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ── FORMATO A: entradas con timestamp HH:MM:SS □Speaker: texto ───────────
  // Buscamos cuántos timestamps HH:MM:SS hay en el texto
  const TS_RE = /\d{1,2}:\d{2}:\d{2}/g;
  const tsMatches = [...text.matchAll(TS_RE)];

  if (tsMatches.length >= 2) {
    // Dividir el texto en segmentos, cada uno comenzando con un timestamp
    const segments = text.split(/(?=\d{1,2}:\d{2}:\d{2})/);
    const blocks: TranscriptBlock[] = [];

    for (const seg of segments) {
      const m = seg.match(/^(\d{1,2}:\d{2}:\d{2})\s*([\s\S]*)/);
      if (!m) continue;
      const timestamp = m[1];
      // Limpiar caracteres box y extraer "Speaker: texto"
      const rest = stripBox(m[2]).trim();
      if (!rest) continue;

      const speakerMatch = rest.match(/^([A-ZÁÉÍÓÚÜÑa-záéíóúüñ][^:\n]{0,60}):\s*([\s\S]+)/);
      if (speakerMatch) {
        blocks.push({
          speaker: speakerMatch[1].trim(),
          timestamp,
          text: speakerMatch[2].replace(/\n+/g, " ").trim(),
        });
      } else if (rest.length > 5) {
        blocks.push({ speaker: null, timestamp, text: rest.replace(/\n+/g, " ").trim() });
      }
    }

    if (blocks.length >= 2) return blocks;
  }

  // ── FORMATO B: línea a línea ──────────────────────────────────────────────
  const lines = text.split("\n");
  const blocks: TranscriptBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw_line = lines[i];
    const line = stripBox(raw_line).trim();
    if (!line) { i++; continue; }

    // "Speaker Name: texto..." inline
    const inlineMatch = line.match(/^([A-ZÁÉÍÓÚÜÑa-záéíóúüñ][^:\n]{1,60}):\s+(.{5,})/);
    if (inlineMatch) {
      blocks.push({ speaker: inlineMatch[1].trim(), timestamp: null, text: inlineMatch[2].trim() });
      i++;
      continue;
    }

    // Línea corta sola (speaker) seguida de texto
    const nextLine = stripBox(lines[i + 1] ?? "").trim();
    const isTimestamp = /^\d{1,2}:\d{2}/.test(nextLine);
    const couldBeSpeaker =
      line.length >= 3 && line.length <= 55 && !/[.,:?!]$/.test(line) &&
      (isTimestamp || (nextLine.length > 0 && nextLine.length > line.length * 0.5));

    if (couldBeSpeaker && nextLine.length > 0) {
      const speaker = line;
      i++;
      let timestamp: string | null = null;
      if (isTimestamp) { timestamp = nextLine; i++; }
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        textLines.push(stripBox(lines[i]).trim());
        i++;
      }
      if (textLines.length > 0) {
        blocks.push({ speaker, timestamp, text: textLines.join(" ") });
      }
      continue;
    }

    // Párrafo sin speaker
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      textLines.push(stripBox(lines[i]).trim());
      i++;
    }
    if (textLines.join("").length > 0) {
      blocks.push({ speaker: null, timestamp: null, text: textLines.join(" ") });
    }
  }

  return blocks;
}

// ── Parser de Gemini Notes ────────────────────────────────────────────────────
// Formato: "[metadata]Resumen [SEP][overview][SEP][SEP][titulo][SEP][contenido]... Detalles [SEP][detalles]"
// El carácter separador varía (□, ☐, u otros) — lo descubrimos dinámicamente.

function stripTimestamps(s: string): string {
  return s.replace(/\s*\(\d{1,2}:\d{2}:\d{2}\)/g, "").replace(/\s{2,}/g, " ").trim();
}

// Escapa un carácter para usarlo dentro de una clase de caracteres en regex
function escapeForCharClass(c: string): string {
  return c.replace(/[\]\\^-]/g, "\\$&");
}

interface GeminiSection {
  title: string | null;
  content: string;
  isActionSection?: boolean; // true cuando el título es "próximos pasos" o similar
}

interface GeminiParsed {
  sections: GeminiSection[];
  actionItems: string[]; // extraídos de la sección "pasos siguientes recomendados"
  details: string[];
}

// Regex para identificar secciones de próximos pasos en Gemini Notes
const GEMINI_ACTION_RE = /pasos\s+siguientes|próximos\s+pasos|next\s+steps|acciones\s+(a\s+seguir|recomendadas?)/i;

function parseGeminiNotes(raw: string): GeminiParsed {
  const EMPTY: GeminiParsed = { sections: [], actionItems: [], details: [] };

  // 1. Localizar la palabra "Resumen" — siempre presente en Gemini Notes
  const resumenIdx = raw.indexOf("Resumen");
  if (resumenIdx < 0) return EMPTY;

  // 2. El carácter inmediatamente después de "Resumen " es el separador real del doc.
  //    Saltamos espacios/saltos de línea entre "Resumen" y el separador.
  let sepIdx = resumenIdx + "Resumen".length;
  while (sepIdx < raw.length && (raw[sepIdx] === " " || raw[sepIdx] === "\n" || raw[sepIdx] === "\r")) {
    sepIdx++;
  }
  if (sepIdx >= raw.length) return EMPTY;

  const SEP = raw[sepIdx]; // carácter separador real de este documento

  // 3. Si el SEP no es un carácter especial no-texto (letra o dígito), caemos
  //    en modo párrafo: dividir por doble salto de línea a partir de "Resumen".
  const isSepSpecial = /[^\w\sáéíóúüñÁÉÍÓÚÜÑ.,;:!?'"()\-]/.test(SEP);
  if (!isSepSpecial) {
    const contentText = raw.slice(resumenIdx + "Resumen".length).trim();
    const paragraphs = contentText.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 20);
    return {
      sections: paragraphs.map((p) => ({ title: null, content: stripTimestamps(p) })),
      actionItems: [],
      details: [],
    };
  }

  // Construir regex que matchea uno o más de ese carácter
  const SEP_RE = new RegExp("[" + escapeForCharClass(SEP) + "]+");

  // 4. Tomar el texto desde el separador (inclusive) — descarta el metadata anterior
  const text = raw.slice(sepIdx);

  // 5. Dividir en chunks
  const rawChunks = text.split(SEP_RE).map((c) => c.trim()).filter(Boolean);

  // 6. Procesar chunks
  const sections: GeminiSection[] = [];
  const actionItems: string[] = [];
  const details: string[] = [];
  let inDetails = false;
  let inActionItems = false;

  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];
    const next  = rawChunks[i + 1];

    // Etiquetas de sección conocidas — cambiar modo
    if (/^Detalles$/i.test(chunk))               { inDetails = true; inActionItems = false; continue; }
    if (/^(Resumen|Notas|Gemini)$/i.test(chunk)) { inActionItems = false; continue; }

    // ── Modo "Detalles" ───────────────────────────────────────────────────────
    if (inDetails) {
      const subParas = chunk
        .split(/\(\d{1,2}:\d{2}:\d{2}\)\.\s+/)
        .map(stripTimestamps)
        .filter((s) => s.length > 15);
      details.push(...(subParas.length ? subParas : [stripTimestamps(chunk)].filter((s) => s.length > 15)));
      continue;
    }

    // ── Modo "Action items" ───────────────────────────────────────────────────
    // Iniciado cuando se detectó la etiqueta "Pasos siguientes recomendados"
    if (inActionItems) {
      const cleaned = stripTimestamps(chunk);
      if (cleaned.length > 5) actionItems.push(cleaned);
      continue;
    }

    // ── Detección de sección de próximos pasos ────────────────────────────────
    // Si el chunk es la etiqueta de "pasos siguientes", activar modo action items.
    // Puede aparecer como chunk solo ("Pasos siguientes recomendados") O como
    // primera línea de un chunk con newline ("Pasos siguientes\nGracy cc confirmará…")
    const isActionLabel = GEMINI_ACTION_RE.test(chunk);
    if (isActionLabel) {
      inActionItems = true;
      // Verificar si el contenido de los pasos está en el mismo chunk (tras un newline)
      const nlIdx = chunk.indexOf("\n");
      if (nlIdx > 0) {
        const rest = chunk.slice(nlIdx + 1).trim();
        if (rest.length > 10) actionItems.push(stripTimestamps(rest));
      }
      // Si el siguiente chunk no es una etiqueta, lo agregaremos en la próxima iteración
      continue;
    }

    // ── Heurística para secciones normales ────────────────────────────────────

    // CASO A: El chunk contiene un salto de línea — la primera línea es el título
    //         y el resto el contenido (formato "Título\nContenido del tema…").
    const nlIdx = chunk.indexOf("\n");
    if (nlIdx > 0 && nlIdx < 80) {
      const firstLine = chunk.slice(0, nlIdx).trim();
      const rest      = chunk.slice(nlIdx + 1).trim();
      if (
        firstLine.length > 0 &&
        rest.length > firstLine.length &&
        !/[.!?]$/.test(firstLine) &&
        !/^(Detalles|Resumen|Notas)$/i.test(firstLine)
      ) {
        sections.push({ title: firstLine, content: stripTimestamps(rest) });
        continue;
      }
    }

    // CASO B: Chunk corto sin puntuación final, seguido de chunk más largo
    //         (y el siguiente no es una etiqueta de sección).
    const isTitle =
      chunk.length < 80 &&
      !/[.!?]$/.test(chunk) &&
      !!next &&
      next.length > chunk.length &&
      !/^(Detalles|Resumen|Notas)$/i.test(next) &&
      !GEMINI_ACTION_RE.test(next);

    if (isTitle && next) {
      sections.push({ title: chunk, content: stripTimestamps(next) });
      i++; // consumir el siguiente como contenido
      continue;
    }

    // CASO C: Chunk de contenido sin título identificable.
    const cleaned = stripTimestamps(chunk);
    if (cleaned.length > 10) sections.push({ title: null, content: cleaned });
  }

  return { sections, actionItems, details };
}

// ── Componentes de renderizado ────────────────────────────────────────────────

// Títulos de sección que corresponden a "próximos pasos" y ya se muestran
// en la sección de action_items — evitar que aparezcan duplicados dentro del overview.
const ACTION_SECTION_RE = /próximos\s+pasos|next\s+steps|pasos\s+siguientes|acciones|action\s+items|tareas\s+pendientes|to[\s-]do/i;

// AI summary (sections[] generadas por Claude)
function AISummaryOverview({ overview, sections }: { overview?: string; sections?: SummarySection[] }) {
  // Filtrar secciones cuyo título sea equivalente a "próximos pasos" para evitar
  // duplicación con el bloque de action_items que se muestra debajo del overview.
  const contentSections = sections?.filter((s) => !ACTION_SECTION_RE.test(s.title));

  return (
    <div className="space-y-5">
      {overview && (
        <p className="text-sm text-gray-300 leading-relaxed">{overview}</p>
      )}
      {contentSections && contentSections.length > 0 && (
        <div className="space-y-5 pt-1">
          {contentSections.map((s, i) => (
            <div key={i} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold text-brand-light uppercase tracking-widest">
                {s.title}
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Gemini Notes overview — secciones + action items + detalles parseados
function GeminiNotesOverview({ text }: { text: string }) {
  const { sections, actionItems, details } = useMemo(() => parseGeminiNotes(text), [text]);

  return (
    <div className="space-y-6">
      {/* Secciones temáticas del resumen */}
      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className={s.title ? "space-y-1.5" : ""}>
              {s.title && (
                <h3 className="text-[11px] font-semibold text-brand-light uppercase tracking-widest">
                  {s.title}
                </h3>
              )}
              {s.content && (
                <p className="text-sm text-gray-300 leading-relaxed">{s.content}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Próximos pasos extraídos de Gemini Notes */}
      {actionItems.length > 0 && (
        <div className="pt-1 border-t border-gray-800/40">
          <SectionLabel icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }>Próximos pasos</SectionLabel>
          <ul className="list-disc list-outside pl-4 space-y-1.5 marker:text-gray-500">
            {actionItems.map((item, i) => (
              <li key={i} className="text-sm text-gray-300 leading-relaxed pl-1">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detalles con timestamps */}
      {details.length > 0 && (
        <div className="pt-1 border-t border-gray-800/50">
          <SectionLabel icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
            </svg>
          }>Detalles</SectionLabel>
          <div className="space-y-3">
            {details.map((para, i) => (
              <div key={i} className="pl-3 border-l-2 border-gray-800">
                <p className="text-sm text-gray-300 leading-relaxed">{para}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Selector automático según origen del resumen
function FormattedOverview({ summary }: { summary: SessionSummary }) {
  const hasAISections = (summary.sections?.length ?? 0) > 0;
  // Detectar Gemini Notes: texto crudo largo (> 400 chars) que contiene la cabecera "Resumen"
  // típica del tab de notas de Google Meet.  Los resúmenes generados por IA siempre tienen
  // sections[] (hasAISections = true) así que entran por la rama anterior.
  const isGeminiNotes =
    !hasAISections &&
    !!summary.overview &&
    summary.overview.length > 400 &&
    summary.overview.includes("Resumen");
  const hasGeminiBox = isGeminiNotes;

  if (hasAISections) {
    return <AISummaryOverview overview={summary.overview} sections={summary.sections} />;
  }
  if (hasGeminiBox && summary.overview) {
    return <GeminiNotesOverview text={summary.overview} />;
  }
  // Texto plano (Fireflies u otros): párrafos separados por salto de línea
  return (
    <div className="space-y-3">
      {(summary.overview ?? "")
        .split(/\n\n+/)
        .filter(Boolean)
        .map((para, i) => (
          <p key={i} className="text-sm text-gray-300 leading-relaxed">{para.trim()}</p>
        ))}
    </div>
  );
}

function FormattedTranscript({ text }: { text: string }) {
  const blocks = useMemo(() => parseTranscript(text), [text]);

  // Asignar índice de paleta por speaker (orden de primera aparición)
  const speakerIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const b of blocks) {
      if (b.speaker && !map.has(b.speaker)) {
        map.set(b.speaker, idx % SPEAKER_PALETTE.length);
        idx++;
      }
    }
    return map;
  }, [blocks]);

  // Agrupar bloques consecutivos del mismo speaker
  const grouped = useMemo(() => {
    const result: Array<{ speaker: string | null; timestamp: string | null; texts: string[] }> = [];
    for (const b of blocks) {
      const last = result[result.length - 1];
      if (last && last.speaker === b.speaker) {
        last.texts.push(b.text);
      } else {
        result.push({ speaker: b.speaker, timestamp: b.timestamp, texts: [b.text] });
      }
    }
    return result;
  }, [blocks]);

  const uniqueSpeakers = [...speakerIndexMap.keys()];
  const hasSpeakers = uniqueSpeakers.length > 0;

  if (!hasSpeakers) {
    return (
      <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
        {text.split(/\n\n+/).filter(Boolean).map((para, i) => (
          <p key={i}>{para.trim()}</p>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Leyenda de speakers */}
      <div className="flex flex-wrap gap-3 mb-6 pb-5 border-b border-gray-800/60">
        {uniqueSpeakers.map((sp) => {
          const palette = SPEAKER_PALETTE[speakerIndexMap.get(sp)!];
          return (
            <div key={sp} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${palette.avatar}`}>
                {memberInitials(sp)}
              </div>
              <span className={`text-xs font-medium ${palette.nameColor}`}>{sp}</span>
            </div>
          );
        })}
      </div>

      {/* Bloques de transcript */}
      <div className="space-y-0">
        {grouped.map((block, i) => {
          const palette = block.speaker ? SPEAKER_PALETTE[speakerIndexMap.get(block.speaker) ?? 0] : null;
          return (
            <div
              key={i}
              className={`flex gap-3 py-4 ${i > 0 ? "border-t border-gray-800/30" : ""}`}
            >
              {block.speaker && palette ? (
                <>
                  {/* Avatar */}
                  <div className="flex-shrink-0 pt-0.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${palette.avatar}`}>
                      {memberInitials(block.speaker)}
                    </div>
                  </div>
                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className={`text-xs font-semibold ${palette.nameColor}`}>{block.speaker}</span>
                      {block.timestamp && (
                        <span className="text-[10px] text-gray-600 tabular-nums">{block.timestamp}</span>
                      )}
                    </div>
                    <div className={`pl-3 border-l-2 ${palette.border} space-y-1.5`}>
                      {block.texts.map((t, ti) => (
                        <p key={ti} className="text-sm text-gray-300 leading-relaxed">{t}</p>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Sin speaker detectado */
                <div className="flex-1 min-w-0 pl-11">
                  {block.texts.map((t, ti) => (
                    <p key={ti} className="text-sm text-gray-500 leading-relaxed italic">{t}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detalle de sesión ─────────────────────────────────────────────────────────

function SessionDetail({
  session,
  clients,
  onClose,
  onClientChanged,
}: {
  session: Session;
  clients: Client[];
  onClose: () => void;
  onClientChanged: (sessionId: string, clientId: string | null) => void;
}) {
  const [tab, setTab] = useState<"resumen" | "transcript">("resumen");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [reEnriching, setReEnriching] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [liveSummary, setLiveSummary] = useState<SessionSummary | null>(session.summary);

  // Resetear estado al cambiar de sesión
  useEffect(() => {
    setLiveSummary(session.summary);
  }, [session.id, session.summary]);

  // Cargar transcript lazy. Si no hay summary, auto-generar con IA al recibirlo.
  useEffect(() => {
    let cancelled = false;
    setTranscript(null);
    setTranscriptLoading(true);
    setTab("resumen");

    fetch(`/api/sessions/${session.id}`)
      .then((r) => r.json())
      .then(async (data: { transcript?: string | null }) => {
        if (cancelled) return;
        const tx = data.transcript ?? null;
        setTranscript(tx);
        setTranscriptLoading(false);

        // Auto-generar resumen si hay transcript pero no hay summary
        if (tx && !liveSummary) {
          setGeneratingSummary(true);
          try {
            const res = await fetch(`/api/sessions/${session.id}/summarize`, { method: "POST" });
            const result = await res.json() as { summary?: SessionSummary | null };
            if (!cancelled && result.summary) setLiveSummary(result.summary);
          } catch {
            // Silencioso — el usuario puede reintentar con el botón
          } finally {
            if (!cancelled) setGeneratingSummary(false);
          }
        }
      })
      .catch(() => { if (!cancelled) setTranscriptLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function handleReEnrich() {
    setReEnriching(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/enrich`, { method: "POST" });
      const data = await res.json() as { transcript?: string | null; summary?: SessionSummary | null };
      setTranscript(data.transcript ?? null);
      if (data.summary) setLiveSummary(data.summary);
    } finally {
      setReEnriching(false);
    }
  }

  async function handleGenerateSummary() {
    if (!transcript) return;
    setGeneratingSummary(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/summarize`, { method: "POST" });
      const data = await res.json() as { summary?: SessionSummary | null };
      if (data.summary) {
        setLiveSummary(data.summary);
        setTab("resumen");
      }
    } finally {
      setGeneratingSummary(false);
    }
  }

  const teamEmails = new Set(session.teamMembers.map((m) => m.email.toLowerCase()));
  const externalParticipants = session.participants.filter((p) => !teamEmails.has(p.toLowerCase()));
  const hasSummary = !!(liveSummary?.overview || liveSummary?.keywords?.length || liveSummary?.action_items?.length);

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-800">
        {/* Fila superior: controles */}
        <div className="flex items-center gap-3 px-5 pt-3.5 pb-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cerrar
          </button>
          <div className="w-px h-4 bg-gray-800" />
          <p className="text-sm font-medium text-white truncate flex-1">{session.title}</p>
          <ClientSelector
            sessionId={session.id}
            currentClientId={session.clientId}
            clients={clients}
            onChanged={(clientId) => onClientChanged(session.id, clientId)}
          />
          <SourceBadge source={session.source} />
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 px-5 pb-2 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDate(session.date)}
          </span>
          {session.duration > 0 && (
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(session.duration)}
            </span>
          )}
          {session.teamMembers.length > 0 && (
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {session.teamMembers.map((m) => m.name.split(" ")[0]).join(", ")}
            </span>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex px-5 gap-0">
          <TabButton active={tab === "resumen"} onClick={() => setTab("resumen")} disabled={!hasSummary && !generatingSummary}>
            <span className="flex items-center gap-1.5">
              Resumen
              {generatingSummary && (
                <span className="w-3 h-3 border border-brand/50 border-t-transparent rounded-full animate-spin" />
              )}
            </span>
          </TabButton>
          <TabButton active={tab === "transcript"} onClick={() => setTab("transcript")}>
            <span className="flex items-center gap-1.5">
              Transcript
              {transcriptLoading && (
                <span className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
              )}
            </span>
          </TabButton>
        </div>
      </div>

      {/* ── Contenido ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Pestaña: Resumen ─────────────────────────────────────────────── */}
        {tab === "resumen" && (
          <div className="px-7 py-6 space-y-7 max-w-3xl">

            {/* Skeleton mientras genera el resumen con IA */}
            {generatingSummary && !hasSummary && (
              <div className="space-y-6 pt-2">
                <div className="space-y-2">
                  <div className="h-2.5 w-16 rounded-full bg-gray-800 animate-pulse" />
                  <div className="h-3.5 rounded-full bg-gray-800/80 animate-pulse" style={{ width: "92%" }} />
                  <div className="h-3.5 rounded-full bg-gray-800/80 animate-pulse" style={{ width: "78%" }} />
                  <div className="h-3.5 rounded-full bg-gray-800/60 animate-pulse" style={{ width: "85%" }} />
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-24 rounded-full bg-gray-800 animate-pulse" />
                  <div className="h-3.5 rounded-full bg-gray-800/80 animate-pulse" style={{ width: "88%" }} />
                  <div className="h-3.5 rounded-full bg-gray-800/60 animate-pulse" style={{ width: "70%" }} />
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-20 rounded-full bg-gray-800 animate-pulse" />
                  <div className="h-3.5 rounded-full bg-gray-800/80 animate-pulse" style={{ width: "95%" }} />
                  <div className="h-3.5 rounded-full bg-gray-800/60 animate-pulse" style={{ width: "60%" }} />
                </div>
                <p className="text-[11px] text-gray-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 border border-gray-700 border-t-brand/50 rounded-full animate-spin inline-block" />
                  Generando resumen con IA…
                </p>
              </div>
            )}

            {/* Participantes: equipo + externos en una sola fila visual */}
            {(session.teamMembers.length > 0 || externalParticipants.length > 0) && (
              <section>
                <SectionLabel icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }>Participantes</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {session.teamMembers.map((m) => (
                    <div key={m.email} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${avatarColor(m.email)}`}>
                        {memberInitials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white leading-none">{m.name}</p>
                        {m.role && <p className="text-[10px] text-gray-500 mt-0.5">{m.role}</p>}
                      </div>
                    </div>
                  ))}
                  {externalParticipants.map((p) => (
                    <div key={p} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-gray-900/50 border border-dashed border-gray-800 hover:border-gray-700 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <p className="text-xs text-gray-500 leading-none max-w-[160px] truncate">{p}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Overview */}
            {liveSummary?.overview ? (
              <section>
                <SectionLabel icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }>Resumen de la reunión</SectionLabel>
                <FormattedOverview summary={liveSummary!} />
              </section>
            ) : !hasSummary ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Sin resumen disponible para esta sesión.</p>
                  {transcript && (
                    <button
                      onClick={handleGenerateSummary}
                      disabled={generatingSummary}
                      className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand-light text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {generatingSummary ? (
                        <>
                          <span className="w-3 h-3 border border-brand-light border-t-transparent rounded-full animate-spin" />
                          Generando con IA…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Generar resumen con IA
                        </>
                      )}
                    </button>
                  )}
                  {!transcript && !transcriptLoading && (
                    <p className="text-xs text-gray-700">Primero obtené el transcript desde la pestaña Transcript.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Action items */}
            {liveSummary?.action_items && liveSummary.action_items.length > 0 && (
              <section>
                <SectionLabel icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }>Próximos pasos</SectionLabel>
                <ul className="list-disc list-outside pl-4 space-y-1.5 marker:text-gray-500">
                  {liveSummary!.action_items!.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300 leading-relaxed pl-1">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Keywords */}
            {liveSummary?.keywords && liveSummary.keywords.length > 0 && (
              <section>
                <SectionLabel icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                }>Temas clave</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {liveSummary!.keywords!.map((kw, i) => (
                    <span
                      key={kw}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium ${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}`}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── Pestaña: Transcript ──────────────────────────────────────────── */}
        {tab === "transcript" && (
          <div className="px-7 py-6 max-w-3xl">

            {/* Acción re-enriquecer */}
            <div className="flex items-center justify-end mb-5">
              <button
                onClick={handleReEnrich}
                disabled={reEnriching || transcriptLoading}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 disabled:opacity-40 transition-colors"
              >
                <svg className={`w-3.5 h-3.5 ${reEnriching ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {reEnriching ? "Obteniendo…" : "Re-enriquecer"}
              </button>
            </div>

            {transcriptLoading ? (
              <div className="space-y-3">
                {[90, 75, 85, 60, 80, 70, 88].map((w, i) => (
                  <div key={i} className="h-3.5 rounded-full bg-gray-800 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : transcript ? (
              <FormattedTranscript text={transcript} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-gray-600">Sin transcript disponible.</p>
                <p className="text-xs text-gray-700 mt-1">
                  Usá &quot;Re-enriquecer&quot; para intentar obtenerlo desde Google Drive.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────

function TabButton({ active, onClick, disabled = false, children }: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors disabled:opacity-40 disabled:cursor-default ${
        active
          ? "border-brand text-white"
          : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && <span className="text-gray-500">{icon}</span>}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
        {children}
      </p>
    </div>
  );
}

// ── Item compacto de sesión en sidebar ───────────────────────────────────────

function SidebarSessionItem({ session, isActive, onClick }: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
        isActive
          ? "bg-gray-800 border-gray-700"
          : "border-transparent hover:bg-gray-900/60 hover:border-gray-800"
      }`}
    >
      <p className="text-sm font-medium text-white line-clamp-2 leading-snug mb-1.5">
        {session.title}
      </p>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>{formatDate(session.date)}</span>
        {session.duration > 0 && (
          <>
            <span className="text-gray-700">·</span>
            <span>{formatDuration(session.duration)}</span>
          </>
        )}
      </div>
      {session.teamRoles.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {session.teamRoles.slice(0, 3).map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
      )}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const ORPHAN_ID = "__orphan__";

export default function SessionsClient({ sessions: initialSessions, clients }: Props) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  // null = mostrando lista de clientes; string = cliente seleccionado
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const countByClient = useMemo(() => {
    const map: Record<string, number> = { [ORPHAN_ID]: 0 };
    for (const s of sessions) {
      if (s.clientId) map[s.clientId] = (map[s.clientId] ?? 0) + 1;
      else map[ORPHAN_ID]++;
    }
    return map;
  }, [sessions]);

  const sidebarSessions = useMemo(() => {
    if (selectedClientId === null) return [];
    if (selectedClientId === ORPHAN_ID) return sessions.filter((s) => !s.clientId);
    return sessions.filter((s) => s.clientId === selectedClientId);
  }, [sessions, selectedClientId]);

  const selectedClient = selectedClientId && selectedClientId !== ORPHAN_ID
    ? clients.find((c) => c.id === selectedClientId) ?? null
    : null;

  function handleClientClick(id: string) {
    setSelectedClientId(id);
    setSelectedSession(null);
  }

  function handleBack() {
    setSelectedClientId(null);
    setSelectedSession(null);
  }

  function handleClientChanged(sessionId: string, clientId: string | null) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, clientId, manualClientId: clientId } : s
      )
    );
    setSelectedSession((prev) =>
      prev?.id === sessionId ? { ...prev, clientId, manualClientId: clientId } : prev
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">

        {selectedClientId === null ? (
          /* ── Vista: lista de clientes ───────────────────────────────────── */
          <div className="flex flex-col flex-1 overflow-y-auto py-3">
            <p className="px-4 pb-2 text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Clientes
            </p>

            {clients.map((c) => {
              const count = countByClient[c.id] ?? 0;
              if (count === 0) return null;
              return (
                <ClientListItem
                  key={c.id}
                  label={c.name}
                  sublabel={c.company ?? undefined}
                  count={count}
                  onClick={() => handleClientClick(c.id)}
                />
              );
            })}

            {(countByClient[ORPHAN_ID] ?? 0) > 0 && (
              <>
                <div className="mx-4 my-2 border-t border-gray-800/60" />
                <ClientListItem
                  label="Sin cliente"
                  count={countByClient[ORPHAN_ID] ?? 0}
                  onClick={() => handleClientClick(ORPHAN_ID)}
                  muted
                />
              </>
            )}
          </div>
        ) : (
          /* ── Vista: sesiones del cliente ────────────────────────────────── */
          <>
            {/* Header con back + nombre del cliente */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-800">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Clientes
              </button>
              <p className="text-sm font-semibold text-white truncate">
                {selectedClient?.name ?? "Sin cliente"}
              </p>
              <p className="text-xs text-gray-600">
                {sidebarSessions.length} sesión{sidebarSessions.length !== 1 ? "es" : ""}
              </p>
            </div>

            {/* Lista de sesiones */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sidebarSessions.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-8">No hay sesiones</p>
              ) : (
                sidebarSessions.map((s) => (
                  <SidebarSessionItem
                    key={s.id}
                    session={s}
                    isActive={selectedSession?.id === s.id}
                    onClick={() => setSelectedSession(s)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Área principal ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            clients={clients}
            onClose={() => setSelectedSession(null)}
            onClientChanged={handleClientChanged}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {selectedClientId === null
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                }
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              {selectedClientId === null
                ? "Seleccioná un cliente para ver sus sesiones"
                : "Seleccioná una sesión para ver el transcript"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item de cliente en sidebar ────────────────────────────────────────────────

function ClientListItem({ label, sublabel, count, onClick, muted = false }: {
  label: string;
  sublabel?: string;
  count: number;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors rounded-lg mx-1 group ${
        muted
          ? "text-gray-600 hover:text-gray-400 hover:bg-gray-900"
          : "text-gray-300 hover:text-white hover:bg-gray-900"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm truncate">{label}</p>
        {sublabel && <p className="text-xs text-gray-600 truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-gray-700 group-hover:text-gray-500 transition-colors">{count}</span>
        <svg className="w-3 h-3 text-gray-700 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
