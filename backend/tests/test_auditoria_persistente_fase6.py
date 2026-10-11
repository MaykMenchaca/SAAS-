"""La auditoría de configuración y respaldos se guarda de verdad (bug real hallado con 6.1, H-09)."""


def _logs(db, entity_type, action):
    from app.models.audit import AuditLog

    db.session.remove()  # consulta con una sesión nueva: solo cuenta lo confirmado
    return AuditLog.query.filter_by(entity_type=entity_type, action=action).all()


def test_actualizar_configuracion_queda_auditado(client, admin_token, db):
    response = client.put("/api/config/", json={"company_name": "Ferretería Auditada"},
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    logs = _logs(db, "config", "update")
    assert len(logs) == 1
    assert logs[0].details["new_value"] == {"company_name": "Ferretería Auditada"}
    assert logs[0].details["previous_value"] == {"company_name": "Mi Negocio"}


def test_borrar_respaldo_queda_auditado(client, admin_token, db, monkeypatch):
    from app.services import backup_service

    monkeypatch.setattr(backup_service, "delete_backup", lambda filename: True)
    response = client.delete("/api/backup/backup_pos_db_20261011_000000.dump",
                             headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert len(_logs(db, "backup", "delete")) == 1


def test_verificar_respaldo_queda_auditado(client, admin_token, db, monkeypatch):
    from app.services import backup_service

    monkeypatch.setattr(backup_service, "verify_backup", lambda filename: {"ok": True})
    response = client.post("/api/backup/backup_pos_db_20261011_000000.dump/verify",
                           headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert len(_logs(db, "backup", "verify")) == 1
