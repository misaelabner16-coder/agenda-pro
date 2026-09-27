# Publicação de segurança: verificações externas ainda necessárias

Este checklist não considera uma opção do painel habilitada apenas porque existe código relacionado a ela. Banco: São Paulo, projeto `nuhxuhkunhuzljjjkzbx`. A URL pública principal é `https://www.ammaligestao.com` desde a virada de 27/09/2026; o domínio Vercel anterior permanece como contingência.

## Acompanhamento manual de MFA — 27/09/2026

- Supabase: ativação informada pelo usuário; segundo fator de reserva não verificado.
- Vercel: painel mostrou 2FA ativo com autenticador TOTP cadastrado; usuário confirmou que guardou os códigos de recuperação.
- GitHub: conclusão informada pelo usuário; sem verificação independente do painel.
- AWS: captura de tela confirmou TOTP cadastrado no AWS Builder ID. A proteção de identidades raiz/IAM ou outros acessos administrativos da AWS, quando existirem, não foi verificada nesta sessão.
- A proteção das contas individuais não comprova revisão dos demais membros, sessões, integrações ou exigência de MFA para a equipe inteira.

## Procedimento de publicação — concluído em 27/09/2026, mantido para referência

O commit da aplicação `bb0a131` está publicado na URL pública existente, na implantação `6Z6V8xsQiGHKxSQZUbrBu5mZr9D4`. O primeiro build rejeitou uma URL do Supabase configurada incorretamente em `NEXT_PUBLIC_SITE_URL`; o operador corrigiu o valor e publicou novamente.

O fluxo protegido de reserva pela Vercel passou antes e depois da desativação das funções antigas de gravação direta. A migration `20260927002839` está aplicada, preservando todos os 15 registros anteriores do histórico. Após a ativação, **32 verificações HTTP passaram**, incluindo recusa das duas funções antigas para usuários anônimos e autenticados. **16 verificações de navegador passaram**, sem erros durante a navegação normal.

Apenas registros gerados pelos testes foram removidos; os dados existentes e o Canadá não foram alterados. As orientações de publicação e Supabase fundamentaram a ativação em etapas e a verificação posterior à mudança.

1. **Chave secreta:** no Supabase de São Paulo, em **Project Settings → API Keys**, obter uma chave secreta desse projeto. Na Vercel, em **Agenda Pro → Settings → Environment Variables**, cadastrar `SUPABASE_SECRET_KEY`, tipo **Secret**, somente em **Production**. Nunca colocá-la em `NEXT_PUBLIC_*`, Git, capturas de tela, chat ou Preview. Os scripts de teste não persistiram credenciais: o servidor local de teste as recebeu apenas nas variáveis do processo.
2. **Variáveis de produção:** confirmar que `NEXT_PUBLIC_SUPABASE_URL` aponta para São Paulo, a chave pública pertence ao mesmo projeto e `NEXT_PUBLIC_SITE_URL` contém `https://www.ammaligestao.com` após a virada. Não configurar `SECURITY_LOCAL_BOOKING_TEST` na Vercel.
3. **Separação de ambientes — pendência:** Preview deve usar projeto e chave próprios de testes, nunca o banco de produção. A proteção bloqueia intencionalmente Preview configurado com produção. **Um projeto separado de testes ainda não foi provisionado.** O `.env.local` existente foi preservado, mas seu destino antigo no Canadá está bloqueado. Substituir por configuração de testes. Acesso local temporário à produção para testes explícitos exige `ALLOW_PRODUCTION_DATABASE_FOR_TESTS=1`. Não definir `VERCEL_ENV=production` para contornar essa proteção no desenvolvimento comum; os testes isolados de build de produção simularam explicitamente esse ambiente com credenciais em memória.
4. **Validação da versão compatível:** publicar o código com o caminho protegido e validar a reserva pelo endereço real da Vercel. Confirmar que `x-vercel-forwarded-for` chega à função. IP confiável ausente/inválido ou falta da credencial do servidor retorna 503; nunca usa a função desprotegida como alternativa.
5. **Desativação das funções antigas — concluída:** somente após a validação anterior, aplicar `20260927002839_security_phase5_retire_direct_booking.sql` e registrar sua versão sem modificar o histórico antigo. Essa etapa já foi executada. Chamadas diretas anônimas/autenticadas foram negadas, e reserva, reagendamento e cancelamento pelo site passaram após a ativação. **Não reaplicar a migration.**

## Painel do Supabase

Os nomes dos menus abaixo foram mantidos como aparecem na interface para facilitar a localização.

