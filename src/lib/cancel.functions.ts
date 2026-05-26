import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBookingCancellation } from "./email.server";

export const cancelBookingByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin.rpc("cancel_booking_by_token", { _token: data.token });
    if (error || !result) return { ok: false as const };

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id, cancel_token, user_name, user_email, guest_emails, notes, starts_at, ends_at, rooms(name, room_number, notification_email, notify_email_enabled)")
      .eq("cancel_token", data.token)
      .single();

    if (bookings) {
      const room = (bookings as any).rooms;
      const roomLabel = room?.name ? `${room.name} (Sala ${room.room_number})` : `Sala ${room?.room_number ?? ""}`;
      const recipients = [bookings.user_email, ...(bookings.guest_emails ?? [])];
      if (room?.notify_email_enabled && room?.notification_email) {
        recipients.push(room.notification_email);
      }
      try {
        await sendBookingCancellation({
          bookingId: bookings.id,
          cancelToken: bookings.cancel_token,
          roomLabel,
          startsAt: new Date(bookings.starts_at),
          endsAt: new Date(bookings.ends_at),
          userName: bookings.user_name,
          recipients,
          notes: bookings.notes ?? null,
        });
      } catch (e) {
        console.error("[email] cancellation email failed:", e);
      }
    }

    return { ok: true as const };
  });