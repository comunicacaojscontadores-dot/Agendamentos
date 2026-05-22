// Sends booking emails (confirmation + reminder) via ZeptoMail HTTP API.
// Configure the following environment variables (Cloudflare secrets / .env):
//   ZEPTOMAIL_TOKEN        — "Send Mail Token" from ZeptoMail dashboard (e.g. "Zoho-enczapikey XXX")
//   ZEPTOMAIL_FROM_ADDRESS — verified sender address (e.g. "noreply@seudominio.com")
//   ZEPTOMAIL_FROM_NAME    — sender display name (e.g. "Agendamentos JS")
//   PUBLIC_BASE_URL        — public app URL without trailing slash (e.g. "https://app.seudominio.com")

const ZEPTOMAIL_API_URL = "https://api.zeptomail.com/v1.1/email";

function getConfig() {
  const token = process.env.ZEPTOMAIL_TOKEN ?? "";
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS ?? "";
  const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? "Agendamentos";
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return { token, fromAddress, fromName, baseUrl };
}

interface BaseArgs {
  bookingId: string;
  cancelToken: string;
  roomLabel: string;
  startsAt: Date;
  endsAt: Date;
  userName: string;
  recipients: string[];
  notes: string | null;
}

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  });
}

function buildHtml(args: BaseArgs, cancelUrl: string, opts: { title: string; intro: string }) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px">${opts.title}</h2>
    <p>Olá ${args.userName}, ${opts.intro}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0"><b>Sala:</b></td><td>${args.roomLabel}</td></tr>
      <tr><td style="padding:6px 0"><b>Início:</b></td><td>${fmt(args.startsAt)}</td></tr>
      <tr><td style="padding:6px 0"><b>Fim:</b></td><td>${fmt(args.endsAt)}</td></tr>
      ${args.notes ? `<tr><td style="padding:6px 0;vertical-align:top"><b>Obs.:</b></td><td>${args.notes.replace(/</g, "&lt;")}</td></tr>` : ""}
    </table>
    <p style="text-align:center;margin:28px 0">
      <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Cancelar reunião</a>
    </p>
    <p style="color:#666;font-size:12px;margin-top:24px">Você está recebendo este e-mail porque foi adicionado a um agendamento.</p>
  </div>`;
}

async function sendEmail(args: BaseArgs, subject: string, html: string) {
  const { token, fromAddress, fromName, baseUrl } = getConfig();

  if (!token) {
    console.warn("[email] ZEPTOMAIL_TOKEN ausente — pulei envio.");
    return;
  }
  if (!fromAddress) {
    console.warn("[email] ZEPTOMAIL_FROM_ADDRESS ausente — pulei envio.");
    return;
  }

  const recipients = Array.from(new Set(args.recipients.filter(Boolean)));
  if (recipients.length === 0) return;

  const payload = {
    from: { address: fromAddress, name: fromName },
    to: recipients.map((address) => ({ email_address: { address } })),
    subject,
    htmlbody: html,
  };

  try {
    const res = await fetch(ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] ZeptoMail falhou [${res.status}]: ${body}`);
    } else {
      console.log("[email] enviado", { subject, to: recipients, booking: args.bookingId });
    }
  } catch (e) {
    console.error("[email] erro ao chamar ZeptoMail:", e);
  }
}

export async function sendBookingConfirmation(args: BaseArgs) {
  const { baseUrl } = getConfig();
  const cancelUrl = `${baseUrl}/cancelar?token=${args.cancelToken}`;
  const html = buildHtml(args, cancelUrl, {
    title: "Agendamento confirmado",
    intro: "seu agendamento foi confirmado:",
  });
  await sendEmail(args, `Agendamento confirmado — ${args.roomLabel}`, html);
}

export async function sendBookingReminder(args: BaseArgs) {
  const { baseUrl } = getConfig();
  const cancelUrl = `${baseUrl}/cancelar?token=${args.cancelToken}`;
  const html = buildHtml(args, cancelUrl, {
    title: "Lembrete: seu agendamento começa em 15 minutos",
    intro: "este é um lembrete do seu agendamento que começa em breve:",
  });
  await sendEmail(args, `Lembrete (15 min) — ${args.roomLabel}`, html);
}
