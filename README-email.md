# Configuração de E-mail (ZeptoMail)

## Por que não enviava antes?

O arquivo `email.server.ts` tinha as credenciais **hardcoded** como strings vazias:

```ts
const ZEPTOMAIL_TOKEN = "";                          // ← vazio, nunca enviava
const ZEPTOMAIL_FROM = { address: "noreply@seudominio.com" }; // ← endereço fictício
```

Agora o código lê de **variáveis de ambiente** em tempo de execução via `process.env`.

---

## Variáveis necessárias

| Variável | Exemplo | Onde encontrar |
|---|---|---|
| `ZEPTOMAIL_TOKEN` | `Zoho-enczapikey abc123...` | ZeptoMail → Mail Agents → Send Mail Token |
| `ZEPTOMAIL_FROM_ADDRESS` | `noreply@seudominio.com` | ZeptoMail → Email Addresses (deve estar verificado) |
| `ZEPTOMAIL_FROM_NAME` | `Agendamentos JS` | Nome de exibição livre |
| `PUBLIC_BASE_URL` | `https://app.seudominio.com` | URL do seu deploy (sem barra no final) |

> ⚠️ O `ZEPTOMAIL_TOKEN` deve incluir o prefixo completo, ex.: `"Zoho-enczapikey XXXX"`.

---

## Como configurar

### Desenvolvimento local (Wrangler)

1. Copie o exemplo:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
2. Preencha os valores reais em `.dev.vars`.
3. O Wrangler lê `.dev.vars` automaticamente em `wrangler dev`.

### Produção (Cloudflare Workers via GitHub)

Adicione os secrets no painel da Cloudflare:

```bash
wrangler secret put ZEPTOMAIL_TOKEN
wrangler secret put ZEPTOMAIL_FROM_ADDRESS
wrangler secret put ZEPTOMAIL_FROM_NAME
wrangler secret put PUBLIC_BASE_URL
```

Ou via **Cloudflare Dashboard** → Workers & Pages → seu worker → Settings → Variables and Secrets.

### Banco de dados (Supabase)

O banco é o **Supabase**. As variáveis abaixo ficam como secrets no Cloudflare e apontam para o projeto atual:
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_PUBLISHABLE_KEY` — chave anon (pública)
- `SUPABASE_SERVICE_ROLE_KEY` — chave service_role (secreta; usada só no servidor)

---

## Testando localmente

Após configurar `.dev.vars`, faça um agendamento e observe os logs do `wrangler dev`.
Você deve ver:

```
[email] enviado { subject: 'Agendamento confirmado — ...', to: [...], booking: '...' }
```

Se aparecer:
- `[email] ZEPTOMAIL_TOKEN ausente` → variável não carregada
- `[email] ZeptoMail falhou [401]` → token inválido
- `[email] ZeptoMail falhou [422]` → endereço remetente não verificado no ZeptoMail
