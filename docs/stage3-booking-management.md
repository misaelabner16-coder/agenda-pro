# Stage 3 — gestão de agendamentos

## Entregue

- Cancelamento administrativo mantém o agendamento no histórico com status `cancelled`, motivo, data e autor.
- Clientes cancelam somente pelo link privado emitido após cada novo agendamento. O banco armazena apenas o hash do token.
- Cada unidade define a antecedência mínima, em minutos, para o cancelamento público.
- Clientes fixos suportam recorrência semanal, quinzenal ou mensal. Quando o dia mensal não existe, por exemplo dia 31 em fevereiro, aquele mês é pulado.
- O painel permite cancelar uma ocorrência pela agenda ou uma série inteira pela página **Clientes**. O cancelamento da série libera somente as ocorrências futuras.
- `misael.abner16@gmail.com` foi incluído como administrador global da plataforma. Em `/admin`, esse administrador pode ver empresas e clientes, conceder acesso a uma pessoa já cadastrada e desativar um acesso sem apagar histórico.

## Operação

1. No dashboard, abra **Configurações** e informe a antecedência de cancelamento.
2. Em **Clientes**, cadastre um cliente fixo. Informe data inicial, horário, serviço e frequência. Data final e quantidade são opcionais; sem ambas, o sistema cria as próximas 24 ocorrências para evitar uma série infinita sem limite.
3. O cliente recebe o botão **Gerenciar ou cancelar agendamento** depois da confirmação. Esse é o link privado daquela reserva.
4. Para adicionar acesso globalmente, abra `/admin`, informe o e-mail de alguém que já criou conta, escolha a empresa e a função.

## Segurança

- Funções administrativas e de recorrência exigem usuário autenticado e autorização no servidor.
- Funções públicas são restritas ao fluxo de agendamento e ao token aleatório de gerenciamento.
- A migração `20260921010312_tighten_function_permissions.sql` remove permissões anônimas das funções internas.
- O Supabase Advisor ainda lista as funções públicas como `SECURITY DEFINER`; isso é esperado porque elas precisam atender visitantes sem login e validam slug, disponibilidade ou token internamente.

## Validação manual recomendada

1. Crie um agendamento público e abra o link de gerenciamento exibido ao final.
2. Em **Configurações**, defina 24 horas; tente cancelar uma reserva dentro desse prazo e confirme o bloqueio.
3. Cancele uma reserva com antecedência suficiente e confirme que o horário volta a aparecer na disponibilidade.
4. Cadastre uma recorrência mensal para dia 31 e confirme que fevereiro é pulado.
5. Entre com `misael.abner16@gmail.com` e confirme a aba **ADM** no dashboard e a rota `/admin`.
