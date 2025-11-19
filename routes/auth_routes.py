import datetime
import time
from flask import Blueprint, request, redirect, url_for, flash, session

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    from db import load_all_users, save_all_users
    from main import generate_random_equipment, CHARACTERS, CHARACTER_ATTRIBUTES, get_character_instance

    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    if not username or not password:
        flash('用户名和密码不能为空', 'error')
        return redirect(url_for('index'))

    users = load_all_users()
    if username in users:
        flash('用户名已存在', 'error')
        return redirect(url_for('index'))

    characters = {}
    for name in CHARACTERS:
        inst = get_character_instance(name)
        stats = {
            'attack': int(getattr(inst, 'attack', 0)),
            'hp': int(getattr(inst, 'hp', 1000)),
            'critRate': float(getattr(inst, 'critRate', 0.0)),
            'critDamage': float(getattr(inst, 'critDamage', 1.0)),
            'reloadReduction': float(getattr(inst, 'reloadReduction', 0.0)),
            'rapidFire': float(getattr(inst, 'rapidFire', 0.0)),
            'extraAmmo': float(getattr(inst, 'extraAmmo', 0.0)),
            'attributePower': int(getattr(inst, 'attributePower', 0)),
            'damageBonus': 0.0,
            'healingBonus': 0.0,
        }
        characters[name] = {
            'stats': stats,
            'equipment': {},
            'attribute': CHARACTER_ATTRIBUTES.get(name, '无属性')
        }
    initial_equipment = []
    slots = ['weapon', 'accessory', 'headwear']
    for slot in slots:
        equipment = generate_random_equipment()
        while equipment['slot'] != slot:
            equipment = generate_random_equipment()
        initial_equipment.append(equipment)

    users[username] = {
        'password': password,
        'created_at': time.time(),
        'characters': characters,
        'equipment': initial_equipment,
        'weapons': [],
        'refinement_material': 0,
        'wish_ticket': 0,
        'last_login_date': None,
        'gacha_pity_4star': 0,
        'gacha_pity_5star': 0,
        'has_received_welcome_reward': False
    }

    if save_all_users(users):
        flash('注册成功，请登录', 'success')
    else:
        flash('注册失败，请重试', 'error')
    return redirect(url_for('index'))

@auth_bp.route('/login', methods=['POST'])
def login():
    from db import load_all_users, save_all_users
    from main import generate_random_equipment, CHARACTERS, CHARACTER_ATTRIBUTES, get_character_instance

    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    if not username or not password:
        flash('用户名和密码不能为空', 'error')
        return redirect(url_for('index'))

    users = load_all_users()
    if username not in users:
        flash('用户名或密码错误', 'error')
        return redirect(url_for('index'))
    if users[username]['password'] != password:
        flash('用户名或密码错误', 'error')
        return redirect(url_for('index'))

    if 'characters' not in users[username]:
        chars = {}
        for name in CHARACTERS:
            inst = get_character_instance(name)
            stats = {
                'attack': int(getattr(inst, 'attack', 0)),
                'hp': int(getattr(inst, 'hp', 1000)),
                'critRate': float(getattr(inst, 'critRate', 0.0)),
                'critDamage': float(getattr(inst, 'critDamage', 1.0)),
                'reloadReduction': float(getattr(inst, 'reloadReduction', 0.0)),
                'rapidFire': float(getattr(inst, 'rapidFire', 0.0)),
                'extraAmmo': float(getattr(inst, 'extraAmmo', 0.0)),
                'attributePower': int(getattr(inst, 'attributePower', 0)),
                'damageBonus': 0.0,
                'healingBonus': 0.0,
            }
            chars[name] = {
                'stats': stats,
                'equipment': {},
                'attribute': CHARACTER_ATTRIBUTES.get(name, '无属性')
            }
        users[username]['characters'] = chars
        save_all_users(users)
    if 'equipment' not in users[username]:
        users[username]['equipment'] = []
        save_all_users(users)
    if 'weapons' not in users[username]:
        users[username]['weapons'] = []
    if 'refinement_material' not in users[username]:
        users[username]['refinement_material'] = 0
    if 'wish_ticket' not in users[username]:
        users[username]['wish_ticket'] = 0
    if 'last_login_date' not in users[username]:
        users[username]['last_login_date'] = None
    if 'gacha_pity_4star' not in users[username]:
        users[username]['gacha_pity_4star'] = 0
    if 'gacha_pity_5star' not in users[username]:
        users[username]['gacha_pity_5star'] = 0
    if 'has_received_welcome_reward' not in users[username]:
        users[username]['has_received_welcome_reward'] = False

    if not users[username].get('has_received_welcome_reward', False):
        users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 30
        users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 20
        users[username]['has_received_welcome_reward'] = True
        save_all_users(users)
        flash('欢迎奖励：获得30个叠志精心料和20个神兵许愿单！', 'success')

    today = datetime.date.today().isoformat()
    last_login_date = users[username].get('last_login_date')
    if last_login_date != today:
        random_equipment = generate_random_equipment()
        if 'equipment' not in users[username]:
            users[username]['equipment'] = []
        users[username]['equipment'].append(random_equipment)
        users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 15
        users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 5
        users[username]['last_login_date'] = today
        save_all_users(users)
        flash('每日登录奖励：获得15个叠志精心料、5个神兵许愿单和1件随机装备！', 'success')

    session['user_id'] = username
    session['username'] = username
    session.permanent = True
    session.modified = True
    flash('登录成功', 'success')
    return redirect(url_for('index'))

@auth_bp.route('/logout')
def logout():
    session.clear()
    flash('已登出', 'info')
    return redirect(url_for('index'))