import json
import random
from flask import Blueprint, session, request

equipment_bp = Blueprint('equipment', __name__)

@equipment_bp.route('/equip_character', methods=['POST'])
def equip_character():
    from main import load_user_data, save_user_data

    if 'user_id' not in session:
        return json.dumps({'success': False, 'message': '未登录'}), 401, {'Content-Type': 'application/json'}

    username = session['user_id']
    data = request.get_json()
    character = data.get('character')
    slot = data.get('slot')
    equipment_id = data.get('equipment_id')

    if not character or not slot:
        return json.dumps({'success': False, 'message': '参数错误'}), 400, {'Content-Type': 'application/json'}

    users = load_user_data()
    if username not in users:
        return json.dumps({'success': False, 'message': '用户不存在'}), 404, {'Content-Type': 'application/json'}

    user_data = users[username]
    if 'characters' not in user_data or character not in user_data['characters']:
        return json.dumps({'success': False, 'message': '角色不存在'}), 404, {'Content-Type': 'application/json'}

    if equipment_id:
        equipment_list = user_data.get('equipment', [])
        equipment = next((eq for eq in equipment_list if eq['id'] == equipment_id), None)
        if not equipment:
            return json.dumps({'success': False, 'message': '装备不存在'}), 404, {'Content-Type': 'application/json'}
        if equipment['slot'] != slot:
            return json.dumps({'success': False, 'message': '装备部位不匹配'}), 400, {'Content-Type': 'application/json'}
        for char_name, char_data in user_data['characters'].items():
            if char_name == character:
                continue
            if char_data.get('equipment', {}).get(slot) == equipment_id:
                return json.dumps({'success': False, 'message': '该装备已被其他角色佩戴'}), 400, {'Content-Type': 'application/json'}

    current_equipment_id = user_data['characters'][character].get('equipment', {}).get(slot)
    if 'equipment' not in user_data['characters'][character]:
        user_data['characters'][character]['equipment'] = {}
    user_data['characters'][character]['equipment'][slot] = equipment_id

    if save_user_data(users):
        return json.dumps({'success': True, 'message': '装备成功'}), 200, {'Content-Type': 'application/json'}
    else:
        return json.dumps({'success': False, 'message': '保存失败'}), 500, {'Content-Type': 'application/json'}

@equipment_bp.route('/upgrade_equipment', methods=['POST'])
def upgrade_equipment():
    from main import load_user_data, save_user_data

    if not session.get('user_id'):
        return json.dumps({'success': False, 'message': '请先登录'}), 401, {'Content-Type': 'application/json'}

    username = session.get('username')
    equipment_id = request.json.get('equipment_id')
    if not equipment_id:
        return json.dumps({'success': False, 'message': '装备ID不能为空'}), 400, {'Content-Type': 'application/json'}

    users = load_user_data()
    if username not in users or 'equipment' not in users[username]:
        return json.dumps({'success': False, 'message': '用户数据不存在'}), 404, {'Content-Type': 'application/json'}

    equipment_list = users[username]['equipment']
    equipment = None
    equipment_index = None
    for i, eq in enumerate(equipment_list):
        if eq.get('id') == equipment_id:
            equipment = eq
            equipment_index = i
            break
    if not equipment:
        return json.dumps({'success': False, 'message': '装备不存在'}), 404, {'Content-Type': 'application/json'}

    if 'level' not in equipment:
        equipment['level'] = 0
    current_level = equipment.get('level', 0)
    if current_level >= 5:
        return json.dumps({'success': False, 'message': '装备已达到最高等级'}), 400, {'Content-Type': 'application/json'}

    refinement_material = users[username].get('refinement_material', 0)
    if refinement_material < 1:
        return json.dumps({'success': False, 'message': '叠志精心料不足，需要1个'}), 400, {'Content-Type': 'application/json'}

    users[username]['refinement_material'] = refinement_material - 1
    new_level = current_level + 1
    equipment['level'] = new_level

    if not equipment.get('subStats') or len(equipment['subStats']) == 0:
        return json.dumps({'success': False, 'message': '装备副词条不存在'}), 400, {'Content-Type': 'application/json'}

    for sub_stat in equipment['subStats']:
        if 'upgradeCount' not in sub_stat:
            sub_stat['upgradeCount'] = 0

    selected_sub_stat = random.choice(equipment['subStats'])
    stat_name = selected_sub_stat['name']
    stat_type = selected_sub_stat['type']
    if 'upgradeCount' not in selected_sub_stat:
        selected_sub_stat['upgradeCount'] = 0
    selected_sub_stat['upgradeCount'] = selected_sub_stat.get('upgradeCount', 0) + 1

    if stat_name == '暴击率':
        boost = random.uniform(0.025, 0.05)
        selected_sub_stat['value'] += boost
    elif stat_name == '暴击伤害':
        boost = random.uniform(0.05, 0.10)
        selected_sub_stat['value'] += boost
    elif stat_name == '换弹减免':
        boost = random.uniform(0.05, 0.10)
        selected_sub_stat['value'] += boost
    elif stat_name == '攻击力':
        boost = random.uniform(0.05, 0.10)
        selected_sub_stat['value'] += boost
    elif stat_name == '生命值':
        boost = random.uniform(0.04, 0.08)
        selected_sub_stat['value'] += boost
    elif stat_name == '属性强度':
        boost = random.randint(5, 10)
        selected_sub_stat['value'] += boost
    else:
        if stat_type == 'percent':
            boost = random.uniform(0.05, 0.10)
            selected_sub_stat['value'] += boost
        elif stat_type == 'time':
            boost = random.uniform(0.05, 0.10)
            selected_sub_stat['value'] += boost
        else:
            boost = random.randint(5, 10)
            selected_sub_stat['value'] += boost

    equipment_list[equipment_index] = equipment
    users[username]['equipment'] = equipment_list

    if save_user_data(users):
        return json.dumps({
            'success': True,
            'equipment': equipment,
            'boosted_stat': {
                'name': stat_name,
                'boost': boost,
                'type': stat_type
            },
            'refinement_material': users[username].get('refinement_material', 0)
        }), 200, {'Content-Type': 'application/json'}
    else:
        return json.dumps({'success': False, 'message': '保存失败'}), 500, {'Content-Type': 'application/json'}