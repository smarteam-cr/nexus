/**
 * scripts/probar-api-de-meet.ts — U2, la prueba de un día de la API de Meet (2026-10-25). SOLO LECTURA: lee la base
 * de producción y le pregunta a Google; no escribe en ninguna de las dos.
 *
 * Toma reuniones reales recientes con código de Meet (una organizada por alguien de fuera, si hay) y mide:
 *   1. el código de la reunión: si con él se encuentra el registro de la conferencia, y si su hora calza con el evento;
 *   2. el acceso como invitado: si una persona del equipo que NO organizó la reunión la puede leer (U5);
 *   3. quiénes entraron, con su id de Google traducido a correo por el directorio, y la transcripción por frases;
 *   4. si la API de Workspace Events acepta la delegación de dominio (`validateOnly`: no crea la suscripción);
 *   5. si la cuenta de servicio puede leer la suscripción de Pub/Sub (`testIamPermissions`, solo lectura).
 *
 *   npx tsx scripts/probar-api-de-meet.ts            # 5 reuniones de los últimos 3 días
 *   npx tsx scripts/probar-api-de-meet.ts --dias 7 --n 8
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptDb } from "./lib/db";
import { getMeetAuth, getPubSubAuth, listDomainUsers, proyectoDeGoogleCloud } from "../lib/google/auth";
import { DOMINIO_PROPIO } from "../lib/sessions/dominio-propio";

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const DIAS = arg("--dias", 3);
const N = arg("--n", 5);
const TEMA = "nexus-meet-eventos";
const SUSCRIPCION = "nexus-meet-eventos-pull";

type Json = Record<string, unknown>;

async function pedir(correo: string, url: string): Promise<{ ok: true; data: Json } | { ok: false; status: number | null; error: string }> {
  try {
    const r = await getMeetAuth(correo).request<Json>({ url, method: "GET" });
    return { ok: true, data: r.data };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
    return { ok: false, status: err.response?.status ?? null, error: err.response?.data?.error?.message ?? err.message ?? String(e) };
  }
}

const MEET = "https://meet.googleapis.com/v2";

async function main() {
  const { prisma, close } = createScriptDb();
  try {
    const usuarios = await listDomainUsers();
    const correoDeId = new Map(usuarios.filter((u) => u.id).map((u) => [`users/${u.id}`, u.email.toLowerCase()]));
    const internos = new Set(usuarios.map((u) => u.email.toLowerCase()));
    const esInterno = (c: string | null | undefined) => !!c && (internos.has(c.toLowerCase()) || c.toLowerCase().endsWith(`@${DOMINIO_PROPIO}`));

    const desde = new Date(Date.now() - DIAS * 86_400_000);
    const filas = await prisma.firefliesSession.findMany({
      where: { conferenceId: { not: null }, date: { gte: desde, lt: new Date(Date.now() - 2 * 3_600_000) }, canceladaEn: null },
      select: { id: true, title: true, date: true, duration: true, conferenceId: true, organizerEmail: true, participants: true, googleDocId: true, transcript: true },
      orderBy: { date: "desc" },
      take: 400,
    });
    const deFuera = filas.filter((f) => !esInterno(f.organizerEmail) && f.participants.some((p) => esInterno(p)));
    const conTexto = filas.filter((f) => esInterno(f.organizerEmail) && (f.transcript?.length ?? 0) > 200);
    const sinTexto = filas.filter((f) => esInterno(f.organizerEmail) && !f.transcript);
    const elegidas = [...deFuera.slice(0, 2), ...conTexto.slice(0, 2), ...sinTexto.slice(0, Math.max(1, N - 4))].slice(0, Math.max(N, 5));
    console.log(`Reuniones con código en ${DIAS} días: ${filas.length} (de fuera: ${deFuera.length}). Pruebo ${elegidas.length}.\n`);

    for (const s of elegidas) {
      const fin = new Date(s.date.getTime() + s.duration * 60_000);
      console.log(`── «${s.title}» ${s.date.toISOString()} (${s.duration} min) código ${s.conferenceId}`);
      console.log(`   organiza ${esInterno(s.organizerEmail) ? "el equipo" : "alguien de fuera"} · texto en Nexus: ${s.transcript ? `${s.transcript.length} car.` : "no"} · Doc adjunto: ${s.googleDocId ? "sí" : "no"}`);
      const candidatos = [...new Set([s.organizerEmail, ...s.participants].filter((c): c is string => esInterno(c)).map((c) => c.toLowerCase()))];
      const quienes = esInterno(s.organizerEmail) ? [s.organizerEmail!.toLowerCase(), ...candidatos.filter((c) => c !== s.organizerEmail!.toLowerCase()).slice(0, 1)] : candidatos.slice(0, 3);
      for (const quien of quienes) {
        const papel = quien === s.organizerEmail?.toLowerCase() ? "organizador" : "invitado";
        const filtro = encodeURIComponent(`space.meeting_code = "${s.conferenceId}"`);
        const lista = await pedir(quien, `${MEET}/conferenceRecords?filter=${filtro}&pageSize=50`);
        if (!lista.ok) {
          console.log(`   [${papel}] lista: ✗ ${lista.status} ${lista.error}`);
        } else {
          const registros = (lista.data.conferenceRecords as Json[] | undefined) ?? [];
          console.log(`   [${papel}] lista por código: ${registros.length} registro(s)`);
          for (const r of registros.slice(0, 4)) {
            const ini = new Date(String(r.startTime));
            const desfase = Math.round((ini.getTime() - s.date.getTime()) / 60_000);
            console.log(`      ${r.name} ${r.startTime} → ${r.endTime ?? "(en curso)"} · desfase con el evento ${desfase} min`);
          }
          const cerca = registros
            .map((r) => ({ r, d: Math.abs(new Date(String(r.startTime)).getTime() - s.date.getTime()) }))
            .filter((x) => x.d <= 12 * 3_600_000)
            .sort((a, b) => a.d - b.d)[0]?.r;
          if (cerca) {
            const part = await pedir(quien, `${MEET}/${cerca.name}/participants?pageSize=100`);
            if (part.ok) {
              const ps = (part.data.participants as Json[] | undefined) ?? [];
              const desc = ps.map((p) => {
                const su = p.signedinUser as Json | undefined;
                if (su) return `${su.displayName}${correoDeId.get(String(su.user)) ? ` <${correoDeId.get(String(su.user))}>` : " (de fuera)"}`;
                if (p.anonymousUser) return `${(p.anonymousUser as Json).displayName} (anónimo)`;
                if (p.phoneUser) return `${(p.phoneUser as Json).displayName} (teléfono)`;
                return "?";
              });
              console.log(`      participantes: ${ps.length}: ${desc.join(", ")}`);
              const p0 = ps[0];
              if (p0) {
                const ses = await pedir(quien, `${MEET}/${p0.name}/participantSessions`);
                console.log(`      sesiones del primero: ${ses.ok ? ((ses.data.participantSessions as Json[] | undefined) ?? []).length : `✗ ${ses.status}`}`);
              }
            } else console.log(`      participantes: ✗ ${part.status} ${part.error}`);
            const tr = await pedir(quien, `${MEET}/${cerca.name}/transcripts`);
            if (tr.ok) {
              const ts = (tr.data.transcripts as Json[] | undefined) ?? [];
              for (const t of ts) {
                const doc = (t.docsDestination as Json | undefined)?.document;
                const ent = await pedir(quien, `${MEET}/${t.name}/entries?pageSize=100`);
                const es = ent.ok ? ((ent.data.entries as Json[] | undefined) ?? []) : [];
                console.log(
                  `      transcripción ${t.state} · Doc ${doc ? (doc === s.googleDocId ? "= el adjunto" : "otro que el adjunto") : "—"} · frases (1ª página) ${ent.ok ? es.length : `✗ ${ent.status}`}${ent.ok && ent.data.nextPageToken ? "+" : ""}`,
                );
                if (es[0]) console.log(`        1ª: ${es[0].participant} ${es[0].startTime} «${String(es[0].text).slice(0, 60)}» (${es[0].languageCode})`);
              }
              if (ts.length === 0) console.log("      transcripción: ninguna");
            } else console.log(`      transcripción: ✗ ${tr.status} ${tr.error}`);
            const notas = await pedir(quien, `${MEET}/${cerca.name}/smartNotes`);
            console.log(`      notas de Gemini (smartNotes): ${notas.ok ? `${((notas.data.smartNotes as Json[] | undefined) ?? []).length}` : `✗ ${notas.status} ${notas.error.slice(0, 80)}`}`);
          } else console.log(`      ningún registro a menos de 12 h del evento (fin del evento ${fin.toISOString()})`);
        }
        // El espacio por su código: ¿lo puede ver quien no lo organizó?
        const esp = await pedir(quien, `${MEET}/spaces/${s.conferenceId}`);
        console.log(`   [${papel}] espacio por código: ${esp.ok ? `✓ ${esp.data.name}` : `✗ ${esp.status} ${esp.error.slice(0, 80)}`}`);
      }
      console.log("");
    }

    // 4. Workspace Events con delegación de dominio, sin crear nada (validateOnly).
    const proyecto = proyectoDeGoogleCloud();
    const alguien = usuarios.find((u) => u.id && u.email.toLowerCase() === process.env.GOOGLE_ADMIN_EMAIL?.toLowerCase()) ?? usuarios.find((u) => u.id);
    if (alguien && proyecto) {
      const cuerpo = {
        targetResource: `//cloudidentity.googleapis.com/users/${alguien.id}`,
        eventTypes: [
          "google.workspace.meet.conference.v2.ended",
          "google.workspace.meet.transcript.v2.fileGenerated",
          "google.workspace.meet.smartNote.v2.fileGenerated",
        ],
        notificationEndpoint: { pubsubTopic: `projects/${proyecto}/topics/${TEMA}` },
        payloadOptions: { includeResource: false },
      };
      try {
        const r = await getMeetAuth(alguien.email).request<Json>({
          url: "https://workspaceevents.googleapis.com/v1/subscriptions?validateOnly=true",
          method: "POST",
          data: cuerpo,
        });
        console.log(`Workspace Events con delegación (validateOnly, usuario del equipo): ✓ ${JSON.stringify(r.data).slice(0, 200)}`);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
        console.log(`Workspace Events con delegación (validateOnly): ✗ ${err.response?.status} ${err.response?.data?.error?.message ?? err.message}`);
      }
      try {
        const filtro = encodeURIComponent('event_types:"google.workspace.meet.conference.v2.ended"');
        const r = await getMeetAuth(alguien.email).request<Json>({ url: `https://workspaceevents.googleapis.com/v1/subscriptions?filter=${filtro}`, method: "GET" });
        console.log(`Workspace Events, suscripciones vivas: ${((r.data.subscriptions as Json[] | undefined) ?? []).length}`);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
        console.log(`Workspace Events, listar: ✗ ${err.response?.status} ${err.response?.data?.error?.message ?? err.message}`);
      }

      // 5. Pub/Sub: permisos de la cuenta de servicio sobre la suscripción (solo lectura).
      try {
        const r = await getPubSubAuth().request<Json>({
          url: `https://pubsub.googleapis.com/v1/projects/${proyecto}/subscriptions/${SUSCRIPCION}:testIamPermissions`,
          method: "POST",
          data: { permissions: ["pubsub.subscriptions.consume", "pubsub.subscriptions.get"] },
        });
        console.log(`Pub/Sub, permisos sobre ${SUSCRIPCION}: ${JSON.stringify(r.data.permissions ?? [])}`);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
        console.log(`Pub/Sub: ✗ ${err.response?.status} ${err.response?.data?.error?.message ?? err.message}`);
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
