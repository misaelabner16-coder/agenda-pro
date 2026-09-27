# Correções de segurança — andamento por fase

Última atualização da publicação (27/09/2026): aplicação `bb0a131` publicada; funções antigas de gravação direta de reservas desativadas em São Paulo após validação em produção. Consulte a seção final para as evidências atuais. As anotações das fases anteriores descrevem a situação no momento de sua execução, não necessariamente a situação atual.

## Fase 1: autorização e isolamento

Branch: `codex/security-hardening`. Base: `9e42932`.

Migration preparada: `20260925230540_security_phase1_authorization.sql`.
**Aplicada em São Paulo em 26/09/2026, após aprovação explícita. Naquele momento, a aplicação ainda não havia sido publicada.**

Alterações:

- As verificações de vínculo e de organização ativa passaram a valer em todos os caminhos de acesso à agenda, inclusive quando o profissional ainda tem o mesmo ID de usuário após a remoção do vínculo com a organização.
- Políticas antigas baseadas em empresas foram desativadas sem excluir suas tabelas ou registros.
- Removidas as permissões de `INSERT`/`UPDATE` direto em eventos e de gravação direta em séries de agendamentos. `DELETE` continua autorizado apenas para bloqueios; agendamentos usam funções de cancelamento.
- Removidas as permissões herdadas, tanto da tabela quanto da coluna, para alterar o e-mail do perfil; a edição de `full_name` permanece disponível.
- A nova RPC de administração global concede acesso por correspondência exata com um e-mail confirmado no Supabase Auth, não por `profiles.email`.
- O e-mail exibido acompanha alterações posteriores do e-mail no Auth.
- Consultas a vínculos e profissionais não permitem mais contornar a revogação do vínculo.

### Evidências obtidas (São Paulo, 26/09/2026)

Projeto: `nuhxuhkunhuzljjjkzbx`, PostgreSQL 17.6.

1. A suíte de regressão executada no banco ainda não corrigido falhou, como esperado, no teste `Legacy business cannot authorize B service` — vínculo antigo não deve autorizar serviço da empresa B. O `INSERT` entre organizações foi aceito. A exceção desfez toda a transação com os registros de teste.
2. A migration candidata e os registros de teste foram executados em uma única transação encerrada com `ROLLBACK`: **49 verificações passaram**, incluindo isolamento A × B, profissional removido, acesso anônimo, e-mail de perfil imutável, falsificação do e-mail exibido, consulta ao Auth confirmado e permissões de eventos.
3. O teste SQL de revogação mantém a mesma identidade do JWT antes e depois da remoção. Em seguida, `scripts/security-session-test.mjs` passou em **11 verificações HTTP** com duas contas temporárias do Auth: login real com senha, criação inicial da agenda, isolamento A × B, gravações proibidas, exclusão do vínculo e reutilização do exato JWT assinado anteriormente. Esse JWT perdeu imediatamente acesso à agenda, ao profissional, à função auxiliar e à exclusão de bloqueios. As duas organizações e os usuários temporários foram removidos ao final. Credenciais administrativas foram usadas apenas para criar e limpar os registros de teste, nunca para comprovar autorização.
4. **10 testes Node existentes passaram**; TypeScript (`--noEmit --incremental false`), ESLint e `git diff --check` também passaram.
5. Uma consulta posterior encontrou **0 organizações temporárias de auditoria persistidas**, **0 divergências entre e-mails de perfil e Auth** e confirmou que a política antiga ainda existia, pois a execução candidata havia sido revertida.
6. A aplicação permanente por `scripts/apply-security-phase1.ps1 -ConfirmApply` preservou todos os **11 registros históricos de migrations**, acrescentando somente `20260925230540` de forma atômica. As **49 verificações SQL passaram novamente no schema aplicado**, sem reaplicar a definição candidata.
7. Os verificadores de segurança do Supabase foram executados. APIs acessíveis com `SECURITY DEFINER` exigem as verificações explícitas de autorização documentadas; não se devem remover permissões necessárias apenas para silenciar alertas. Permaneceram os alertas externos de proteção contra senhas vazadas desativada e `btree_gist` no schema `public`; sua avaliação deve preservar a constraint contra sobreposição.

