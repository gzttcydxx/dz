import json
import time
import random
from flask import Blueprint, session, request

gacha_bp = Blueprint('gacha', __name__)

@gacha_bp.route('/gacha')
def gacha_page():
    from main import load_user_data
    if not session.get('user_id'):
        from flask import redirect, url_for, flash
        flash('请先登录', 'error')
        return redirect(url_for('index'))

    username = session.get('username')
    users = load_user_data()
    if username not in users:
        from flask import redirect, url_for, flash
        flash('用户不存在', 'error')
        return redirect(url_for('index'))

    wish_ticket = users[username].get('wish_ticket', 0)
    refinement_material = users[username].get('refinement_material', 0)
    pity_4star = users[username].get('gacha_pity_4star', 0)
    pity_5star = users[username].get('gacha_pity_5star', 0)

    from flask import render_template
    return render_template('gacha.html', 
                         username=username,
                         wish_ticket=wish_ticket,
                         refinement_material=refinement_material,
                         pity_4star=pity_4star,
                         pity_5star=pity_5star)

def perform_gacha(users, username, count=1):
    from main import log_gacha, generate_random_equipment, save_user_data, WEAPONS
    results = []
    pity_4star = users[username].get('gacha_pity_4star', 0)
    pity_5star = users[username].get('gacha_pity_5star', 0)

    log_gacha(username, f"========== 开始抽卡 ==========")
    log_gacha(username, f"抽卡数量: {count}, 初始保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")

    has_4star_in_batch = False
    has_5star_in_batch = False

    for i in range(count):
        log_gacha(username, f"--- 第 {i+1} 抽 --- 抽卡前保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")

        must_4star = (pity_4star >= 9)
        must_5star = (pity_5star >= 49)

        if count == 10 and i == 9 and not has_4star_in_batch:
            must_4star = True
        if count == 10 and i == 9 and not has_5star_in_batch and pity_5star >= 49:
            must_5star = True

        if must_5star:
            star = 5
            has_5star_in_batch = True
            force_weapon = True
            should_reset_5star_pity = True
            should_reset_4star_pity = True
            log_gacha(username, f"触发五星保底！star=5, force_weapon=True")
        elif must_4star:
            star = 4
            has_4star_in_batch = True
            force_weapon = True
            should_reset_4star_pity = True
            should_reset_5star_pity = False
            log_gacha(username, f"触发四星保底！star=4, force_weapon=True")
        else:
            rand = random.random()
            should_reset_5star_pity = False
            should_reset_4star_pity = False
            if rand < 0.03:
                star = 5
                should_reset_5star_pity = True
                should_reset_4star_pity = True
                has_5star_in_batch = True
                force_weapon = False
                log_gacha(username, f"随机抽到五星！rand={rand:.4f}")
            elif rand < 0.15:
                star = 4
                should_reset_4star_pity = True
                should_reset_5star_pity = False
                has_4star_in_batch = True
                force_weapon = False
                log_gacha(username, f"随机抽到四星！rand={rand:.4f}")
            else:
                star = 3
                pity_4star += 1
                pity_5star += 1

        user_weapons = users[username].get('weapons', [])
        if star == 5 or star == 4:
            reward_type = 'weapon'
        elif star == 3:
            reward_type = random.choice(['emoji', 'material', 'equipment', 'weapon'])
        else:
            reward_type = 'weapon'

        if reward_type == 'emoji':
            emoji_num = random.randint(1, 10)
            results.append({'type': 'emoji','star': 3,'name': f'表情包{emoji_num}','image': f'/static/表情包/{emoji_num}.png','index': i + 1})
            log_gacha(username, f"第{i+1}抽: 抽到表情包{emoji_num}，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        elif reward_type == 'material':
            users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 1
            results.append({'type': 'material','star': 3,'name': '叠志精心料','count': 1,'index': i + 1})
            log_gacha(username, f"第{i+1}抽: 抽到叠志精心料x1，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        elif reward_type == 'equipment':
            equipment = generate_random_equipment()
            if 'equipment' not in users[username]:
                users[username]['equipment'] = []
            users[username]['equipment'].append(equipment)
            results.append({'type': 'equipment','star': 3,'equipment': equipment,'index': i + 1})
            log_gacha(username, f"第{i+1}抽: 抽到装备，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        else:
            weapon_name = random.choice(WEAPONS[star])
            weapon_ids = [w.get('name') for w in user_weapons]
            is_duplicate = weapon_name in weapon_ids
            if should_reset_5star_pity:
                log_gacha(username, f"第{i+1}抽: 抽到五星武器 {weapon_name}，重置保底计数 - 四星: 0, 五星: 0，是否重复: {is_duplicate}")
                pity_5star = 0
                pity_4star = 0
            elif should_reset_4star_pity:
                log_gacha(username, f"第{i+1}抽: 抽到四星武器 {weapon_name}，重置四星保底计数: 0, 五星保底计数: {pity_5star + 1}，是否重复: {is_duplicate}")
                pity_4star = 0
                pity_5star += 1
            else:
                log_gacha(username, f"第{i+1}抽: 抽到{star}星武器 {weapon_name}，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}，是否重复: {is_duplicate}")

            if is_duplicate:
                compensation = None
                if star == 3:
                    users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 5
                    compensation = {'type': 'material', 'name': '叠志精心料', 'count': 5}
                elif star == 4:
                    users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 1
                    compensation = {'type': 'ticket', 'name': '神兵许愿单', 'count': 1}
                else:
                    users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 5
                    compensation = {'type': 'ticket', 'name': '神兵许愿单', 'count': 5}

                weapon = {'id': f"weapon_{int(time.time() * 1000)}_{random.randint(1000, 9999)}",'name': weapon_name,'star': star}
                results.append({'type': 'weapon','star': star,'weapon': weapon,'is_duplicate': True,'compensation': compensation,'index': i + 1})
            else:
                weapon = {'id': f"weapon_{int(time.time() * 1000)}_{random.randint(1000, 9999)}",'name': weapon_name,'star': star}
                user_weapons.append(weapon)
                results.append({'type': 'weapon','star': star,'weapon': weapon,'index': i + 1})

    users[username]['gacha_pity_4star'] = pity_4star
    users[username]['gacha_pity_5star'] = pity_5star
    users[username]['weapons'] = user_weapons
    log_gacha(username, f"========== 抽卡结束 ========== 最终保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")
    return results

@gacha_bp.route('/gacha/draw', methods=['POST'])
def gacha_draw():
    from main import load_user_data, save_user_data
    if not session.get('user_id'):
        return json.dumps({'success': False, 'message': '请先登录'}), 401, {'Content-Type': 'application/json'}

    username = session.get('username')
    data = request.get_json()
    count = data.get('count', 1)
    if count not in [1, 10]:
        return json.dumps({'success': False, 'message': '无效的抽卡数量'}), 400, {'Content-Type': 'application/json'}

    users = load_user_data()
    if username not in users:
        return json.dumps({'success': False, 'message': '用户不存在'}), 404, {'Content-Type': 'application/json'}

    wish_ticket = users[username].get('wish_ticket', 0)
    if wish_ticket < count:
        return json.dumps({'success': False, 'message': f'神兵许愿单不足，需要{count}个'}), 400, {'Content-Type': 'application/json'}

    users[username]['wish_ticket'] = wish_ticket - count
    results = perform_gacha(users, username, count)
    if save_user_data(users):
        return json.dumps({'success': True,'results': results,'wish_ticket': users[username].get('wish_ticket', 0),'refinement_material': users[username].get('refinement_material', 0),'pity_4star': users[username].get('gacha_pity_4star', 0),'pity_5star': users[username].get('gacha_pity_5star', 0)}, ensure_ascii=False), 200, {'Content-Type': 'application/json'}
    else:
        return json.dumps({'success': False, 'message': '保存失败'}), 500, {'Content-Type': 'application/json'}