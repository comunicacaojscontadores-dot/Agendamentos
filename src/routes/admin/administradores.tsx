import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAdmins, createAdminUser, deleteAdminUser } from "@/lib/admin-users.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const Route = createFileRoute("/admin/administradores")({ component: AdminsPage });

function AdminsPage() {
  const fetchAdmins = useServerFn(listAdmins);
  const createAdmin = useServerFn(createAdminUser);
  const removeAdmin = useServerFn(deleteAdminUser);

  const [admins, setAdmins] = useState<any[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const reload = () => {
    fetchAdmins({ data: undefined as any })
      .then((r) => setAdmins(r.admins))
      .catch(() => setAdmins([]));
  };
  useEffect(reload, [fetchAdmins]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await createAdmin({ data: { email: email.trim(), password } });
      if (res.ok) {
        toast.success("Administrador cadastrado");
        setEmail(""); setPassword("");
        reload();
      } else {
        toast.error(res.error);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    try {
      const res = await removeAdmin({ data: { userId } });
      if (res.ok) {
        toast.success("Administrador removido");
        setAdmins((prev) => (prev ?? []).filter((a) => a.user_id !== userId));
      } else {
        toast.error(res.error);
      }
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto">
      <AdminPageHeader
        icon={ShieldCheck}
        title="Administradores"
        subtitle="Cadastre novos administradores informando e-mail e senha. Cadastros públicos estão desativados."
      />

      <Card className="p-6 bg-surface shadow-soft mb-6">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><UserPlus className="size-4" /> Novo administrador</h2>
        <form onSubmit={handleCreate} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Senha (mín. 6)</Label>
            <Input id="password" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Cadastrar
          </Button>
        </form>
      </Card>

      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Atuais ({admins?.length ?? 0})
      </h2>
      {admins === null ? (
        <div className="text-center py-8 text-muted-foreground">Carregando…</div>
      ) : (
        <div className="grid gap-2">
          {admins.map((a) => (
            <Card key={a.user_id} className="p-4 bg-surface border-l-4 border-l-primary shadow-soft hover:shadow-card transition-shadow flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-md bg-primary-soft text-primary grid place-items-center shrink-0">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.email ?? a.user_id}</div>
                  <div className="text-xs text-muted-foreground">Desde {new Date(a.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={removingId === a.user_id}>
                    <Trash2 className="size-4 mr-1.5" /> Remover
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover este administrador?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A conta será excluída permanentemente e perderá o acesso ao painel.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRemove(a.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
