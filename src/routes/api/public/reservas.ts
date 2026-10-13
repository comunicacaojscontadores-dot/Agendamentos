import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Endpoint SOMENTE LEITURA para o Gerenciador de Atas.
// GET /api/public/reservas?de=AAAA-MM-DD&ate=AAAA-MM-DD
// Header: Authorization: Bearer <ATAS_API_TOKEN>
//
// Segurança: se ATAS_API_TOKEN não estiver configurado no Cloudflare, o
// endpoint fica DESLIGADO (503) — nunca aberto. Para revogar o acesso,
// basta apagar ou trocar o segredo no painel.
// Devolve só os campos combinados (sem observações, convidados ou tokens).

const MAX_DAYS = 31;
const BRT = "-03:00"; // Brasil sem horário de verão desde 2019

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Comparação em tempo constante (não revela a chave por diferença de tempo).
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00${BRT}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ISO no fuso de Brasília, ex.: 2026-10-01T14:00:00-03:00
function toBrt(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 19) + BRT;
}

export const Route = createFileRoute("/api/public/reservas")({
  server: {
    handlers: {
      GET: async () => {
        const token = process.env.ATAS_API_TOKEN;
        if (!token) return json({ ok: false, error: "disabled" }, 503);

        const request = getRequest();
        const auth = request.headers.get("authorization") ?? "";
        const sent = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!sent || !safeEqual(sent, token)) return json({ ok: false, error: "unauthorized" }, 401);

        const url = new URL(request.url);
        const from = parseDay(url.searchParams.get("de"));
        const toDay = parseDay(url.searchParams.get("ate"));
        if (!from || !toDay) {
          return json({ ok: false, error: "Informe de=AAAA-MM-DD e ate=AAAA-MM-DD" }, 400);
        }
        const to = new Date(toDay.getTime() + 24 * 3600_000); // "ate" inclusivo
        const days = (to.getTime() - from.getTime()) / (24 * 3600_000);
        if (days <= 0) return json({ ok: false, error: "'de' deve ser anterior ou igual a 'ate'" }, 400);
        if (days > MAX_DAYS) return json({ ok: false, error: `Período máximo de ${MAX_DAYS} dias` }, 400);

        const { data, error } = await supabaseAdmin
          .from("bookings")
          .select("id, starts_at, ends_at, user_name, user_email, status, rooms(name, room_number)")
          .gte("starts_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at", { ascending: true });

        if (error) {
          console.error("[reservas] query failed:", error);
          return json({ ok: false, error: "Falha ao consultar reservas" }, 500);
        }

        const reservas = (data ?? []).map((b) => {
          const room = (b as any).rooms;
          return {
            id: b.id,
            sala: room?.name ?? null,
            sala_numero: room?.room_number ?? null,
            inicio: toBrt(b.starts_at),
            fim: toBrt(b.ends_at),
            reservado_por_nome: b.user_name,
            reservado_por_email: b.user_email,
            status: b.status === "cancelled" ? "cancelada" : "confirmada",
          };
        });

        return json({ ok: true, de: url.searchParams.get("de"), ate: url.searchParams.get("ate"), total: reservas.length, reservas });
      },
    },
  },
});
