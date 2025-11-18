from flask import Blueprint, render_template, session
from game_combat import ENEMY_CONFIG

main_bp = Blueprint('main', __name__)

@main_bp.route('/', endpoint='index')
def index():
    from main import CHARACTER_SKILLS, CHARACTERS, CHARACTER_ATTRIBUTES, load_user_data, init_user_characters, save_user_data
    is_logged_in = session.get('user_id') is not None
    username = session.get('username', '')

    user_characters = None
    if is_logged_in:
        users = load_user_data()
        if username in users and 'characters' in users[username]:
            user_characters = users[username]['characters']
        else:
            if username in users:
                users[username]['characters'] = init_user_characters()
                save_user_data(users)
                user_characters = users[username]['characters']

    user_equipment = []
    refinement_material = 0
    wish_ticket = 0
    if is_logged_in:
        users = load_user_data()
        if username in users:
            if 'equipment' in users[username]:
                user_equipment = users[username]['equipment']
                refinement_material = users[username].get('refinement_material', 0)
                wish_ticket = users[username].get('wish_ticket', 0)

    user_weapons = []
    if is_logged_in:
        users = load_user_data()
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