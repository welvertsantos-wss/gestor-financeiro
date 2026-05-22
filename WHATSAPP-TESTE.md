# WhatsApp - Meu Secretário

Esta etapa prepara o teste real do WhatsApp usando Meta WhatsApp Cloud API + Netlify Functions + Supabase.

## Importante

O deploy por arrastar ZIP no Netlify pode não ativar Functions. Para webhook real, use GitHub conectado ao Netlify ou Netlify CLI.

Webhook:

```text
https://SEU-SITE.netlify.app/.netlify/functions/whatsapp-webhook
```

## Variáveis secretas no Netlify

Em Netlify:

Site configuration -> Environment variables

Crie:

```text
WHATSAPP_VERIFY_TOKEN=crie_um_token_secreto_exemplo_meu_secretario_2026
WHATSAPP_ACCESS_TOKEN=token_temporario_ou_permanente_da_meta
WHATSAPP_PHONE_NUMBER_ID=id_do_numero_do_whatsapp_cloud_api
SUPABASE_URL=https://rlleyxvplvgemhtabfja.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_do_supabase
WHATSAPP_TEST_USER_ID=id_do_usuario_de_teste_no_supabase
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no `app.js`. Ela fica somente no Netlify.

## Onde pegar WHATSAPP_TEST_USER_ID

No Supabase:

Authentication -> Users -> clique no usuário -> copie o `User UID`.

Esse usuário receberá os lançamentos do teste do WhatsApp.

## Configurar webhook na Meta

No app da Meta/WhatsApp:

1. Vá em WhatsApp -> Configuration.
2. Em Callback URL, cole:

```text
https://SEU-SITE.netlify.app/.netlify/functions/whatsapp-webhook
```

3. Em Verify token, coloque o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.
4. Assine o campo `messages`.

## Frases para testar

```text
Gastei R$ 89,90 hoje no mercado pelo PIX Nubank
Recebi R$ 1500 hoje da Clínica Alfa no InfinitePay
Paguei R$ 320,50 internet pelo PIX Mercado Pago
```

O sistema deve responder no WhatsApp e lançar no app.

## Observação

Nesta primeira versão de teste o lançamento é direto. Depois podemos evoluir para confirmação:

```text
Confirmar lançamento?
Responder SIM para gravar.
```
