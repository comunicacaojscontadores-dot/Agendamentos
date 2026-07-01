import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Tempo de inatividade até deslogar automaticamente (segurança). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const IDLE_KEY = "js-admin-last-activity";

/** Marca o momento da última atividade. Chamar no login e a cada interação. */
export function markActivity() {
  try {
    localStorage.setItem(IDLE_KEY, String(Date.now()));
  } catch {
    /* localStorage indisponível — ignora */
  }
}

/**
 * Desloga automaticamente após IDLE_TIMEOUT_MS sem interação do usuário.
 * Como a última atividade fica salva no navegador, também funciona quando a
 * aba é fechada e reaberta mais tarde: ao abrir, se o tempo já passou, encerra.
 *
 * @param enabled  Só ativa quando há sessão (usuário logado).
 * @param onLogout Callback chamado após o logout (ex.: avisar e ir pro login).
 */
export function useIdleLogout(enabled: boolean, onLogout?: () => void) {
  const cbRef = useRef(onLogout);
  cbRef.current = onLogout;

  useEffect(() => {
    if (!enabled) return;

    let lastWrite = 0;
    const touch = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) {
        // grava no máximo a cada 5s pra não pesar
        lastWrite = now;
        try {
          localStorage.setItem(IDLE_KEY, String(now));
        } catch {
          /* ignora */
        }
      }
    };

    const check = async () => {
      const last = Number(localStorage.getItem(IDLE_KEY) || 0);
      if (last > 0 && Date.now() - last > IDLE_TIMEOUT_MS) {
        try {
          localStorage.removeItem(IDLE_KEY);
        } catch {
          /* ignora */
        }
        await supabase.auth.signOut();
        cbRef.current?.();
      }
    };

    // Se ainda não há marca (ex.: sessão restaurada sem login recente), inicia agora.
    if (!localStorage.getItem(IDLE_KEY)) touch();

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    check(); // confere assim que entra
    const interval = window.setInterval(check, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
