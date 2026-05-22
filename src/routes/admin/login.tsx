import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({ component: LoginPage });

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error("E-mail ou senha incorretos"); return; }
    navigate({ to: "/admin" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary to-primary/80 px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="size-12 rounded-xl bg-white/10 backdrop-blur text-primary-foreground grid place-items-center mx-auto mb-3">
            <Building2 className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-primary-foreground">JS Contadores</h1>
          <p className="text-primary-foreground/70 text-sm mt-1">Painel administrativo</p>
        </div>
        <Card className="p-6 bg-surface">
          <form onSubmit={handle} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </Card>
        <p className="text-xs text-primary-foreground/60 text-center mt-4">
          Acesso restrito. Solicite credenciais a um administrador.
        </p>
        <div className="text-center mt-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/80 hover:text-primary-foreground">
            <ArrowLeft className="size-3.5" /> Voltar para agendamentos
          </Link>
        </div>
      </div>
    </div>
  );
}
