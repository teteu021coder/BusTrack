"""
BusTrack - criação e população do banco de dados SQLite.

Uso (a partir da pasta raiz do projeto):
    python database/init_db.py

O script APAGA e recria todas as tabelas, então use com cuidado.

IMPORTANTE: todos os dados inseridos aqui (linhas, paradas, horários,
coordenadas) são FICTÍCIOS, criados apenas para demonstração do sistema.
Eles não representam o serviço real de nenhuma cidade. Cada registro
guarda a coluna `fonte = 'demo'` para deixar isso explícito. Quando houver
dados oficiais (por exemplo, um arquivo GTFS), basta importá-los para as
mesmas tabelas e usar outro valor em `fonte`.
"""
import math
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")

# --------------------------------------------------------------------------
# ESTRUTURA DO BANCO
# --------------------------------------------------------------------------
SCHEMA = """
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS mensagens;
DROP TABLE IF EXISTS avisos;
DROP TABLE IF EXISTS trajetos;
DROP TABLE IF EXISTS horarios;
DROP TABLE IF EXISTS linha_paradas;
DROP TABLE IF EXISTS paradas;
DROP TABLE IF EXISTS linhas;

-- Linhas de ônibus
CREATE TABLE linhas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    numero         TEXT    NOT NULL UNIQUE,
    nome           TEXT    NOT NULL,
    origem         TEXT    NOT NULL,
    destino        TEXT    NOT NULL,
    cor            TEXT    NOT NULL DEFAULT '#2563eb',
    frequencia_min INTEGER,               -- intervalo médio em minutos (dia útil)
    observacao     TEXT,                  -- informação complementar
    descricao      TEXT,
    fonte          TEXT    NOT NULL DEFAULT 'demo'
);

-- Pontos de parada
CREATE TABLE paradas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    nome     TEXT NOT NULL,
    endereco TEXT,
    lat      REAL NOT NULL,
    lng      REAL NOT NULL,
    fonte    TEXT NOT NULL DEFAULT 'demo'
);

-- Relação N:N entre linhas e paradas (com a ordem de passagem)
CREATE TABLE linha_paradas (
    linha_id  INTEGER NOT NULL REFERENCES linhas(id)  ON DELETE CASCADE,
    parada_id INTEGER NOT NULL REFERENCES paradas(id) ON DELETE CASCADE,
    ordem     INTEGER NOT NULL,
    tempo_min REAL    NOT NULL DEFAULT 0,  -- minutos desde a saída da origem
    PRIMARY KEY (linha_id, ordem)
);

-- Horários de saída da origem
CREATE TABLE horarios (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    linha_id INTEGER NOT NULL REFERENCES linhas(id) ON DELETE CASCADE,
    tipo_dia TEXT    NOT NULL CHECK (tipo_dia IN ('util', 'sabado', 'domingo')),
    hora     TEXT    NOT NULL              -- formato HH:MM
);

-- Pontos do desenho do trajeto de cada linha (polilinha)
CREATE TABLE trajetos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    linha_id INTEGER NOT NULL REFERENCES linhas(id) ON DELETE CASCADE,
    ordem    INTEGER NOT NULL,
    lat      REAL    NOT NULL,
    lng      REAL    NOT NULL
);

-- Avisos / informações gerais mostrados no dashboard
CREATE TABLE avisos (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    texto  TEXT NOT NULL,
    tipo   TEXT NOT NULL DEFAULT 'info'    -- info | alerta
);

-- Mensagens enviadas pelo formulário de contato
CREATE TABLE mensagens (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    email     TEXT NOT NULL,
    assunto   TEXT NOT NULL,
    mensagem  TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_horarios_linha_dia ON horarios (linha_id, tipo_dia, hora);
CREATE INDEX idx_linha_paradas_parada ON linha_paradas (parada_id);
CREATE INDEX idx_trajetos_linha ON trajetos (linha_id, ordem);
"""

