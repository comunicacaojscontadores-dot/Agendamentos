import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBookingReminder } from "@/lib/email.server";

// Endpoint chamado por pg_cron a cada minuto. Procura agendamentos ativos
// que iniciam entre 14 e 16 minutos a partir de agora e que ainda não
// receberam lembrete. Envia o e-mail e marca reminder_sent = true.
export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const now = new Date();
        const from = new Date(now.getTime() + 14 * 60_000).toISOString();
        const to = new Date(now.getTime() + 16 * 60_000).toISOString();

        const { data: bookings, error } = await supabaseAdmin
          .from("bookings")
          .select("id, cancel_token, user_name, user_email, guest_emails, notes, starts_at, ends_at, rooms(name, room_number)")
          .eq("status", "active")
          .eq("reminder_sent", false)
          .gte("starts_at", from)
          .lte("starts_at", to);

        if (error) {
          console.error("[reminders] query failed:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        let sent = 0;
        for (const b of bookings ?? []) {
          const room = (b as any).rooms;
          const roomLabel = room?.name ? `${room.name} (Sala ${room.room_number})` : `Sala ${room?.room_number ?? ""}`;
          try {
            await sendBookingReminder({
              bookingId: b.id,
              cancelToken: b.cancel_token,
              roomLabel,
              startsAt: new Date(b.starts_at),
              endsAt: new Date(b.ends_at),
              userName: b.user_name,
              recipients: [b.user_email, ...(b.guest_emails ?? [])],
              notes: b.notes ?? null,
            });
            await supabaseAdmin.from("bookings").update({ reminder_sent: true }).eq("id", b.id);
            sent++;
          } catch (e) {
            console.error("[reminders] send failed for", b.id, e);
          }
        }

        return new Response(JSON.stringify({ ok: true, checked: bookings?.length ?? 0, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