- **Authentication → Providers / Email:** captura de tela confirmou exigência de confirmação de e-mail; usuário informou mínimo de 8 caracteres salvo. Domínio Resend foi verificado em São Paulo e o usuário confirmou entrega de confirmação de cadastro no endereço antigo e de recuperação no novo. A proteção contra senhas vazadas estava indisponível/desativada no plano observado; conferir mudanças de plano, limites de requisições e demais configurações do Auth separadamente.
- **Authentication → URL Configuration:** o usuário informou que `Site URL` agora é `https://www.ammaligestao.com` e adicionou os callbacks exatos necessários, preservando os antigos durante a transição. Não houve leitura autenticada direta da configuração. Revisar a lista completa de redirecionamentos; preferir URLs exatas de retorno de produção, sem curingas amplos que possam alcançar domínios controlados por terceiros. Remover retornos locais de produção quando desnecessários.
- **Segurança de organizações e contas:** exigir autenticação multifator para administradores de Supabase, Vercel e GitHub, conceder somente as permissões necessárias e revisar sessões e integrações ativas. A condição de administrador global da aplicação deve ser controlada explicitamente, sem concessão automática baseada em metadados editáveis de perfil.
- **Backups do banco:** as cópias lógicas locais criptografadas são uma contingência, **não uma restauração completa testada**. Definir política de backup automático e retenção; demonstrar restauração em outro projeto antes de armazenar dados reais de clientes. Arquivos do Storage e configurações da plataforma não estão nessas cópias. A recuperação por DPAPI depende da conta/perfil original do Windows.
- **Infraestrutura:** o banco informou PostgreSQL 17.6. Revisar atualizações de segurança disponíveis com o Supabase, preservar e testar o índice de exclusão por profissional e seguir as orientações de reindexação do fornecedor ao atualizar. Nenhuma atualização de infraestrutura foi executada. O alerta de `btree_gist` no schema `public` exige cuidado: movê-lo sem análise pode quebrar a constraint de agenda. Planejar separadamente, verificando dependências.
- **Security Advisor:** revisar os apontamentos restantes de `SECURITY DEFINER`, com permissões explícitas e restritas e autorização dentro das funções. A simples existência dessas funções não justifica remover RPCs públicas necessárias nem desativar RLS.

## Vercel e GitHub

- Confirmar a região das Functions do projeto como São Paulo: `gru1` no `vercel.json` versionado. Uma resposta pública `HEAD` mostrou `gru1`, mas isso, isoladamente, não comprova a execução de todas as funções nessa região.
- Confirmar proteção das publicações de Preview, segredos separados por ambiente, permissões dos membros do projeto e acesso à reversão de publicação. Não houve auditoria autenticada das configurações de Vercel/GitHub nesta execução.
- Inspecionar logs de acesso, ferramentas de análise e destinos de exportação de logs para `/p/*/agendamento/*`, equivalentes na API e parâmetros de retorno do Auth. Ocultar ou excluir tokens privados, restringir acesso dos operadores e definir retenção. Os logs da aplicação omitem erros brutos e dados pessoais, mas não controlam logs dos provedores, histórico do navegador, capturas de tela ou área de transferência. **Tratar uma URL privada copiada como uma senha.**
- Configurar WAF e alertas de volume de requisições como proteção adicional. As cotas do banco são compartilhadas e, após a desativação, não podem ser contornadas chamando a função pública antiga. Permanecem o risco de abuso distribuído em baixo volume e a identidade não verificada do telefone. CAPTCHA/verificação de telefone podem ser necessários se ocorrer abuso; nenhum dos dois é considerado implementado.
- No GitHub, conferir proteção de branches, exigência de revisão, detecção de segredos e bloqueio de seu envio, alertas de dependências e permissões mínimas dos fluxos automatizados. Nenhuma configuração do repositório foi alterada.

## Limitações de logs, retenção e reversão

- Os registros de auditoria do banco capturam autor, organização, operação e metadados explicitamente permitidos. Nomes, telefones, e-mails, motivos, senhas e hashes de tokens não são copiados para os novos registros. Logs existentes foram preservados, não apagados silenciosamente. Logs do Auth e dos provedores precisam de revisão separada.
- Auditoria e alterações de negócio são gravadas atomicamente; falhas revertem a ação. Papéis da API não podem editar/excluir a trilha de auditoria. Administradores do banco ainda podem alterá-la. A exclusão de organização com `CASCADE`, já existente, também exclui seus logs. Se for necessária retenção imutável para investigação, utilizar exportação externa com retenção. Nenhuma nova ação de exclusão de organização foi adicionada.
- O token privado de consulta expira 30 dias após o término do agendamento ou, para agendamentos cancelados, após o cancelamento. O histórico permanece visível aos profissionais autorizados. Ainda não existe recuperação/rotação de token pelo cliente com verificação de identidade; não substituir por consulta baseada apenas no telefone.
- **Reversão de código:** usar os commits isolados, mas, após a desativação das funções diretas, **nunca** retornar a uma versão que grave reservas anonimamente nem afrouxar permissões para restaurar o serviço. Manter uma versão compatível com o caminho protegido ou suspender temporariamente novas reservas enquanto se publica a correção.
- **Reversão de schema:** nenhuma migration histórica aplicada foi editada ou excluída. Corrigir problemas por uma nova migration aditiva revisada; não excluir dados de clientes nem recriar políticas antigas vulneráveis. O `db push` comum continua bloqueado pela divergência histórica de versões; não usar `--include-all` nem marcar migrations antigas como revertidas.

**Parecer atual: publicação, desativação das funções antigas e testes essenciais em produção concluídos. Ainda NÃO liberado para dados reais de clientes até verificar os itens externos de backup/restauração, Auth, acesso administrativo, logs dos provedores e infraestrutura descritos acima.**