# --------------------------------------------------------------------------
# DADOS FICTÍCIOS DE DEMONSTRAÇÃO
# (nome, endereço, latitude, longitude) - o id é a posição na lista (1, 2, ...)
# --------------------------------------------------------------------------
PARADAS = [
    ("Terminal Central",           "Região central",        -22.8583, -47.2200),  # 1
    ("Praça da Matriz",            "Região central",        -22.8561, -47.2168),  # 2
    ("Mercado Municipal",          "Região central",        -22.8540, -47.2135),  # 3
    ("Hospital Municipal",         "Zona leste",            -22.8512, -47.2090),  # 4
    ("Escola Técnica",             "Zona leste",            -22.8480, -47.2050),  # 5
    ("Parque Ecológico",           "Zona leste",            -22.8450, -47.2010),  # 6
    ("Jardim das Flores",          "Zona oeste",            -22.8610, -47.2250),  # 7
    ("Vila Esperança",             "Zona oeste",            -22.8640, -47.2300),  # 8
    ("Residencial Aurora",         "Zona oeste",            -22.8670, -47.2350),  # 9
    ("Distrito Industrial",        "Zona oeste",            -22.8720, -47.2400),  # 10
    ("Rodoviária",                 "Região central",        -22.8600, -47.2120),  # 11
    ("Shopping Plaza",             "Zona sudeste",          -22.8650, -47.2060),  # 12
    ("Campus Universitário",       "Zona sudeste",          -22.8700, -47.2000),  # 13
    ("UBS Centro",                 "Região central",        -22.8570, -47.2230),  # 14
    ("Parque Industrial Norte",    "Zona norte",            -22.8400, -47.2250),  # 15
    ("Conjunto Habitacional Sul",  "Zona sul",              -22.8800, -47.2150),  # 16
    ("Estação Ciência",            "Zona noroeste",         -22.8530, -47.2300),  # 17
    ("Bairro Novo Horizonte",      "Zona noroeste",         -22.8500, -47.2380),  # 18
    ("Praça do Lago",              "Região central",        -22.8620, -47.2180),  # 19
    ("Jardim Primavera",           "Zona sul",              -22.8750, -47.2250),  # 20
]

# Horários por tipo de dia: lista de (início, fim, passo_em_minutos)
def _padrao(freq):
    return {
        "util":    [("05:30", "22:30", freq)],
        "sabado":  [("06:00", "21:00", round(freq * 1.5))],
        "domingo": [("07:00", "20:00", freq * 2)],
    }

LINHAS = [
    {
        "numero": "101", "nome": "Central – Parque Ecológico",
        "origem": "Terminal Central", "destino": "Parque Ecológico",
        "cor": "#2563eb", "freq": 15, "paradas": [1, 2, 3, 4, 5, 6],
        "descricao": "Liga o centro ao Parque Ecológico passando pelo Hospital Municipal e pela Escola Técnica.",
        "observacao": None, "horarios": _padrao(15),
    },
    {
        "numero": "102", "nome": "Central – Distrito Industrial",
        "origem": "Terminal Central", "destino": "Distrito Industrial",
        "cor": "#0891b2", "freq": 20, "paradas": [1, 14, 7, 8, 9, 10],
        "descricao": "Atende os bairros da zona oeste até o Distrito Industrial.",
        "observacao": "Reforço nos horários de entrada e saída de turnos (demonstração).",
        "horarios": _padrao(20),
    },
    {
        "numero": "103", "nome": "Rodoviária – Campus Universitário",
        "origem": "Rodoviária", "destino": "Campus Universitário",
        "cor": "#7c3aed", "freq": 30, "paradas": [11, 19, 12, 13],
        "descricao": "Conecta a rodoviária ao Shopping Plaza e ao Campus Universitário.",
        "observacao": None, "horarios": _padrao(30),
    },
    {
        "numero": "104", "nome": "Central – Novo Horizonte",
        "origem": "Terminal Central", "destino": "Bairro Novo Horizonte",
        "cor": "#059669", "freq": 25, "paradas": [1, 14, 17, 18],
        "descricao": "Atende a zona noroeste, passando pela Estação Ciência.",
        "observacao": None, "horarios": _padrao(25),
    },
    {
        "numero": "105", "nome": "Central – Conjunto Habitacional Sul",
        "origem": "Terminal Central", "destino": "Conjunto Habitacional Sul",
        "cor": "#d97706", "freq": 30, "paradas": [1, 19, 20, 16],
        "descricao": "Liga o centro à zona sul da cidade.",
        "observacao": None, "horarios": _padrao(30),
    },
    {
        "numero": "106", "nome": "Circular Norte (horário de pico)",
        "origem": "Terminal Central", "destino": "Parque Industrial Norte",
        "cor": "#dc2626", "freq": 20, "paradas": [1, 14, 17, 15],
        "descricao": "Linha de reforço que opera somente nos horários de pico dos dias úteis.",
        "observacao": "Opera apenas em dias úteis, nos horários de pico.",
        "horarios": {"util": [("06:00", "09:00", 20), ("16:00", "19:40", 20)]},
    },
    {
        "numero": "107", "nome": "Rodoviária – Parque Ecológico",
        "origem": "Rodoviária", "destino": "Parque Ecológico",
        "cor": "#db2777", "freq": 40, "paradas": [11, 3, 4, 5, 6],
        "descricao": "Ligação direta entre a rodoviária e a região leste.",
        "observacao": None, "horarios": _padrao(40),
    },
]

