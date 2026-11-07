# 🚌 BusTrack — Sistema de Acompanhamento de Transporte Público

Aplicação web para consultar **linhas de ônibus, trajetos, pontos de parada e horários** em uma interface moderna, responsiva e fácil de usar. Projeto de TCC do curso técnico de TI.

> ⚠️ **Aviso importante sobre os dados**
> As linhas, paradas, horários e coordenadas incluídos no projeto são **fictícios**, criados apenas para demonstrar o sistema. Os ônibus exibidos no mapa são **simulados** (calculados a partir dos horários cadastrados) e **não representam veículos reais**. Isso é sinalizado na interface (faixa amarela no topo, selo "SIMULADO" nos marcadores e aviso no mapa).

---

## 1. Objetivo

Reunir em uma única aplicação a consulta de informações do transporte público: quais linhas existem, por onde passam, quando saem e onde ficam os pontos de ônibus.

## 2. Problema que o sistema pretende resolver

Informações de transporte público costumam estar espalhadas em placas, tabelas em PDF e sites pouco amigáveis, o que dificulta o planejamento da viagem. O BusTrack centraliza essas informações com busca, mapa interativo e horários organizados por tipo de dia.

## 3. Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (sem frameworks) |
| Backend | Python 3 + Flask |
| Banco de dados | SQLite (módulo `sqlite3` do Python) |
| Mapas | Leaflet.js + OpenStreetMap |
| Comunicação | Fetch API (JSON) entre o frontend e a API própria em Flask |

## 4. Funcionalidades

- **Dashboard (`/`)** — totais de linhas, paradas, horários e saídas do dia; acesso rápido; próximas saídas; avisos; busca rápida com resultados enquanto digita.
- **Linhas (`/linhas`)** — listagem com número, nome, origem/destino, frequência, quantidade de paradas e duração estimada; pesquisa por número, nome, destino ou ponto; filtros ("Operam hoje", "A cada 20 min ou menos").
- **Mapa (`/mapa`)** — mapa interativo (Leaflet/OpenStreetMap), pontos de parada com popup, seleção de linha com trajeto desenhado e paradas numeradas, lista de paradas clicável.
- **Ônibus simulados** — marcadores com selo **SIM**; é possível simular um horário específico (ex.: 08:00) para testar a funcionalidade a qualquer hora.
- **Horários (`/horarios`)** — saídas por linha em **dias úteis, sábados e domingos**, agrupadas por hora, com destaque da próxima saída e contagem regressiva.
- **Sobre (`/sobre`)** — descrição do projeto, fontes de dados e **formulário de contato com validação** (no navegador e no servidor); as mensagens são gravadas no SQLite.

## 5. Estrutura de pastas

```
BusTrack/
├── app.py                  # Servidor Flask: páginas + API JSON
├── requirements.txt        # Dependências Python
├── README.md
├── database/
│   ├── __init__.py
│   ├── init_db.py          # Cria as tabelas e insere os dados de demonstração
│   └── database.db         # Banco SQLite (criado automaticamente se não existir)
├── templates/              # Páginas HTML (Jinja2)
│   ├── base.html           # Layout comum: menu, faixa de aviso, rodapé, ícones
│   ├── index.html          # Dashboard
│   ├── linhas.html
│   ├── mapa.html
│   ├── horarios.html
│   ├── sobre.html
│   └── 404.html
└── static/
    ├── css/style.css       # Todo o visual (variáveis de cor no topo do arquivo)
    ├── js/
    │   ├── main.js         # Funções compartilhadas (fetch, escape de HTML, menu...)
    │   ├── home.js         # Dashboard e busca rápida
    │   ├── linhas.js       # Listagem e filtros de linhas
    │   ├── mapa.js         # Mapa, trajetos, paradas e ônibus simulados
    │   ├── horarios.js     # Consulta de horários
    │   └── contato.js      # Validação e envio do formulário
    └── images/favicon.svg
```

