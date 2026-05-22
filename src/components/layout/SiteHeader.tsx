import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border/60 bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-soft group-hover:scale-105 transition-transform">
            <Building2 className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-foreground">JS Contadores</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">Agendamento de Salas</div>
          </div>
        </Link>
        <Link
          to="/admin"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Área administrativa
        </Link>
      </div>
    </header>
  );
}