Comando usado para validar uma migration candidata:

```powershell
./scripts/security-sql.ps1 -SqlFile ./supabase/tests/security_phase1.test.sql `
  -CandidateMigration ./supabase/migrations/20260925230540_security_phase1_authorization.sql
```

Após a aplicação permanente, execute a mesma suíte sem `-CandidateMigration`. A suíte sempre reverte seus registros de teste com nomes aleatórios. Não teste RLS usando `service_role`.

### Cópia de segurança e pré-requisito de publicação

Uma cópia lógica dos dados da aplicação, usuários/identidades do Auth, funções, políticas, constraints, permissões de acesso, colunas, gatilhos e histórico de migrations foi salva em:

`C:\Users\misael\AppData\Local\AgendaPro\SecurityBackups\sao-paulo-20260926-160406.dpapi`

O arquivo é protegido pelo Windows DPAPI para o usuário atual do Windows. A criptografia e a descriptografia foram verificadas. **Não é um backup físico completo do Supabase e não foi restaurado em outro banco.** Arquivos do Storage e configurações da plataforma não estão incluídos. Mantenha o arquivo privado; não envie seu conteúdo descriptografado ao Git ou a outros serviços.

`supabase db push --dry-run --skip-vault` falhou porque versões históricas das migrations remotas diferem dos nomes locais:

| Nome | Versão local | Versão remota |
|---|---|---|
| stage3_booking_management | 20260921003735 | 20260921005902 |
| tighten_function_permissions | 20260921010312 | 20260921010452 |
| revoke_trigger_function_access | 20260921010839 | 20260921010902 |
| allow_professionals_to_manage_customers | 20260921011437 | 20260921011516 |

Os dois primeiros scripts de schema também não aparecem no histórico remoto. Seus objetos existem, o que é compatível com a configuração manual anterior. **Não** marque registros existentes como revertidos, reaplique migrations iniciais, use `--include-all` ou renomeie arquivos antigos já aplicados apenas para silenciar a CLI. Nenhuma migration histórica nem registro anterior foi alterado nesta correção.

Procedimento utilizado: aplicar apenas a **nova** migration revisada e registrar sua versão na mesma transação, preservando o histórico anterior. A suíte posterior à aplicação passou. A nova ação administrativa foi registrada no commit `f65eee3`; naquele momento ainda não estava publicada na Vercel. O `db push` comum continua bloqueado até uma conciliação separada do histórico inicial.

### Trabalho que ainda faltava ao encerrar a fase 1

- Publicar a ação administrativa correspondente junto à versão revisada da aplicação.
- Fase 2: integridade da agenda, cópias históricas dos dados, recorrência, chave estrangeira da série e concorrência.
- Fase 3: redirecionamentos, cabeçalhos, links privados, entradas e erros controlados.
- Fase 4: atualização pontual de dependências e verificações completas de build.
- Fase 5: proteção contra abuso que cubra RPCs diretas, não apenas a Vercel.
- Fase 6: registros de auditoria, privacidade, separação de ambientes e checklist operacional.

## Fase 2: integridade dos agendamentos

A migration `20260926191023_security_phase2_booking_integrity.sql` foi aplicada em São Paulo após validação de regressão com reversão integral dos testes, preservando os 12 registros anteriores do histórico. Cópia criptografada anterior à aplicação: `sao-paulo-20260926-161745.dpapi`, no diretório citado acima.

- **B1:** o cálculo interno compartilhado de disponibilidade usa a duração e o profissional originais ao reagendar. A interface passou a consultar um endpoint de disponibilidade autorizado pelo token privado. As cópias históricas de preço, duração e nome permanecem inalteradas. Editar o serviço não pode gerar uma verificação de disponibilidade mais curta seguida de uma reserva mais longa que ultrapasse o expediente.
- **B3:** o agendamento público reutiliza o cliente identificado pelo telefone normalizado sem sobrescrever seu nome no cadastro. O nome informado fica apenas na cópia histórica do agendamento.
- **B4:** cancelamento, reagendamento e cancelamento de série obtêm travas na mesma ordem — primeiro profissional, depois registro — e verificam novamente o status. Cancelamentos duplicados não geram registros duplicados da mudança de estado.
- **B5:** chave estrangeira composta por organização e série; obrigatoriedade de duração e preço na cópia histórica do serviço.
- **Recorrência:** trava por profissional e nova verificação de disponibilidade na função interna de gravação; validação explícita de entradas nulas e reversão de toda a transação se qualquer ocorrência conflitar.
- Preservada a constraint de exclusão por profissional. O cancelamento continua lógico, sem exclusão física.
- **A5/antiabuso não é resolvido por verificações de integridade**; foi tratado na fase 5.

Evidências: **49 verificações SQL da fase 1 + 28 da fase 2 passaram após a aplicação**, com reversão dos dados de teste. O teste HTTP ampliado com sessão assinada passou em **19 verificações**, incluindo duas reservas realmente simultâneas por RPC anônima direta — uma aceita e outra com erro `23P01` —, existência de apenas um cliente/agendamento ao final, cancelamento simultâneo com um sucesso e uma recusa por estado final, um único registro de auditoria e outro profissional autorizado a atender na mesma unidade e horário. Os registros temporários foram removidos. TypeScript e ESLint passaram. Naquele momento, as alterações de interface e rota de reagendamento ainda não estavam publicadas.

## Fase 3: segurança web

- **B2:** a validação de redirecionamento rejeita destinos relativos a protocolo, barras invertidas — inclusive codificadas — e caracteres de controle. A confirmação aceita apenas tipos de OTP suportados.
- **B7:** nonce CSP aleatório de 256 bits por requisição; scripts com `strict-dynamic`, sem `unsafe-inline`/`eval` em produção; restrições de enquadramento, objetos e URL base; cabeçalhos `nosniff`, de permissões e de referência. A renderização raiz passou a ocorrer por requisição, impedindo reutilização estática de HTML com nonce. Consequência: a página inicial também é renderizada dinamicamente. Estilos inline existentes da agenda continuam permitidos, mas scripts inline sem autorização não. A Vercel já fornece HSTS.
- **B8:** respostas de gerenciamento, autenticação e API usam `no-store`, `no-referrer` e `noindex`; a página privada tem metadados correspondentes. Retenção e ocultação de URLs nos logs dos provedores/CDN continuam sendo uma verificação operacional externa: o formato atual do link privado ainda contém o token que concede acesso a quem o possui.
- **B9/B10:** leitura de JSON em fluxo com tamanho limitado rejeita `null`, arrays, corpos malformados ou grandes demais, conteúdo não JSON e alterações originadas de outro site no navegador. Validação de UUID, data, fuso, slug e motivo; espaços da senha preservados; mensagens neutras no cadastro e reenvio; e-mail removido das URLs de redirecionamento geradas. Preços inválidos ou acima do limite numérico retornam erro controlado.
- Revisado o código cliente em busca de inserção insegura de HTML, uso de `eval` e armazenamento de credenciais. Não foram encontrados pontos de inserção de HTML dessa natureza; `localStorage` é usado somente para registrar o fechamento do tutorial, não para tokens de gerenciamento. A autorização no servidor continua independente dos controles da interface.

Evidências: **18 testes Node passaram**, além de TypeScript, lint, build de produção e **16 verificações de navegador** no build local de produção conectado a São Paulo. Os testes cobrem login responsivo, navegação, exibição/ocultação de senha, entrega de nonce/cabeçalhos, nonces distintos, bloqueio real de script injetado no HTML, JSON `null` → 400, `Origin` externo → 403 e data impossível → 400. A navegação normal não gerou erros de execução ou CSP.

A primeira tentativa de injeção por execução no DevTools era inadequada para testar HTML não confiável; foi substituída por injeção na resposta HTML, mantendo a CSP original. O primeiro build encontrou erro `EXDEV` em arquivo de telemetria no Windows; desativar a telemetria resolveu o problema.

## Fase 4: atualização pontual de dependências

Next.js e `eslint-config-next` foram atualizados de 16.3.5 para **16.3.6**, correção do fornecedor para GHSA-vcvr-r3jv-pc5j (`ImageResponse`/`next-og`). Não foi encontrado uso de `next/og` na aplicação, mas a dependência vulnerável foi corrigida. React e dependências não relacionadas não foram atualizados. O cabeçalho que divulga o framework foi desativado.

Evidências: **19 testes unitários**, lint, TypeScript e build de produção passaram; **16 verificações de segurança no navegador** passaram novamente com Next 16.3.6, sem erros durante a navegação normal. A captura da tela de login mobile foi inspecionada. `pnpm audit` informou **0 vulnerabilidades entre 443 dependências** naquele momento; isso não substitui acompanhar os avisos dos fornecedores.

O teste de regressão de dependências verifica a versão mínima revisada e a correspondência com o pacote de lint. A verificação com PNPM 11 utiliza as mesmas configurações de CI e armazenamento da instalação, sem desativar suas verificações.

Referência: [aviso de segurança do fornecedor](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).

## Fase 5: proteção contra abuso de reservas apoiada no banco

A migration de preparação `20260927002836_security_phase5_booking_gateway.sql` foi **aplicada em São Paulo**: o histórico passou a ter 14 registros, preservando os anteriores. Cópia criptografada prévia: `sao-paulo-20260927-075046.dpapi`. Um aviso de atualização da CLI interrompeu inicialmente a interpretação do JSON; a operação parou antes de alterar o schema, a interpretação foi corrigida e a execução foi repetida.

O novo cliente de reservas, exclusivo do servidor, chama uma única RPC protegida e privilegiada. Credenciais não são passadas a componentes nem a cookies dos usuários. O IP confiável fornecido pela Vercel é transformado com HMAC; endereços IPv6 são agrupados por `/64` para evitar que a troca do endereço da interface reinicie a contagem.

Limites compartilhados e atômicos no banco:

- 10 tentativas por IP por minuto;
- 100 tentativas por IP por dia;
- 10 tentativas por estabelecimento e telefone por hora.

Tentativas malsucedidas também consomem a cota, sem deixar reservas parcialmente criadas. A limpeza de contadores expirados é limitada por execução. Não foram introduzidos novos serviços, Docker, Redis ou conta de cliente. A identidade associada ao telefone ainda não é verificada; abuso distribuído em baixo volume continua sendo um risco. CAPTCHA ou verificação de identidade podem ser considerados se esse abuso ocorrer. **Limitar requisições não garante bloquear toda automação.**

**Ao encerrar a preparação da fase 5, a migration de ativação `20260927002839_security_phase5_retire_direct_booking.sql` ainda não estava aplicada. Ela foi aplicada posteriormente, conforme a seção final.** Essa migration revoga o acesso às duas funções antigas de gravação direta para `anon`, `authenticated` e `service_role`. A função protegida mantém o único ponto de entrada de reserva para `service_role` e chama as funções internas. Aplicar a desativação antes da versão compatível da aplicação interromperia as reservas em produção. Não aplique indiscriminadamente todas as migrations pendentes.

Evidências nessa fase: **22 testes unitários**, lint, TypeScript, build, **19 verificações SQL** de limites e tentativas de contornar a proteção com `anon`/`authenticated` — migration candidata de desativação seguida de reversão —, **28 verificações HTTP com sessão assinada** e **16 verificações de navegador**. A nova API criou, exibiu, reagendou e cancelou um agendamento, liberando os horários anteriores. Duas reservas simultâneas produziram um único sucesso; 12 requisições inválidas simultâneas à função protegida produziram exatamente 10 tentativas admitidas e 2 respostas de limite atingido. Todos os registros aleatórios de teste foram removidos.

A preparação dos dados de teste da fase 2 passou a chamar a função interna de gravação somente para montar o cenário; as verificações de reagendamento/cancelamento anônimo permaneceram iguais. A fase 5 testa explicitamente as permissões de gravação.

### Ordem segura de publicação — procedimento mantido para referência

1. Na Vercel, em Agenda Pro → **Settings → Environment Variables**, cadastrar `SUPABASE_SECRET_KEY` como **Secret**, somente em **Production**, usando uma chave secreta do projeto de São Paulo. Nunca usar prefixo `NEXT_PUBLIC`, colar o valor no chat ou copiar a chave para Preview/Development. A chave antiga `service_role` também funciona no servidor, mas a nova chave secreta é preferível. `SECURITY_LOCAL_BOOKING_TEST` deve permanecer ausente na Vercel.
2. Publicar a aplicação revisada com o caminho protegido de reserva e as correções restantes da fase 6; confirmar uma reserva controlada no site de produção e a chegada do cabeçalho de IP confiável.
3. Somente então aplicar a migration de desativação e comprovar que RPCs diretas anônimas/autenticadas são negadas enquanto a reserva pelo site funciona. Não afrouxar permissões para fazer testes passarem.
4. Após a desativação, não retornar a uma versão da aplicação que grave reservas anonimamente. Publicar uma correção compatível com o caminho protegido ou suspender temporariamente novas reservas; nunca restaurar o caminho vulnerável.

Referências: [cabeçalho confiável da Vercel](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for) e [chaves de API do Supabase](https://supabase.com/docs/guides/api/api-keys).

## Fase 6: auditoria, privacidade e separação de ambientes

A migration `20260927105655_security_phase6_audit_and_token_lifetime.sql` foi **aplicada em São Paulo** após testes com reversão integral, com cópia criptografada `sao-paulo-20260927-080655.dpapi`. Os 14 registros anteriores foram preservados, totalizando 15 naquele momento.

- Onze gatilhos de banco registram alterações críticas, incluindo edições diretas autorizadas pela API, revogação de vínculo, alterações em serviços/horários/bloqueios e criação de reservas. O autor vem do contexto autenticado; os dados de antes/depois seguem uma lista explícita de campos permitidos. Papéis da API não podem gravar nem excluir registros de auditoria. Valores pessoais, motivos e hashes de tokens ficam excluídos desses registros.
- A leitura pelo token privado expira 30 dias após o término do agendamento ou após seu cancelamento. Reservas futuras permanecem acessíveis e o histórico do profissional é preservado. A interface explica a validade. Recuperação/rotação de tokens e retenção de URLs nos logs dos provedores continuam sendo limitações operacionais.
- Limites de texto no banco e validações correspondentes no servidor impedem entradas excessivamente grandes. Nenhum dado existente foi truncado ou excluído. Datas reais, horários, UUIDs e tamanho de e-mail são verificados antes das ações. Mensagens brutas do banco e objetos completos de erro foram removidos dos logs da aplicação/navegador; verificações de regressão protegem esses pontos de registro.
- O Canadá é bloqueado em todos os ambientes. Produção deve usar São Paulo; Preview não pode compartilhar o banco de produção; acesso local à produção exige autorização temporária explícita. A origem usada no redirecionamento do e-mail de autenticação rejeita URLs do Supabase e origens inválidas/inseguras. O `.env.local` existente foi preservado; por isso, a inicialização local comum é intencionalmente bloqueada até substituir sua configuração antiga. Nenhum teste se conectou ao Canadá.
- Adicionado o checklist externo de operação/publicação em `security-operations-checklist.md`. As orientações de Supabase, Next.js, variáveis de ambiente, React e observabilidade ajudaram a definir permissões restritas, credenciais exclusivas do servidor e logs mínimos sem dados sensíveis. Nenhum fornecedor de telemetria ou outra dependência de infraestrutura foi introduzido.

A primeira definição candidata da expiração usava uma assinatura de retorno antiga; o PostgreSQL a rejeitou e reverteu a transação. A assinatura efetiva foi inspecionada, preservando as saídas `service_id` e `can_reschedule`. A candidata corrigida e a versão aplicada passaram nos testes.

### Verificação executada antes da publicação (27/09/2026)

| Verificação | Resultado |
|---|---|
| `pnpm test` | 26 testes passaram |
| SQL da fase 1: isolamento, RLS, revogação e políticas antigas | 62 verificações passaram |
| SQL da fase 2: agenda, dados históricos e recorrência | 28 verificações passaram |
| SQL da fase 5: cotas e tentativa de contornar proteção; desativação em `ROLLBACK` | 19 verificações passaram |
| SQL da fase 6: auditoria, expiração e limites de entrada no banco | 17 verificações passaram |
| Integração HTTP/JWT assinado, requisições simultâneas e fluxo real da API | 28 verificações passaram |
| Navegador no build de produção: mobile, interatividade, CSP/XSS e requisições inválidas | 16 verificações passaram |
| Inspeção dos arquivos compilados enviados ao navegador | 24 arquivos; nenhuma credencial privilegiada detectada |
| `pnpm lint`, TypeScript e `pnpm build` | Aprovados |
| `git diff --check` | Aprovado |
| Tabelas efetivas no schema público sem RLS | 0 |
| Gatilhos de auditoria habilitados | 11 |

A execução HTTP repetiu login/criação inicial da agenda, negação de acesso A × B, remoção com reutilização do mesmo JWT assinado, reserva/cancelamento realmente simultâneos, cotas atômicas e o fluxo de criar/consultar/reagendar/cancelar pela API. Todos os registros gerados de organizações, usuários e cotas de teste foram removidos. As suítes SQL sempre reverteram seus dados de teste. Dados existentes de testes/clientes foram preservados.

### Resumo dos achados e evidências

| Achado | Correção aplicada | Teste de regressão | Resultado | Commit |
|---|---|---|---|---|
| A1 | Vínculo atual obrigatório, inclusive para profissional associado | SQL e reutilização do mesmo JWT após revogação | Aprovado | f65eee3, 20695f7 |
| A2 | Políticas/permissões antigas desativadas, sem remover dados | Cenários A × B com dados e tentativa de gravação entre organizações | Aprovado | f65eee3, 4baabca |
| A3 | Gravação direta e exclusão física de reservas bloqueadas | Permissões de tabela/coluna e alteração HTTP negada | Aprovado | f65eee3 |
| A4 | Identidade confirmada no Auth e e-mail de perfil imutável | Perfil falsificado e e-mail não confirmado rejeitados | Aprovado | f65eee3 |
| A5 | Reserva pelo servidor, cotas atômicas e desativação das funções diretas | 19 verificações SQL, concorrência HTTP e acesso direto negado em produção | Aprovado; abuso distribuído permanece uma limitação | 0754f09 |
| B1 | Reagendamento validado pela duração e pelo profissional originais | Serviço encurtado/alongado, bloqueios e fim do expediente | Aprovado | c4ec533 |
| B2 | Redirecionamento interno validado rigorosamente | Barras codificadas/invertidas e origem externa | Aprovado | 34e5361 |
| B3 | Reserva pública não sobrescreve nome do cliente no cadastro | Reutilização por telefone normalizado com cópia histórica independente | Aprovado | c4ec533 |
| B4 | Ordem comum das travas e nova verificação do estado | Cancelamento simultâneo com um único registro da ação | Aprovado | c4ec533 |
| B5 | Chave estrangeira de organização/série e constraints dos dados históricos | Série de outra organização e valores históricos nulos rejeitados | Aprovado | c4ec533 |
| B6 | Auditoria atômica, gravação protegida e dados mínimos | Autor, diferenças, revogação, privacidade e exclusão em cascata | Aprovado; retenção externa pendente | bb0a131 |
| B7 | CSP com nonce e cabeçalhos de enquadramento, conteúdo e referência | Navegador real bloqueia script injetado | Aprovado em produção | 34e5361 |
| B8 | `no-store`/`noindex`/`no-referrer`, expiração e redução dos logs | Cabeçalhos, validade do token e inspeção de logs/arquivos compilados | Aprovado; logs de URLs dos provedores pendentes | 34e5361, bb0a131 |
| B9 | Mensagens neutras, senha preservada e entradas tipadas/limitadas | Testes unitários, requisições inválidas e constraints do banco | Aprovado | 34e5361, bb0a131 |
| B10 | JSON limitado e obrigatoriamente um objeto não nulo | JSON `null` retorna 400 no navegador/API | Aprovado em produção | 34e5361 |
| B11 | Next.js 16.3.6 e atualização mínima relacionada | Regressão de dependência, build e auditoria de pacotes | Aprovado; auditoria corresponde ao momento da correção | 987f0ff |
| B12 | Proteção por ambiente e autorização explícita para testes locais | Separação Canadá/Preview/local | Aprovado; projeto separado de Preview pendente | bb0a131 |

### Situação em produção e parecer atual

O commit da aplicação `bb0a131` foi enviado para `main`. A primeira publicação na Vercel foi bloqueada de forma segura porque `NEXT_PUBLIC_SITE_URL` continha a origem do Supabase. O operador corrigiu o valor para `https://agenda-pro-lovat.vercel.app` e publicou novamente com sucesso: `6Z6V8xsQiGHKxSQZUbrBu5mZr9D4`. Nenhuma proteção foi enfraquecida para fazer o build passar.

