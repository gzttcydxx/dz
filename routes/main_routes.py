from flask import Blueprint, render_template, session
from game_combat import ENEMY_CONFIG

main_bp = Blueprint('main', __name__)

@main_bp.route('/', endpoint='index')
def index():
    from main import CHARACTERS, CHARACTER_ATTRIBUTES
    from domain.characters import CHARACTER_CLASS_MAP
    from db import load_all_users
    CHARACTER_SKILLS = {name: getattr(cls, 'skill_config', {}) for name, cls in CHARACTER_CLASS_MAP.items()}
    is_logged_in = session.get('user_id') is not None
    username = session.get('user_id', '')

    user_characters = None
    if is_logged_in:
        users = load_all_users()
        if username in users:
            user_characters = users[username]['characters']

    user_equipment = []
    refinement_material = 0
    wish_ticket = 0
    if is_logged_in:
        users = load_all_users()
        if username in users:
            if 'equipment' in users[username]:
                user_equipment = users[username]['equipment']
                refinement_material = users[username].get('refinement_material', 0)
                wish_ticket = users[username].get('wish_ticket', 0)

    user_weapons = []
    if is_logged_in:
        users = load_all_users()
        if username in users and 'weapons' in users[username]:
            user_weapons = users[username]['weapons']

    enemy_attributes = {name: config.get('attribute', '无属性') for name, config in ENEMY_CONFIG.items()}

    return render_template('index.html', 
                         is_logged_in=is_logged_in, 
                         username=username,
                         characters=CHARACTERS,
                         character_skills=CHARACTER_SKILLS,
                         user_characters=user_characters,
                         user_equipment=user_equipment,
                         user_weapons=user_weapons,
                         refinement_material=refinement_material,
                         wish_ticket=wish_ticket,
                         character_attributes=CHARACTER_ATTRIBUTES,
                         enemy_attributes=enemy_attributes)