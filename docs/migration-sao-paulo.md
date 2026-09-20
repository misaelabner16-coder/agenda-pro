# Etapa 2 — migração para São Paulo

Estado: dados migrados no destino e virada de produção pendente. O `vercel.json` com região `gru1` está preparado localmente, mas ainda não foi publicado.

## Escopo e limites

- Origem: projeto Supabase atual em `ca-central-1` (Canadá); Vercel em produção no domínio `agenda-pro-lovat.vercel.app`.
- A resposta dinâmica de `/p/barbearia-1` antes da migração apresentou `X-Vercel-Id: gru1::iad1::...`: a requisição entrou por São Paulo, mas a função executou em `iad1`.
- Destino: novo projeto Supabase em `sa-east-1` e Vercel Functions em `gru1` (São Paulo).
- O projeto Supabase antigo permanece intacto. Não alterar variáveis de produção antes da validação do destino.
- A opção do painel **Restore to new project** não atende à troca de região: ela mantém a região da origem. Usar exportação/restauração lógica.
- Não usar `supabase db push` sobre um banco restaurado antes de reconciliar o histórico de migrations. As duas migrations locais podem ter sido aplicadas manualmente.

### Destino criado — 2026-09-20

- Projeto: `Agenda Pro - São Paulo`
- Referência: `nuhxuhkunhuzljjjkzbx`
- Região: `sa-east-1` (São Paulo)
- Status inicial: `ACTIVE_HEALTHY`
- Custo confirmado: US$ 0/mês no plano atual
- Produção ainda aponta para a origem no Canadá. O destino recebeu as duas migrations e os dados públicos da origem; a virada na Vercel ainda não ocorreu.

## Inventário obrigatório da origem (somente leitura)

1. Confirmar versão do Postgres, extensões, funções, índices, constraints, políticas RLS, triggers e cron/webhooks.
2. Registrar contagens e conjuntos de IDs de `auth.users`, `organizations`, `organization_memberships`, `locations`, `professionals`, `services`, `location_hours`, `customers` e `calendar_events` (além das demais tabelas existentes).
3. Conferir histórico de `supabase_migrations`, configurações Auth (Site URL, redirects, confirmação de e-mail, templates, SMTP e provedores) e buckets/objetos do Storage.
4. Confirmar se há dados reais ou somente dados de teste. Preservar todos por padrão.

### Inventário inicial — 2026-09-18 00:33 UTC

Consulta somente de leitura na origem (`ca-central-1`, Postgres 17.6): 3 usuários Auth; 2 organizações; 2 associações; 2 unidades; 2 profissionais; 2 serviços; 9 registros de horários da unidade; 5 clientes; 6 eventos de agenda (todos confirmados). Tabelas legadas também contêm dados: 3 profiles, 1 business, 5 business_hours, 2 location_professionals, 9 professional_hours e 2 professional_services. Não há buckets/objetos Storage, secrets Vault nem registros de audit_logs.

