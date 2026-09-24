# Reformulação visual — setembro de 2026

- Paleta petróleo, superfícies claras quentes e contraste nas ações principais.
- Painel com menu lateral no desktop e menu expansível no celular, sem módulos novos.
- Agenda diária com faixa semanal, data direta, anterior/próximo/hoje, horários de início/fim e ações recolhidas por atendimento.
- Consulta limitada ao entorno da data escolhida, preservando filtros de organização/unidade e RLS. Conversão pelo timezone da unidade; aviso explícito caso o limite de resultados seja atingido.
- Bloqueios aplicáveis ao dia visíveis antes dos atendimentos; edição das regras permanece na mesma página.
- Reserva com apresentação do estabelecimento, etapas numeradas, serviços selecionáveis e acesso visível a Meu agendamento.
- Link privado da confirmação, APIs, mutações, cancelamento e regras de conflito preservados. Nenhuma migration ou dependência adicionada.

## Validação

8 testes unitários (disponibilidade e navegação de datas/timezone), ESLint, TypeScript e build de produção. Conferência visual de componentes reais com dados fictícios em 390px e 1440px, sem overflow horizontal. Não representa teste autenticado nem reserva real.

O `.env.local` ainda aponta ao projeto antigo no Canadá e não é enviado ao Git/Vercel. A publicação autorizada usa build remoto e variáveis de produção da Vercel. O build recusa produção quando `NEXT_PUBLIC_SUPABASE_URL` não corresponde ao projeto de São Paulo `nuhxuhkunhuzljjjkzbx`; a execução continua configurada em `gru1`. Uma futura migração exige atualizar explicitamente essa proteção em `next.config.ts`.

Dois testes adicionais validam essa proteção de publicação (10 testes no total). O fluxo autenticado completo permanece pendente de conferência pelo proprietário.

## Conferência após publicar

Abrir o menu no celular, navegar entre as abas, consultar dias diferentes na Agenda, expandir Detalhes e ações. Abrir a página pública, selecionar serviço/data, confirmar uma reserva de teste e conferir o link privado. Verificar cancelamento com uma reserva de teste. Não confundir a lista de compromissos da agenda com a disponibilidade pública.

## Referências de produto

Organização centrada na agenda e reserva guiada, sem copiar marcas, recursos pagos ou módulos extras: [Fresha](https://www.fresha.com/for-business/features/scheduling), [Booksy](https://biz.booksy.com/en-gb/features/calendar-scheduling), [Vagaro](https://www.vagaro.com/pro/calendar), [Zenoti](https://www.zenoti.com/salon-management-software/appointment-scheduling), [Phorest](https://www.phorest.com/gb/features/).
