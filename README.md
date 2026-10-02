# Administração das Bases pedWeb

Painel para manutenção das bases de dados do sistema pedWeb. Mesma stack, layout, cores e
componentes do b2b admin (`b2bweb/admin/code`): Express + Vite + React 19 + Tailwind 4 + mysql2.

## Fluxo

1. **Login**: usuário e senha de `pedweb_admin.usuarios`. O painel valida com a sua própria conexão
   (as variáveis `PAINEL_MYSQL_*` do `.env`, que só apontam para `pedweb_admin`).
2. Com o login aceito, o servidor abre a conexão MySQL **com as credenciais gravadas na linha do
   usuário** (`mysql_host`, `mysql_port`, `mysql_user`, `mysql_senha`; aceita também `host`, `porta`,
   `mysql_usuario`, `mysql_password`…). Em branco, cai para as credenciais do `.env`. A senha fica só
   na memória do servidor.
3. **Base**: o usuário escolhe entre as bases `pedweb*` que **a conta de MySQL dele enxerga**
   (`pedweb_admin` fica de fora). **Só o super usuário** vê o ícone de cópia ao lado de cada base,
   que cria uma base nova com a
   estrutura dela: tabelas (`CREATE TABLE ... LIKE` — colunas, índices, defaults, auto_increment),
   chaves estrangeiras (`ALTER TABLE` depois que todas as tabelas existem), visões, funções,
   procedures e triggers, **sem os dados**. Visões, rotinas e triggers são recriadas com as
   referências à base de origem trocadas pela nova e sem o `DEFINER` original. O nome novo precisa
   começar com `pedweb`. O que não puder ser copiado é listado na tela, e a base criada é mantida.
4. **Tabelas**: CRUD de qualquer tabela da base, com a mesma tela de lista/abas/formulário do b2b admin.

Quem cadastra os usuários do painel (e preenche as credenciais de MySQL de cada um) é o **super
usuário**; é dele também a tela Liberar Bases.

## A tabela `pedweb_admin.usuarios`

O painel lê a estrutura dessa tabela, então ela só precisa ter o que for usado (eu não crio nem
altero tabelas):

| Coluna | Para quê |
| --- | --- |
| `id` (ou `id_app`) | identifica a linha |
| `email` (ou `login`, `usuario`, `nome`) | login do painel |
| `senha_hash` (ou `senha`) | senha do painel, gravada em bcrypt |
| `nivel` (ou `tipo`, `perfil`, `papel`) | `'super'` marca o super usuário (`'admin'` **não** é super) |
| `ativo` | opcional; inativo não entra |
| `mysql_host`, `mysql_port`, `mysql_user`, `mysql_senha` | credenciais com que esse usuário acessa as bases |
| `config_listas` | preferências das listas (larguras, ordem, colunas) |

## Como rodar

```bash
npm install
npm run dev
```

Sobe em <http://localhost:3000> (mude com `ADMIN_PORT`). Copie `.env.example` para `.env` e preencha.

## Deploy na Vercel

O mesmo app Express serve as duas situações: local, `server.ts` acrescenta o Vite e o `listen`; na
Vercel, [`api/index.ts`](api/index.ts) exporta o app como função e o [`vercel.json`](vercel.json)
manda todo `/api/*` para ela. O frontend é o `vite build` normal (`dist`).

Como cada requisição pode cair em uma instância diferente, **a sessão não guarda nada no servidor**:
o token é `usuarioId.expiração.assinatura` (HMAC-SHA256, 12 horas) e a cada chamada o painel relê o
usuário em `pedweb_admin` e reaproveita o pool da conta de MySQL dele.

Variáveis de ambiente a definir no projeto da Vercel:

| Variável | Para quê |
| --- | --- |
| `PAINEL_MYSQL_HOST`, `PAINEL_MYSQL_PORT`, `PAINEL_MYSQL_USER`, `PAINEL_MYSQL_PASSWORD` | conexão do painel com `pedweb_admin` |
| `SESSION_SECRET` | assina o token de sessão (valor longo e aleatório; sem ele todo deploy derruba as sessões) |

O MySQL precisa aceitar conexão dos IPs da Vercel.

## Arquitetura

Igual ao b2b admin, mas os metadados vêm do banco em vez de um registro escrito à mão:
[`server/schema.ts`](server/schema.ts) lê `INFORMATION_SCHEMA` e monta, para cada tabela, o mesmo
`ResourceDef` que o b2b usa (tipos de campo, obrigatoriedade, PK, enum, FK como combo). O backend usa
esse resultado como whitelist de tabelas e colunas; nada de nome de coluna vem do cliente HTTP.

