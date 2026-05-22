// Server-only helper for creating Google Calendar events through the Lovable connector gateway.
// Uses the connected Google account (single account per project — typically the diretoria account).

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone?: string;
  attendees: string[];
  withMeet: boolean;
}

interface CreateEventResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  meetLink?: string;
  error?: string;
}

export function isGoogleCalendarConfigured(): boolean {
  return !!process.env.LOVABLE_API_KEY && !!process.env.GOOGLE_CALENDAR_API_KEY;
}

export async function createCalendarEvent(input: CreateEventInput): Promise<CreateEventResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_CALENDAR_API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_CALENDAR_API_KEY) {
    return { ok: false, error: "Conta Google ainda não conectada." };
  }

  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? "",
    start: { dateTime: input.startISO, timeZone: input.timeZone ?? "America/Sao_Paulo" },
    end: { dateTime: input.endISO, timeZone: input.timeZone ?? "America/Sao_Paulo" },
    attendees: input.attendees.map((email) => ({ email })),
    reminders: { useDefault: true },
  };

  if (input.withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = new URL(`${GATEWAY_URL}/calendars/primary/events`);
  url.searchParams.set("sendUpdates", "all");
  if (input.withMeet) url.searchParams.set("conferenceDataVersion", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: `Google Calendar [${res.status}]: ${JSON.stringify(json).slice(0, 300)}` };
  }

  const meetLink =
    json?.hangoutLink ??
    json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;

  return { ok: true, eventId: json?.id, htmlLink: json?.htmlLink, meetLink };
}
