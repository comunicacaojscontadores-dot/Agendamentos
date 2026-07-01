import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin, Video, Clock, Calendar as CalendarIcon, DoorOpen } from "lucide-react";
import { DAYS_PT, DAYS_PT_SHORT, formatDuration, FULL_DAY_MIN } from "@/lib/booking-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/salas")({ component: AdminRooms });

interface Room {
  id: string; room_number: string; name: string | null; location: string;
  video_call: boolean; available_durations: number[]; active: boolean;
  notify_email_enabled: boolean; notification_email: string | null;
  google_calendar_enabled: boolean; google_meet_enabled: boolean;
}
interface Avail { id: string; room_id: string; day_of_week: number; start_time: string; end_time: string; }

const DURATIONS = [15, 30, 45, 60, 90, 120, FULL_DAY_MIN];

function AdminRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [avail, setAvail] = useState<Avail[]>([]);
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("rooms").select("*").order("room_number"),
      supabase.from("room_availability").select("*"),
    ]);
    setRooms((r ?? []) as Room[]);
    setAvail((a ?? []) as Avail[]);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta sala? Os agendamentos ficarão órfãos.")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Sala excluída"); load(); }
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <AdminPageHeader
        icon={DoorOpen}
        title="Salas"
        subtitle="Gerencie salas, vídeo chamada, durações e horários disponíveis."
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Plus className="size-4" /> Nova sala
          </Button>
        }
      />

      <div className="grid gap-3">
        {rooms.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground bg-surface shadow-soft">Nenhuma sala cadastrada. Crie a primeira.</Card>
        )}
        {rooms.map((r) => {
          const ra = avail.filter(a => a.room_id === r.id).sort((x, y) => x.day_of_week - y.day_of_week);
          return (
            <Card key={r.id} className={`p-5 bg-surface border-l-4 shadow-soft hover:shadow-card transition-shadow ${r.active ? "border-l-primary" : "border-l-border opacity-75"}`}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-lg">{r.name ?? `Sala ${r.room_number}`}</span>
                    <Badge variant="outline">Sala {r.room_number}</Badge>
                    {!r.active && <Badge variant="secondary">Inativa</Badge>}
                    {r.video_call && <Badge className="bg-success/15 text-success border-0"><Video className="size-3 mr-1" />Vídeo</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5"><MapPin className="size-3.5" />{r.location}</div>
                  <div className="text-sm mt-2">
                    <span className="text-muted-foreground">Durações:</span>{" "}
                    {r.available_durations.map(formatDuration).join(", ")}
                  </div>
                  <div className="mt-2 text-sm flex flex-wrap gap-1.5">
                    {ra.length === 0 && <span className="text-destructive text-xs">⚠ sem disponibilidade configurada</span>}
                    {ra.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1 bg-primary-soft text-primary text-xs px-2 py-0.5 rounded">
                        <Clock className="size-3" />{DAYS_PT_SHORT[a.day_of_week]} {a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(r.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <RoomDialog open={open} onOpenChange={setOpen} editing={editing} availability={avail} onSaved={load} />
    </div>
  );
}

function RoomDialog({ open, onOpenChange, editing, availability, onSaved }: {
  open: boolean; onOpenChange: (b: boolean) => void; editing: Room | null; availability: Avail[]; onSaved: () => void;
}) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [video, setVideo] = useState(false);
  const [active, setActive] = useState(true);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [gcalEnabled, setGcalEnabled] = useState(false);
  const [meetEnabled, setMeetEnabled] = useState(false);
  const [durations, setDurations] = useState<number[]>([30, 60]);
  const [windows, setWindows] = useState<{ day: number; start: string; end: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setNumber(editing.room_number); setName(editing.name ?? "");
        setLocation(editing.location); setVideo(editing.video_call);
        setActive(editing.active); setDurations(editing.available_durations);
        setNotifyEnabled(editing.notify_email_enabled);
        setNotifyEmail(editing.notification_email ?? "");
        setGcalEnabled(editing.google_calendar_enabled);
        setMeetEnabled(editing.google_meet_enabled);
        setWindows(availability.filter(a => a.room_id === editing.id).map(a => ({ day: a.day_of_week, start: a.start_time.slice(0,5), end: a.end_time.slice(0,5) })));
      } else {
        setNumber(""); setName(""); setLocation(""); setVideo(false); setActive(true);
        setNotifyEnabled(false); setNotifyEmail("");
        setGcalEnabled(false); setMeetEnabled(false);
        setDurations([30, 60]); setWindows([{ day: 1, start: "08:00", end: "17:00" }]);
      }
    }
  }, [open, editing, availability]);

  const toggleDuration = (d: number) => setDurations(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort((a,b)=>a-b));
  const addWindow = () => setWindows(p => [...p, { day: 1, start: "08:00", end: "17:00" }]);
  const updateWindow = (i: number, k: "day"|"start"|"end", v: any) => setWindows(p => p.map((w, idx) => idx === i ? { ...w, [k]: v } : w));
  const removeWindow = (i: number) => setWindows(p => p.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!number.trim() || !location.trim() || durations.length === 0) {
      toast.error("Preencha sala, local e ao menos uma duração.");
      return;
    }
    if (notifyEnabled && !/\S+@\S+\.\S+/.test(notifyEmail.trim())) {
      toast.error("Informe um e-mail válido para notificações."); return;
    }
    for (const w of windows) {
      if (w.start >= w.end) { toast.error("Horário inicial deve ser antes do final."); return; }
    }
    setSaving(true);
    const payload = {
      room_number: number.trim(), name: name.trim() || null, location: location.trim(),
      video_call: video, active, available_durations: durations,
      notify_email_enabled: notifyEnabled,
      notification_email: notifyEnabled ? notifyEmail.trim() : null,
      google_calendar_enabled: gcalEnabled,
      google_meet_enabled: gcalEnabled && meetEnabled,
    };
    let roomId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("rooms").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("rooms").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); toast.error(error?.message ?? "Erro"); return; }
      roomId = data.id;
    }
    // Replace availability
    if (roomId) {
      await supabase.from("room_availability").delete().eq("room_id", roomId);
      if (windows.length) {
        await supabase.from("room_availability").insert(windows.map(w => ({
          room_id: roomId!, day_of_week: w.day, start_time: w.start + ":00", end_time: w.end + ":00",
        })));
      }
    }
    setSaving(false);
    toast.success(editing ? "Sala atualizada" : "Sala criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar sala" : "Nova sala"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Número *</Label><Input value={number} onChange={e=>setNumber(e.target.value)} placeholder="1" /></div>
            <div><Label>Nome (opcional)</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Sala de Reunião 1" /></div>
          </div>
          <div><Label>Local *</Label><Input value={location} onChange={e=>setLocation(e.target.value)} placeholder="2º andar, ala oeste" /></div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2"><Switch checked={video} onCheckedChange={setVideo} /><Label>Vídeo chamada</Label></div>
            <div className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} /><Label>Ativa</Label></div>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
              <Label>Notificar por e-mail a cada agendamento</Label>
            </div>
            {notifyEnabled && (
              <div>
                <Label htmlFor="notify-email" className="text-xs">E-mail para receber avisos</Label>
                <Input id="notify-email" type="email" value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="diretor@empresa.com" maxLength={255} />
                <p className="text-xs text-muted-foreground mt-1">Receberá uma cópia de toda nova reserva desta sala.</p>
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-muted-foreground" />
              <Switch checked={gcalEnabled} onCheckedChange={(v) => { setGcalEnabled(v); if (!v) setMeetEnabled(false); }} />
              <Label>Sincronizar com Google Calendar</Label>
            </div>
            {gcalEnabled && (
              <>
                <div className="flex items-center gap-2 pl-6">
                  <Switch checked={meetEnabled} onCheckedChange={setMeetEnabled} />
                  <Label>Gerar link do Google Meet automaticamente</Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Os eventos aparecem na agenda da conta Google conectada ao sistema. Se ainda não houver
                  conta conectada, é necessário autorizar o acesso no Google uma única vez.
                </p>
              </>
            )}
          </div>
          <div>
            <Label>Durações disponíveis *</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {DURATIONS.map(d => (
                <button key={d} type="button" onClick={() => toggleDuration(d)}
                  className={`px-3 py-1.5 rounded-md text-sm border-2 transition ${durations.includes(d) ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:border-secondary/40"}`}>
                  {formatDuration(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Disponibilidade (dias e horários)</Label>
              <Button size="sm" type="button" variant="outline" onClick={addWindow}><Plus className="size-3.5" />Adicionar</Button>
            </div>
            <div className="space-y-2">
              {windows.length === 0 && <p className="text-xs text-muted-foreground">Sem horários — esta sala não poderá ser agendada.</p>}
              {windows.map((w, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <select value={w.day} onChange={e => updateWindow(i, "day", Number(e.target.value))}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {DAYS_PT.map((n, idx) => <option key={idx} value={idx}>{n}</option>)}
                  </select>
                  <Input type="time" value={w.start} onChange={e => updateWindow(i, "start", e.target.value)} className="w-[110px]" />
                  <Input type="time" value={w.end} onChange={e => updateWindow(i, "end", e.target.value)} className="w-[110px]" />
                  <Button size="sm" variant="ghost" type="button" onClick={() => removeWindow(i)}><Trash2 className="size-3.5 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
