import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdminBookings, deleteBooking } from "@/lib/booking.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Calendar, Mail, MapPin, Search, Trash2, Users } from "lucide-react";
import { formatDateBR, formatTime } from "@/lib/booking-utils";

export const Route = createFileRoute("/admin/")({ component: AdminBookings });

function AdminBookings() {
  const fetchBookings = useServerFn(listAdminBookings);
  const removeBooking = useServerFn(deleteBooking);
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = () => {
    fetchBookings({ data: undefined as any })
      .then((r) => setItems(r.bookings))
      .catch(() => setItems([]));
  };

  useEffect(reload, [fetchBookings]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await removeBooking({ data: { id } });
      if (res.ok) {
        toast.success("Agendamento excluído");
        setItems((prev) => (prev ?? []).filter((b) => b.id !== id));
      } else {
        toast.error(res.error || "Não foi possível excluir");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir");
    } finally {
      setDeletingId(null);
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

  const upcoming = filtered.filter(b => b.status === "active" && new Date(b.starts_at) >= new Date());
  const past = filtered.filter(b => b.status === "active" && new Date(b.starts_at) < new Date());
  const cancelled = filtered.filter(b => b.status === "cancelled");

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">Agendamentos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Visualize e gerencie todas as reservas das salas.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, sala, e-mail…" className="pl-9" />
        </div>
      </div>

      {items === null ? (
        <div className="text-center py-12 text-muted-foreground">Carregando…</div>
      ) : (
        <div className="space-y-8">
          <Section title={`Próximos (${upcoming.length})`} bookings={upcoming} onDelete={handleDelete} deletingId={deletingId} />
          {past.length > 0 && <Section title={`Passados (${past.length})`} bookings={past} muted onDelete={handleDelete} deletingId={deletingId} />}
          {cancelled.length > 0 && <Section title={`Cancelados (${cancelled.length})`} bookings={cancelled} muted onDelete={handleDelete} deletingId={deletingId} />}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  bookings: any[];
  muted?: boolean;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function Section({ title, bookings, muted, onDelete, deletingId }: SectionProps) {
  if (!bookings.length) return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h2>
      <Card className="p-6 text-center text-muted-foreground text-sm">Nada por aqui.</Card>
    </div>
  );
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h2>
      <div className="grid gap-3">
        {bookings.map((b) => (
          <Card key={b.id} className={`p-5 bg-surface ${muted ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold">{b.rooms?.name ?? `Sala ${b.rooms?.room_number}`}</span>
                  <Badge variant="outline" className="text-[10px]">Sala {b.rooms?.room_number}</Badge>
                  {b.status === "cancelled" && <Badge variant="destructive">Cancelado</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> {formatDateBR(new Date(b.starts_at))}</span>
                  <span className="flex items-center gap-1.5">{formatTime(new Date(b.starts_at))} – {formatTime(new Date(b.ends_at))}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {b.rooms?.location}</span>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={deletingId === b.id}
                  >
                    <Trash2 className="size-4 mr-1.5" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir este agendamento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é permanente e não pode ser desfeita. O registro será removido do banco de dados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(b.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="mt-3 pt-3 border-t border-border text-sm space-y-1">
              <div className="flex items-center gap-2"><span className="font-medium">{b.user_name}</span><span className="text-muted-foreground flex items-center gap-1"><Mail className="size-3" />{b.user_email}</span></div>
              {b.guest_emails?.length > 0 && (
                <div className="text-muted-foreground flex items-start gap-1.5"><Users className="size-3.5 mt-0.5" /><span>{b.guest_emails.join(", ")}</span></div>
              )}
              {b.notes && <div className="text-muted-foreground italic mt-2 whitespace-pre-wrap">"{b.notes}"</div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
