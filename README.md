# Agenda Pro

MVP de agendamento online para pequenos profissionais, iniciado para barbeiros. Não inclui pagamentos, WhatsApp, domínio próprio ou integrações de terceiros.

## O que está incluído

- Cadastro e login do profissional com Supabase Auth.
- Onboarding de estabelecimento com página pública em `/p/[slug]`.
- Cadastro, pausa e exclusão de serviços.
- Expediente semanal com até dois períodos por dia.
- Agenda de eventos e bloqueio de horários.
- Fluxo público para cliente selecionar serviço, data, horário, nome e telefone.
- Proteção contra horários sobrepostos diretamente no PostgreSQL.
- Row Level Security: cada profissional só lê e altera os dados de seu estabelecimento.

## Tecnologias

- Next.js + TypeScript + Tailwind CSS.
- Supabase (PostgreSQL e Auth).
- Testes nativos do Node para a lógica de disponibilidade.

## Configuração local

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No SQL Editor do Supabase, execute as migrations pela ordem do nome: primeiro [`202609150001_initial_schema.sql`](./supabase/migrations/202609150001_initial_schema.sql) e depois [`202609160001_multi_tenant_foundation.sql`](./supabase/migrations/202609160001_multi_tenant_foundation.sql). A segunda migration preserva seus dados e cria a base de organizações, unidades, equipe, papéis e agenda por profissional.
3. Em Authentication > URL Configuration, adicione `http://localhost:3000` como URL de redirecionamento durante o desenvolvimento.
4. Copie `.env.example` para `.env.local` e preencha a URL e a chave pública (*publishable*) do seu projeto.
5. Instale dependências e inicie o servidor:

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:3000`. Para validar as regras puras de agenda:

```bash
pnpm test
```

## Regra de conflito

O frontend lista somente slots que cabem no expediente, têm a duração do serviço e não colidem com eventos. A confirmação nunca depende apenas dessa lista: a função `book_public_appointment` valida o slot novamente e a constraint `calendar_events_no_professional_overlaps` do PostgreSQL rejeita qualquer sobreposição concorrente para o mesmo profissional.

Os testes SQL em [`supabase/tests`](./supabase/tests) são destinados ao Supabase CLI e cobrem conflito por profissional e isolamento de dados entre organizações.

## Notas do MVP

- O fuso inicial do negócio é `America/Sao_Paulo`.
- A grade de novos horários é de 15 minutos.
- O profissional pode criar apenas bloqueios diretamente; clientes só criam agendamentos pela função pública controlada.
- Cancelamento, notificações, pagamentos e integrações intencionalmente ficaram fora deste escopo.
