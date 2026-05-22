import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Calendar, DoorOpen, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const path = useLocation({ select: (l) => l.pathname });
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!path.startsWith("/admin")) return;
    if (!session) {
      if (path !== "/admin/login") navigate({ to: "/admin/login" });
      return;
    }
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle().then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [session, loading, navigate, path]);

  if (path === "/admin/login") return <Outlet />;

  if (loading || (session && isAdmin === null)) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  }
  if (!session) return <div className="min-h-screen grid place-items-center text-muted-foreground">Redirecionando…</div>;
  if (isAdmin === false) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Acesso restrito</h1>
          <p className="text-muted-foreground mt-1">Sua conta não possui permissão de administrador.</p>
          <Button className="mt-5" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/admin/login" }); }}>Sair</Button>
        </div>
      </div>
    );
  }

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
    <Link to={to} className={cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      path === to ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
    )}>
      <Icon className="size-4" /> {label}
    </Link>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 bg-sidebar text-sidebar-foreground p-4 flex flex-col gap-1 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2.5 mb-6 px-2">
          <div className="size-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Building2 className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-sm">JS Contadores</div>
            <div className="text-[10px] text-sidebar-foreground/60 -mt-0.5">Painel admin</div>
          </div>
        </Link>
        <NavItem to="/admin" icon={Calendar} label="Agendamentos" />
        <NavItem to="/admin/salas" icon={DoorOpen} label="Salas" />
        <NavItem to="/admin/administradores" icon={ShieldCheck} label="Administradores" />
        <div className="mt-auto pt-3 border-t border-sidebar-border">
          <div className="px-2 py-2 text-xs text-sidebar-foreground/60 truncate">{session.user.email}</div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/admin/login" }); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}
