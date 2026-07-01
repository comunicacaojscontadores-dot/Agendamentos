export const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DAYS_PT_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Valor-sentinela que representa a opção "Dia inteiro" na lista de durações.
// Não é uma duração fixa: significa reservar toda a janela de disponibilidade
// do dia (ex.: 08:00–17:00). Usa-se fullDayRange() para calcular o intervalo.
export const FULL_DAY_MIN = 1440;

export function formatDuration(min: number) {
  if (min === FULL_DAY_MIN) return "Dia inteiro";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h${(min % 60)}`;
}

export function formatDateTime(d: Date) {
  return d.toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatDateBR(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export interface AvailabilityWindow {
  day_of_week: number;
  start_time: string; // HH:MM:SS
  end_time: string;
}
export interface BookedSlot { starts_at: string; ends_at: string; }

/**
 * Intervalo de "dia inteiro" para uma data: do começo da primeira janela de
 * disponibilidade ao fim da última janela daquele dia da semana.
 * Retorna null se não houver disponibilidade no dia.
 */
export function fullDayRange(date: Date, availability: AvailabilityWindow[]): { start: Date; end: Date } | null {
  const dow = date.getDay();
  const windows = availability.filter((w) => w.day_of_week === dow);
  if (!windows.length) return null;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const w of windows) {
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    minStart = Math.min(minStart, sh * 60 + sm);
    maxEnd = Math.max(maxEnd, eh * 60 + em);
  }
  const start = new Date(date); start.setHours(Math.floor(minStart / 60), minStart % 60, 0, 0);
  const end = new Date(date); end.setHours(Math.floor(maxEnd / 60), maxEnd % 60, 0, 0);
  return { start, end };
}

/** Generate slots for a date based on availability + duration, excluding booked ones. */
/** Buffer (minutes) enforced before/after each booking. */
export const BOOKING_BUFFER_MIN = 15;

export function generateSlots(
  date: Date,
  durationMin: number,
  availability: AvailabilityWindow[],
  booked: BookedSlot[],
  step = 15,
): { start: Date; end: Date }[] {
  const dow = date.getDay();
  const windows = availability.filter((w) => w.day_of_week === dow);
  if (!windows.length) return [];

  const slots: { start: Date; end: Date }[] = [];
  const now = new Date();
  const bufferMs = BOOKING_BUFFER_MIN * 60_000;

  for (const w of windows) {
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    const winStart = new Date(date); winStart.setHours(sh, sm, 0, 0);
    const winEnd = new Date(date); winEnd.setHours(eh, em, 0, 0);

    let cursor = new Date(winStart);
    while (true) {
      const end = new Date(cursor.getTime() + durationMin * 60_000);
      if (end > winEnd) break;
      if (cursor > now) {
        const overlaps = booked.some((b) => {
          const bs = new Date(b.starts_at).getTime() - bufferMs;
          const be = new Date(b.ends_at).getTime() + bufferMs;
          return cursor.getTime() < be && end.getTime() > bs;
        });
        if (!overlaps) slots.push({ start: new Date(cursor), end });
      }
      cursor = new Date(cursor.getTime() + step * 60_000);
    }
  }
  return slots;
}
