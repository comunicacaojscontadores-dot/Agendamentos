import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { roomLabel, isVehicle } from "@/lib/booking-utils";

const createSchema = z.object({
  roomId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  userName: z.string().trim().min(1).max(120),
  userEmail: z.string().trim().email().max(255),
  guestEmails: z.array(z.string().trim().email().max(255)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  turnstileToken: z.string().max(2048).optional().default(""),
  allDay: z.boolean().optional().default(false),
  twoDays: z.boolean().optional().default(false),
  untilClose: z.boolean().optional().default(false),
});

// Verifica o token anti-robô (Turnstile) com a Cloudflare.
// Só é exigido quando TURNSTILE_SECRET_KEY está configurado no servidor;
// sem ele, a verificação é ignorada (mantém o agendamento funcionando).
async function verifyTurnstile(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, error: "Confirme que você não é um robô e tente novamente." };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) return { ok: false, error: "Verificação de segurança falhou. Recarregue a página e tente novamente." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível validar a verificação de segurança. Tente novamente." };
  }
}

function getBRParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[map.weekday], hour: Number(map.hour) % 24, minute: Number(map.minute) };
}

// Data (AAAA-MM-DD) no fuso de Brasília, para contar diferença de dias.
function brDateMs(d: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return Date.parse(`${ymd}T00:00:00Z`);
}

type Window = { day_of_week: number; start_time: string; end_time: string };

// Primeiro início e último fim das janelas de um dia da semana.
function dayBounds(avail: Window[], dow: number) {
  const ws = avail.filter((w) => w.day_of_week === dow);
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const w of ws) {
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    minStart = Math.min(minStart, sh * 60 + sm);
    maxEnd = Math.max(maxEnd, eh * 60 + em);
  }
  return ws.length ? { minStart, maxEnd } : null;
}

