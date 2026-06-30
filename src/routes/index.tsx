import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Video, ArrowRight, Calendar, CalendarDays, DoorOpen } from "lucide-react";

export const Route = createFileRoute("/")({ component: HomePage });

interface Room {
  id: string;
  room_number: string;
  name: string | null;
  location: string;
  video_call: boolean;
  available_durations: number[];
  active: boolean;
}

function HomePage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  useEffect(() => {
    supabase.from("rooms").select("*").eq("active", true).order("room_number").then(({ data }) => {
      setRooms((data ?? []) as Room[]);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-secondary text-primary-foreground p-8 md:p-12 mb-10 shadow-elevated">
          <CalendarDays className="absolute -right-8 -top-8 size-56 text-white/10 pointer-events-none" strokeWidth={1.25} />
          <div className="relative max-w-2xl">
            <Badge variant="secondary" className="mb-4 bg-white/10 backdrop-blur text-primary-foreground border-0 font-medium">
              <Calendar className="size-3 mr-1.5" /> Agendamento de salas
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Reserve uma sala em <span className="text-blue-200">poucos cliques</span>
            </h1>
            <p className="text-primary-foreground/80 text-lg">
              Selecione abaixo a sala que deseja agendar. Você escolhe a duração, o dia e o horário disponíveis.
            </p>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Salas disponíveis
            </h2>
            {rooms && rooms.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium">{rooms.length}</span>
            )}
          </div>
          {rooms === null ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0,1,2,3].map(i => <Card key={i} className="h-44 animate-pulse bg-muted" />)}
            </div>
          ) : rooms.length === 0 ? (
            <Card className="p-10 text-center bg-surface shadow-soft">
              <div className="size-12 rounded-xl bg-muted text-muted-foreground grid place-items-center mx-auto mb-3">
                <DoorOpen className="size-6" />
              </div>
              <p className="text-muted-foreground">Nenhuma sala cadastrada ainda. Entre em contato com o administrador.</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <Link
                  key={r.id}
                  to="/agendar/$roomId"
                  params={{ roomId: r.id }}
                  className="group"
                >
                  <Card className="p-6 h-full shadow-soft hover:shadow-elevated hover:-translate-y-1 hover:border-secondary/40 transition-all duration-200 bg-surface flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Sala {r.room_number}
                        </div>
                        <div className="font-display font-bold text-lg text-foreground mt-0.5">
                          {r.name ?? `Sala ${r.room_number}`}
                        </div>
                      </div>
                      <div className="size-9 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0 group-hover:bg-secondary group-hover:text-secondary-foreground group-hover:translate-x-0.5 transition-all">
                        <ArrowRight className="size-4" />
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground mt-auto">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{r.location}</span>
                      </div>
                      {r.video_call && (
                        <div className="inline-flex items-center gap-1.5 bg-success/10 text-success rounded-full px-2.5 py-1 text-xs font-medium">
                          <Video className="size-3.5 shrink-0" />
                          Vídeo chamada disponível
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
