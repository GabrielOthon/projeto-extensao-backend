import os
import re
from datetime import datetime, timezone

from bson.errors import InvalidId
from bson.objectid import ObjectId
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import ASCENDING, DESCENDING, MongoClient


app = Flask(__name__)
CORS(app)


# conecta ao mongodb
cliente = MongoClient(
    os.getenv("MONGO_URI", "mongodb://mongo:27017/ongdb")
)
banco = cliente[os.getenv("MONGO_DB", "ongdb")]
colecao_projetos = banco.projects

### start - definicoes
STATUS_VALIDOS = [
    "Planejamento",
    "Em andamento",
    "Concluído",
    "Pausado",
]

CATEGORIAS_VALIDAS = [
    "Educação",
    "Saúde",
    "Alimentação",
    "Capacitação",
    "Moradia",
    "Cultura e lazer",
    "Meio ambiente",
    "Outros",
]

CAMPOS_OBRIGATORIOS = {
    "name": "Nome do projeto",
    "description": "Descrição",
    "responsible": "Responsável",
    "status": "Status",
    "startDate": "Data de início",
    "objectives": "Objetivos",
    "category": "Categoria",
    "community": "Comunidade atendida",
}
### end - definicoes


def preparar_projeto(projeto):
    """pega oq veio do mongoDB pro frontend consumir"""
    if not projeto:
        return None

    projeto["_id"] = str(projeto["_id"])

    for campo in ["createdAt", "updatedAt"]:
        if isinstance(projeto.get(campo), datetime):
            projeto[campo] = projeto[campo].isoformat()

    return projeto


def converter_id(id_projeto):
    """tenta converter o id do projeto pra ObjectId, se falhar retorna None"""
    try:
        return ObjectId(id_projeto)
    except (InvalidId, TypeError):
        return None


def validar_projeto(dados):
    """recebe oq veio do frontend e valida"""
    if not isinstance(dados, dict):
        return {"body": "Envie os dados em formato JSON."}

    erros = {}

    for campo, nome in CAMPOS_OBRIGATORIOS.items():
        valor = dados.get(campo)

        if valor is None or str(valor).strip() == "":
            erros[campo] = f"{nome} é obrigatório."

    if dados.get("status") not in STATUS_VALIDOS:
        erros["status"] = "Selecione um status válido."

    if dados.get("category") not in CATEGORIAS_VALIDAS:
        erros["category"] = "Selecione uma categoria válida."

    try:
        beneficiarios = int(dados.get("beneficiaries", 0))

        if beneficiarios < 0:
            raise ValueError

        dados["beneficiaries"] = beneficiarios
    except (TypeError, ValueError):
        erros["beneficiaries"] = (
            "A quantidade de beneficiários deve ser um número inteiro positivo."
        )

    return erros


# a partir daqui começam as rotas da API
@app.route("/projects", methods=["GET"])
def listar_projetos():
    filtros = {}

    # querystrings pra pesquisa, filtro por status e categoria
    pesquisa = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip()
    categoria = request.args.get("category", "").strip()

    if pesquisa:
        # da escape pra ignorar char especial
        texto = re.escape(pesquisa)
        filtros["$or"] = [
            {"name": {"$regex": texto, "$options": "i"}},
            {"description": {"$regex": texto, "$options": "i"}},
            {"responsible": {"$regex": texto, "$options": "i"}},
            {"community": {"$regex": texto, "$options": "i"}},
        ]

    if status:
        filtros["status"] = status

    if categoria:
        filtros["category"] = categoria

    campos_ordenacao = {
        "name": "name",
        "createdAt": "createdAt",
        "startDate": "startDate",
        "beneficiaries": "beneficiaries",
    }

    campo = campos_ordenacao.get(
        request.args.get("sort"),
        "createdAt",
    )

    ordem = (
        ASCENDING
        if request.args.get("order") == "asc"
        else DESCENDING
    )

    projetos = colecao_projetos.find(filtros).sort(campo, ordem)

    return jsonify([
        preparar_projeto(projeto)
        for projeto in projetos
    ]), 200

# post de projeto recebendo dados do front e validando com nossa função
@app.route("/projects", methods=["POST"])
def cadastrar_projeto():
    dados = request.get_json(silent=True)
    erros = validar_projeto(dados)

    if erros:
        return jsonify({
            "error": "Dados inválidos.",
            "fields": erros,
        }), 400

    agora = datetime.now(timezone.utc)
    dados["createdAt"] = agora
    dados["updatedAt"] = agora

    resultado = colecao_projetos.insert_one(dados)
    projeto_criado = colecao_projetos.find_one({
        "_id": resultado.inserted_id
    })

    return jsonify(preparar_projeto(projeto_criado)), 201


# get especifico de projeto
@app.route("/projects/<id_projeto>", methods=["GET"])
def mostrar_projeto(id_projeto):
    id_convertido = converter_id(id_projeto)

    if not id_convertido:
        return jsonify({
            "error": "ID do projeto inválido."
        }), 400

    projeto = colecao_projetos.find_one({
        "_id": id_convertido
    })

    if not projeto:
        return jsonify({
            "error": "Projeto não encontrado."
        }), 404

    return jsonify(preparar_projeto(projeto)), 200


# put de projeto recebendo dados do front e validando com nossa função, além de atualizar o campo updatedAt
@app.route("/projects/<id_projeto>", methods=["PUT"])
def atualizar_projeto(id_projeto):
    id_convertido = converter_id(id_projeto)

    if not id_convertido:
        return jsonify({
            "error": "ID do projeto inválido."
        }), 400

    dados = request.get_json(silent=True)
    erros = validar_projeto(dados)

    if erros:
        return jsonify({
            "error": "Dados inválidos.",
            "fields": erros,
        }), 400

    dados.pop("_id", None)
    dados.pop("createdAt", None)
    dados["updatedAt"] = datetime.now(timezone.utc)

    resultado = colecao_projetos.update_one(
        {"_id": id_convertido},
        {"$set": dados},
    )

    if resultado.matched_count == 0:
        return jsonify({
            "error": "Projeto não encontrado."
        }), 404

    projeto_atualizado = colecao_projetos.find_one({
        "_id": id_convertido
    })

    return jsonify(preparar_projeto(projeto_atualizado)), 200


# delete de projeto, validando o id e retornando mensagem de sucesso ou erro
@app.route("/projects/<id_projeto>", methods=["DELETE"])
def excluir_projeto(id_projeto):
    id_convertido = converter_id(id_projeto)

    if not id_convertido:
        return jsonify({
            "error": "ID do projeto inválido."
        }), 400

    resultado = colecao_projetos.delete_one({
        "_id": id_convertido
    })

    if resultado.deleted_count == 0:
        return jsonify({
            "error": "Projeto não encontrado."
        }), 404

    return jsonify({
        "message": "Projeto excluído com sucesso."
    }), 200


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
