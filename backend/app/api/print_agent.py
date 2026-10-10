"""API para los agentes de impresión de las cajas (OPS-03).

Se autentican con la cabecera X-Agent-Key (clave por caja que genera el admin), no con JWT.
"""
import base64

from flask import Blueprint, jsonify, request

from app.services import print_queue_service

print_agent_bp = Blueprint("print_agent", __name__)


def _agent_register():
    return print_queue_service.authenticate_agent(request.headers.get("X-Agent-Key"))


@print_agent_bp.route("/jobs", methods=["GET"])
def get_jobs():
    register = _agent_register()
    if not register:
        return jsonify({"error": "Clave de agente inválida"}), 401
    jobs = print_queue_service.claim_jobs(register)
    return jsonify({
        "jobs": [
            {"id": job.id, "kind": job.kind, "payload_b64": base64.b64encode(job.payload).decode()}
            for job in jobs
        ]
    }), 200


@print_agent_bp.route("/jobs/<int:job_id>/result", methods=["POST"])
def post_result(job_id):
    register = _agent_register()
    if not register:
        return jsonify({"error": "Clave de agente inválida"}), 401
    data = request.get_json(silent=True) or {}
    job = print_queue_service.report_result(
        register, job_id, bool(data.get("ok")), data.get("error")
    )
    if not job:
        return jsonify({"error": "Trabajo no encontrado"}), 404
    return jsonify({"id": job.id, "status": job.status}), 200
