function getConfig() {
  return {
    token: process.env.ZEPTOMAIL_TOKEN ?? "",
    fromAddress: process.env.ZEPTOMAIL_FROM_ADDRESS ?? process.env.SMTP_FROM_ADDRESS ?? "",
    fromName: process.env.ZEPTOMAIL_FROM_NAME ?? process.env.SMTP_FROM_NAME ?? "Agendamentos",
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

function buildHtml(args: BaseArgs, cancelUrl: string | null, opts: { title: string; intro: string; showCancel: boolean }) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px">${opts.title}</h2>
    <p>${opts.intro}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0"><b>Agendado por:</b></td><td>${args.userName}</td></tr>
      <tr><td style="padding:6px 0"><b>Sala:</b></td><td>${args.roomLabel}</td></tr>
      <tr><td style="padding:6px 0"><b>Início:</b></td><td>${fmt(args.startsAt)}</td></tr>
      <tr><td style="padding:6px 0"><b>Fim:</b></td><td>${fmt(args.endsAt)}</td></tr>
      ${args.notes ? `<tr><td style="padding:6px 0;vertical-align:top"><b>Obs.:</b></td><td>${args.notes.replace(/</g, "&lt;")}</td></tr>` : ""}
    </table>
    ${opts.showCancel && cancelUrl ? `
    <p style="text-align:center;margin:28px 0">
      <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Cancelar reunião</a>
    </p>` : ""}
    <p style="color:#666;font-size:12px;margin-top:24px">Você está recebendo este e-mail porque foi adicionado a um agendamento.</p>
  </div>`;
}

async function sendEmail(args: BaseArgs, subject: string, html: string) {
  const { token, fromAddress, fromName } = getConfig();

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

  try {
    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
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
      console.error(`[email] ZeptoMail falhou [${response.status}]: ${body}`);
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
    intro: "Um novo agendamento foi realizado:",
    showCancel: true,
  });
  await sendEmail(args, `Agendamento confirmado — ${args.roomLabel}`, html);
}

export async function sendBookingReminder(args: BaseArgs) {
  const { baseUrl } = getConfig();
  const cancelUrl = `${baseUrl}/cancelar?token=${args.cancelToken}`;
  const html = buildHtml(args, cancelUrl, {
    title: "Lembrete: agendamento em 15 minutos",
    intro: "Este é um lembrete do agendamento que começa em breve:",
    showCancel: true,
  });
  await sendEmail(args, `Lembrete (15 min) — ${args.roomLabel}`, html);
}

export async function sendBookingCancellation(args: BaseArgs) {
  const html = buildHtml(args, null, {
    title: "Agendamento cancelado",
    intro: "O seguinte agendamento foi cancelado:",
    showCancel: false,
  });
  await sendEmail(args, `Agendamento cancelado — ${args.roomLabel}`, html);
}