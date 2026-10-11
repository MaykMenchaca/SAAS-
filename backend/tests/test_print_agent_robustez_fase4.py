"""Robustez de la cola de impresión, agente e instaladores (Subfase 4.12, OPS-17..OPS-24)."""
import base64
import importlib.util
from datetime import timedelta
from pathlib import Path

import pytest

from app.utils import timeutil

ROOT = Path(__file__).parents[2]


@pytest.fixture
def caja_con_agente(client, admin_token, seed_cash_register):
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.patch(f"/api/cash-register/registers/{seed_cash_register.id}", json={"print_via_agent": True}, headers=headers)
    return client.post(f"/api/cash-register/registers/{seed_cash_register.id}/agent-key", headers=headers).get_json()["agent_key"]


def _jobs(client, key):
    return client.get("/api/print-agent/jobs", headers={"X-Agent-Key": key})


def _vender(client, token, session_id, product_id, method="efectivo"):
    response = client.post(
        "/api/sales/", headers={"Authorization": f"Bearer {token}"},
        json={"session_id": session_id, "items": [{"product_id": product_id, "quantity": 1}],
              "payments": [{"method": method, "amount": "116.00"}]},
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _mover_reloj(monkeypatch, segundos):
    futuro = timeutil.utc_now() + timedelta(seconds=segundos)
    monkeypatch.setattr(timeutil, "utc_now", lambda: futuro)


# ── OPS-17: entrega sin confirmación y estado visible ──────────────────────

def test_trabajo_entregado_sin_confirmacion_pasa_a_error(
    client, admin_token, db, seed_open_session, seed_product_for_sale, caja_con_agente, monkeypatch
):
    from app.models.printing import PrintJob

    sale = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")
    client.post(f"/api/printing/sales/{sale['id']}/ticket", json={"send": True},
                headers={"Authorization": f"Bearer {admin_token}"})
    assert len(_jobs(client, caja_con_agente).get_json()["jobs"]) == 1

    _mover_reloj(monkeypatch, 3 * 60)
    _jobs(client, caja_con_agente)
    db.session.remove()
    job = PrintJob.query.one()
    assert job.status == "error"
    assert "confirmación" in job.error


def test_ticket_encolado_informa_si_el_agente_no_esta_conectado(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente
):
    sale = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")
    headers = {"Authorization": f"Bearer {admin_token}"}

    data = client.post(f"/api/printing/sales/{sale['id']}/ticket", json={"send": True}, headers=headers).get_json()
    assert data["queued"] is True and data["agent_online"] is False

    _jobs(client, caja_con_agente)  # el agente se conecta
    data = client.post(f"/api/printing/sales/{sale['id']}/ticket", json={"send": True}, headers=headers).get_json()
    assert data["agent_online"] is True


def test_trabajo_incluye_segundos_restantes(client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    job = _jobs(client, caja_con_agente).get_json()["jobs"][0]
    assert 0 < job["expires_in"] <= 30


# ── OPS-22: robustez de la cola ────────────────────────────────────────────

def test_clave_con_digitos_unicode_da_401(client, caja_con_agente):
    assert _jobs(client, "².secreto").status_code == 401


def test_resultado_solo_desde_entregado(
    client, admin_token, db, seed_open_session, seed_product_for_sale, caja_con_agente
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    job = _jobs(client, caja_con_agente).get_json()["jobs"][0]
    headers = {"X-Agent-Key": caja_con_agente}
    assert client.post(f"/api/print-agent/jobs/{job['id']}/result", json={"ok": True}, headers=headers).status_code == 200
    # Un segundo reporte (o sobre un trabajo ya cerrado) no cambia el estado
    response = client.post(f"/api/print-agent/jobs/{job['id']}/result", json={"ok": False, "error": "x"}, headers=headers)
    assert response.status_code == 409


def test_falla_al_encolar_el_cajon_no_rompe_la_venta(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente, monkeypatch
):
    from app.services import print_queue_service

    def falla(*args, **kwargs):
        raise RuntimeError("BD no disponible")

    monkeypatch.setattr(print_queue_service, "enqueue", falla)
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)


# ── OPS-21: sin escrituras en cada sondeo ──────────────────────────────────

def test_sondeo_no_actualiza_last_seen_en_cada_peticion(client, db, seed_cash_register, caja_con_agente, monkeypatch):
    from app.models.sale import CashRegister

    register_id = seed_cash_register.id
    _jobs(client, caja_con_agente)
    db.session.remove()
    primero = db.session.get(CashRegister, register_id).agent_last_seen_at

    _mover_reloj(monkeypatch, 3)
    _jobs(client, caja_con_agente)
    db.session.remove()
    assert db.session.get(CashRegister, register_id).agent_last_seen_at == primero

    _mover_reloj(monkeypatch, 15)
    _jobs(client, caja_con_agente)
    db.session.remove()
    assert db.session.get(CashRegister, register_id).agent_last_seen_at > primero


# ── Agente: caducidad local, reportes y estado de la impresora (OPS-17, OPS-18) ─

def _agente():
    path = ROOT / "tools" / "print-agent" / "pos_print_agent.py"
    spec = importlib.util.spec_from_file_location("pos_print_agent_robustez", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _job(job_id, data, expires_in=30):
    return {"id": job_id, "kind": "drawer", "payload_b64": base64.b64encode(data).decode(), "expires_in": expires_in}


def test_agente_descarta_trabajo_caducado_y_no_imprime():
    agente = _agente()
    impresos, reportes = [], []
    agente.run_once(
        fetch_jobs=lambda: [_job(1, b"CAJON", expires_in=0)],
        print_raw=impresos.append,
        report=lambda job_id, ok, error=None: reportes.append((job_id, ok, error)),
    )
    assert impresos == []
    assert reportes[0][:2] == (1, False) and "caduc" in reportes[0][2]


def test_un_reporte_fallido_no_aborta_el_lote():
    agente = _agente()
    impresos = []

    def reporte_que_falla(job_id, ok, error=None):
        if job_id == 1:
            raise OSError("red caída")

    agente.run_once(
        fetch_jobs=lambda: [_job(1, b"A"), _job(2, b"B")],
        print_raw=impresos.append,
        report=reporte_que_falla,
    )
    assert impresos == [b"A", b"B"]


def test_impresora_no_lista_no_recibe_datos():
    agente = _agente()
    impresos, reportes = [], []
    agente.run_once(
        fetch_jobs=lambda: [_job(1, b"CAJON")],
        print_raw=impresos.append,
        report=lambda job_id, ok, error=None: reportes.append((ok, error)),
        printer_ready=lambda: "Impresora fuera de línea",
    )
    assert impresos == []
    assert reportes == [(False, "Impresora fuera de línea")]


# ── Instaladores (OPS-19, OPS-20, OPS-22, OPS-24) ──────────────────────────

def _read(*parts):
    return ROOT.joinpath(*parts).read_text(encoding="utf-8")


def test_install_service_reconfigura_un_servicio_existente():
    script = _read("install-service.ps1")
    assert "set $ServiceName Application" in script and "set $ServiceName AppParameters" in script
    assert "Restart-Service" in script
    # Todas las llamadas de configuración pasan por Invoke-Nssm, que aborta si nssm falla
    assert "function Invoke-Nssm" in script and "LASTEXITCODE" in script
    assert script.count("Invoke-Nssm set") >= 8
    assert "/api/health" in script


def test_install_agent_instala_en_carpeta_protegida_y_guarda_clave_con_acl():
    script = _read("tools", "print-agent", "install-agent.ps1")
    assert "ProgramFiles" in script and "icacls" in script
    assert "agent.key" in script and "POS_AGENT_KEY_FILE" in script
    assert "POS_AGENT_KEY=" not in script, "la clave no debe quedar en el entorno del servicio"
    assert "Restart-Service" in script
    assert "3.11" in script


def test_agente_lee_la_clave_de_archivo():
    assert "POS_AGENT_KEY_FILE" in _read("tools", "print-agent", "pos_print_agent.py")


def test_update_production_detiene_el_servicio_antes_de_compilar_y_no_expone_la_contrasena():
    script = _read("update-production.ps1")
    assert script.index("Stop-Service") < script.index("build-production.ps1")
    assert "PGPASSWORD" in script
    assert "BACKUP_DIR" in script
