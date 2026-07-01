import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, MapPin, Video, Check, Loader2, X } from "lucide-react";
import { generateSlots, formatDuration, formatDateBR, formatTime, fullDayRange, FULL_DAY_MIN, DAYS_PT_SHORT, type AvailabilityWindow, type BookedSlot } from "@/lib/booking-utils";
import { createBooking } from "@/lib/booking.functions";
import { Turnstile } from "@/components/Turnstile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Site key pública da proteção anti-robô. Quando vazia, o widget não aparece
// e o agendamento funciona normalmente (proteção desligada).
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export const Route = createFileRoute("/agendar/$roomId")({ component: BookPage });

interface Room { id: string; room_number: string; name: string | null; location: string; video_call: boolean; available_durations: number[]; }

function BookPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [duration, setDuration] = useState<number | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guestsRaw, setGuestsRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const create = useServerFn(createBooking);

  useEffect(() => {
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle().then(({ data }) => setRoom(data as Room | null));
    supabase.from("room_availability").select("day_of_week, start_time, end_time").eq("room_id", roomId).then(({ data }) => setAvailability((data ?? []) as AvailabilityWindow[]));
  }, [roomId]);

  useEffect(() => {
    if (!date) return;
    const d = date.toISOString().slice(0, 10);
    supabase.rpc("get_booked_slots", { _room_id: roomId, _date: d }).then(({ data }) => {
      setBooked((data ?? []) as BookedSlot[]);
    });
  }, [date, roomId, slot]);

  const allDay = duration === FULL_DAY_MIN;

  const slots = useMemo(() => {
    if (!date || !duration || allDay) return [];
    return generateSlots(date, duration, availability, booked);
  }, [date, duration, availability, booked, allDay]);

  // No modo "dia inteiro", qualquer reserva existente no dia impede ocupar o dia todo.
  const dayConflict = allDay && slot
    ? booked.some((b) => new Date(b.starts_at) < slot.end && new Date(b.ends_at) > slot.start)
    : false;

  if (!room) {
    return <div className="min-h-screen bg-background"><SiteHeader /><div className="p-12 text-center text-muted-foreground">Carregando…</div></div>;
  }

  const handleSubmit = async () => {
    if (!slot) return;
    setSubmitting(true);
    const guests = guestsRaw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const res = await create({
      data: {
        roomId: room.id,
        startsAt: slot.start.toISOString(),
        endsAt: slot.end.toISOString(),
        userName: name,
        userEmail: email,
        guestEmails: guests,
        notes: notes || null,
        turnstileToken: captchaToken,
        allDay,
      },
    });
    setSubmitting(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Agendamento confirmado!");
    navigate({ to: "/sucesso", search: { token: res.cancelToken } });
  };

  const validForm =
    name.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    !dayConflict &&
    (!TURNSTILE_SITE_KEY || captchaToken.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-3.5" /> Voltar para salas
        </Link>

        <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground p-6 sm:p-7 mb-4 shadow-elevated">
          <div className="text-xs uppercase tracking-wider text-primary-foreground/70 font-medium">Sala {room.room_number}</div>
          <h1 className="font-display text-2xl font-bold mt-1">{room.name ?? `Sala ${room.room_number}`}</h1>
          <div className="flex flex-wrap gap-2 mt-3 text-sm">
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><MapPin className="size-3.5" /> {room.location}</span>
            {room.video_call && <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><Video className="size-3.5" /> Vídeo chamada</span>}
          </div>
        </div>

        <Card className="p-5 mb-6 bg-surface shadow-soft">
          <Stepper step={step} allDay={allDay} />
        </Card>

        {step === 1 && (
          <Card className="p-6 bg-surface shadow-soft">
            <h2 className="font-display font-bold text-xl mb-1">Duração da reunião</h2>
            <p className="text-sm text-muted-foreground mb-5">Quanto tempo você precisa?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {room.available_durations.map((d) => (
                <button
                  key={d}
                  onClick={() => { setDuration(d); setStep(2); }}
                  className={cn(
                    "rounded-lg border-2 px-4 py-4 text-center font-semibold transition-all",
                    duration === d ? "border-secondary bg-secondary/5 text-secondary" : "border-border hover:border-secondary/40 hover:bg-accent"
                  )}
                >
                  {formatDuration(d)}
                </button>
              ))}
            </div>
          </Card>
        )}

        {step === 2 && duration && (
          <Card className="p-6 bg-surface shadow-soft">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-bold text-xl">Escolha a data</h2>
              <Badge variant="secondary" className="bg-primary-soft text-primary border-0">{formatDuration(duration)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-5">Próximos 60 dias.</p>
            <DatePicker
              availableDays={[...new Set(availability.map(a => a.day_of_week))]}
              selected={date}
              onSelect={(d) => {
                setDate(d);
                if (allDay) {
                  // Dia inteiro: já define o intervalo (janela do dia) e pula a etapa de horário.
                  setSlot(fullDayRange(d, availability));
                  setStep(4);
                } else {
                  setSlot(null);
                  setStep(3);
                }
              }}
            />
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="size-4" />Voltar</Button>
            </div>
          </Card>
        )}

        {step === 3 && date && duration && (
          <Card className="p-6 bg-surface shadow-soft">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display font-bold text-xl">Horários livres</h2>
              <Badge variant="secondary" className="bg-primary-soft text-primary border-0">{formatDateBR(date)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-5">Selecione o início da sua reunião.</p>
            {slots.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                Nenhum horário disponível neste dia.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start.toISOString()}
                    onClick={() => { setSlot(s); setStep(4); }}
                    className={cn(
                      "rounded-md border px-2 py-2.5 text-sm font-medium transition-all",
                      slot?.start.getTime() === s.start.getTime()
                        ? "border-secondary bg-secondary text-secondary-foreground"
                        : "border-border hover:border-secondary hover:bg-accent"
                    )}
                  >
                    {formatTime(s.start)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="size-4" />Voltar</Button>
            </div>
          </Card>
        )}

        {step === 4 && slot && (
          <Card className="p-6 bg-surface shadow-soft">
            <h2 className="font-display font-bold text-xl mb-1">Seus dados</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Reservando <strong className="text-foreground">{formatDateBR(slot.start)}</strong>
              {allDay
                ? <> — <strong className="text-foreground">dia inteiro</strong> ({formatTime(slot.start)} às {formatTime(slot.end)}).</>
                : <> das <strong className="text-foreground">{formatTime(slot.start)}</strong> às <strong className="text-foreground">{formatTime(slot.end)}</strong>.</>}
            </p>
            {dayConflict && (
              <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
                Este dia já possui outra reserva, então não é possível agendar o dia inteiro. Escolha outra data ou uma duração específica.
              </div>
            )}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Seu nome *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Silva" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="email">Seu e-mail *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" maxLength={255} />
              </div>
              <div>
                <Label htmlFor="guests">E-mails dos convidados</Label>
                <Input id="guests" value={guestsRaw} onChange={(e) => setGuestsRaw(e.target.value)} placeholder="joao@empresa.com, ana@empresa.com" />
                <p className="text-xs text-muted-foreground mt-1">Separe por vírgula ou espaço.</p>
              </div>
              <div>
                <Label htmlFor="notes">Observações para preparar a reunião</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Pauta, contexto, materiais necessários…" maxLength={2000} />
              </div>
            </div>
            {TURNSTILE_SITE_KEY && (
              <div className="mt-5">
                <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />
              </div>
            )}
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(allDay ? 2 : 3)} disabled={submitting}><ArrowLeft className="size-4" />Voltar</Button>
              <Button onClick={handleSubmit} disabled={!validForm || submitting} size="lg">
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Agendando…</> : <>Agendar <ArrowRight className="size-4" /></>}
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function Stepper({ step, allDay }: { step: 1 | 2 | 3 | 4; allDay?: boolean }) {
  // No modo "dia inteiro" não há etapa de horário.
  const labels = allDay ? ["Duração", "Data", "Dados"] : ["Duração", "Data", "Horário", "Dados"];
  const cur = allDay && step === 4 ? 3 : step;
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < cur;
        const active = n === cur;
        return (
          <div key={l} className="flex items-center gap-2 flex-1">
            <div className={cn(
              "size-7 rounded-full grid place-items-center text-xs font-semibold transition-colors",
              done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {done ? <Check className="size-3.5" /> : n}
            </div>
            <span className={cn("text-xs font-medium hidden sm:inline", active ? "text-foreground" : "text-muted-foreground")}>{l}</span>
            {i < labels.length - 1 && <div className={cn("h-px flex-1", done ? "bg-success" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function DatePicker({ availableDays, selected, onSelect }: { availableDays: number[]; selected: Date | null; onSelect: (d: Date) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    days.push(d);
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[420px] overflow-y-auto pr-1">
      {days.map((d) => {
        const enabled = availableDays.includes(d.getDay());
        const isSel = selected?.toDateString() === d.toDateString();
        return (
          <button
            key={d.toISOString()}
            disabled={!enabled}
            onClick={() => onSelect(d)}
            className={cn(
              "rounded-md border px-2 py-2.5 text-sm transition-all text-left",
              !enabled && "opacity-30 cursor-not-allowed",
              enabled && !isSel && "border-border hover:border-secondary hover:bg-accent",
              isSel && "border-secondary bg-secondary text-secondary-foreground",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-70">{DAYS_PT_SHORT[d.getDay()]}</div>
            <div className="font-semibold">{d.getDate().toString().padStart(2, "0")}/{(d.getMonth() + 1).toString().padStart(2, "0")}</div>
          </button>
        );
      })}
    </div>
  );
}