## 6. Como funciona (arquitetura)

```
Navegador  ──(HTML/CSS/JS)──►  Flask (app.py)  ──(SQL)──►  SQLite (database.db)
    │                              │
    └───── fetch("/api/...") ──────┘   responde em JSON
    │
    └── Leaflet ──► tiles do OpenStreetMap (internet)
```

1. O Flask entrega as páginas HTML (rotas `/`, `/linhas`, `/mapa`, `/horarios`, `/sobre`).
2. O JavaScript de cada página chama a **API própria** com `fetch()` e monta a tela com os dados recebidos.
3. A API consulta o SQLite e devolve JSON.

### Rotas da API

| Rota | O que faz |
|---|---|
| `GET /api/resumo` | Totais, próximas saídas e avisos do dashboard |
| `GET /api/linhas?q=` | Lista de linhas (com busca opcional) |
| `GET /api/linhas/<id>` | Detalhes: paradas, horários por tipo de dia e trajeto |
| `GET /api/paradas?q=` | Pontos de parada e as linhas que passam por eles |
| `GET /api/busca?q=` | Busca geral por linha, destino ou ponto |
| `GET /api/veiculos-simulados?linha=&hora=` | Ônibus **simulados** (sempre com `simulado: true`) |
| `POST /api/contato` | Grava mensagem do formulário (validação no servidor) |

### Banco de dados

```
linhas ──< linha_paradas >── paradas
  │  └──< horarios            (tipo_dia: util | sabado | domingo)
  └─────< trajetos            (pontos da polilinha do trajeto)
avisos      mensagens
```

Todos os registros de demonstração têm `fonte = 'demo'`.

### Como os ônibus simulados são calculados

Para cada horário de saída que já ocorreu e cuja viagem ainda não terminou, o sistema calcula há quantos minutos o ônibus saiu e o posiciona entre as paradas, de acordo com o tempo estimado de cada trecho. **Não há nenhuma fonte de localização real.**

## 7. Como instalar e executar (VS Code)

Pré-requisito: **Python 3.9 ou superior** e acesso à internet (para o mapa e a fonte).

1. Abra a pasta `BusTrack` no VS Code (`Arquivo > Abrir Pasta`).
2. Abra o terminal (`Ctrl + '`) e crie um ambiente virtual:
   ```bash
   python -m venv venv
   ```
3. Ative o ambiente:
   - Windows (PowerShell): `venv\Scripts\Activate.ps1`
   - Windows (CMD): `venv\Scripts\activate.bat`
   - Linux/macOS: `source venv/bin/activate`
4. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
5. *(Opcional)* Recrie o banco com os dados de demonstração:
   ```bash
   python database/init_db.py
   ```
   Se o arquivo `database/database.db` não existir, o `app.py` o cria sozinho.
6. Inicie o sistema:
   ```bash
   python app.py
   ```
7. Abra **http://127.0.0.1:5000** no navegador.

> Se o PowerShell bloquear a ativação do ambiente virtual, execute `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` e tente novamente.

## 8. Roteiro de testes

| Teste | Resultado esperado |
|---|---|
| Início: digitar `hosp` na busca | Aparece "Hospital Municipal" com as linhas que passam por ele |
| Início: digitar `101` e apertar Enter | Abre `/linhas` filtrada pela linha 101 |
| Linhas: pesquisar `Terminal`; clicar nos filtros | A lista muda; pesquisa sem resultado mostra o estado vazio |
| Linhas: botão **Ver no mapa** | Abre o mapa com a linha selecionada e o trajeto desenhado |
| Mapa: clicar em uma parada | Popup com nome e linhas; clicar no número da linha abre os horários |
| Mapa: ligar/desligar "Ônibus simulados" | Marcadores com selo SIM aparecem/somem; o aviso amarelo acompanha |
| Mapa: simular horário `08:00` | Aparecem vários ônibus simulados; botão **Agora** volta ao horário real |
| Horários: trocar de linha e de aba (dias úteis/sábado/domingo) | A tabela muda; a linha 106 informa "Sem operação" aos sábados |
| Sobre: enviar o formulário vazio | Mensagens de erro em cada campo |
| Sobre: preencher corretamente | Mensagem de sucesso; registro gravado na tabela `mensagens` |
| Celular (ferramentas do navegador, `F12`) | Menu vira botão, layout em coluna única, sem rolagem horizontal |

