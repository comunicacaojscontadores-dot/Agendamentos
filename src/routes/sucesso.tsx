import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar } from "lucide-react";
import { formatDateBR, formatTime } from "@/lib/booking-utils";

export const Route = createFileRoute("/sucesso")({
  validateSearch: z.object({ token: z.string().uuid() }),
  component: SuccessPage,
});

function SuccessPage() {
  const { token } = Route.useSearch();
  const [info, setInfo] = useState<any>(null);
  useEffect(() => {
    supabase.rpc("get_booking_by_token", { _token: token }).then(({ data }) => {
      setInfo((data as any[])?.[0] ?? null);
    });
  }, [token]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Card className="p-8 text-center bg-surface">
          <div className="size-14 rounded-full bg-success/10 text-success grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="size-7" />
          </div>
          <h1 className="font-display text-2xl font-bold mb-2">Agendamento confirmado!</h1>
          <p className="text-muted-foreground">Você receberá um e-mail de confirmação com o link para cancelar, caso precise.</p>

          {info && (
            <div className="mt-6 p-4 rounded-lg bg-primary-soft text-left space-y-1.5">
              <div className="text-xs uppercase tracking-wider font-medium text-primary">Sua reserva</div>
              <div className="font-semibold">{info.room_name ?? `Sala ${info.room_number}`}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {formatDateBR(new Date(info.starts_at))} · {formatTime(new Date(info.starts_at))} – {formatTime(new Date(info.ends_at))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-center gap-3">
            <Link to="/"><Button variant="outline">Voltar ao início</Button></Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
