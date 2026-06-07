"""Tests for audit log model, service, and API."""
from app.models.audit import AuditLog
from app.services.audit_service import log_action, get_logs


# --- Model and service tests ---


def test_log_action_creates_entry(app, db, seed_admin):
    """log_action should create an AuditLog row."""
    entry = log_action(
        action="test_action",
        entity_type="widget",
        entity_id=42,
        details={"key": "value"},
        user_id=seed_admin.id,
        username=seed_admin.username,
    )
    assert entry.id is not None
    assert entry.action == "test_action"
    assert entry.entity_type == "widget"
    assert entry.entity_id == 42
    assert entry.details == {"key": "value"}
    assert entry.user_id == seed_admin.id
    assert entry.username == "admin"


def test_get_logs_pagination(app, db, seed_admin):
    """get_logs should return paginated results."""
    for i in range(5):
        log_action(action=f"action_{i}", user_id=seed_admin.id, username="admin")

    result = get_logs(page=1, per_page=3)
    assert result["total"] == 5
    assert result["page"] == 1
    assert result["per_page"] == 3
    assert len(result["items"]) == 3
    assert result["pages"] == 2

    result2 = get_logs(page=2, per_page=3)
    assert len(result2["items"]) == 2


def test_get_logs_filter_by_action(app, db, seed_admin):
    """get_logs should filter by action type."""
    log_action(action="login", user_id=seed_admin.id, username="admin")
    log_action(action="create", user_id=seed_admin.id, username="admin")
    log_action(action="login", user_id=seed_admin.id, username="admin")

    result = get_logs(action="login")
    assert result["total"] == 2


def test_get_logs_filter_by_entity(app, db, seed_admin):
    """get_logs should filter by entity_type and entity_id."""
    log_action(
        action="create", entity_type="sale", entity_id=1,
        user_id=seed_admin.id, username="admin",
    )
    log_action(
        action="create", entity_type="product", entity_id=2,
        user_id=seed_admin.id, username="admin",
    )
    log_action(
        action="update", entity_type="sale", entity_id=1,
        user_id=seed_admin.id, username="admin",
    )

    result = get_logs(entity_type="sale")
    assert result["total"] == 2

    result2 = get_logs(entity_type="sale", entity_id=1)
    assert result2["total"] == 2

    result3 = get_logs(entity_type="product")
    assert result3["total"] == 1


def test_get_logs_filter_by_user(app, db, seed_admin, seed_cajero):
    """get_logs should filter by user_id."""
    log_action(action="login", user_id=seed_admin.id, username="admin")
    log_action(action="login", user_id=seed_cajero.id, username="cajero1")
    log_action(action="logout", user_id=seed_admin.id, username="admin")

    result = get_logs(user_id=seed_admin.id)
    assert result["total"] == 2

    result2 = get_logs(user_id=seed_cajero.id)
    assert result2["total"] == 1


# --- API endpoint tests ---


def test_audit_list_requires_admin(client, db, seed_permissions, seed_roles):
    """GET /api/audit/ should require admin role."""
    response = client.get("/api/audit/")
    assert response.status_code == 401


def test_audit_list_non_admin_forbidden(client, regular_user_token, db):
    """GET /api/audit/ should reject non-admin users."""
    response = client.get(
        "/api/audit/",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403


def test_audit_list_returns_logs(client, admin_token, db, seed_admin):
    """GET /api/audit/ should return audit entries."""
    log_action(action="login", entity_type="user", user_id=seed_admin.id, username="admin")
    log_action(action="create", entity_type="sale", entity_id=99, user_id=seed_admin.id, username="admin")

    response = client.get(
        "/api/audit/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 3  # 2 manual + 1 login from admin_token fixture
    assert "items" in data
    assert data["page"] == 1


def test_audit_list_filters(client, admin_token, db, seed_admin):
    """GET /api/audit/ should support query param filters."""
    log_action(action="create", entity_type="product", entity_id=5, user_id=seed_admin.id, username="admin")

    response = client.get(
        "/api/audit/?action=create&entity_type=product",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 1
    assert data["items"][0]["action"] == "create"
    assert data["items"][0]["entity_type"] == "product"


# --- Integration: login creates audit entry ---


def test_login_creates_audit_entry(client, db, seed_admin):
    """Successful login should create an audit log entry."""
    client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })

    logs = AuditLog.query.filter_by(action="login").all()
    assert len(logs) == 1
    assert logs[0].user_id == seed_admin.id
    assert logs[0].entity_type == "user"


def test_failed_login_creates_audit_entry(client, db, seed_admin):
    """Failed login should log a login_failed entry."""
    client.post("/api/auth/login", json={
        "username": "admin",
        "password": "wrong_password",
    })

    logs = AuditLog.query.filter_by(action="login_failed").all()
    assert len(logs) == 1
    assert logs[0].details["username"] == "admin"


def test_sale_create_creates_audit_entry(
    client, admin_token, seed_open_session, seed_product_for_sale, db
):
    """Creating a sale should log an audit entry."""
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )

    logs = AuditLog.query.filter_by(action="create", entity_type="sale").all()
    assert len(logs) == 1
    assert logs[0].details["folio"] is not None
