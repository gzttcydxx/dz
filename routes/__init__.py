from .main_routes import main_bp
from .auth_routes import auth_bp
from .room_routes import room_bp
from .equipment_routes import equipment_bp
from .gacha_routes import gacha_bp

__all__ = [
    "main_bp",
    "auth_bp",
    "room_bp",
    "equipment_bp",
    "gacha_bp",
]