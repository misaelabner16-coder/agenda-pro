# Ammali — marca, domínio e recuperação de senha

## Alterações

- Marca visível e títulos: Ammali. IDs internos, banco, migrations e organizações permanecem intactos.
- `/recuperar-senha`: solicita recuperação pelo Supabase Auth/SMTP, com resposta neutra.
- `/auth/confirm`: valida o token/código; recuperação encaminha para `/redefinir-senha`; falhas voltam para solicitar outro link.
- `/redefinir-senha`: sessão validada no servidor, senha confirmada e mínimo de 8 caracteres; atualização apenas do usuário da sessão.
- Após a alteração, solicita revogação global das sessões de refresh e retorna ao login. JWTs já emitidos podem durar até sua expiração; não prometer revogação instantânea deles.
- Páginas de recuperação privadas, sem cache/indexação; sem e-mails, senhas ou tokens nos logs da aplicação.
- Sem migration, dependência nova ou mudança nas regras de agenda/RLS.

## Virada de domínio

1. Vercel, projeto existente `agenda-pro` → Settings → Domains: adicionar `www.ammaligestao.com` à Production. O domínio raiz com redirecionamento para `www` é opcional e ainda não foi configurado.
2. GoDaddy: usar EXATAMENTE os registros informados pela Vercel. Não alterar nameservers nem TXT/MX/DKIM/SPF do Resend. Não substituir outros registros sem identificar seu propósito.
3. Aguardar validação DNS e certificado HTTPS. Confirmar que o domínio novo serve o mesmo projeto, com Functions em `gru1` e Supabase `nuhxuhkunhuzljjjkzbx`.
4. Supabase Authentication → URL Configuration: manter callbacks antigos durante a transição; acrescentar `https://www.ammaligestao.com/auth/confirm?next=/onboarding` e `https://www.ammaligestao.com/auth/confirm?next=/redefinir-senha`. Acrescentar também o callback de recuperação equivalente na URL Vercel atual. Sem curingas abrangentes.
5. Só após HTTPS válido: Site URL do Supabase e `NEXT_PUBLIC_SITE_URL` da Vercel Production → `https://www.ammaligestao.com`. Não alterar `NEXT_PUBLIC_SUPABASE_URL`, chaves nem banco. Redeploy e testar cadastro/recuperação pelo domínio novo.
6. PKCE exige abrir o link no mesmo navegador/origem que solicitou o e-mail. Direcionar novos pedidos ao domínio canônico; não redirecionar callbacks antigos indiscriminadamente durante a transição. Cookies não migram entre domínios: é normal precisar entrar novamente.
7. Não mudar ainda os templates para um endereço novo se o domínio não estiver validado. Template de recuperação deve preservar `{{ .ConfirmationURL }}` (ou um callback `token_hash` devidamente configurado).
8. Resend: conferir rastreamento de cliques/aberturas para e-mails de autenticação. Verificar DMARC e MFA das contas Resend/GoDaddy separadamente.

## Estado confirmado após a virada

- O domínio `www.ammaligestao.com` tem CNAME específico da Vercel na GoDaddy, HTTPS válido, resposta 200 no login e na página pública `/p/barbearia-misael`. As respostas verificadas indicam `gru1::gru1`.
- O login no endereço antigo redireciona para `https://www.ammaligestao.com/login`. O domínio Vercel antigo continua associado ao projeto.
- O usuário informou que cadastrou no Supabase de São Paulo os dois callbacks exatos do novo domínio e o callback de recuperação do domínio antigo, definiu a `Site URL` nova, alterou `NEXT_PUBLIC_SITE_URL` de Production na Vercel e fez redeploy. Esses valores do painel não foram lidos diretamente pelo agente.
- O usuário testou a entrega do e-mail de recuperação pelo endereço novo e confirmou que o link abriu a tela de nova senha no mesmo navegador. A entrega do e-mail de confirmação de cadastro pelo SMTP já havia sido confirmada na URL antiga.
- O teste automatizado de 15 verificações passou também contra `https://www.ammaligestao.com`, com conta descartável removida. O teste gerou um token pela API administrativa; a entrega real por SMTP foi confirmada separadamente pelo usuário.
- O domínio raiz sem `www`, a entrega de um cadastro novo pelo domínio novo, o acesso administrativo autenticado e os backups continuam sem validação nesta tarefa.

## Rollback

Restaurar Site URL e NEXT_PUBLIC_SITE_URL para `https://agenda-pro-lovat.vercel.app` e fazer redeploy. Manter callbacks antigos permitidos e não excluir o domínio Vercel. Nenhum rollback de banco é necessário.

## Validação manual de entrega

Solicitar recuperação com uma conta de teste, abrir o e-mail no mesmo navegador, definir senha nova, confirmar que a senha antiga falha e a nova entra. Reutilizar o link deve falhar. Testar também link inválido, confirmação diferente e celular. Não compartilhar link/código/senha em prints ou chat.

## Evidência em 27/09/2026

- 33 testes unitários aprovados; lint, TypeScript e build de produção aprovados.
- 15 verificações de navegador contra build local e Auth real de São Paulo: marca/mobile, proteção sem sessão, no-store, link inválido, token real, senhas diferentes, alteração, senha antiga recusada, senha nova aceita, refresh anterior revogado e link consumido recusado. Zero erros de execução no navegador.
- A conta temporária exclusiva do teste foi removida; nenhuma conta existente foi alterada. O teste gera link por API administrativa sem enviar e-mail: não comprova entrega SMTP nem allowlist de redirect do painel.
- `agent-browser` não estava instalado; utilizado Playwright/Edge do runtime já disponível, sem nova dependência.
- A entrega de recuperação por SMTP e a emissão do domínio novo foram confirmadas em seguida, como registrado acima.
- Publicação `d717c9f`: Vercel reportou sucesso em `AoeBVdyG1HZ9jxBd24g5a6tED554`. As mesmas 15 verificações passaram na URL pública antiga depois do deploy. Resposta HTTP 200, no-store/noindex, CSP e execução `gru1::gru1` confirmadas. Fixture de produção removida. Logs autenticados da Vercel não disponíveis nesta sessão.
