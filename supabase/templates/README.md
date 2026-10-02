# E-mails da Ammali em português

Estes arquivos são modelos para copiar para o painel do Supabase. Um deploy na
Vercel não altera os modelos de e-mail de um projeto Supabase.

Configure e valide primeiro no **Ammali Testes** (`dbtxikkhzmqstuiudxko`), em
Authentication → Email → Templates:

| Modelo no painel | Assunto | Corpo |
| --- | --- | --- |
| Confirm sign up | Confirme seu e-mail \| Ammali | `confirmation.html` |
| Reset password | Redefina sua senha \| Ammali | `recovery.html` |

Preserve `{{ .ConfirmationURL }}` exatamente como está: o Supabase gera o link
com a verificação e o destino de autenticação. Não troque essa variável por uma
URL fixa, token ou chave de API.

A alteração vale para mensagens enviadas após salvar. Mensagens já recebidas
mantêm o texto anterior. Abra a confirmação e a recuperação no mesmo navegador
que iniciou o pedido, para preservar a sessão PKCE.

Validar: assunto e corpo em português, confirmação do cadastro chegando ao
onboarding e recuperação chegando à tela para definir nova senha. A chegada do
e-mail sozinha não comprova a conclusão desses fluxos.

Depois de validar no Ammali Testes, copie os mesmos assuntos e corpos para o
projeto de produção (`nuhxuhkunhuzljjjkzbx`), nos dois modelos correspondentes.
Cole o HTML completo no editor de código/Source do corpo, não apenas no preview.
Salve uma cópia do assunto e HTML anteriores antes de substituir em cada projeto.
Não altere SMTP, Site URL, Redirect URLs ou variáveis da Vercel nesta etapa.

Os botões e o endereço alternativo usam somente `{{ .ConfirmationURL }}`: não há
domínio de produção ou testes fixo no HTML. O remetente continua sendo definido
pelo SMTP de cada projeto (por exemplo, Ammali Testes no ambiente de testes).

O layout usa tabelas, estilos inline, fontes do sistema e botão sem imagens
externas. A renderização pode variar entre clientes de e-mail; valide uma mensagem
real no celular e no computador, além de testar os dois links de autenticação.

A produção tem configurações próprias. Estes arquivos não foram aplicados
automaticamente em nenhum projeto pelo agente. Não é necessário redeploy na
Vercel para uma alteração de assunto/corpo salva no painel do Supabase.
