import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { cancelBookingByToken } from "@/lib/booking.functions";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDateBR, formatTime } from "@/lib/booking-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/cancelar")({
  validateSearch: z.object({ token: z.string().uuid() }),
  component: CancelPage,
});

function CancelPage() {
  const { token } = Route.useSearch();
  const [info, setInfo] = useState<any | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => {
    supabase.rpc("get_booking_by_token", { _token: token }).then(({ data }) => {
      setInfo((data as any[])?.[0] ?? null);
    });
  };
  useEffect(load, [token]);

 const handleCancel = async () => {
    setSubmitting(true);
    const result = await cancelBookingByToken({ data: { token } });
    setSubmitting(false);
    if (!result.ok) { toast.error("Não foi possível cancelar."); return; }
    toast.success("Agendamento cancelado.");
    setDone(true);
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-6 py-12">
        <Card className="p-8 bg-surface">
          {info === undefined ? (
            <div className="text-center text-muted-foreground py-6">Carregando…</div>
          ) : info === null ? (
            <div className="text-center">
              <AlertCircle className="size-10 mx-auto text-destructive mb-3" />
              <h1 className="font-display text-xl font-bold">Link inválido</h1>
              <p className="text-muted-foreground mt-1">Esse agendamento não foi encontrado.</p>
            </div>
          ) : info.status === "cancelled" || done ? (
            <div className="text-center">
              <CheckCircle2 className="size-10 mx-auto text-success mb-3" />
              <h1 className="font-display text-xl font-bold">Agendamento cancelado</h1>
              <p className="text-muted-foreground mt-1">O horário voltou a ficar disponível.</p>
              <Link to="/"><Button className="mt-5" variant="outline">Voltar ao início</Button></Link>
            </div>
          ) : (
            <>
              <XCircle className="size-10 mx-auto text-destructive mb-3" />
              <h1 className="font-display text-xl font-bold text-center">Cancelar agendamento?</h1>
              <div className="mt-5 p-4 rounded-lg bg-primary-soft">
                <div className="font-semibold">{info.room_name ?? `Sala ${info.room_number}`}</div>
                <div className="text-sm text-muted-foreground">{formatDateBR(new Date(info.starts_at))}</div>
                <div className="text-sm text-muted-foreground">{formatTime(new Date(info.starts_at))} – {formatTime(new Date(info.ends_at))}</div>
                <div className="text-sm mt-2">Solicitado por <strong>{info.user_name}</strong></div>
              </div>
              <div className="mt-6 flex gap-3 justify-center">
                <Link to="/"><Button variant="outline" disabled={submitting}>Manter agendamento</Button></Link>
                <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
                  {submitting ? "Cancelando…" : "Sim, cancelar"}
                </Button>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
