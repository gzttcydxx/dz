import json
import random
from flask import Blueprint, session, request

equipment_bp = Blueprint('equipment', __name__)

@equipment_bp.route('/equip_character', methods=['POST'])
def equip_character():
    from db import set_character_equipment

    if 'user_id' not in session:
        return json.dumps({'success': False, 'message': '未登录'}), 401, {'Content-Type': 'application/json'}

    username = session['user_id']
    data = request.get_json()
    character = data.get('character')
    slot = data.get('slot')
    equipment_id = data.get('equipment_id')

    if not character or not slot:
        return json.dumps({'success': False, 'message': '参数错误'}), 400, {'Content-Type': 'application/json'}

    ok, msg = set_character_equipment(username, character, slot, equipment_id)
    if ok:
        return json.dumps({'success': True, 'message': msg}), 200, {'Content-Type': 'application/json'}
    else:
        return json.dumps({'success': False, 'message': msg}), 400, {'Content-Type': 'application/json'}

@equipment_bp.route('/upgrade_equipment', methods=['POST'])
def upgrade_equipment():
    from db import upgrade_equipment_for_user, load_all_users

    if not session.get('user_id'):
        return json.dumps({'success': False, 'message': '请先登录'}), 401, {'Content-Type': 'application/json'}

    username = session.get('user_id')
    equipment_id = request.json.get('equipment_id')
    if not equipment_id:
        return json.dumps({'success': False, 'message': '装备ID不能为空'}), 400, {'Content-Type': 'application/json'}

    ok, result = upgrade_equipment_for_user(username, equipment_id)
    if ok:
        user = load_all_users().get(username, {})
        equipment = next((e for e in user.get('equipment', []) if e.get('id') == equipment_id), None)
        return json.dumps({'success': True,'equipment': equipment,'boosted_stat': result,'refinement_material': user.get('refinement_material', 0)}), 200, {'Content-Type': 'application/json'}
    else:
        return json.dumps({'success': False, 'message': result}), 400, {'Content-Type': 'application/json'}