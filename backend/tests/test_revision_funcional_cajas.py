"""Revisión funcional 2026-10, cajas: RF-09 (no se podía dar de alta una segunda caja)."""
from app.models.audit import AuditLog
from app.models.sale import CashRegister


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_rf09_admin_da_de_alta_una_caja_y_aparece_en_la_lista(client, admin_token, db, seed_cash_register):
    resp = client.post("/api/cash-register/registers", headers=_h(admin_token), json={"name": "  Caja 2  "})
    assert resp.status_code == 201, resp.get_json()
    caja = resp.get_json()
    assert caja["name"] == "Caja 2" and caja["is_active"] is True
    nombres = [c["name"] for c in client.get("/api/cash-register/", headers=_h(admin_token)).get_json()]
    assert "Caja 2" in nombres
    assert AuditLog.query.filter_by(entity_type="cash_register", entity_id=caja["id"], action="crear").count() == 1


def test_rf09_en_la_caja_nueva_se_puede_abrir_turno(client, admin_token, regular_user_token, seed_cash_register):
    caja = client.post("/api/cash-register/registers", headers=_h(admin_token), json={"name": "Caja 2"}).get_json()
    resp = client.post("/api/cash-register/open", headers=_h(regular_user_token),
                       json={"cash_register_id": caja["id"], "opening_amount": "500.00"})
    assert resp.status_code == 201, resp.get_json()


def test_rf09_nombre_vacio_largo_o_repetido_se_rechaza(client, admin_token, db, seed_cash_register):
    existente = seed_cash_register.name
    for nombre in ("", "   ", "x" * 51, existente.upper()):
        resp = client.post("/api/cash-register/registers", headers=_h(admin_token), json={"name": nombre})
        assert resp.status_code == 400, (nombre, resp.get_json())
    assert CashRegister.query.count() == 1


def test_rf09_renombrar_a_un_nombre_repetido_se_rechaza(client, admin_token, seed_cash_register):
    caja = client.post("/api/cash-register/registers", headers=_h(admin_token), json={"name": "Caja 2"}).get_json()
    resp = client.patch(f"/api/cash-register/registers/{caja['id']}", headers=_h(admin_token),
                        json={"name": seed_cash_register.name.lower()})
    assert resp.status_code == 400


def test_rf09_solo_admin(client, regular_user_token, seed_cash_register):
    assert client.post("/api/cash-register/registers", headers=_h(regular_user_token), json={"name": "Caja 9"}).status_code == 403
    assert client.post("/api/cash-register/registers", json={"name": "Caja 9"}).status_code == 401
