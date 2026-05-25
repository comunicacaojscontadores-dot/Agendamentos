// Sends booking emails via SMTP (ZeptoMail or any SMTP provider).
// Configure the following environment variables in Cloudflare:
//   SMTP_HOST          — ex: smtp.zeptomail.com
//   SMTP_PORT          — ex: 465
//   SMTP_USER          — SMTP username / emailapikey
//   SMTP_PASSWORD      — SMTP password
//   SMTP_FROM_ADDRESS  — verified sender address
//   SMTP_FROM_NAME     — sender display name
//   PUBLIC_BASE_URL    — public app URL without trailing slash

function getConfig() {
  return {
    host: process.env.SMTP_HOST ?? "",
    port: parseInt(process.env.SMTP_PORT ?? "465"),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    fromAddress: process.env.SMTP_FROM_ADDRESS ?? "",
    fromName: process.env.SMTP_FROM_NAME ?? "Agendamentos",
    baseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
  };
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
  const { host, port, user, password, fromAddress, fromName } = getConfig();

  if (!host || !user || !password || !fromAddress) {
    console.warn("[email] Configuração SMTP incompleta — pulei envio.");
    return;
  }

  const recipients = Array.from(new Set(args.recipients.filter(Boolean)));
  if (recipients.length === 0) return;

  // Encode credentials for AUTH LOGIN
  const userB64 = btoa(user);
  const passB64 = btoa(password);
  const from = `${fromName} <${fromAddress}>`;
  const to = recipients.join(", ");

  // Build raw MIME message
  const boundary = `boundary_${Date.now()}`;
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    `--${boundary}--`,
  ].join("\r\n");

  try {
    // Use fetch to send via ZeptoMail SMTP API (HTTP wrapper)
    // Cloudflare Workers don't support raw TCP sockets, so we use ZeptoMail's HTTP API
    // with SMTP-style auth
    const response = await fetch(`https://api.zeptomail.com/v1.1/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `${user} ${password}`,
      },
      body: JSON.stringify({
        from: { address: fromAddress, name: fromName },
        to: recipients.map((address) => ({ email_address: { address } })),
        subject,
        htmlbody: html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[email] SMTP/ZeptoMail falhou [${response.status}]: ${body}`);
    } else {
      console.log("[email] enviado", { subject, to: recipients, booking: args.bookingId });
    }
  } catch (e) {
    console.error("[email] erro ao enviar:", e);
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