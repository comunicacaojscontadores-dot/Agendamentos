import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Video, ArrowRight, Calendar } from "lucide-react";

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
        <section className="mb-12 max-w-2xl">
          <Badge variant="secondary" className="mb-4 bg-primary-soft text-primary border-0 font-medium">
            <Calendar className="size-3 mr-1.5" /> Agendamento de salas
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Reserve uma sala em <span className="text-secondary">poucos cliques</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Selecione abaixo a sala que deseja agendar. Você escolhe a duração, o dia e o horário disponíveis.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Salas disponíveis
          </h2>
          {rooms === null ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0,1,2,3].map(i => <Card key={i} className="h-44 animate-pulse bg-muted" />)}
            </div>
          ) : rooms.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma sala cadastrada ainda. Entre em contato com o administrador.
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
                  <Card className="p-6 h-full hover:shadow-elevated hover:-translate-y-0.5 hover:border-secondary/40 transition-all duration-200 bg-surface">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Sala {r.room_number}
                        </div>
                        <div className="font-display font-bold text-lg text-foreground mt-0.5">
                          {r.name ?? `Sala ${r.room_number}`}
                        </div>
                      </div>
                      <div className="size-8 rounded-md bg-primary-soft text-primary grid place-items-center group-hover:bg-secondary group-hover:text-secondary-foreground transition-colors">
                        <ArrowRight className="size-4" />
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{r.location}</span>
                      </div>
                      {r.video_call && (
                        <div className="flex items-center gap-2 text-success">
                          <Video className="size-3.5 shrink-0" />
                          <span>Vídeo chamada disponível</span>
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
