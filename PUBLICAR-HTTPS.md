# Publicar em HTTPS

Esta aplicação é estática: basta publicar a pasta com estes arquivos em uma hospedagem HTTPS.

## Opção mais simples: Netlify Drop

1. Acesse `https://app.netlify.com/drop`.
2. Arraste a pasta do projeto ou um `.zip` com os arquivos.
3. Aguarde a publicação.
4. O Netlify entrega um link `https://...netlify.app`.

Depois disso, o Android deve permitir instalar como PWA com mais consistência.

## Opção profissional: domínio próprio

1. Publique em Netlify, Vercel, Cloudflare Pages ou GitHub Pages.
2. Configure um domínio, por exemplo `financeiro.suaempresa.com.br`.
3. Ative o HTTPS automático da plataforma.
4. Teste o app no celular e use a opção `Instalar app`.

## Arquivos que precisam ir para a hospedagem

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `icon.svg`
- `icon-192.png`
- `icon-512.png`
- `base-planilha-teste.json`

## Observação importante

Os dados continuam locais no aparelho pelo IndexedDB. Para uso profissional com vários usuários, o próximo passo é sincronizar com banco em nuvem.
