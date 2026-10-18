"""Las migraciones de Alembic se prueban de verdad (OPS-32, BE-110).

Los demás tests crean el esquema con `create_all`, así que una migración rota o que no coincide
con los modelos pasaría desapercibida hasta `update-production.ps1`. Aquí se aplica toda la cadena
sobre un esquema vacío de `pos_test_db`, se compara con los modelos y se hace un ciclo
downgrade/upgrade. Corre en un subproceso porque Alembic reconfigura el logging.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from app.config import TestConfig

BACKEND = Path(__file__).parents[1]
SCHEMA = "mig_check"


def _ddl(engine, *sentencias):
    """DDL con reintentos: otros carriles de pruebas pueden estar creando tablas en la misma base."""
    for intento in range(5):
        try:
            with engine.begin() as conn:
                for sql in sentencias:
                    conn.execute(text(sql))
            return
        except OperationalError:
            if intento == 4:
                raise
            time.sleep(1 + intento)


@pytest.fixture
def url_esquema_vacio():
    base = make_url(TestConfig.SQLALCHEMY_DATABASE_URI)
    assert base.database == "pos_test_db", "Solo se prueba contra pos_test_db"
    base = base.set(query={k: v for k, v in base.query.items() if k != "options"})
    engine = create_engine(base)
    _ddl(engine, f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE", f"CREATE SCHEMA {SCHEMA}",
         "CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public")
    yield base.update_query_dict({"options": f"-csearch_path={SCHEMA},public"})
    _ddl(engine, f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
    engine.dispose()


def _flask_db(url, *args):
    env = dict(
        os.environ,
        DATABASE_URL=url.render_as_string(hide_password=False),
        SECRET_KEY=TestConfig.SECRET_KEY,
        JWT_SECRET_KEY=TestConfig.JWT_SECRET_KEY,
    )
    r = subprocess.run([sys.executable, "-m", "flask", "--app", "run", "db", *args], cwd=BACKEND, env=env,
                       capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, f"flask db {' '.join(args)}:\n{r.stdout}\n{r.stderr}"
    return r.stdout + r.stderr


def test_migraciones_desde_cero_coinciden_con_los_modelos(url_esquema_vacio):
    _flask_db(url_esquema_vacio, "upgrade")
    # Sin diferencias entre el esquema migrado y los modelos
    _flask_db(url_esquema_vacio, "check")
    # Ida y vuelta completa: todas las migraciones tienen downgrade que funciona
    _flask_db(url_esquema_vacio, "downgrade", "base")
    _flask_db(url_esquema_vacio, "upgrade")
    assert "a5b4c3d2e1f0" in _flask_db(url_esquema_vacio, "current")