Para ver as mensagens gravadas: `sqlite3 database/database.db "SELECT * FROM mensagens;"` (ou use a extensão *SQLite Viewer* do VS Code).

## 9. APIs públicas de transporte: o que existe e quais as limitações

O projeto **não** usa nenhuma API de transporte em tempo real, porque nenhuma fonte confiável foi configurada. As opções conhecidas e suas limitações:

| Fonte | O que oferece | Limitações |
|---|---|---|
| **SPTrans — API Olho Vivo** | Posição de ônibus, linhas, paradas e previsão de chegada | Cobre **somente a cidade de São Paulo**; exige cadastro na área de desenvolvedores e um **token**; autenticação por `POST` no endpoint de login; acesso por HTTPS |
| **SPTrans — GTFS** | Arquivos de linhas, paradas, horários e trajetos (dados planejados, não em tempo real) | Cobre somente a cidade de São Paulo; o download exige login e senha da área de desenvolvedores |
| **Outras cidades/operadoras** | Algumas publicam arquivos **GTFS** | Varia por cidade; é preciso verificar com a prefeitura ou a operadora |

Consulte a documentação oficial em <https://www.sptrans.com.br/desenvolvedores/> antes de integrar.

**Como evoluir o projeto com dados reais:** importe o GTFS da sua cidade (arquivos `routes.txt`, `stops.txt`, `stop_times.txt`, `shapes.txt`) para as tabelas `linhas`, `paradas`, `horarios` e `trajetos`, usando outro valor na coluna `fonte`. As páginas continuam funcionando sem alteração. Posição em tempo real só deve ser exibida se vier de uma API oficial do operador.

## 10. Limitações conhecidas

- Dados fictícios (ver aviso no topo).
- Os trajetos são linhas retas entre as paradas; com GTFS, o arquivo `shapes.txt` daria o desenho real das ruas.
- Cada linha tem horários em um único sentido (saída da origem).
- Feriados não são tratados (são considerados dias úteis, sábados ou domingos pelo calendário).
- O horário usado é o do computador onde o servidor roda.

## 11. Créditos

- **OpenStreetMap** — dados e imagens do mapa © colaboradores do OpenStreetMap, licença ODbL. <https://www.openstreetmap.org/copyright>
- **Leaflet** — biblioteca de mapas interativos. <https://leafletjs.com>
- **Inter** — fonte tipográfica via Google Fonts.
- **Flask** — microframework web em Python. <https://flask.palletsprojects.com>


## Publicação na internet (Render)

O projeto pode ser publicado como aplicação Flask. O arquivo `render.yaml` já contém a configuração básica e o `requirements.txt` inclui o Gunicorn.

1. Envie esta pasta para um repositório GitHub.
2. No Render, crie um novo serviço Web conectado ao repositório.
3. Selecione a pasta `BusTrack` como diretório raiz caso o repositório tenha outros arquivos na raiz.
4. O Render pode detectar o `render.yaml`; confirme o comando de build `pip install -r requirements.txt` e o comando de inicialização `gunicorn app:app`.
5. Após a publicação, use o endereço `.onrender.com` gerado pelo Render.

**Observação:** o banco SQLite incluído contém dados demonstrativos. Em hospedagens sem disco persistente, mensagens enviadas pelo formulário podem não permanecer após reinicializações ou novas publicações. Para uso contínuo, configure armazenamento persistente ou um banco de dados hospedado.
