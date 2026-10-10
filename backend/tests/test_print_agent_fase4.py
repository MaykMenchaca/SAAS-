"""Impresión en cajas remotas con agente local y cola de trabajos (Subfase 4.11, OPS-03, OPS-12)."""
import base64
import importlib.util
from datetime import timedelta
from pathlib import Path

import pytest

from app.utils import timeutil

ESC_INIT = b"\x1b@"
DRAWER_KICK = b"\x1bp\x00\x19\x96"


@pytest.fixture
def caja_con_agente(client, admin_token, seed_cash_register):
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = client.patch(
        f"/api/cash-register/registers/{seed_cash_register.id}",
        json={"print_via_agent": True}, headers=headers,
    )
    assert response.status_code == 200, response.get_json()
    response = client.post(f"/api/cash-register/registers/{seed_cash_register.id}/agent-key", headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["agent_key"]


def _jobs(client, key):
    return client.get("/api/print-agent/jobs", headers={"X-Agent-Key": key})


def _vender(client, token, session_id, product_id, method="efectivo"):
    response = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id": session_id,
            "items": [{"product_id": product_id, "quantity": 1}],
            "payments": [{"method": method, "amount": "116.00"}],
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_admin_genera_clave_y_no_se_vuelve_a_mostrar(client, admin_token, caja_con_agente, seed_cash_register):
    assert caja_con_agente.startswith(f"{seed_cash_register.id}.")
    listado = client.get("/api/cash-register/", headers={"Authorization": f"Bearer {admin_token}"}).get_json()
    caja = listado[0]
    assert caja["print_via_agent"] is True
    assert caja["agent_configured"] is True
    assert "agent_key" not in caja and "agent_key_hash" not in caja


def test_solo_admin_genera_clave(client, regular_user_token, seed_cash_register):
    response = client.post(
        f"/api/cash-register/registers/{seed_cash_register.id}/agent-key",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403


@pytest.mark.parametrize("key", [None, "", "1.clave-falsa", "no-tiene-formato", "999.x"])
def test_agente_con_clave_invalida_da_401(client, caja_con_agente, key):
    headers = {} if key is None else {"X-Agent-Key": key}
    assert client.get("/api/print-agent/jobs", headers=headers).status_code == 401


def test_venta_en_efectivo_encola_el_cajon_para_el_agente(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "efectivo")

    jobs = _jobs(client, caja_con_agente).get_json()["jobs"]
    assert [j["kind"] for j in jobs] == ["drawer"]
    assert DRAWER_KICK in base64.b64decode(jobs[0]["payload_b64"])


def test_venta_con_tarjeta_no_encola_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")
    assert _jobs(client, caja_con_agente).get_json()["jobs"] == []


def test_imprimir_ticket_lo_encola_para_la_caja(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente
):
    sale = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")
    response = client.post(
        f"/api/printing/sales/{sale['id']}/ticket",
        json={"send": True}, headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert response.get_json()["sent"] is True
    assert response.get_json()["queued"] is True

    jobs = _jobs(client, caja_con_agente).get_json()["jobs"]
    payload = base64.b64decode(jobs[0]["payload_b64"])
    assert jobs[0]["kind"] == "ticket"
    assert payload.startswith(ESC_INIT + b"\x1bt\x02")
    assert sale["folio"].encode() in payload
    assert DRAWER_KICK not in payload


def test_cada_trabajo_se_entrega_una_sola_vez(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_agente
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    assert len(_jobs(client, caja_con_agente).get_json()["jobs"]) == 1
    assert _jobs(client, caja_con_agente).get_json()["jobs"] == []


def test_cajon_caducado_no_se_entrega(
    client, admin_token, db, seed_open_session, seed_product_for_sale, caja_con_agente, monkeypatch
):
    from app.models.printing import PrintJob

    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    futuro = timeutil.utc_now() + timedelta(seconds=31)
    monkeypatch.setattr(timeutil, "utc_now", lambda: futuro)

    assert _jobs(client, caja_con_agente).get_json()["jobs"] == []
    db.session.remove()
    assert PrintJob.query.one().status == "caducado"


def test_agente_reporta_resultado(
    client, admin_token, db, seed_open_session, seed_product_for_sale, caja_con_agente
):
    from app.models.printing import PrintJob

    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    job = _jobs(client, caja_con_agente).get_json()["jobs"][0]

    response = client.post(
        f"/api/print-agent/jobs/{job['id']}/result",
        json={"ok": False, "error": "Impresora sin papel"},
        headers={"X-Agent-Key": caja_con_agente},
    )
    assert response.status_code == 200
    db.session.remove()
    guardado = db.session.get(PrintJob, job["id"])
    assert guardado.status == "error"
    assert guardado.error == "Impresora sin papel"


def test_agente_no_ve_ni_reporta_trabajos_de_otra_caja(
    client, admin_token, db, seed_open_session, seed_product_for_sale, caja_con_agente
):
    from app.models.sale import CashRegister

    otra = CashRegister(name="Caja 2", print_via_agent=True)
    db.session.add(otra)
    db.session.commit()
    otra_key = client.post(
        f"/api/cash-register/registers/{otra.id}/agent-key",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).get_json()["agent_key"]

    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    assert _jobs(client, otra_key).get_json()["jobs"] == []

    job = _jobs(client, caja_con_agente).get_json()["jobs"][0]
    response = client.post(
        f"/api/print-agent/jobs/{job['id']}/result", json={"ok": True}, headers={"X-Agent-Key": otra_key},
    )
    assert response.status_code == 404


def test_estado_del_agente_visible_para_el_admin(client, admin_token, caja_con_agente):
    _jobs(client, caja_con_agente)
    caja = client.get("/api/cash-register/", headers={"Authorization": f"Bearer {admin_token}"}).get_json()[0]
    assert caja["agent_last_seen_at"] is not None


# ── El script del agente (tools/print-agent) ─────────────────────────────


def _cargar_agente():
    path = Path(__file__).parents[2] / "tools" / "print-agent" / "pos_print_agent.py"
    spec = importlib.util.spec_from_file_location("pos_print_agent", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_script_del_agente_imprime_y_reporta():
    agente = _cargar_agente()
    impresos, reportes = [], []
    jobs = [
        {"id": 1, "kind": "ticket", "payload_b64": base64.b64encode(b"TICKET").decode()},
        {"id": 2, "kind": "drawer", "payload_b64": base64.b64encode(b"CAJON").decode()},
    ]

    def imprimir(data):
        if data == b"CAJON":
            raise OSError("Impresora desconectada")
        impresos.append(data)

    procesados = agente.run_once(
        fetch_jobs=lambda: jobs,
        print_raw=imprimir,
        report=lambda job_id, ok, error=None: reportes.append((job_id, ok, error)),
    )

    assert procesados == 2
    assert impresos == [b"TICKET"]
    assert reportes == [(1, True, None), (2, False, "Impresora desconectada")]
