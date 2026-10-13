"""Subfase 7.3: descarga de respaldos desde la web (solo admin, nombre validado, auditada)."""
from app.models.audit import AuditLog

NOMBRE = "backup_pos_db_20261011_030000.dump"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _preparar(app, tmp_path):
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None
    (tmp_path / NOMBRE).write_bytes(b"CONTENIDO-DEL-RESPALDO")


def test_descarga_devuelve_el_archivo(client, app, admin_token, tmp_path):
    _preparar(app, tmp_path)
    resp = client.get(f"/api/backup/{NOMBRE}/download", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.data == b"CONTENIDO-DEL-RESPALDO"
    assert "attachment" in resp.headers["Content-Disposition"]
    assert NOMBRE in resp.headers["Content-Disposition"]


def test_descarga_queda_auditada(client, app, db, admin_token, tmp_path):
    _preparar(app, tmp_path)
    client.get(f"/api/backup/{NOMBRE}/download", headers=_auth(admin_token))
    entrada = AuditLog.query.filter_by(action="download", entity_type="backup").one()
    assert entrada.details["filename"] == NOMBRE


def test_descarga_solo_admin(client, app, regular_user_token, tmp_path):
    _preparar(app, tmp_path)
    resp = client.get(f"/api/backup/{NOMBRE}/download", headers=_auth(regular_user_token))
    assert resp.status_code == 403


def test_descarga_sin_sesion(client, app, tmp_path):
    _preparar(app, tmp_path)
    assert client.get(f"/api/backup/{NOMBRE}/download").status_code == 401


def test_descarga_archivo_inexistente_404(client, app, admin_token, tmp_path):
    _preparar(app, tmp_path)
    resp = client.get("/api/backup/backup_pos_db_29990101_000000.dump/download", headers=_auth(admin_token))
    assert resp.status_code == 404


def test_descarga_rechaza_rutas(client, app, admin_token, tmp_path):
    _preparar(app, tmp_path)
    secreto = tmp_path.parent / "secreto.txt"
    secreto.write_text("no debe salir")
    for nombre in ("..%5Csecreto.txt", "..%2Fsecreto.txt", "%2E%2E%5Csecreto.txt"):
        resp = client.get(f"/api/backup/{nombre}/download", headers=_auth(admin_token))
        assert resp.status_code in (400, 404)
        assert b"no debe salir" not in resp.data


def test_descarga_solo_archivos_de_la_lista(client, app, admin_token, tmp_path):
    """Un archivo que existe en la carpeta pero no es un respaldo listado no se descarga."""
    _preparar(app, tmp_path)
    (tmp_path / "otro.txt").write_text("ajeno")
    resp = client.get("/api/backup/otro.txt/download", headers=_auth(admin_token))
    assert resp.status_code == 404
