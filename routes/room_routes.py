from flask import Blueprint, request, redirect, url_for, flash, session, render_template
from game_combat import ENEMY_CONFIG, ATTRIBUTE_ADVANTAGE

room_bp = Blueprint('room', __name__)

@room_bp.route('/create_room', methods=['POST'])
def create_room():
    from main import generate_room_key
    from state import rooms

    if not session.get('user_id'):
        flash('请先登录', 'error')
        return redirect(url_for('index'))

    player_name = request.form.get('playerName', '').strip()
    max_players = int(request.form.get('maxPlayers', 2))
    selected_map = request.form.get('mapSelect', '寒清境')
    selected_monster = request.form.get('monsterSelect', '杂鱼蕉形脸')

    if not player_name:
        flash('玩家名不能为空', 'error')
        return redirect(url_for('index'))

    room_key = generate_room_key()

    saved_user_id = session.get('user_id')
    saved_username = session.get('username')
    session.clear()
    if saved_user_id:
        session['user_id'] = saved_user_id
    if saved_username:
        session['username'] = saved_username
    session['player_name'] = player_name
    session['is_host'] = True
    session['room_key'] = room_key
    session['max_players'] = max_players
    session['map'] = selected_map
    session['monster'] = selected_monster
    session.permanent = True
    session.modified = True

    rooms[room_key] = {
        'host_name': player_name,
        'max_players': max_players,
        'map': selected_map,
        'monster': selected_monster,
        'players': {}
    }
    return redirect(f'/lobby/{room_key}')

@room_bp.route('/lobby/<room_key>')
def lobby(room_key):
    from state import rooms
    from main import CHARACTER_ATTRIBUTES

    if room_key not in rooms:
        return "房间不存在", 404

    if not session.get('player_name'):
        return redirect(url_for('index'))

    player_name = session.get('player_name')
    enemy_attributes = {name: config.get('attribute', '无属性') for name, config in ENEMY_CONFIG.items()}

    room = rooms[room_key]
    return render_template('lobby.html', 
                         room_key=room_key, 
                         player_name=player_name,
                         character_attributes=CHARACTER_ATTRIBUTES,
                         enemy_attributes=enemy_attributes,
                         attribute_advantage=ATTRIBUTE_ADVANTAGE)

@room_bp.route('/game/<room_key>')
def game(room_key):
    from state import rooms
    from main import load_user_data, calculate_equipment_stats_server

    if room_key not in rooms:
        return "房间不存在", 404

    room = rooms[room_key]
    player_name = session.get('player_name', '玩家')
    username = session.get('user_id')

    player_avatar = {'character': '勇者', 'color': 1}
    for sid, pinfo in room['players'].items():
        if pinfo['name'] == player_name:
            player_avatar = pinfo.get('avatar', player_avatar)
            break

    user_character_data = None
    if username:
        users = load_user_data()
        if username in users and 'characters' in users[username]:
            character_name = player_avatar.get('character', '勇者')
            if character_name in users[username]['characters']:
                char_data = users[username]['characters'][character_name]
                base_stats = char_data.get('stats', {}).copy()
                equipment_dict = char_data.get('equipment', {})
                all_equipment = users[username].get('equipment', [])
                final_stats = calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name)
                user_character_data = {
                    'stats': final_stats,
                    'equipment': equipment_dict,
                    'attribute': char_data.get('attribute', '无属性')
                }

    return render_template('game.html', 
                         room_key=room_key,
                         player_name=player_name,
                         player_avatar=player_avatar,
                         map_name=room['map'],
                         monster_type=room['monster'],
                         user_character_data=user_character_data)

@room_bp.route('/join_room', methods=['POST'])
def join_room_http():
    from state import rooms

    if not session.get('user_id'):
        flash('请先登录', 'error')
        return redirect(url_for('index'))

    room_key = request.form.get('roomKey', '').strip().upper()
    player_name = request.form.get('playerName', '').strip()

    if not player_name:
        flash('玩家名不能为空', 'error')
        return redirect(url_for('index'))

    if room_key not in rooms:
        return "房间不存在或密钥错误", 404

    room = rooms[room_key]
    if len(room['players']) >= room['max_players']:
        return f"房间已满（{room['max_players']}/{room['max_players']}）", 400

    saved_user_id = session.get('user_id')
    saved_username = session.get('username')
    session.clear()
    if saved_user_id:
        session['user_id'] = saved_user_id
    if saved_username:
        session['username'] = saved_username
    session['player_name'] = player_name
    session['is_host'] = False
    session['room_key'] = room_key
    session.permanent = True
    session.modified = True
    return redirect(f'/lobby/{room_key}')