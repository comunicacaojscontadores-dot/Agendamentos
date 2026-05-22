import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  roomId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  userName: z.string().trim().min(1).max(120),
  userEmail: z.string().trim().email().max(255),
  guestEmails: z.array(z.string().trim().email().max(255)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
});

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

const BUFFER_MIN = 15;

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);
    const now = new Date();
    if (start < now) return { ok: false as const, error: "Horário no passado." };
    const max = new Date(); max.setDate(max.getDate() + 60);
    if (start > max) return { ok: false as const, error: "Data fora do limite (60 dias)." };

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("id, name, room_number, location, notify_email_enabled, notification_email, google_calendar_enabled, google_meet_enabled")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) return { ok: false as const, error: "Sala não encontrada." };

    const { data: avail } = await supabaseAdmin
      .from("room_availability")
      .select("day_of_week, start_time, end_time")
      .eq("room_id", data.roomId);

    // Validate using Brazil timezone (server may run in UTC).
    const { dow, hour, minute } = getBRParts(start);
    const startMin = hour * 60 + minute;
    const durMin = Math.round((end.getTime() - start.getTime()) / 60_000);
    const endMin = startMin + durMin;
    const fitsWindow = (avail ?? []).filter((w) => w.day_of_week === dow).some((w) => {
      const [sh, sm] = w.start_time.split(":").map(Number);
      const [eh, em] = w.end_time.split(":").map(Number);
      return startMin >= sh * 60 + sm && endMin <= eh * 60 + em;
    });
    if (!fitsWindow) return { ok: false as const, error: "Horário fora da disponibilidade da sala." };

    // 15-min buffer enforcement against existing active bookings on same day.
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);
    const { data: sameDay } = await supabaseAdmin
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("room_id", data.roomId)
      .eq("status", "active")
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString());
    const bufferMs = BUFFER_MIN * 60_000;
    const conflicts = (sameDay ?? []).some((b) => {
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
          const roomLabel = room.name ? `${room.name} (Sala ${room.room_number})` : `Sala ${room.room_number}`;
          const res = await createCalendarEvent({
            summary: `Reunião — ${roomLabel}`,
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
        roomLabel: room.name ? `${room.name} (Sala ${room.room_number})` : `Sala ${room.room_number}`,
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
      .select("id, room_id, user_name, user_email, guest_emails, notes, starts_at, ends_at, status, created_at, cancelled_at, rooms(name, room_number, location)")
      .order("starts_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { bookings: data ?? [] };
  });

export const deleteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("bookings").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    return { isAdmin: !!data };
  });