Todas as tabelas `public` estão com RLS ativado; há 32 políticas `public` e a constraint `calendar_events_no_professional_overlaps` está presente. Extensões instaladas: `btree_gist`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault` e `uuid-ossp`.

**Risco confirmado:** não existe `supabase_migrations.schema_migrations` na origem, e a lista de migrations remotas está vazia. As migrations locais precisam ser reconciliadas com o schema restaurado; não devem ser reaplicadas automaticamente.

O deploy de produção mais recente da Vercel está `READY` no commit `8739838` (Etapa 1). A conexão de leitura da Vercel confirmou o projeto, mas não fornece acesso às configurações detalhadas da conta; a região de execução foi verificada pelo cabeçalho da resposta dinâmica.

A configuração local de `gru1` foi validada com 3 testes unitários, ESLint, TypeScript e build de produção do Next.js. Isso valida o repositório local, não a implantação na Vercel; o arquivo ainda não foi enviado ao GitHub.

O [changelog do Supabase](https://supabase.com/changelog.md) foi verificado em 2026-09-17: pinagem explícita de versões de extensões passou a ser ignorada e o schema `realtime` ficou bloqueado contra alterações. O procedimento não deve restaurar objetos gerenciados nesse schema nem presumir versões de extensões iguais entre projetos.

## Backup e ensaio

1. Preparar destino de backup protegido, fora do Git e da pasta sincronizada do projeto. Não registrar senhas ou chaves em documentos, logs ou histórico de comandos.
2. Exportar roles, schema e dados da origem conforme o guia oficial do Supabase. Incluir `auth` para preservar IDs, usuários e hashes de senha. Copiar objetos do Storage separadamente se existirem.
3. Registrar tamanho e checksums dos arquivos de backup. Verificar que os arquivos são legíveis e manter ao menos uma cópia protegida separada.
4. Criar o novo projeto especificamente em `sa-east-1`. Configurar extensões necessárias e restaurar o backup nele, sem apontar produção para o destino.
5. Repetir contagens e comparação de IDs; verificar RLS, funções SQL, constraints, índices e histórico de migrations. Os testes SQL existentes usam `pgtap`, que não está habilitado na origem; habilitá-lo somente no destino de teste e então executar isolamento e conflito.
6. Usar uma implantação de teste isolada para validar login, cadastro/confirmação, agenda, serviços, horários, bloqueios, agendamento público, fusos e concorrência. Não usar o domínio de produção nesta fase.

## Virada (somente após validação e autorização)

1. Anunciar uma janela curta de manutenção e impedir novas gravações/agendamentos.
2. Fazer exportação final da origem e atualizar o destino pelo procedimento já ensaiado. Revalidar contagens, IDs e testes críticos antes de liberar tráfego.
3. Configurar a região padrão das Vercel Functions como `gru1`; atualizar somente as variáveis de produção para URL/chave publicável do novo Supabase. Manter `NEXT_PUBLIC_SITE_URL` no domínio público.
4. Configurar no novo Supabase o Site URL e redirects de Auth; publicar e testar o domínio final.
5. Liberar gravações somente após smoke tests de login, cadastro, agenda, serviços, horários, bloqueios, agendamento público, RLS, timezone e conflitos.

## Rollback

- Antes de aceitar gravações no destino: reverter variáveis/implantação da Vercel para a origem e testar. A origem não terá sido modificada.
- Depois de aceitar gravações no destino: **não** apontar simplesmente de volta para a origem, pois novos agendamentos poderiam ser perdidos. Pausar gravações, reconciliar o delta de dados e só então decidir a reversão.
- Manter backups e origem disponíveis durante a janela de observação; não apagar o projeto antigo sem aprovação separada.

## Dependências ainda não atendidas

- Acesso administrativo verificado aos projetos Supabase e Vercel.
- Ferramentas de exportação/restauração (`supabase` CLI, PostgreSQL `psql`/`pg_dump` e, conforme o método, Docker) ou método equivalente validado.
- Senha de banco da origem fornecida somente por um meio local e protegido, nunca no chat ou no repositório; conferir também as credenciais do destino quando existir.
- Confirmação da organização de destino e do custo exibido pelo Supabase antes de criar o novo projeto.

### Ferramentas verificadas — 2026-09-20

- A CLI oficial do Supabase para Windows foi baixada somente para a pasta temporária e validada pelo checksum publicado (`84dbb4b75466065d4458eeda1cd6a95fff31ff33202ffcd8edac41819d0ce496`). Ela não foi adicionada ao repositório.
- O computador ainda não tem Docker Desktop, `psql` ou `pg_dump`. O comando oficial `supabase db dump` requer Docker Desktop para produzir os arquivos de roles, schema e dados.
- A CLI também precisa de autenticação interativa no terminal do usuário. O fluxo automático não é permitido no terminal não interativo do agente; não solicitar ou registrar tokens no chat.
- Projeto de destino criado em `sa-east-1` e local seguro para os backups.

Fontes: [migração com CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [migração de Auth](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects), [restauração para novo projeto](https://supabase.com/docs/guides/platform/clone-project), [regiões das Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region).
