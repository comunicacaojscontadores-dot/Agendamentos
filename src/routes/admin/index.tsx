import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdminBookings, adminCancelBooking } from "@/lib/booking.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Ban, Building2, Calendar, CalendarClock, CalendarDays, CheckCircle2, Clock, Mail, MapPin, Search, Users } from "lucide-react";
import { formatDateBR, formatTime } from "@/lib/booking-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const Route = createFileRoute("/admin/")({ component: AdminBookings });

type Tone = "upcoming" | "past" | "cancelled";

function AdminBookings() {
  const fetchBookings = useServerFn(listAdminBookings);
  const cancelBooking = useServerFn(adminCancelBooking);
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const reload = () => {
    fetchBookings({ data: undefined as any })
      .then((r) => setItems(r.bookings))
      .catch(() => setItems([]));
  };

  useEffect(reload, [fetchBookings]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      const res = await cancelBooking({ data: { id } });
      if (res.ok) {
        toast.success("Agendamento cancelado");
        // Mantém o registro na tela, apenas marcado como cancelado.
        setItems((prev) => (prev ?? []).map((b) =>
          b.id === id
            ? { ...b, status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: res.cancelledBy }
            : b
        ));
      } else {
        toast.error(res.error || "Não foi possível cancelar");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar");
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = (items ?? []).filter((b) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return b.user_name?.toLowerCase().includes(s)
      || b.user_email?.toLowerCase().includes(s)
      || b.rooms?.name?.toLowerCase().includes(s)
      || b.rooms?.room_number?.toLowerCase().includes(s);
  });

  const upcoming = filtered
    .filter(b => b.status === "active" && new Date(b.starts_at) >= new Date())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const past = filtered.filter(b => b.status === "active" && new Date(b.starts_at) < new Date());
  const cancelled = filtered.filter(b => b.status === "cancelled");

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <AdminPageHeader icon={CalendarDays} title="Agendamentos" subtitle="Visualize e gerencie todas as reservas das salas." />

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="size-4 absolute left-3 top-3 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, sala, e-mail…" className="pl-9 h-11 bg-surface shadow-soft" />
      </div>

      {/* Cartões de resumo */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard icon={CalendarClock} label="Próximos" value={upcoming.length} tone="upcoming" />
        <StatCard icon={CheckCircle2} label="Realizados" value={past.length} tone="past" />
        <StatCard icon={Ban} label="Cancelados" value={cancelled.length} tone="cancelled" />
      </div>

      {items === null ? (
        <div className="text-center py-16 text-muted-foreground">Carregando…</div>
      ) : (
        <div className="space-y-10">
          <Section title="Próximos" tone="upcoming" bookings={upcoming} onCancel={handleCancel} cancellingId={cancellingId} />
          {past.length > 0 && <Section title="Realizados" tone="past" bookings={past} onCancel={handleCancel} cancellingId={cancellingId} />}
          {cancelled.length > 0 && <Section title="Cancelados" tone="cancelled" bookings={cancelled} onCancel={handleCancel} cancellingId={cancellingId} />}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: Tone }) {
  const badge =
    tone === "upcoming" ? "bg-primary-soft text-primary"
    : tone === "cancelled" ? "bg-destructive/10 text-destructive"
    : "bg-muted text-muted-foreground";
  return (
    <Card className="p-4 bg-surface shadow-soft flex items-center gap-3">
      <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${badge}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="font-display text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </Card>
  );
}

interface SectionProps {
  title: string;
  tone: Tone;
  bookings: any[];
  onCancel: (id: string) => void;
  cancellingId: string | null;
}

function Section({ title, tone, bookings, onCancel, cancellingId }: SectionProps) {
  const dot =
    tone === "upcoming" ? "bg-primary"
    : tone === "cancelled" ? "bg-destructive"
    : "bg-muted-foreground/40";

  if (!bookings.length) return (
    <div>
      <SectionLabel title={title} count={0} dot={dot} />
      <Card className="p-8 text-center text-muted-foreground text-sm bg-surface shadow-soft">Nada por aqui.</Card>
    </div>
  );

  // Agrupa os agendamentos por sala, preservando a ordem (já vêm ordenados por data).
  const groups: { roomId: string; room: any; items: any[] }[] = [];
  const byRoom = new Map<string, number>();
  for (const b of bookings) {
    const key = b.room_id ?? "sem-sala";
    if (!byRoom.has(key)) {
      byRoom.set(key, groups.length);
      groups.push({ roomId: key, room: b.rooms, items: [] });
    }
    groups[byRoom.get(key)!].items.push(b);
  }
  // Ordena as salas por número (1, 2, 10… na ordem natural).
  groups.sort((a, b) =>
    (a.room?.room_number ?? "").localeCompare(b.room?.room_number ?? "", "pt-BR", { numeric: true })
  );

  return (
    <div>
      <SectionLabel title={title} count={bookings.length} dot={dot} />
      <div className="space-y-7">
        {groups.map((g) => (
          <div key={g.roomId}>
            {/* Cabeçalho da sala */}
            <div className="flex items-center gap-2.5 flex-wrap mb-3 pb-2.5 border-b border-border">
              <div className="size-8 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0">
                <Building2 className="size-4" />
              </div>
              <h3 className="font-display font-bold">{g.room?.name ?? `Sala ${g.room?.room_number}`}</h3>
              <Badge variant="outline" className="text-[10px]">Sala {g.room?.room_number}</Badge>
              {g.room?.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> {g.room.location}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                {g.items.length} {g.items.length === 1 ? "reserva" : "reservas"}
              </span>
            </div>
            <div className="grid gap-3">
              {g.items.map((b) => (
                <BookingCard key={b.id} b={b} tone={tone} onCancel={onCancel} cancellingId={cancellingId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ title, count, dot }: { title: string; count: number; dot: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className={`size-2 rounded-full ${dot}`} />
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h2>
      <span className="text-xs text-muted-foreground font-medium">{count}</span>
    </div>
  );
}

function BookingCard({ b, tone, onCancel, cancellingId }: { b: any; tone: Tone; onCancel: (id: string) => void; cancellingId: string | null }) {
  const accent =
    tone === "upcoming" ? "border-l-primary"
    : tone === "cancelled" ? "border-l-destructive"
    : "border-l-border";
  const dim = tone === "past" ? "opacity-75" : "";
  const isCancelled = b.status === "cancelled";

  return (
    <Card className={`p-5 bg-surface border-l-4 ${accent} ${dim} shadow-soft hover:shadow-card transition-shadow`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold flex items-center gap-1.5"><Calendar className="size-4 text-primary" /> {formatDateBR(new Date(b.starts_at))}</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Clock className="size-3.5" /> {formatTime(new Date(b.starts_at))} – {formatTime(new Date(b.ends_at))}</span>
            {isCancelled && <Badge variant="destructive">Cancelado</Badge>}
          </div>
        </div>
        {!isCancelled && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={cancellingId === b.id}
              >
                <Ban className="size-4 mr-1.5" />
                Cancelar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
                <AlertDialogDescription>
                  O horário voltará a ficar disponível e o registro ficará marcado como
                  cancelado por você. Esta ação não apaga o agendamento — ele continua no histórico.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onCancel(b.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Cancelar agendamento
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border text-sm space-y-1">
        <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{b.user_name}</span><span className="text-muted-foreground flex items-center gap-1"><Mail className="size-3" />{b.user_email}</span></div>
        {b.guest_emails?.length > 0 && (
          <div className="text-muted-foreground flex items-start gap-1.5"><Users className="size-3.5 mt-0.5" /><span>{b.guest_emails.join(", ")}</span></div>
        )}
        {b.notes && <div className="text-muted-foreground italic mt-2 whitespace-pre-wrap">"{b.notes}"</div>}
        {isCancelled && (b.cancelled_by || b.cancelled_at) && (
          <div className="text-xs text-destructive/80 flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
            <Ban className="size-3" />
            Cancelado{b.cancelled_by ? ` por ${b.cancelled_by}` : ""}{b.cancelled_at ? ` em ${formatDateBR(new Date(b.cancelled_at))} às ${formatTime(new Date(b.cancelled_at))}` : ""}
          </div>
        )}
      </div>
    </Card>
  );
}