- `tinyint(1)` vira toggle Sim/Não; `enum` vira seleção; `text` vira área de texto; colunas binárias
  (blob etc.) ficam de fora.
- Tabelas sem chave primária: só consulta e inclusão (não há como identificar a linha).
- Na inclusão, campo em branco fica fora do INSERT para valer o `DEFAULT` da coluna.
- Colunas `id_app` (ou PK) primeiro, depois descrição/nome, depois o resto.
- Datas de criação/atualização (`DEFAULT CURRENT_TIMESTAMP`, `ON UPDATE`, ou nomes como `date_update`,
  `datahora_cadastro`, `datahora_alteracao`) ficam fora da edição; o que o banco não preencher sozinho o
  CRUD preenche no horário de Brasília (inclusão: todas; alteração: as de alteração).
- **Liberar Bases** ([`server/liberarBases.ts`](server/liberarBases.ts)), só para o super usuário:
  marca quais bases `pedweb*` cada **conta do MySQL** enxerga, aplicando `GRANT ALL PRIVILEGES` /
  `REVOKE ALL PRIVILEGES` por base (nada de privilégio global é tocado). Mexe no servidor MySQL, não
  nos usuários do painel. A conta usada pela conexão atual fica bloqueada (revogar a si mesmo
  derrubaria o painel), contas internas do MySQL não aparecem, e quem tem privilégio global é
  marcado porque continua enxergando tudo.
- **Cadastros** ([`server/cadastros.ts`](server/cadastros.ts)): telas desenhadas à mão sobre tabelas do
  pedWeb, no modelo do crmWeb — rótulos em português, ordem dos campos, tipos e dicas definidos um a
  um, por cima do que foi lido do banco (coluna a mais ou a menos na base não quebra a tela). Hoje:
  **Usuários** (`app_usuarios`) e **Vendedores** (`app_vendedores`), que saem da seção Tabelas.
  Vendedores vêm do bmsoft: a tela é só de consulta (`podeIncluir`/`podeAlterar`/`podeExcluir` em
  `false`), aberta pelo ícone de olho, com os campos desabilitados e sem Salvar.
  A senha de `app_usuarios` é gravada **como digitada**, porque o aplicativo pedWeb compara em texto
  puro no login (`hash: false`); já a do painel vai em bcrypt. Colunas `char(1)` com S/N usam o tipo
  `simnao`, exibido como toggle. Um `id_app` em branco na inclusão é gerado pelo painel, no mesmo
  formato do aplicativo (data/hora de Brasília + 8 dígitos aleatórios).
- No grid de **Vendedores**, o ícone de pessoa com "+" cria o usuário do aplicativo para aquele
  vendedor: a confirmação pede o **e-mail de acesso** (é por ele que o pedWeb autentica), já
  preenchido quando a base tem essa coluna no vendedor. Cria com `vendedor_id_app` apontando para
  ele e senha `1234`; recusa se o vendedor já tiver usuário ou se o e-mail já estiver em uso. As
  ações extras por tela ficam em
  [`src/utils/acoesLinha.tsx`](src/utils/acoesLinha.tsx).
- **Usuários do Painel** (`pedweb_admin.usuarios`) aparecem na sidebar junto de qualquer base, **só
  para o super usuário** — para os demais a seção não existe e o CRUD recusa. Super é `tipo` =
  `'super'` (**`admin` não é super**); em tabelas sem a coluna `tipo`, vale uma coluna de sim/não
  `super`/`superusuario`/`super_usuario`. Sem nenhuma das duas, ninguém é super e as telas de super
  não aparecem. Mesmo CRUD: senha gravada em bcrypt (em branco na alteração mantém a atual; o hash nunca vai ao
  navegador), `config_listas` fora do formulário, e o usuário logado não pode excluir a si mesmo.
- Na edição, o ícone de olho ao lado de cada rótulo mostra/oculta a coluna na lista.
- Preferências das listas (larguras, ordem, grade, colunas visíveis) ficam em
  `pedweb_admin.usuarios.config_listas`, com chave `base.tabela`.

```
server.ts              conexão ao MySQL, lista de bases, Vite/SPA
server/db.ts           pools por conexão (token no header x-conexao)
server/schema.ts       metadados via INFORMATION_SCHEMA
server/crud.ts         CRUD genérico (base no header x-base)
server/usuarios.ts     login do painel e config_listas em pedweb_admin.usuarios
server/schema.check.ts checagem da montagem dos metadados: npx tsx server/schema.check.ts
src/components/        LoginView (servidor), BasesView (base), Dashboard, CrudView, RecordForm…
```
