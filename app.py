"""
BusTrack - Sistema de Acompanhamento de Transporte Público
Backend em Flask: serve as páginas HTML e uma API JSON consumida pelo frontend.

Executar:  python app.py   (e abrir http://127.0.0.1:5000)
"""
import os
import re
import sqlite3
from datetime import datetime

from flask import Flask, g, jsonify, render_template, request

from database.init_db import DB_PATH, init_db

app = Flask(__name__)
app.json.ensure_ascii = False  # mantém acentos nas respostas JSON

# Se o banco ainda não existe, cria automaticamente com os dados de demonstração
if not os.path.exists(DB_PATH):
    init_db()

DIAS = {"util": "Dias úteis", "sabado": "Sábados", "domingo": "Domingos"}
ASSUNTOS = ["Dúvida", "Sugestão", "Erro nos dados", "Elogio", "Outro"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HORA_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


# --------------------------------------------------------------------------
# Banco de dados
# --------------------------------------------------------------------------
def get_db():
    """Abre (uma vez por requisição) a conexão com o SQLite."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def fechar_db(_erro):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def consulta(sql, params=()):
    """Executa um SELECT e devolve uma lista de dicionários."""
    return [dict(linha) for linha in get_db().execute(sql, params).fetchall()]


# --------------------------------------------------------------------------
# Funções auxiliares
# --------------------------------------------------------------------------
def tipo_dia_de(data):
    """Converte uma data em 'util', 'sabado' ou 'domingo' (feriados não são tratados)."""
    return ("util", "util", "util", "util", "util", "sabado", "domingo")[data.weekday()]


def hora_para_minutos(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def erro(mensagem, codigo=400, **extra):
    return jsonify({"erro": mensagem, **extra}), codigo


# --------------------------------------------------------------------------
# Páginas
# --------------------------------------------------------------------------
@app.route("/")
def pagina_inicio():
    return render_template("index.html", active="inicio")


@app.route("/linhas")
def pagina_linhas():
    return render_template("linhas.html", active="linhas")


@app.route("/mapa")
def pagina_mapa():
    return render_template("mapa.html", active="mapa")


@app.route("/horarios")
def pagina_horarios():
    return render_template("horarios.html", active="horarios")


@app.route("/sobre")
def pagina_sobre():
    return render_template("sobre.html", active="sobre", assuntos=ASSUNTOS)


@app.errorhandler(404)
def nao_encontrado(_e):
    if request.path.startswith("/api/"):
        return erro("Recurso não encontrado.", 404)
    return render_template("404.html", active=""), 404


# --------------------------------------------------------------------------
# API: resumo do dashboard
# --------------------------------------------------------------------------
@app.route("/api/resumo")
def api_resumo():
    agora = datetime.now()
    tipo = tipo_dia_de(agora)
    hora_atual = agora.strftime("%H:%M")

    totais = consulta(
        """SELECT (SELECT COUNT(*) FROM linhas)   AS linhas,
                  (SELECT COUNT(*) FROM paradas)  AS paradas,
                  (SELECT COUNT(*) FROM horarios) AS horarios"""
    )[0]
    totais["saidas_hoje"] = consulta(
        "SELECT COUNT(*) AS n FROM horarios WHERE tipo_dia = ?", (tipo,)
    )[0]["n"]

    proximas = consulta(
        """SELECT l.id AS linha_id, l.numero, l.nome, l.destino, l.cor, h.hora
           FROM horarios h JOIN linhas l ON l.id = h.linha_id
           WHERE h.tipo_dia = ? AND h.hora >= ?
           ORDER BY h.hora, l.numero LIMIT 6""",
        (tipo, hora_atual),
    )
    avisos = consulta("SELECT titulo, texto, tipo FROM avisos ORDER BY id")

    return jsonify({
        "totais": totais,
        "tipo_dia": tipo,
        "tipo_dia_nome": DIAS[tipo],
        "hora_servidor": hora_atual,
        "proximas_saidas": proximas,
        "avisos": avisos,
    })


# --------------------------------------------------------------------------
# API: linhas
# --------------------------------------------------------------------------
@app.route("/api/linhas")
def api_linhas():
    q = request.args.get("q", "").strip()[:60]
    tipo = tipo_dia_de(datetime.now())

    sql = """
        SELECT l.id, l.numero, l.nome, l.origem, l.destino, l.cor,
               l.frequencia_min, l.observacao, l.descricao, l.fonte,
               (SELECT COUNT(*) FROM linha_paradas lp WHERE lp.linha_id = l.id) AS total_paradas,
               (SELECT MAX(tempo_min) FROM linha_paradas lp WHERE lp.linha_id = l.id) AS duracao_min,
               (SELECT GROUP_CONCAT(DISTINCT h.tipo_dia) FROM horarios h WHERE h.linha_id = l.id) AS dias,
               (SELECT MIN(hora) FROM horarios h WHERE h.linha_id = l.id AND h.tipo_dia = :tipo) AS primeira_hoje,
               (SELECT MAX(hora) FROM horarios h WHERE h.linha_id = l.id AND h.tipo_dia = :tipo) AS ultima_hoje
        FROM linhas l
    """
    params = {"tipo": tipo}
    if q:
        sql += """ WHERE l.numero LIKE :q OR l.nome LIKE :q OR l.origem LIKE :q OR l.destino LIKE :q
                   OR EXISTS (SELECT 1 FROM linha_paradas lp JOIN paradas p ON p.id = lp.parada_id
                              WHERE lp.linha_id = l.id AND p.nome LIKE :q)"""
        params["q"] = f"%{q}%"
    sql += " ORDER BY l.numero"

    linhas = consulta(sql, params)
    for l in linhas:
        l["dias"] = l["dias"].split(",") if l["dias"] else []
        l["duracao_min"] = round(l["duracao_min"] or 0)
        l["opera_hoje"] = l["primeira_hoje"] is not None
    return jsonify({"tipo_dia": tipo, "total": len(linhas), "linhas": linhas})


def _buscar_linha(linha_id):
    linhas = consulta("SELECT * FROM linhas WHERE id = ?", (linha_id,))
    return linhas[0] if linhas else None


@app.route("/api/linhas/<int:linha_id>")
def api_linha(linha_id):
    linha = _buscar_linha(linha_id)
    if not linha:
        return erro("Linha não encontrada.", 404)

    paradas = consulta(
        """SELECT p.id, p.nome, p.endereco, p.lat, p.lng, lp.ordem, lp.tempo_min
           FROM linha_paradas lp JOIN paradas p ON p.id = lp.parada_id
           WHERE lp.linha_id = ? ORDER BY lp.ordem""",
        (linha_id,),
    )
    horarios = {"util": [], "sabado": [], "domingo": []}
    for h in consulta(
        "SELECT tipo_dia, hora FROM horarios WHERE linha_id = ? ORDER BY hora", (linha_id,)
    ):
        horarios[h["tipo_dia"]].append(h["hora"])
    trajeto = [
        [t["lat"], t["lng"]]
        for t in consulta("SELECT lat, lng FROM trajetos WHERE linha_id = ? ORDER BY ordem", (linha_id,))
    ]
    linha["duracao_min"] = round(paradas[-1]["tempo_min"]) if paradas else 0
    return jsonify({
        "linha": linha, "paradas": paradas, "horarios": horarios, "trajeto": trajeto,
        "tipo_dia_atual": tipo_dia_de(datetime.now()),
    })


# --------------------------------------------------------------------------
# API: paradas
# --------------------------------------------------------------------------
@app.route("/api/paradas")
def api_paradas():
    q = request.args.get("q", "").strip()[:60]
    sql = """
        SELECT p.id, p.nome, p.endereco, p.lat, p.lng, p.fonte,
               (SELECT GROUP_CONCAT(l.numero, ',')
                  FROM (SELECT DISTINCT l.numero FROM linha_paradas lp
                        JOIN linhas l ON l.id = lp.linha_id
                        WHERE lp.parada_id = p.id ORDER BY l.numero) l) AS linhas
        FROM paradas p
    """
    params = ()
    if q:
        sql += " WHERE p.nome LIKE ? OR p.endereco LIKE ?"
        params = (f"%{q}%", f"%{q}%")
    sql += " ORDER BY p.nome"
    paradas = consulta(sql, params)
    for p in paradas:
        p["linhas"] = p["linhas"].split(",") if p["linhas"] else []
    return jsonify({"total": len(paradas), "paradas": paradas})


# --------------------------------------------------------------------------
# API: busca geral (linha, destino ou ponto de ônibus)
# --------------------------------------------------------------------------
@app.route("/api/busca")
def api_busca():
    q = request.args.get("q", "").strip()[:60]
    if len(q) < 2:
        return jsonify({"q": q, "linhas": [], "paradas": []})
    like = f"%{q}%"
    linhas = consulta(
        """SELECT id, numero, nome, origem, destino, cor FROM linhas
           WHERE numero LIKE ? OR nome LIKE ? OR origem LIKE ? OR destino LIKE ?
           ORDER BY numero LIMIT 8""",
        (like, like, like, like),
    )
    paradas = consulta(
        """SELECT p.id, p.nome, p.endereco,
                  (SELECT GROUP_CONCAT(l.numero, ', ')
                     FROM (SELECT DISTINCT l.numero FROM linha_paradas lp
                           JOIN linhas l ON l.id = lp.linha_id
                           WHERE lp.parada_id = p.id ORDER BY l.numero) l) AS linhas
           FROM paradas p WHERE p.nome LIKE ? OR p.endereco LIKE ?
           ORDER BY p.nome LIMIT 8""",
        (like, like),
    )
    return jsonify({"q": q, "linhas": linhas, "paradas": paradas})


# --------------------------------------------------------------------------
# API: ônibus SIMULADOS
# Não existe aqui nenhuma fonte de posição real. A posição é calculada a
# partir dos horários cadastrados: se uma viagem saiu da origem há X minutos,
# o "ônibus" está no ponto correspondente do trajeto (interpolando entre as
# paradas). Toda resposta é marcada com simulado = true.
# --------------------------------------------------------------------------
@app.route("/api/veiculos-simulados")
def api_veiculos_simulados():
    agora = datetime.now()
    hora_param = request.args.get("hora", "").strip()
    if hora_param:
        if not HORA_RE.match(hora_param):
            return erro("Hora inválida. Use o formato HH:MM.")
        minutos_agora = float(hora_para_minutos(hora_param))
        hora_usada = hora_param
    else:
        minutos_agora = agora.hour * 60 + agora.minute + agora.second / 60
        hora_usada = agora.strftime("%H:%M")

    tipo = request.args.get("dia", "").strip() or tipo_dia_de(agora)
    if tipo not in DIAS:
        return erro("Tipo de dia inválido.")

    filtro_linha = request.args.get("linha", type=int)
    sql = "SELECT id, numero, nome, destino, cor FROM linhas"
    params = ()
    if filtro_linha:
        sql += " WHERE id = ?"
        params = (filtro_linha,)

    veiculos = []
    for linha in consulta(sql, params):
        paradas = consulta(
            """SELECT p.nome, p.lat, p.lng, lp.tempo_min
               FROM linha_paradas lp JOIN paradas p ON p.id = lp.parada_id
               WHERE lp.linha_id = ? ORDER BY lp.ordem""",
            (linha["id"],),
        )
        if len(paradas) < 2:
            continue
        duracao = paradas[-1]["tempo_min"]
        saidas = consulta(
            "SELECT hora FROM horarios WHERE linha_id = ? AND tipo_dia = ? ORDER BY hora",
            (linha["id"], tipo),
        )
        for saida in saidas:
            decorrido = minutos_agora - hora_para_minutos(saida["hora"])
            if not 0 <= decorrido <= duracao:
                continue
            for i in range(len(paradas) - 1):
                a, b = paradas[i], paradas[i + 1]
                if a["tempo_min"] <= decorrido <= b["tempo_min"]:
                    trecho = b["tempo_min"] - a["tempo_min"]
                    f = (decorrido - a["tempo_min"]) / trecho if trecho else 0
                    veiculos.append({
                        "id": f"{linha['id']}-{saida['hora']}",
                        "linha_id": linha["id"],
                        "numero": linha["numero"],
                        "nome": linha["nome"],
                        "destino": linha["destino"],
                        "cor": linha["cor"],
                        "saida": saida["hora"],
                        "lat": a["lat"] + (b["lat"] - a["lat"]) * f,
                        "lng": a["lng"] + (b["lng"] - a["lng"]) * f,
                        "proxima_parada": b["nome"],
                        "simulado": True,
                    })
                    break

    return jsonify({
        "simulado": True,
        "aviso": "Posições SIMULADAS a partir dos horários cadastrados. Não são veículos reais.",
        "hora_referencia": hora_usada,
        "tipo_dia": tipo,
        "total": len(veiculos),
        "veiculos": veiculos,
    })


# --------------------------------------------------------------------------
# API: formulário de contato (com validação no servidor)
# --------------------------------------------------------------------------
@app.route("/api/contato", methods=["POST"])
def api_contato():
    dados = request.get_json(silent=True) or {}
    nome = str(dados.get("nome", "")).strip()
    email = str(dados.get("email", "")).strip()
    assunto = str(dados.get("assunto", "")).strip()
    mensagem = str(dados.get("mensagem", "")).strip()

    erros = {}
    if len(nome) < 3:
        erros["nome"] = "Informe seu nome (mínimo de 3 caracteres)."
    elif len(nome) > 80:
        erros["nome"] = "O nome deve ter no máximo 80 caracteres."
    if not EMAIL_RE.match(email) or len(email) > 120:
        erros["email"] = "Informe um e-mail válido."
    if assunto not in ASSUNTOS:
        erros["assunto"] = "Selecione um assunto."
    if len(mensagem) < 10:
        erros["mensagem"] = "A mensagem deve ter pelo menos 10 caracteres."
    elif len(mensagem) > 1000:
        erros["mensagem"] = "A mensagem deve ter no máximo 1000 caracteres."

    if erros:
        return erro("Dados inválidos.", 400, campos=erros)

    db = get_db()
    db.execute(
        "INSERT INTO mensagens (nome, email, assunto, mensagem) VALUES (?, ?, ?, ?)",
        (nome, email, assunto, mensagem),
    )
    db.commit()
    return jsonify({"mensagem": "Mensagem enviada com sucesso! Obrigado pelo contato."}), 201


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
