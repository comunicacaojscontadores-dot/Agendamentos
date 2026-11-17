export const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DAYS_PT_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Valor-sentinela que representa a opção "Dia inteiro" na lista de durações.
// Não é uma duração fixa: significa reservar toda a janela de disponibilidade
// do dia (ex.: 08:00–17:00). Usa-se fullDayRange() para calcular o intervalo.
export const FULL_DAY_MIN = 1440;

// Valor-sentinela da opção "Até o fim do expediente": a pessoa escolhe o
// início e a reserva vai até o fim da disponibilidade do dia. Fica abaixo de
// FULL_DAY_MIN só para aparecer antes de "Dia inteiro" na lista.
export const UNTIL_CLOSE_MIN = 1400;

// Valor-sentinela da opção "2 dias": o dia escolhido inteiro + o próximo dia
// com disponibilidade inteiro (ex.: sexta → segunda). Usa-se twoDayRange().
export const TWO_DAYS_MIN = 2880;

/** Durações que não escolhem horário (ocupam dias inteiros). */
export function isWholeDays(min: number | null) {
  return min === FULL_DAY_MIN || min === TWO_DAYS_MIN;
}

export function formatDuration(min: number) {
  if (min === UNTIL_CLOSE_MIN) return "Até o fim do expediente";
  if (min === FULL_DAY_MIN) return "Dia inteiro";
  if (min === TWO_DAYS_MIN) return "2 dias";
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h${(min % 60)}`;
}

// "Sala" comum ou "veículo" (ex.: o carro da empresa). Muda só os textos.
export type RoomKind = "room" | "vehicle";
interface Labeled { name?: string | null; room_number?: string | null; kind?: string | null }

export function isVehicle(r?: Labeled | null) {
  return r?.kind === "vehicle";
}

/** "Sala 3" ou "Placa ABC1D23". */
export function numberLabel(r?: Labeled | null) {
  return `${isVehicle(r) ? "Placa" : "Sala"} ${r?.room_number ?? ""}`.trim();
}

/** "Sala de Reunião 1 (Sala 3)" ou "Carro – Argo (Placa ABC1D23)". */
export function roomLabel(r?: Labeled | null) {
  return r?.name ? `${r.name} (${numberLabel(r)})` : numberLabel(r);
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

/** "09:00 – 10:00" no mesmo dia; "08:00 – qua, 19/11 17:00" quando termina em outro dia. */
export function formatTimeRange(start: Date, end: Date) {
  if (start.toDateString() === end.toDateString()) return `${formatTime(start)} – ${formatTime(end)}`;
  const day = end.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  return `${formatTime(start)} – ${day} ${formatTime(end)}`;
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
 *
 * Se for HOJE e a abertura já tiver passado, o início passa a ser o horário
 * atual (arredondado para o próximo múltiplo de 15 min), até o fim do dia —
 * assim não conflita com reservas anteriores do mesmo dia que já ocorreram.
 * Retorna null se não houver disponibilidade no dia ou se o dia já encerrou.
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

  const now = new Date();
  if (start < now) {
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + (15 - (next.getMinutes() % 15))); // próximo múltiplo de 15 min
    if (next > start) start.setTime(next.getTime());
  }
  if (start >= end) return null; // não há mais tempo disponível hoje

  return { start, end };
}

/**
 * Intervalo de "2 dias": começa como o "dia inteiro" da data escolhida e vai
 * até o fim do PRÓXIMO dia que tenha disponibilidade (pula fim de semana, por
 * exemplo, se ele não estiver liberado). Retorna null se não for possível.
 */
export function twoDayRange(date: Date, availability: AvailabilityWindow[]): { start: Date; end: Date } | null {
  const first = fullDayRange(date, availability);
  if (!first) return null;
  for (let k = 1; k <= 7; k++) {
    const next = new Date(date); next.setDate(date.getDate() + k);
    const second = fullDayRange(next, availability);
    if (second) return { start: first.start, end: second.end };
  }
  return null;
}

/**
 * Horários de início para "Até o fim do expediente": qualquer início livre
 * dentro das janelas do dia; o fim é sempre o fim da última janela do dia.
 * Um início só aparece se o intervalo inteiro até o fechamento estiver livre.
 */
export function generateUntilCloseSlots(
  date: Date,
  availability: AvailabilityWindow[],
  booked: BookedSlot[],
  step = 15,
): { start: Date; end: Date }[] {
  const close = fullDayRange(date, availability)?.end; // fim da última janela do dia
  const dow = date.getDay();
  const windows = availability.filter((w) => w.day_of_week === dow);
  if (!windows.length || !close) return [];

  const slots: { start: Date; end: Date }[] = [];
  const now = new Date();
  const bufferMs = BOOKING_BUFFER_MIN * 60_000;

  for (const w of windows) {
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    const winStart = new Date(date); winStart.setHours(sh, sm, 0, 0);
    const winEnd = new Date(date); winEnd.setHours(eh, em, 0, 0);
    for (let cursor = new Date(winStart); cursor < winEnd; cursor = new Date(cursor.getTime() + step * 60_000)) {
      if (cursor <= now) continue;
      const overlaps = booked.some((b) => {
        const bs = new Date(b.starts_at).getTime() - bufferMs;
        const be = new Date(b.ends_at).getTime() + bufferMs;
        return cursor.getTime() < be && close.getTime() > bs;
      });
      if (!overlaps) slots.push({ start: new Date(cursor), end: new Date(close) });
    }
  }
  return slots;
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