const BUFFER_MIN = 15;

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const captcha = await verifyTurnstile(data.turnstileToken);
    if (!captcha.ok) return { ok: false as const, error: captcha.error };

    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);
    const now = new Date();
    if (start < now) return { ok: false as const, error: "Horário no passado." };
    const max = new Date(); max.setDate(max.getDate() + 60);
    if (start > max) return { ok: false as const, error: "Data fora do limite (60 dias)." };

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("*") // inclui "kind" (sala/veículo) quando existir
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) return { ok: false as const, error: "Sala não encontrada." };

    const { data: avail } = await supabaseAdmin
      .from("room_availability")
      .select("day_of_week, start_time, end_time")
      .eq("room_id", data.roomId);

    const { dow, hour, minute } = getBRParts(start);
    const startMin = hour * 60 + minute;
    const durMin = Math.round((end.getTime() - start.getTime()) / 60_000);
    const endMin = startMin + durMin;
    const windowsToday = (avail ?? []).filter((w) => w.day_of_week === dow);

    let fitsWindow: boolean;
    if (data.twoDays) {
      // 2 dias: começa como "dia inteiro" no dia do início e termina no fim da
      // disponibilidade do PRÓXIMO dia que tiver janela (ex.: sexta → segunda).
      const first = dayBounds(avail ?? [], dow);
      let k = 1;
      while (k <= 7 && !dayBounds(avail ?? [], (dow + k) % 7)) k++;
      const second = k <= 7 ? dayBounds(avail ?? [], (dow + k) % 7) : null;
      const endParts = getBRParts(end);
      const dayDiff = Math.round((brDateMs(end) - brDateMs(start)) / 86_400_000);
      fitsWindow = !!first && !!second &&
        startMin >= first.minStart && startMin < first.maxEnd &&
        dayDiff === k && endParts.hour * 60 + endParts.minute === second.maxEnd;
    } else if (data.untilClose) {
      // Até o fim do expediente: início dentro de alguma janela do dia e fim
      // exatamente no fim da última janela.
      const b = dayBounds(avail ?? [], dow);
      fitsWindow = !!b && endMin === b.maxEnd && windowsToday.some((w) => {
        const [sh, sm] = w.start_time.split(":").map(Number);
        const [eh, em] = w.end_time.split(":").map(Number);
        return startMin >= sh * 60 + sm && startMin < eh * 60 + em;
      });
    } else if (data.allDay) {
      // Dia inteiro: precisa cobrir exatamente do início da primeira janela ao
      // fim da última janela do dia (a regra das reservas normais fica intacta).
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const w of windowsToday) {
        const [sh, sm] = w.start_time.split(":").map(Number);
        const [eh, em] = w.end_time.split(":").map(Number);
        minStart = Math.min(minStart, sh * 60 + sm);
        maxEnd = Math.max(maxEnd, eh * 60 + em);
      }
      // Dia inteiro vai até o fim da disponibilidade; o início pode ser a
      // abertura OU, se for hoje e já tiver passado, o horário atual.
      fitsWindow = windowsToday.length > 0 && startMin >= minStart && endMin === maxEnd;
    } else {
      fitsWindow = windowsToday.some((w) => {
        const [sh, sm] = w.start_time.split(":").map(Number);
        const [eh, em] = w.end_time.split(":").map(Number);
        return startMin >= sh * 60 + sm && endMin <= eh * 60 + em;
      });
    }
    if (!fitsWindow) return { ok: false as const, error: "Horário fora da disponibilidade da sala." };

    // Reservas ativas que encostam no intervalo (com a folga de 15 min) — vale
    // também para reservas de vários dias que começaram antes.
    const bufferMs = BUFFER_MIN * 60_000;
    const { data: nearby } = await supabaseAdmin
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("room_id", data.roomId)
      .eq("status", "active")
      .lt("starts_at", new Date(end.getTime() + bufferMs).toISOString())
      .gt("ends_at", new Date(start.getTime() - bufferMs).toISOString());
    const conflicts = (nearby ?? []).some((b) => {
      const bs = new Date(b.starts_at).getTime() - bufferMs;
      const be = new Date(b.ends_at).getTime() + bufferMs;
      return start.getTime() < be && end.getTime() > bs;
    });
    if (conflicts) {
      return { ok: false as const, error: "Conflito com outro agendamento (intervalo mínimo de 15 min)." };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        room_id: data.roomId,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        user_name: data.userName,
        user_email: data.userEmail,
        guest_emails: data.guestEmails,
        notes: data.notes ?? null,
      })
      .select("id, cancel_token")
      .single();

    if (error) {
      if (error.message?.includes("bookings_no_overlap")) {
        return { ok: false as const, error: "Esse horário acabou de ser reservado por outra pessoa." };
      }
      return { ok: false as const, error: "Não foi possível criar o agendamento." };
    }

    const recipients = [data.userEmail, ...data.guestEmails];
    if (room.notify_email_enabled && room.notification_email) {
      recipients.push(room.notification_email);
    }

    let meetLink: string | undefined;
    if (room.google_calendar_enabled) {
      try {
        const { createCalendarEvent, isGoogleCalendarConfigured } = await import("./google-calendar.server");
        if (isGoogleCalendarConfigured()) {
          const res = await createCalendarEvent({
            summary: `Reunião — ${roomLabel(room)}`,
            description: [
              `Reserva feita por ${data.userName} (${data.userEmail}).`,
              `Local: ${room.location}`,
              data.notes ? `\nObservações:\n${data.notes}` : "",
            ].join("\n"),
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            attendees: recipients,
            withMeet: room.google_meet_enabled,
          });
          if (res.ok) meetLink = res.meetLink;
          else console.error("[gcal] create event failed:", res.error);
        } else {
          console.warn("[gcal] enabled for room but no Google account connected yet.");
        }
      } catch (e) {
        console.error("[gcal] unexpected failure:", e);
      }
    }

    try {
      const { sendBookingConfirmation } = await import("./email.server");
      await sendBookingConfirmation({
        bookingId: inserted.id,
        cancelToken: inserted.cancel_token,
        roomLabel: roomLabel(room),
        vehicle: isVehicle(room),
        startsAt: start,
        endsAt: end,
        userName: data.userName,
        recipients,
        notes: [data.notes, meetLink ? `Link da reunião: ${meetLink}` : null].filter(Boolean).join("\n\n") || null,
      });
    } catch (e) {
      console.error("[email] confirmation failed:", e);
    }

    return { ok: true as const, bookingId: inserted.id, cancelToken: inserted.cancel_token };
  });

export const listAdminBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("bookings")
      .select("id, room_id, user_name, user_email, guest_emails, notes, starts_at, ends_at, status, created_at, cancelled_at, cancelled_by, rooms(*)")
      .order("starts_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { bookings: data ?? [] };
  });

// Cancela um agendamento pelo painel: NÃO apaga o registro — apenas marca como
// cancelado, grava data/hora e quem cancelou (e-mail do admin logado). O horário
// volta a ficar disponível porque a restrição de conflito só considera os ativos.
export const adminCancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const cancelledBy = (claims as any)?.email ?? "administrador";
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy } as any)
      .eq("id", data.id)
      .eq("status", "active");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, cancelledBy };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    return { isAdmin: !!data };
  });