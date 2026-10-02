# Histórico

## 0.0.1 — 02/10/2026

Primeira versão publicada do painel de administração das bases pedWeb.

- Acesso em uma tela só: usuário e senha de `pedweb_admin.usuarios`. O painel valida com a conexão
  do `.env` (`PAINEL_MYSQL_*`) e abre a conexão de trabalho com as credenciais de MySQL gravadas na
  linha do usuário, com a opção "Lembrar neste dispositivo".
- Escolha da base entre as `pedweb*` que a conta de MySQL do usuário enxerga.
- CRUD genérico de qualquer tabela da base, com metadados lidos do `INFORMATION_SCHEMA`: lista com
  busca, busca avançada, abas, colunas redimensionáveis e configuráveis (gravadas em
  `usuarios.config_listas`), e formulário com os tipos do b2b admin.
- Cadastros desenhados à mão: Usuários do aplicativo e Vendedores (só consulta, vêm do bmsoft), com
  a ação de criar o usuário do aplicativo a partir de um vendedor.
- Datas de criação/atualização fora da edição, preenchidas no horário de Brasília quando o banco não
  as preenche; `id_app` gerado no formato do aplicativo.
- Telas do super usuário: Usuários do Painel, Liberar Bases (GRANT/REVOKE por conta do MySQL) e
  criação de base nova clonando a estrutura de outra (tabelas, chaves estrangeiras, visões, funções,
  procedures e triggers), sem os dados.
