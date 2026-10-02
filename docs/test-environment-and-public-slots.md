# Ammali: isolamento e horários públicos

Verificação realizada em 01/10/2026 (America/Sao_Paulo).

## Ambientes

| Ambiente | Código/URL | Supabase |
| --- | --- | --- |
| Production | main; https://www.ammaligestao.com | nuhxuhkunhuzljjjkzbx |
| Preview | codex/staging; https://agenda-pro-git-codex-staging-misaelabner16-8780.vercel.app | dbtxikkhzmqstuiudxko |
| Teste local desta execução | http://localhost:3000; build com VERCEL_ENV=preview | dbtxikkhzmqstuiudxko |

A resposta publicada de Production apresentou HTTP 200 e CSP connect-src para
o projeto de produção. O usuário confirmou no painel Vercel os valores de
NEXT_PUBLIC_SUPABASE_URL de Production e Preview. Os valores das chaves e do
SMTP no painel não foram lidos diretamente nesta execução.

O Preview publicado retornou 302 para o login da Vercel. A proteção foi mantida:
o fluxo de navegador descrito abaixo foi executado no app local contra o banco
real Ammali Testes, não no domínio protegido. Ainda é necessário conferir o
deployment atualizado e o fluxo no Preview autenticado.

## Horários ocupados

A consulta get_public_slot_states retorna apenas starts_at e status:
available, occupied ou blocked. Os horários seguem o expediente da unidade e
do profissional, a duração do serviço e intervalos de 15 minutos. Horários
passados e serviços que não cabem no expediente não são candidatos.

A disponibilidade livre continua sendo calculada pela função get_available_slots,
que também valida a reserva no banco. Os horários que cruzam uma reserva ficam
visíveis e desabilitados; bloqueios aparecem como Indisponível. Nenhum nome,
telefone, ID de agendamento ou token de gerenciamento é exposto pela consulta.

A API mantém slots com apenas horários livres e acrescenta slot_states. A resposta
não é armazenada em cache. Um conflito na reserva recarrega todos os horários da
data, pois uma reserva pode afetar várias opções de início.

## Evidências

- 35 testes de unidade/validação aprovados, incluindo recusa de produção nos scripts.
- TypeScript, ESLint e build aprovados.
- 10 verificações SQL aprovadas em transação revertida no Ammali Testes:
  duração, sobreposição, adjacência, bloqueios, consistência com a consulta livre,
  cancelamento, passado, permissão pública, privacidade e agenda suspensa.
- 26 verificações HTTP/SQL de sessão, isolamento entre organizações, reservas
  concorrentes, cancelamento concorrente e gateway aprovadas no Ammali Testes.
- 27 verificações completas UI/Auth/API/banco aprovadas: cadastro, bloqueio de
  login antes da confirmação, token real de signup, callback PKCE, onboarding,
  login, serviço, expediente, disponibilidade, reserva, painel, botões ocupados,
  rejeição de reserva duplicada, cancelamento e liberação do horário.
- Layout da agenda conferido em 390 px, sem overflow nem erros de execução.
- As contas e agendas descartáveis foram removidas. Consultas somente de leitura
  confirmaram ausência dos IDs/endereço/slug deste teste em produção.

O cadastro solicitou envio de e-mail ao Gmail autorizado usando um alias com
+ammali-e2e. O teste consumiu o token real desse cadastro no mesmo navegador.
Isso valida o token, o redirecionamento e o callback; não substitui a confirmação
do destinatário sobre chegada, idioma e botão na caixa de entrada.

## Executar os testes

Os scripts security-session-test.mjs, security-browser-test.mjs e
verify-password-recovery.mjs aceitam somente app local ou a origem exata do
Preview. É obrigatório --confirm-test-fixtures; os antigos flags de testes
em produção são recusados antes de obter credenciais.

Exemplos PowerShell (o CLI Supabase precisa estar autenticado):

```powershell
$env:NODE_USE_SYSTEM_CA='1'
node scripts/security-session-test.mjs --confirm-test-fixtures --gateway --expect-retired
node scripts/verify-password-recovery.mjs --confirm-test-fixtures

# Informe um Gmail seu autorizado para receber a confirmação da conta temporária.
$env:SECURITY_TEST_EMAIL='seu-email@gmail.com'
node scripts/verify-booking-flow.mjs --confirm-test-fixtures
```

O runner de fluxo completo injeta as credenciais de testes somente na memória
do processo, faz build e inicia seu próprio servidor local. Não salva senhas,
chaves ou tokens no repositório. Feche outro app na porta 3000 antes de executá-lo.

security-sql.ps1 usa testes por padrão. O modo EncryptedSnapshot dos antigos
scripts de release continua destinado ao backup de produção, mas exige o arquivo
security_snapshot.sql exato e rejeita migrações candidatas nessa modalidade.

.env.local continua separado dos deployments Vercel. Os valores de desenvolvimento
local ainda precisam ser configurados para uso manual; o runner acima não depende
da presença dessas chaves no arquivo. supabase/.temp não é versionado.

## Banco publicado e histórico

A migração 20261002001300_public_slot_states foi aplicada somente ao Ammali Testes.
Seu prefixo é o timestamp UTC gerado pelo CLI; a execução ocorreu em 01/10 no Brasil.

As migrações platform_manager_manual_billing e guard_suspended_onboarding foram
recuperadas, sem alterações, do histórico existente do Ammali Testes para
versionamento. Elas já estavam aplicadas nesse banco e não foram reaplicadas.
Não foram aplicadas em produção nesta tarefa.

O histórico de produção é diferente do histórico de testes, inclusive em versões
antigas. Não executar db push genérico em produção. A publicação desta feature
exige revisar e aplicar apenas a migração public_slot_states em produção antes de
publicar seu código; as migrações de cobrança são uma decisão de release separada.

Nenhum código, esquema, conta ou agendamento de produção foi alterado nesta execução.
O fluxo completo em produção não foi repetido com uma conta real nesta execução.