O site público passou a retornar HTTP 200, nonce CSP por resposta, `nosniff`, bloqueio de enquadramento, `no-referrer` e roteamento `gru1::gru1`. Esse cabeçalho sozinho não comprova a região de execução de todas as funções. Dezesseis verificações no Edge, em tamanho de tela mobile, passaram no site publicado, incluindo mostrar/ocultar senha com JavaScript ativo, navegação, requisições inválidas/de outra origem e bloqueio por CSP de um script injetado apenas no navegador de teste. Não foram observados erros de execução na navegação normal. O teste de injeção não alterou HTML de produção nem conteúdo de clientes.

O fluxo da aplicação/API publicada passou inicialmente em 28 verificações de integração. Em seguida, a migration existente de desativação `20260927002839` foi aplicada em uma única transação com proteção do histórico, preservando os 15 registros anteriores e totalizando 16. Uma nova cópia lógica criptografada foi verificada em:

`C:\Users\misael\AppData\Local\AgendaPro\SecurityBackups\sao-paulo-20260927-132039.dpapi`

Isso não equivale a um backup físico completo nem a uma restauração demonstrada do banco.

Após a ativação, **32 verificações HTTP com sessão assinada passaram**: ambas as funções antigas rejeitam chamadas anônimas e autenticadas por falta de permissão; reservas pelo servidor da Vercel continuam funcionando; consulta privada, reagendamento, liberação do horário antigo, cancelamento e liberação do novo horário funcionam. Requisições realmente simultâneas produzem uma reserva e um conflito controlado. A remoção do vínculo impede o acesso com o mesmo JWT emitido anteriormente. Todos os registros temporários foram removidos, sem tocar nos dados existentes de organizações/clientes.

