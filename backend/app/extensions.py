from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from flask_cors import CORS

db = SQLAlchemy(session_options={"expire_on_commit": False})
jwt = JWTManager()
migrate = Migrate()
cors = CORS()
