import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

/**
 * Cabeçalho padrão das telas do painel: faixa em gradiente com ícone,
 * título e subtítulo — no mesmo estilo visual da tela de login.
 * O `action` (opcional) renderiza um botão à direita.
 */
export function AdminPageHeader({ icon: Icon, title, subtitle, action }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground p-6 sm:p-7 shadow-elevated mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="size-12 rounded-xl bg-white/10 backdrop-blur grid place-items-center shrink-0">
            <Icon className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            <p className="text-primary-foreground/70 text-sm mt-0.5">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}