AVISOS = [
    ("Dados de demonstração",
     "As linhas, paradas e horários exibidos são fictícios e servem apenas para demonstrar o funcionamento do sistema.",
     "alerta"),
    ("Ônibus no mapa são simulados",
     "A posição dos veículos é calculada a partir dos horários cadastrados. Não representa ônibus reais em circulação.",
     "alerta"),
    ("Como usar o BusTrack",
     "Pesquise uma linha, veja o trajeto no mapa e consulte os horários de saída para dias úteis, sábados e domingos.",
     "info"),
]

VELOCIDADE_MEDIA_KMH = 15   # usada para estimar o tempo entre paradas (demo)
TEMPO_PARADA_MIN = 1.0      # tempo de embarque/desembarque por parada (demo)


def _distancia_km(lat1, lng1, lat2, lng2):
    """Distância entre dois pontos (fórmula de Haversine)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _gerar_horas(inicio, fim, passo):
    """Gera ['05:30', '05:45', ...] de `inicio` até `fim`, de `passo` em `passo` minutos."""
    h, m = map(int, inicio.split(":"))
    h2, m2 = map(int, fim.split(":"))
    atual, limite = h * 60 + m, h2 * 60 + m2
    horas = []
    while atual <= limite:
        horas.append(f"{atual // 60:02d}:{atual % 60:02d}")
        atual += passo
    return horas


def init_db(caminho=DB_PATH):
    """Recria o banco e insere os dados de demonstração."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    conn = sqlite3.connect(caminho)
    conn.executescript(SCHEMA)
    cur = conn.cursor()

    # Paradas
    for nome, endereco, lat, lng in PARADAS:
        cur.execute(
            "INSERT INTO paradas (nome, endereco, lat, lng) VALUES (?, ?, ?, ?)",
            (nome, endereco, lat, lng),
        )

    # Linhas, paradas da linha, trajeto e horários
    for linha in LINHAS:
        cur.execute(
            """INSERT INTO linhas (numero, nome, origem, destino, cor,
                                   frequencia_min, observacao, descricao)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (linha["numero"], linha["nome"], linha["origem"], linha["destino"],
             linha["cor"], linha["freq"], linha["observacao"], linha["descricao"]),
        )
        linha_id = cur.lastrowid

        tempo = 0.0
        anterior = None
        for ordem, parada_id in enumerate(linha["paradas"], start=1):
            _, _, lat, lng = PARADAS[parada_id - 1]
            if anterior is not None:
                km = _distancia_km(anterior[0], anterior[1], lat, lng)
                tempo += km / VELOCIDADE_MEDIA_KMH * 60 + TEMPO_PARADA_MIN
            anterior = (lat, lng)
            cur.execute(
                "INSERT INTO linha_paradas (linha_id, parada_id, ordem, tempo_min) VALUES (?, ?, ?, ?)",
                (linha_id, parada_id, ordem, round(tempo, 2)),
            )
            # Trajeto simples: linha reta entre as paradas.
            # Com um GTFS real, aqui entrariam os pontos do arquivo shapes.txt.
            cur.execute(
                "INSERT INTO trajetos (linha_id, ordem, lat, lng) VALUES (?, ?, ?, ?)",
                (linha_id, ordem, lat, lng),
            )

        for tipo_dia, faixas in linha["horarios"].items():
            for inicio, fim, passo in faixas:
                for hora in _gerar_horas(inicio, fim, passo):
                    cur.execute(
                        "INSERT INTO horarios (linha_id, tipo_dia, hora) VALUES (?, ?, ?)",
                        (linha_id, tipo_dia, hora),
                    )

    for titulo, texto, tipo in AVISOS:
        cur.execute("INSERT INTO avisos (titulo, texto, tipo) VALUES (?, ?, ?)", (titulo, texto, tipo))

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Banco criado com sucesso em: {DB_PATH}")
