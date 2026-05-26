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

function buildHtml(args: BaseArgs, cancelUrl: string | null, opts: { title: string; intro: string; showCancel: boolean; accentColor: string }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:${opts.accentColor};padding:28px 40px;text-align:center">
            <img src="https://jscontadores.com.br/wp-content/uploads/2026/05/cropped-logo-azul-scaled-1-2048x561.png"
                 alt="JS Contadores" width="200" style="display:block;margin:0 auto;filter:brightness(0) invert(1)">
          </td>
        </tr>

        <!-- Faixa título -->
        <tr>
          <td style="background:#f8f9fc;padding:20px 40px;border-bottom:3px solid ${opts.accentColor}">
            <h1 style="margin:0;font-size:20px;color:#1a1a2e;font-weight:700">${opts.title}</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#666">${opts.intro}</p>
          </td>
        </tr>

        <!-- Detalhes -->
        <tr>
          <td style="padding:28px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
                  <span style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Agendado por</span><br>
                  <span style="font-size:15px;color:#1a1a2e;font-weight:600">${args.userName}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
                  <span style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Sala</span><br>
                  <span style="font-size:15px;color:#1a1a2e;font-weight:600">${args.roomLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
                  <span style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Início</span><br>
                  <span style="font-size:15px;color:#1a1a2e;font-weight:600">${fmt(args.startsAt)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;${args.notes ? "border-bottom:1px solid #f0f0f0" : ""}">
                  <span style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Fim</span><br>
                  <span style="font-size:15px;color:#1a1a2e;font-weight:600">${fmt(args.endsAt)}</span>
                </td>
              </tr>
              ${args.notes ? `
              <tr>
                <td style="padding:10px 0">
                  <span style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Observações</span><br>
                  <span style="font-size:15px;color:#1a1a2e">${args.notes.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</span>
                </td>
              </tr>` : ""}
            </table>
          </td>
        </tr>

        <!-- Botão cancelar -->
        ${opts.showCancel && cancelUrl ? `
        <tr>
          <td style="padding:0 40px 28px;text-align:center">
            <a href="${cancelUrl}"
               style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">
              Cancelar reunião
            </a>
          </td>
        </tr>` : ""}

        <!-- Rodapé -->
        <tr>
          <td style="background:#f8f9fc;padding:20px 40px;text-align:center;border-top:1px solid #eee">
            <p style="margin:0;font-size:12px;color:#999">
              JS Contadores — Sistema de Agendamento de Salas<br>
              Você recebeu este e-mail porque foi adicionado a um agendamento.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
    title: "Agendamento confirmado ✓",
    intro: "Um novo agendamento foi realizado com sucesso.",
    showCancel: true,
    accentColor: "#1e40af",
  });
  await sendEmail(args, `Agendamento confirmado — ${args.roomLabel}`, html);
}

export async function sendBookingReminder(args: BaseArgs) {
  const { baseUrl } = getConfig();
  const cancelUrl = `${baseUrl}/cancelar?token=${args.cancelToken}`;
  const html = buildHtml(args, cancelUrl, {
    title: "Lembrete: agendamento em 15 minutos ⏰",
    intro: "Seu agendamento começa em breve.",
    showCancel: true,
    accentColor: "#d97706",
  });
  await sendEmail(args, `Lembrete (15 min) — ${args.roomLabel}`, html);
}

export async function sendBookingCancellation(args: BaseArgs) {
  const html = buildHtml(args, null, {
    title: "Agendamento cancelado",
    intro: "O seguinte agendamento foi cancelado.",
    showCancel: false,
    accentColor: "#dc2626",
  });
  await sendEmail(args, `Agendamento cancelado — ${args.roomLabel}`, html);
}