As **126 verificações SQL passaram novamente após a ativação**: 62 de autorização/isolamento, 28 de integridade da agenda, 19 de antiabuso e 17 de auditoria/expiração/limites de entrada. Os testes de antiabuso passaram a validar as permissões efetivamente ativadas, não apenas uma alteração candidata. Os **26 testes locais passaram**, assim como lint, TypeScript e verificação de diferenças.

A primeira execução restrita pelo ambiente de segurança local não conseguiu iniciar processos Node (`EPERM`); não foi uma falha de regra da aplicação. A nova execução com permissão aprovada passou. O build de produção passou na Vercel; não houve alteração no código da aplicação após a publicação validada.

Não houve acesso autenticado para uma inspeção dos logs de execução da Vercel nem para uma auditoria completa das configurações dos provedores. O script versionado de ativação impede reaplicação e atualiza primeiro a cópia criptografada. Não volte para uma versão anterior ao caminho protegido de reserva nem conceda novamente gravação pública direta.

**Depois das correções, colocaria dados reais de clientes na aplicação atualmente publicada? NÃO, ainda.**

A publicação, a desativação das funções antigas e os testes essenciais em produção passaram. Restauração de backup, autenticação multifator administrativa, escopo dos ambientes, proteções do Auth/entrega de e-mails, tratamento de tokens nos logs da infraestrutura e controles de acesso ao repositório ainda dependem das verificações externas do checklist operacional. Testes aprovados não significam ausência de toda vulnerabilidade possível. A revisão de segurança como um todo não deve ser considerada concluída enquanto essas pendências não forem verificadas.
