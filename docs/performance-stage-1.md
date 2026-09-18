# Etapa 1 — navegação do dashboard

Esta etapa altera somente a aplicação. Não há mudanças no banco, nas políticas de RLS, na Vercel nem na região do Supabase.

## Alterações

- `currentUser` e a busca do workspace usam `React.cache`, que deduplica chamadas apenas durante a renderização da mesma requisição. Não há cache global nem compartilhamento entre usuários.
- A busca do workspace continua limitada ao `user_id` autenticado e às políticas de RLS. Organização e unidade continuam sendo buscadas em paralelo.
- A consulta adicional do profissional padrão foi removida: as telas usam apenas `location.default_professional_id`, que já vem na consulta da unidade.
- As quatro abas do dashboard têm telas de carregamento enquanto o conteúdo é renderizado.
- As actions revalidam somente as páginas afetadas. Mudanças de serviço também revalidam a página pública da unidade.

## Comparação estrutural

Com profissional padrão configurado, a renderização inicial do dashboard podia invocar até 13 leituras de Auth/dados para montar o contexto no layout e na página (sem contar Proxy nem dados específicos da página). Agora são 4: usuário, associação, organização e unidade. Na troca de abas, quando o layout é reutilizado, o caminho da página passa de até 6 para 4 leituras. São contagens do código, não medições de requisições HTTP ou de tempo; o Next.js pode deduplicar algumas requisições por conta própria.

O Proxy continua validando/atualizando a sessão separadamente. A busca por associação ainda precisa ocorrer depois da identificação do usuário; não foi introduzido um cache persistente de dados privados.

## Verificação em produção após publicação

1. Entrar com uma conta de teste e abrir cada aba uma vez para aquecer a navegação.
2. Nas ferramentas de rede do navegador, comparar cinco trocas entre as mesmas abas antes/depois, registrando mediana do tempo até conteúdo útil e quantidade de requisições.
3. Confirmar que serviços, horários e bloqueios aparecem imediatamente após salvar e que a página pública reflete serviços alterados.
4. Repetir com duas organizações distintas para confirmar que não há vazamento de dados.

Sem sessão autenticada disponível neste ambiente, não há medição confiável em milissegundos para as abas nem teste remoto de RLS nesta etapa.
