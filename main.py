from flask import Flask, render_template, session, request, redirect, flash, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import secrets
import string
import random
import time
import json
import os
import math
import datetime
from game_combat import (
    ENEMY_CONFIG, PLAYER_BASE_SPEED, SPEED_MULTIPLIER,
    spawn_enemies, update_enemies, check_enemy_player_collisions,
    check_bullet_enemy_collisions, check_victory_defeat, process_game_tick
)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 3600

# 初始化 SocketIO，确保正确配置
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    manage_session=True,  # 启用Session管理，确保Socket事件中的Session修改被保存
    async_mode='threading',  # 使用线程模式
    logger=False,  # 关闭详细日志
    engineio_logger=False,  # 关闭引擎日志
    ping_timeout=60,  # ping超时时间
    ping_interval=25  # ping间隔
)

# 存储所有房间信息（全局状态模块）
from state import rooms

# 数据库初始化
from db import init_db, load_all_users, save_all_users
init_db()

# 抽卡日志文件路径
GACHA_LOG_FILE = 'gacha_log.txt'

def log_gacha(username, message):
    """记录抽卡日志到文件"""
    try:
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"[{timestamp}] [{username}] {message}\n"
        with open(GACHA_LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(log_entry)
    except Exception as e:
        # 如果日志写入失败，静默处理，不影响抽卡功能
        pass

# 角色列表
CHARACTERS = list(CHARACTER_CLASS_MAP.keys())
COLOR_VARIANTS = [1, 2, 3]

# 角色属性配置
CHARACTER_ATTRIBUTES = {
    '勇者': '物理系',
    '幺幺俊羊羊': '物理系',
    '公主蓉': '自然系',
    '星耀犊': '超能系',
    '王子栗': '无属性'
}

from domain.equipment_config import EQUIPMENT_SETS, EQUIPMENT_MAIN_STATS, EQUIPMENT_SUB_STATS
from domain.characters import Character, CHARACTER_CLASS_MAP

# 武器配置
WEAPONS = {
    3: [  # 三星武器
        '精致冲锋枪', '精致手炮', '破烂法书', '玩具水枪', '精致左轮',
        '海蓝导师', '海蓝斗士', '海蓝舞者', '海蓝先锋', '海蓝贤者'
    ],
    4: [  # 四星武器
        '直音拟态寐', '焦心虑', '毒苹果汁', '龙炎脉冲', '冰霜冲击枪',
        '星月断念天', '伪消防火炮', '无限放射波', '金鸣器-煞毙', '机械连射兵'
    ],
    5: [  # 五星武器
        '万世封卷系列', '轰鸣炮-救星临', '红富士', '圣堂加冕', '莎与礼的誓约'
    ]
}

# 检测套装
def detect_set_bonus(equipment_dict, all_equipment):
    """检测角色是否装备了完整套装"""
    equipped_items = {
        'weapon': None,
        'accessory': None,
        'headwear': None
    }
    
    # 获取已装备的物品
    for slot in ['weapon', 'accessory', 'headwear']:
        equipment_id = equipment_dict.get(slot)
        if equipment_id:
            equipped_items[slot] = next((eq for eq in all_equipment if eq['id'] == equipment_id), None)
    
    # 检查每个套装
    for set_name, set_config in EQUIPMENT_SETS.items():
        weapon_match = equipped_items['weapon'] and equipped_items['weapon']['name'] == set_config['weapon']
        accessory_match = equipped_items['accessory'] and equipped_items['accessory']['name'] == set_config['accessory']
        headwear_match = equipped_items['headwear'] and equipped_items['headwear']['name'] == set_config['headwear']
        
        if weapon_match and accessory_match and headwear_match:
            return set_config
    
    return None

# 应用单个属性
def apply_stat_to_stats(stats, stat_name, stat_value, stat_type):
    """应用单个属性到stats字典"""
    if stat_name == '攻击力':
        if stat_type == 'percent':
            stats['attack'] = stats.get('attack', 0) * (1 + stat_value)
        else:
            stats['attack'] = stats.get('attack', 0) + stat_value
    elif stat_name == '生命值':
        if stat_type == 'percent':
            stats['hp'] = stats.get('hp', 1000) * (1 + stat_value)
        else:
            stats['hp'] = stats.get('hp', 1000) + stat_value
    elif stat_name == '暴击率':
        stats['critRate'] = stats.get('critRate', 0.0) + stat_value
    elif stat_name == '暴击伤害':
        stats['critDamage'] = stats.get('critDamage', 1.0) + stat_value
    elif stat_name == '伤害加成':
        stats['damageBonus'] = stats.get('damageBonus', 0.0) + stat_value
    elif stat_name == '治疗加成':
        stats['healingBonus'] = stats.get('healingBonus', 0.0) + stat_value
    elif stat_name == '换弹减免':
        stats['reloadReduction'] = stats.get('reloadReduction', 0.0) + stat_value
    elif stat_name == '快速射击':
        stats['rapidFire'] = stats.get('rapidFire', 0.0) + stat_value
    elif stat_name == '额外弹容':
        stats['extraAmmo'] = stats.get('extraAmmo', 0.0) + stat_value
    elif stat_name == '属性强度':
        stats['attributePower'] = stats.get('attributePower', 0) + stat_value

# 应用角色被动技能（服务器端）
def apply_passive_skills_server(stats, character_name):
    """应用角色被动技能（服务器端版本）"""
    final_stats = stats.copy()
    
    # 公主蓉的被动：根据治疗加成获得等额暴击率
    if character_name == '公主蓉':
        healing_bonus = final_stats.get('healingBonus', 0.0)
        final_stats['critRate'] = final_stats.get('critRate', 0.0) + healing_bonus
    
    # 幺幺俊羊羊的被动：当自身最终的攻击力面板超过100点，则提高50%暴击率
    if character_name == '幺幺俊羊羊':
        attack = final_stats.get('attack', 0)
        if attack > 100:
            final_stats['critRate'] = final_stats.get('critRate', 0.0) + 0.5
    
    # 勇者的被动：当暴击率超过100%时，根据超出的部分获得双倍的暴击伤害加成
    if character_name == '勇者':
        crit_rate = final_stats.get('critRate', 0.0)
        if crit_rate > 1.0:  # 超过100%
            excess_crit_rate = crit_rate - 1.0  # 超出的部分
            # 超出的部分转换为双倍的暴击伤害加成
            crit_damage_bonus = excess_crit_rate * 2.0
            final_stats['critDamage'] = final_stats.get('critDamage', 1.0) + crit_damage_bonus
    
    return final_stats

# 计算装备属性加成（服务器端）
def calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name=None):
    """计算装备属性加成（服务器端版本）"""
    stats = base_stats.copy()
    
    # 保存基础攻击力和生命值（用于百分比加成计算）
    base_attack = stats.get('attack', 0)
    base_hp = stats.get('hp', 1000)
    
    # 收集所有百分比加成和固定值加成
    attack_percent_bonuses = []  # 攻击力百分比加成列表
    hp_percent_bonuses = []  # 生命值百分比加成列表
    attack_flat_bonuses = []  # 攻击力固定值加成列表
    hp_flat_bonuses = []  # 生命值固定值加成列表
    
    # 遍历三个装备槽位
    for slot in ['weapon', 'accessory', 'headwear']:
        equipment_id = equipment_dict.get(slot)
        if not equipment_id:
            continue
        
        equip = next((eq for eq in all_equipment if eq['id'] == equipment_id), None)
        if not equip:
            continue
        
        # 收集主词条
        if 'mainStat' in equip:
            main_stat = equip['mainStat']
            if main_stat['name'] == '攻击力':
                if main_stat['type'] == 'percent':
                    attack_percent_bonuses.append(main_stat['value'])
                else:
                    attack_flat_bonuses.append(main_stat['value'])
            elif main_stat['name'] == '生命值':
                if main_stat['type'] == 'percent':
                    hp_percent_bonuses.append(main_stat['value'])
                else:
                    hp_flat_bonuses.append(main_stat['value'])
            else:
                # 其他属性直接应用
                apply_stat_to_stats(stats, main_stat['name'], main_stat['value'], main_stat['type'])
        
        # 收集副词条
        if 'subStats' in equip:
            for sub_stat in equip['subStats']:
                if sub_stat['name'] == '攻击力':
                    if sub_stat['type'] == 'percent':
                        attack_percent_bonuses.append(sub_stat['value'])
                    else:
                        attack_flat_bonuses.append(sub_stat['value'])
                elif sub_stat['name'] == '生命值':
                    if sub_stat['type'] == 'percent':
                        hp_percent_bonuses.append(sub_stat['value'])
                    else:
                        hp_flat_bonuses.append(sub_stat['value'])
                else:
                    # 其他属性直接应用
                    apply_stat_to_stats(stats, sub_stat['name'], sub_stat['value'], sub_stat['type'])
    
    # 检测并收集套装效果的百分比加成
    set_bonus = detect_set_bonus(equipment_dict, all_equipment)
    if set_bonus and 'effects' in set_bonus:
        effects = set_bonus['effects']
        
        # 世间真理的传授者：暴击率+20%
        if 'critRate' in effects:
            stats['critRate'] = stats.get('critRate', 0.0) + effects['critRate']
        
        # 黑色狭窄的小巷：攻击力+50%（百分比加成）
        if 'attack_bonus' in effects:
            attack_percent_bonuses.append(effects['attack_bonus'])
        
        # 愿这一轮朝阳照亮明天：生命值+50%（百分比加成）
        if 'hp_bonus' in effects:
            hp_percent_bonuses.append(effects['hp_bonus'])
        
        if 'healingBonus' in effects:
            stats['healingBonus'] = stats.get('healingBonus', 0.0) + effects['healingBonus']
    
    # 先应用所有固定值加成
    for flat_bonus in attack_flat_bonuses:
        base_attack += flat_bonus
    for flat_bonus in hp_flat_bonuses:
        base_hp += flat_bonus
    
    # 然后基于基础值（包含固定值加成后）应用所有百分比加成
    # 所有百分比加成累加后一次性应用
    total_attack_percent = sum(attack_percent_bonuses)
    total_hp_percent = sum(hp_percent_bonuses)
    
    if total_attack_percent > 0:
        stats['attack'] = base_attack * (1 + total_attack_percent)
    else:
        stats['attack'] = base_attack
    
    if total_hp_percent > 0:
        stats['hp'] = base_hp * (1 + total_hp_percent)
    else:
        stats['hp'] = base_hp
    
    # 攻击力和生命值向上取整
    if 'attack' in stats:
        stats['attack'] = int(math.ceil(stats['attack']))
    if 'hp' in stats:
        stats['hp'] = int(math.ceil(stats['hp']))
    
    # 黑色狭窄的小巷：检查攻击力>150的条件（在取整后检查）
    if set_bonus and 'effects' in set_bonus and 'attribute_power_conditional' in set_bonus['effects']:
        if stats.get('attack', 0) > 150:
            stats['attributePower'] = stats.get('attributePower', 0) + set_bonus['effects']['attribute_power_conditional']
    
    # 应用角色被动技能
    if character_name:
        stats = apply_passive_skills_server(stats, character_name)
    
    return stats

# 初始化用户数据
users = load_all_users()

# 初始化新用户的角色数据
def generate_random_equipment():
    """随机生成一件装备"""
    # 1. 从三个套装中随机一套
    set_name = random.choice(list(EQUIPMENT_SETS.keys()))
    set_info = EQUIPMENT_SETS[set_name]
    
    # 2. 从三个部件中随机一件
    slot = random.choice(['weapon', 'accessory', 'headwear'])
    equipment_name = set_info[slot]
    
    # 3. 从部件的主词条中随机一件
    main_stats = EQUIPMENT_MAIN_STATS[slot]
    main_stat = random.choice(main_stats)
    
    # 4. 从所有副词条中随机3条（不与主词条相同）
    available_sub_stats = [s for s in EQUIPMENT_SUB_STATS if s['name'] != main_stat['name']]
    selected_sub_stats = random.sample(available_sub_stats, min(3, len(available_sub_stats)))
    
    # 5. 每条副词条的数值从区间内随机
    sub_stats = []
    for sub_stat in selected_sub_stats:
        if sub_stat['type'] == 'percent':
            value = random.uniform(sub_stat['min'], sub_stat['max'])
        elif sub_stat['type'] == 'time':
            value = random.uniform(sub_stat['min'], sub_stat['max'])
        else:  # flat
            value = random.randint(int(sub_stat['min']), int(sub_stat['max']))
        sub_stats.append({
            'name': sub_stat['name'],
            'value': value,
            'type': sub_stat['type'],
            'upgradeCount': 0  # 该副词条被强化的次数
        })
    
    equipment = {
        'id': f"equip_{int(time.time() * 1000)}_{random.randint(1000, 9999)}",
        'name': equipment_name,
        'set': set_name,
        'slot': slot,
        'mainStat': main_stat,
        'subStats': sub_stats,
        'level': 0  # 装备等级，初始为0
    }
    
    return equipment

def create_character_instances():
    instances = {}
    for name in CHARACTERS:
        cls = CHARACTER_CLASS_MAP.get(name)
        if not cls:
            continue
        instances[name] = cls.create()
    return instances

CHARACTER_INSTANCES = create_character_instances()

def get_character_instance(name: str) -> Character:
    return CHARACTER_INSTANCES.get(name)

def generate_room_key():
    """生成6位随机房间密钥"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))

def random_character():
    """随机生成角色形象"""
    character = random.choice(CHARACTERS)
    color = random.choice(COLOR_VARIANTS)
    return {'character': character, 'color': color}

@socketio.on('join_room_session')
def handle_join_room_session(data):
    """大厅页面加载时加入Socket房间"""
    room_key = data.get('room_key')
    player_name = data.get('player_name', '').strip()
    
    print(f"\n{'='*60}")
    print(f"=== join_room_session 事件 ===")
    print(f"收到的数据: {data}")
    print(f"房间密钥: '{room_key}'")
    print(f"玩家名(参数): '{player_name}'")
    print(f"Socket SID: {request.sid}")
    print(f"Session内容: {dict(session)}")
    
    if room_key not in rooms:
        session_room_key = session.get('room_key')
        if session_room_key and session_room_key in rooms:
            print(f"⚠ 房间密钥不一致，使用Session中的房间密钥: {session_room_key}")
            room_key = session_room_key
        else:
            print(f"❌ 错误：房间不存在")
            print(f"{'='*60}\n")
            emit('error', {'message': '房间不存在'})
            return
    
    room = rooms[room_key]
    print(f"✓ 房间信息:")
    print(f"  房主: '{room['host_name']}'")
    print(f"  最大玩家数: {room['max_players']}")
    print(f"  地图: '{room['map']}'")
    print(f"  怪物: '{room['monster']}'")
    print(f"  当前玩家数: {len(room['players'])}")
    
    # 如果没有提供玩家名，从session获取
    if not player_name:
        player_name = session.get('player_name', '')
        print(f"⚠️ 参数中无玩家名，从session获取: '{player_name}'")
    
    # 如果还是没有玩家名，说明这是一个无效的连接
    if not player_name:
        print(f"❌ 错误：无法确定玩家名")
        print(f"{'='*60}\n")
        emit('error', {'message': '玩家信息丢失，请重新加入房间'})
        return
    
    # 检查是否是刷新（同一玩家用不同SID重新连接）
    old_sid = None
    old_player_data = None
    for sid, pinfo in list(room['players'].items()):
        if pinfo['name'] == player_name and sid != request.sid:
            print(f"⚠️ 检测到玩家刷新，旧SID: {sid}, 新SID: {request.sid}")
            old_sid = sid
            old_player_data = pinfo.copy()
            # 删除旧连接
            del room['players'][sid]
            break
    
    # 如果玩家不在房间中，添加进去
    if request.sid not in room['players']:
        if old_sid and old_player_data:
            # 刷新情况，完全保留之前的数据（包括is_host）
            print(f"✓ 玩家刷新，保留之前的所有状态")
            room['players'][request.sid] = old_player_data
            print(f"  SID: {request.sid}")
            print(f"  名字: '{old_player_data['name']}'")
            print(f"  是否房主: {old_player_data['is_host']}")
            print(f"  角色: {old_player_data.get('avatar')}")
            print(f"  准备状态: {old_player_data.get('ready', False)}")
        else:
            # 没有旧数据，但有Session，说明是页面跳转导致的断开重连
            # 使用Session数据重新添加玩家
            print(f"✓ 页面跳转重连，使用Session数据恢复玩家")
            is_host_from_session = session.get('is_host', False)
            
            # 安全检查：确保只有真正的房主才能设置is_host=True
            if is_host_from_session and player_name != room['host_name']:
                print(f"⚠️ 警告：Session声称是房主，但名字不匹配！")
                print(f"   Session中的player_name: '{player_name}'")
                print(f"   房间的host_name: '{room['host_name']}'")
                print(f"   强制设置is_host=False")
                is_host_from_session = False
            
            room['players'][request.sid] = {
                'name': player_name,
                'ready': False,
                'is_host': is_host_from_session,
                'avatar': random_character()
            }
            print(f"  SID: {request.sid}")
            print(f"  名字: '{player_name}'")
            print(f"  是否房主: {is_host_from_session}")
            print(f"  角色: {room['players'][request.sid]['avatar']}")
            print(f"  准备状态: False")
    else:
        print(f"⚠️ 玩家已在房间中（当前SID）")
    
    # 加入Socket房间
    join_room(room_key)
    print(f"✓ 已加入Socket房间: {room_key}")
    
    # 检查是否是新加入（没有旧数据）
    is_new_join = not old_sid and not old_player_data
    
    # 发送房间信息
    room_info = get_room_info(room_key)
    print(f"✓ 生成房间信息:")
    print(f"  玩家列表: {[p['name'] for p in room_info['players']]}")
    print(f"  玩家数量: {len(room_info['players'])}")
    print(f"✓ 发送 room_info 给当前客户端")
    emit('room_info', room_info)
    print(f"✓ 广播 update_room 给房间内所有人")
    socketio.emit('update_room', room_info, room=room_key)
    
    # 如果是新加入，广播通知
    if is_new_join:
        print(f"✓ 广播新玩家加入消息")
        socketio.emit('player_joined_lobby', {
            'message': f'{player_name} 加入了房间',
            'player_name': player_name
        }, room=room_key)
    
    print(f"{'='*60}\n")

@socketio.on('get_room_info')
def handle_get_room_info(data):
    """获取房间信息"""
    room_key = data.get('room_key')
    if room_key in rooms:
        emit('room_info', get_room_info(room_key))

@socketio.on('send_lobby_message')
def handle_send_lobby_message(data):
    """处理大厅聊天消息"""
    room_key = data.get('room_key')
    message = data.get('message', '').strip()
    
    if not room_key or room_key not in rooms:
        return
    
    if not message:
        return
    
    room = rooms[room_key]
    if request.sid not in room['players']:
        return
    
    # 获取发送者信息
    player_info = room['players'][request.sid]
    player_name = player_info.get('name', '未知玩家')
    
    # 限制消息长度
    if len(message) > 200:
        message = message[:200]
    
    # 广播消息给房间内所有玩家
    for sid in room['players']:
        is_own = (sid == request.sid)
        socketio.emit('lobby_message', {
            'player_name': player_name,
            'message': message,
            'is_own': is_own
        }, room=sid)
    
    print(f"💬 大厅聊天: {player_name} 在房间 {room_key} 发送消息: {message[:50]}...")

@socketio.on('leave_lobby')
def handle_leave_lobby(data):
    """玩家主动离开大厅"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if request.sid not in room['players']:
        return
    
    player_name = room['players'][request.sid].get('name', '未知玩家')
    player_is_host = room['players'][request.sid].get('is_host', False)
    
    print(f"\n{'='*60}")
    print(f"=== 玩家主动离开大厅 ===")
    print(f"玩家: {player_name}")
    print(f"房间: {room_key}")
    print(f"是否房主: {player_is_host}")
    
    # 从Socket房间中移除
    leave_room(room_key)
    
    # 从玩家列表中移除
    del room['players'][request.sid]
    
    # 如果是房主离开
    if player_is_host:
        print(f"⚠️ 房主离开房间")
        
        # 如果房间里还有其他玩家，选择一个新房主
        if len(room['players']) > 0:
            # 选择第一个玩家作为新房主
            new_host_sid = list(room['players'].keys())[0]
            room['players'][new_host_sid]['is_host'] = True
            room['host_name'] = room['players'][new_host_sid]['name']
            
            print(f"✓ 选择新房主: {room['host_name']} (SID: {new_host_sid})")
            
            # 通知所有玩家房主更换
            socketio.emit('host_changed', {
                'message': f'房主已离开，{room["host_name"]} 成为新房主',
                'new_host': room['host_name']
            }, room=room_key)
        else:
            # 房间空了，删除房间
            print(f"⚠️ 房间无玩家，删除房间")
            del rooms[room_key]
            print(f"{'='*60}\n")
            return
    else:
        # 普通玩家离开，通知其他玩家
        print(f"✓ 普通玩家离开，通知其他玩家更新")
        socketio.emit('player_left_lobby', {
            'message': f'{player_name} 离开了房间',
            'player_name': player_name
        }, room=room_key)
    
    # 更新房间信息
    socketio.emit('update_room', get_room_info(room_key), room=room_key)
    
    print(f"{'='*60}\n")

@socketio.on('toggle_ready')
def handle_toggle_ready(data):
    """切换准备状态"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if request.sid not in room['players']:
        return
    
    # 切换准备状态
    room['players'][request.sid]['ready'] = not room['players'][request.sid]['ready']
    
    # 广播更新
    socketio.emit('update_room', get_room_info(room_key), room=room_key)

@socketio.on('change_player_name')
def handle_change_player_name(data):
    """更改玩家名字"""
    room_key = data.get('room_key')
    new_name = data.get('new_name', '').strip()
    
    if not new_name or room_key not in rooms:
        return
    
    room = rooms[room_key]
    if request.sid not in room['players']:
        return
    
    # 更新玩家名字
    room['players'][request.sid]['name'] = new_name
    
    # 如果是房主，也更新房主名字
    if room['players'][request.sid].get('is_host', False):
        room['host_name'] = new_name
    
    # 更新session
    session['player_name'] = new_name
    session.modified = True
    
    # 广播更新
    socketio.emit('update_room', get_room_info(room_key), room=room_key)

@socketio.on('change_avatar')
def handle_change_avatar(data):
    """更改角色形象"""
    room_key = data.get('room_key')
    character = data.get('character')
    color = data.get('color')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if request.sid not in room['players']:
        return
    
    # 验证角色和配色
    if character not in CHARACTERS or color not in COLOR_VARIANTS:
        emit('error', {'message': '无效的角色或配色'})
        return
    
    # 检查是否有其他玩家已经选择了该角色
    for player_id, player_data in room['players'].items():
        if player_id != request.sid and player_data.get('avatar', {}).get('character') == character:
            emit('error', {'message': f'角色"{character}"已被其他玩家选择'})
            return
    
    # 更新角色形象
    room['players'][request.sid]['avatar'] = {
        'character': character,
        'color': color
    }
    
    # 广播更新
    socketio.emit('update_room', get_room_info(room_key), room=room_key)

@socketio.on('update_room_settings')
def handle_update_room_settings(data):
    """更新房间设置（仅房主可用）"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    
    # 检查是否为房主
    is_host = request.sid in room['players'] and room['players'][request.sid].get('is_host', False)
    if not is_host:
        emit('error', {'message': '只有房主才能修改设置'})
        return
    
    # 验证玩家数量
    if 'max_players' in data:
        new_max_players = data['max_players']
        current_player_count = len(room['players'])
        if new_max_players < current_player_count:
            emit('error', {'message': f'玩家人数不能小于当前玩家数量（{current_player_count}人）'})
            return
    
    # 更新设置
    if 'max_players' in data:
        room['max_players'] = data['max_players']
    if 'map' in data:
        room['map'] = data['map']
    if 'monster' in data:
        room['monster'] = data['monster']
    
    # 广播更新
    socketio.emit('update_room', get_room_info(room_key), room=room_key)

@socketio.on('start_game')
def handle_start_game(data):
    """开始游戏（仅房主可用）"""
    room_key = data.get('room_key')
    
    print(f"\n{'='*60}")
    print(f"=== 开始游戏 ===")
    print(f"房间密钥: {room_key}")
    print(f"当前所有房间: {list(rooms.keys())}")
    
    if room_key not in rooms:
        print(f"❌ 错误：房间不存在")
        print(f"{'='*60}\n")
        return
    
    room = rooms[room_key]
    
    # 检查是否为房主
    is_host = request.sid in room['players'] and room['players'][request.sid].get('is_host', False)
    print(f"请求者SID: {request.sid}")
    print(f"是否为房主: {is_host}")
    
    if not is_host:
        print(f"❌ 错误：只有房主才能开始游戏")
        print(f"{'='*60}\n")
        emit('error', {'message': '只有房主才能开始游戏'})
        return
    
    # 检查是否满足开始条件
    can_start = can_start_game(room_key)
    print(f"是否满足开始条件: {can_start}")
    
    if not can_start:
        print(f"❌ 错误：未满足开始条件")
        print(f"{'='*60}\n")
        emit('error', {'message': '未满足开始条件'})
        return
    
    # 重置游戏状态（每次开始新游戏时都重置）
    monster_type = room.get('monster', '杂鱼蕉形脸')
    room['game_state'] = {
        'started': True,
        'players': {},  # 清空玩家列表
        'bullets': [],  # 清空子弹列表
        'enemies': [],  # 清空敌人列表
        'beams': {},  # 光束系统
        'countdown': 3,  # 3秒倒计时
        'countdown_started': False,
        'game_start_time': None,  # 游戏开始时间（倒计时结束后设置）
        'monster_type': monster_type,
        'enemies_spawned': False,  # 敌人是否已生成
        'enemy_collision_cooldowns': {}  # 清空碰撞冷却
    }
    
    # 添加测试木桩（勇者角色，1000HP，无法移动和射击）
    dummy_id = 'dummy_player_1'
    room['game_state']['players'][dummy_id] = {
        'id': dummy_id,
        'name': '测试木桩',
        'avatar': {'character': '勇者', 'color': 1},
        'x': 200,
        'y': 200,
        'hp': 1000,
        'maxHp': 1000,
        'angle': 0,
        'hit_flash_end': 0,
        'lockedBy': None,
        'isDummy': True  # 标记为测试木桩
    }
    print(f"✓ 游戏状态已重置并初始化，怪物类型: {monster_type}")
    print(f"✓ 已添加测试木桩: {dummy_id}")
    
    print(f"✓ 广播游戏开始事件到房间 {room_key}")
    print(f"房间内玩家数: {len(room['players'])}")
    print(f"房间详情:")
    for sid, pinfo in room['players'].items():
        print(f"  - {pinfo['name']} (SID: {sid})")
    print(f"当前所有房间密钥: {list(rooms.keys())}")
    print(f"{'='*60}\n")
    
    # 广播游戏开始
    socketio.emit('game_started', {'room_key': room_key}, room=room_key)

# ===== 游戏相关Socket事件 =====

@socketio.on('join_game')
def handle_join_game(data):
    """玩家加入游戏"""
    room_key = data.get('room_key')
    player_name = data.get('player_name')
    avatar = data.get('avatar')
    x = data.get('x', 400)
    y = data.get('y', 300)
    # hp 将在后面从用户数据中获取，不使用客户端传来的值
    
    print(f"\n{'='*60}")
    print(f"=== 玩家加入游戏 ===")
    print(f"玩家: {player_name}")
    print(f"SID: {request.sid}")
    print(f"房间: {room_key}")
    
    if room_key not in rooms:
        print(f"❌ 错误：房间不存在")
        print(f"{'='*60}\n")
        emit('error', {'message': '房间不存在'})
        return
    
    room = rooms[room_key]
    
    # 初始化游戏状态（如果还没有）
    if 'game_state' not in room:
        monster_type = room.get('monster', '杂鱼蕉形脸')
        room['game_state'] = {
            'started': True,
            'players': {},
            'bullets': [],
            'enemies': [],
            'countdown': 3,  # 3秒倒计时
            'countdown_started': False,
            'game_start_time': None,
            'monster_type': monster_type
        }
        
        # 添加测试木桩（勇者角色，1000HP，无法移动和射击）
        dummy_id = 'dummy_player_1'
        room['game_state']['players'][dummy_id] = {
            'id': dummy_id,
            'name': '测试木桩',
            'avatar': {'character': '勇者', 'color': 1},
            'x': 200,
            'y': 200,
            'hp': 1000,
            'maxHp': 1000,
            'angle': 0,
            'hit_flash_end': 0,
            'lockedBy': None,
            'isDummy': True  # 标记为测试木桩
        }
        print(f"✓ 初始化游戏状态，怪物类型: {monster_type}")
        print(f"✓ 已添加测试木桩: {dummy_id}")
    
    # 检查玩家是否已经在游戏中（防止重复加入）
    if request.sid in room['game_state']['players']:
        print(f"⚠️ 玩家已在游戏中，刷新状态（同一SID）")
        # 更新玩家信息（可能是刷新页面）
        player = room['game_state']['players'][request.sid]
        
        # 保持原有位置和技能状态
        saved_x = player.get('x', x)
        saved_y = player.get('y', y)
        saved_skills = player.get('skills')
        saved_hp = player.get('hp', 0)
        is_dead = saved_hp <= 0
        
        player['name'] = player_name
        player['avatar'] = avatar
        # 保持原有位置（不更新为客户端传来的位置）
        player['x'] = saved_x
        player['y'] = saved_y
        print(f"  保持原有位置: ({saved_x}, {saved_y})，忽略客户端传来的位置: ({x}, {y})")
        
        # 刷新时重新获取用户数据，确保生命值和属性正确
        username = session.get('user_id')
        player['username'] = username  # 更新用户名
        if username:
            users = load_all_users()
            if username in users and 'characters' in users[username]:
                character_name = avatar.get('character', '勇者')
                if character_name in users[username]['characters']:
                    char_data = users[username]['characters'][character_name]
                    stats = char_data.get('stats', {})
                    # 根据角色设置默认生命值
                    default_hp_map = {
                        '勇者': 1000,
                        '公主蓉': 2000,
                        '幺幺俊羊羊': 1200,
                        '星耀犊': 1500,
                        '王子栗': 1000
                    }
                    user_hp = stats.get('hp', None)
                    if user_hp is not None:
                        max_hp = user_hp
                    else:
                        max_hp = default_hp_map.get(character_name, 1000)
                    # 更新生命值上限
                    player['maxHp'] = max_hp
                    # 如果当前hp大于maxHp则设为maxHp，如果小于maxHp则保持当前hp（不自动回满）
                    if player.get('hp', 0) > max_hp:
                        player['hp'] = max_hp
                    # 如果hp未设置或为0，则设置为maxHp（满血）
                    if player.get('hp', 0) <= 0:
                        player['hp'] = max_hp
                    player['attributePower'] = stats.get('attributePower', 0)
                    player['critRate'] = stats.get('critRate', 0.0)
                    player['critDamage'] = stats.get('critDamage', 1.0)
                    print(f"✓ 刷新玩家数据: {character_name}, maxHp={max_hp}, hp={player.get('hp', max_hp)}")
        
        # 重新加入Socket房间
        join_room(room_key)
        
        # 发送当前游戏状态，包含技能状态
        game_state_response = {
            'players': room['game_state']['players'],
            'bullets': room['game_state']['bullets'],
            'enemies': room['game_state'].get('enemies', []),
            'countdown': room['game_state'].get('countdown', 3),
            'myPlayerId': request.sid,
            'playerSkills': {},  # 总是包含技能状态字段
            'soul_balls': room['game_state'].get('soul_balls', {}),  # 包含灵魂球状态
            'q_skills': room['game_state'].get('q_skills', {}),  # 包含Q技能状态（王子栗、公主蓉）
            'big_apples': room['game_state'].get('big_apples', {}),  # 包含巨大苹果状态
            'poison_apples': room['game_state'].get('poison_apples', {})  # 包含毒苹果状态
        }
        
        # 如果玩家有技能状态，包含在响应中
        if player.get('skills') is not None:
            game_state_response['playerSkills'][request.sid] = player['skills']
            print(f"  包含技能状态: {player['skills']}")
        
        emit('game_state', game_state_response)
        print(f"✓ 已发送游戏状态（刷新），位置=({saved_x}, {saved_y})")
        print(f"{'='*60}\n")
        return
    
    # 检查是否已有同名玩家（刷新页面时，SID会变化，但玩家名相同）
    # 优先使用username匹配（更准确），如果没有username则使用player_name
    username = session.get('user_id')
    existing_player_sid = None
    existing_player = None
    for sid, player_data in room['game_state']['players'].items():
        # 跳过测试木桩
        if player_data.get('isDummy', False) or sid.startswith('dummy_player_'):
            continue
        # 优先使用username匹配（如果存在）
        if username and player_data.get('username') == username:
            existing_player_sid = sid
            existing_player = player_data
            break
        # 如果没有username，则使用玩家名匹配
        elif not username and player_data.get('name') == player_name:
            existing_player_sid = sid
            existing_player = player_data
            break
    
    if existing_player_sid and existing_player:
        print(f"⚠️ 检测到同名玩家已存在（可能是刷新页面）")
        print(f"  旧SID: {existing_player_sid}")
        print(f"  新SID: {request.sid}")
        print(f"  玩家名: {player_name}")
        print(f"  当前HP: {existing_player.get('hp', 0)}")
        
        # 保存原有玩家的所有状态
        old_player_data = existing_player.copy()
        
        # 检查玩家是否已死亡
        is_dead = existing_player.get('hp', 0) <= 0
        if is_dead:
            print(f"⚠️ 玩家已死亡，允许重新加入但保持死亡状态")
        else:
            print(f"✓ 玩家未死亡，用新SID替换旧SID，保持原有状态（位置、技能冷却、大招能量）")
        
        # 删除旧玩家数据
        del room['game_state']['players'][existing_player_sid]
        
        # 更新玩家信息（保持原有HP、位置、技能状态等）
        old_player_data['id'] = request.sid  # 更新ID为新SID
        old_player_data['name'] = player_name  # 更新名字（可能变化）
        old_player_data['avatar'] = avatar  # 更新角色形象（可能变化）
        old_player_data['username'] = session.get('user_id')  # 更新用户名
        
        # 保持原有位置（不更新为客户端传来的位置）
        # 明确不更新x和y，使用原有的位置
        saved_x = old_player_data.get('x', x)  # 保存原有位置，如果没有则使用默认值
        saved_y = old_player_data.get('y', y)
        old_player_data['x'] = saved_x  # 确保使用原有位置
        old_player_data['y'] = saved_y
        print(f"  保持原有位置: ({saved_x}, {saved_y})，忽略客户端传来的位置: ({x}, {y})")
        
        # 确保技能状态字段存在（如果不存在则初始化为None，等待客户端同步）
        if 'skills' not in old_player_data:
            old_player_data['skills'] = None
            print(f"  警告：玩家没有技能状态，将等待客户端同步")
        
        # 重新计算属性（但保持HP不变，如果已死亡则保持HP=0）
        username = session.get('user_id')
        character_name = avatar.get('character', '勇者')
        if username:
            users = load_all_users()
            if username in users and 'characters' in users[username]:
                if character_name in users[username]['characters']:
                    char_data = users[username]['characters'][character_name]
                    base_stats = char_data.get('stats', {}).copy()
                    equipment_dict = char_data.get('equipment', {})
                    all_equipment = users[username].get('equipment', [])
                    
                    # 计算装备和套装效果（包含被动技能）
                    final_stats = calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name)
                    
                    # 更新属性（但保持HP不变）
                    old_player_data['maxHp'] = final_stats.get('hp', old_player_data.get('maxHp', 1000))
                    old_player_data['critRate'] = final_stats.get('critRate', 0.0)
                    old_player_data['critDamage'] = final_stats.get('critDamage', 1.0)
                    old_player_data['attributePower'] = final_stats.get('attributePower', 0)
                    old_player_data['attack'] = final_stats.get('attack', 0)
                    old_player_data['damageBonus'] = final_stats.get('damageBonus', 0.0)
                    old_player_data['healingBonus'] = final_stats.get('healingBonus', 0.0)
                    old_player_data['reloadReduction'] = final_stats.get('reloadReduction', 0.0)
                    old_player_data['rapidFire'] = final_stats.get('rapidFire', 0.0)
                    old_player_data['extraAmmo'] = final_stats.get('extraAmmo', 0.0)
                    old_player_data['attribute'] = CHARACTER_ATTRIBUTES.get(character_name, '无属性')
                    
                    # 如果当前HP超过了新的maxHp，则调整为maxHp（但如果是死亡状态则保持0）
                    if not is_dead and old_player_data.get('hp', 0) > old_player_data['maxHp']:
                        old_player_data['hp'] = old_player_data['maxHp']
                    elif is_dead:
                        old_player_data['hp'] = 0  # 确保死亡状态保持
        
        # 用新SID添加玩家（保持原有状态，包括位置、技能状态等）
        room['game_state']['players'][request.sid] = old_player_data
        
        # 更新所有毒苹果的owner（如果owner是旧的socket ID，则更新为新的socket ID）
        if 'poison_apples' in room['game_state']:
            for apple_id, apple in room['game_state']['poison_apples'].items():
                if apple.get('owner') == existing_player_sid:
                    apple['owner'] = request.sid
                    # 同时更新owner_attack和owner_damage_bonus（使用新玩家的最新值）
                    apple['owner_attack'] = old_player_data.get('attack', apple.get('owner_attack', 0))
                    apple['owner_damage_bonus'] = old_player_data.get('damageBonus', apple.get('owner_damage_bonus', 0.0))
                    print(f"🍎 更新毒苹果 {apple_id} 的owner: {existing_player_sid} -> {request.sid}")
                    print(f"🍎 更新毒苹果 {apple_id} 的属性: attack={apple['owner_attack']}, damageBonus={apple['owner_damage_bonus']}")
        
        # 加入Socket房间
        join_room(room_key)
        
        # 发送当前游戏状态，包含技能状态
        game_state_response = {
            'players': room['game_state']['players'],
            'bullets': room['game_state']['bullets'],
            'enemies': room['game_state'].get('enemies', []),
            'countdown': room['game_state'].get('countdown', 3),
            'myPlayerId': request.sid,
            'playerSkills': {},  # 总是包含技能状态字段
            'soul_balls': room['game_state'].get('soul_balls', {}),  # 包含灵魂球状态
            'q_skills': room['game_state'].get('q_skills', {}),  # 包含Q技能状态（王子栗、公主蓉）
            'big_apples': room['game_state'].get('big_apples', {}),  # 包含巨大苹果状态
            'poison_apples': room['game_state'].get('poison_apples', {})  # 包含毒苹果状态
        }
        
        # 如果玩家有技能状态，包含在响应中
        if old_player_data.get('skills') is not None:
            game_state_response['playerSkills'][request.sid] = old_player_data['skills']
            print(f"  包含技能状态: {old_player_data['skills']}")
        else:
            print(f"  警告：玩家技能状态为None，客户端需要同步")
        
        emit('game_state', game_state_response)
        
        # 通知其他玩家玩家重新连接（不发送player_joined，因为玩家已经存在）
        status_msg = "死亡状态" if is_dead else f"HP={old_player_data.get('hp', 0)}/{old_player_data.get('maxHp', 1000)}"
        print(f"✓ 玩家重新连接成功，保持原有状态: {status_msg}, 位置=({old_player_data.get('x', 0)}, {old_player_data.get('y', 0)})")
        if 'skills' in old_player_data:
            print(f"  技能状态已恢复: {old_player_data['skills']}")
        print(f"{'='*60}\n")
        return
    
    # 加入Socket房间
    join_room(room_key)
    print(f"✓ 已加入Socket房间")
    
    # 获取玩家角色数据以确定最大生命值和属性
    # 根据角色设置默认生命值
    character_name = avatar.get('character', '勇者')
    default_hp_map = {
        '勇者': 1000,
        '公主蓉': 2000,
        '幺幺俊羊羊': 1200,
        '星耀犊': 1500,
        '王子栗': 1000
    }
    max_hp = default_hp_map.get(character_name, 1000)  # 根据角色设置默认值
    crit_rate = 0.0  # 默认暴击率
    crit_damage = 1.0  # 默认暴击伤害
    attribute_power = 0  # 默认属性强度
    username = session.get('user_id')
    if username:
        users = load_all_users()
        if username in users and 'characters' in users[username]:
            if character_name in users[username]['characters']:
                char_data = users[username]['characters'][character_name]
                base_stats = char_data.get('stats', {}).copy()
                equipment_dict = char_data.get('equipment', {})
                all_equipment = users[username].get('equipment', [])
                
                # 计算装备和套装效果（包含被动技能）
                final_stats = calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name)
                
                # 从最终属性中获取数值
                max_hp = final_stats.get('hp', default_hp_map.get(character_name, 1000))
                crit_rate = final_stats.get('critRate', 0.0)
                crit_damage = final_stats.get('critDamage', 1.0)
                attribute_power = final_stats.get('attributePower', 0)
                print(f"✓ 加载玩家角色数据（含装备加成）: {character_name}, maxHp={max_hp}, critRate={crit_rate}, critDamage={crit_damage}, attributePower={attribute_power}")
    else:
        print(f"⚠️ 未登录用户，使用默认值: {character_name}, maxHp={max_hp}")
    
    # 使用max_hp初始化hp（而不是客户端传来的hp）
    hp = max_hp
    print(f"✓ 初始化玩家生命值: {player_name} ({character_name}), hp={hp}, maxHp={max_hp}")
    
    # 获取完整的最终属性（用于存储到玩家数据中）
    final_stats_for_player = {}
    if username:
        users = load_all_users()
        if username in users and 'characters' in users[username]:
            character_name = avatar.get('character', '勇者')
            if character_name in users[username]['characters']:
                char_data = users[username]['characters'][character_name]
                base_stats = char_data.get('stats', {}).copy()
                equipment_dict = char_data.get('equipment', {})
                all_equipment = users[username].get('equipment', [])
                
                # 计算装备和套装效果（包含被动技能）
                final_stats_for_player = calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name)
                
                # 从最终属性中获取数值（如果之前没有获取到）
                if max_hp == default_hp_map.get(character_name, 1000):
                    max_hp = final_stats_for_player.get('hp', max_hp)
                if crit_rate == 0.0:
                    crit_rate = final_stats_for_player.get('critRate', 0.0)
                if crit_damage == 1.0:
                    crit_damage = final_stats_for_player.get('critDamage', 1.0)
                if attribute_power == 0:
                    attribute_power = final_stats_for_player.get('attributePower', 0)
    
    # 添加玩家到游戏状态
    room['game_state']['players'][request.sid] = {
        'id': request.sid,
        'name': player_name,
        'username': username,  # 存储用户名（用于游戏胜利奖励）
        'avatar': avatar,
        'x': x,
        'y': y,
        'hp': hp,
        'maxHp': max_hp,
        'angle': 0,
        'hit_flash_end': 0,  # 受击闪烁结束时间
        'lockedBy': None,  # 被谁锁定（用于显示锁定框）
        'isDummy': False,  # 是否为测试木桩
        'critRate': crit_rate,  # 暴击率
        'critDamage': crit_damage,  # 暴击伤害
        'attributePower': attribute_power,  # 属性强度
        'attack': final_stats_for_player.get('attack', 0) if final_stats_for_player else 0,  # 攻击力
        'damageBonus': final_stats_for_player.get('damageBonus', 0.0) if final_stats_for_player else 0.0,  # 伤害加成
        'healingBonus': final_stats_for_player.get('healingBonus', 0.0) if final_stats_for_player else 0.0,  # 治疗加成
        'reloadReduction': final_stats_for_player.get('reloadReduction', 0.0) if final_stats_for_player else 0.0,  # 换弹减免
        'rapidFire': final_stats_for_player.get('rapidFire', 0.0) if final_stats_for_player else 0.0,  # 快速射击
        'extraAmmo': final_stats_for_player.get('extraAmmo', 0.0) if final_stats_for_player else 0.0,  # 额外弹容
        'attribute': CHARACTER_ATTRIBUTES.get(avatar.get('character', '勇者'), '无属性'),  # 角色属性
        'skills': None  # 技能状态（冷却时间、充能值等），由客户端同步
    }
    print(f"✓ 已添加玩家到游戏状态")
    print(f"游戏中玩家数: {len(room['game_state']['players'])}")
    
    # 通知该玩家当前游戏状态
    game_state_response = {
        'players': room['game_state']['players'],
        'bullets': room['game_state']['bullets'],
        'enemies': room['game_state'].get('enemies', []),
        'countdown': room['game_state'].get('countdown', 3),
        'myPlayerId': request.sid,
        'playerSkills': {},  # 总是包含技能状态字段
        'soul_balls': room['game_state'].get('soul_balls', {})  # 包含灵魂球状态
    }
    
    # 如果玩家有技能状态，包含在响应中（首次加入时通常为None）
    player = room['game_state']['players'][request.sid]
    if player.get('skills') is not None:
        game_state_response['playerSkills'][request.sid] = player['skills']
    
    emit('game_state', game_state_response)
    print(f"✓ 已发送游戏状态给当前玩家")
    
    # 通知其他玩家新玩家加入
    socketio.emit('player_joined', room['game_state']['players'][request.sid], room=room_key, skip_sid=request.sid)
    print(f"✓ 已通知其他玩家")
    print(f"{'='*60}\n")

@socketio.on('player_move')
def handle_player_move(data):
    """玩家移动"""
    room_key = data.get('room_key')
    x = data.get('x')
    y = data.get('y')
    angle = data.get('angle')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    # 检查是否是测试木桩（无法移动）
    player = room['game_state']['players'][request.sid]
    if player.get('isDummy', False) or player.get('id', '').startswith('dummy_player_'):
        return  # 测试木桩无法移动
    
    # 更新玩家位置
    player['x'] = x
    player['y'] = y
    player['angle'] = angle
    
    # 广播给其他玩家
    socketio.emit('player_moved', {
        'id': request.sid,
        'x': x,
        'y': y,
        'angle': angle
    }, room=room_key, skip_sid=request.sid)

@socketio.on('sync_skills_state')
def handle_sync_skills_state(data):
    """同步玩家技能状态（冷却时间、充能值等）"""
    room_key = data.get('room_key')
    skills_state = data.get('skills')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    # 更新玩家的技能状态
    player = room['game_state']['players'][request.sid]
    if skills_state:
        player['skills'] = skills_state
        # 可选：记录最后更新时间，用于验证
        player['skills_last_sync'] = time.time()

@socketio.on('update_lock_target')
def handle_update_lock_target(data):
    """更新锁定目标"""
    room_key = data.get('room_key')
    target_id = data.get('targetId')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    # 更新所有玩家的锁定状态
    for player_id, player in room['game_state']['players'].items():
        if player_id == request.sid:
            # 清除之前的锁定
            for other_player_id, other_player in room['game_state']['players'].items():
                if other_player.get('lockedBy') == request.sid:
                    other_player['lockedBy'] = None
            
            # 设置新的锁定
            if target_id and target_id in room['game_state']['players']:
                room['game_state']['players'][target_id]['lockedBy'] = request.sid
            break

@socketio.on('activate_beam')
def handle_activate_beam(data):
    """激活光束（星耀犊Q技能或王子栗右键技能）"""
    room_key = data.get('room_key')
    beam_type = data.get('beam_type', 'star_beam')  # 默认是星耀犊的光束
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        print(f"❌ 无法激活光束: game_state不存在或玩家不存在")
        return
    
    # 确保beams字典存在
    if 'beams' not in room['game_state']:
        room['game_state']['beams'] = {}
    
    # 初始化光束数据
    player = room['game_state']['players'][request.sid]
    character_name = player.get('avatar', {}).get('character', '未知')
    
    if beam_type == 'prince_purification':
        # 王子栗净灭射线
        room['game_state']['beams'][request.sid] = {
            'x': player.get('x', 0),
            'y': player.get('y', 0),
            'angle': data.get('angle', 0),
            'width': 50,  # 光束宽度50
            'isCrit': False,
            'start_time': time.time(),  # 开始时间
            'duration': 0.6,  # 持续0.6秒
            'hitEnemies': [],  # 已击中的敌人ID列表（每次发射只生效一次伤害）
            'beam_type': 'prince_purification'
        }
        print(f"✓ 王子栗激活净灭射线: {request.sid}, 位置: ({player.get('x', 0)}, {player.get('y', 0)}), 角度: {data.get('angle', 0)}")
    else:
        # 星耀犊聚合光束
        room['game_state']['beams'][request.sid] = {
            'x': player.get('x', 0),
            'y': player.get('y', 0),
            'angle': data.get('angle', 0),
            'width': 35,  # 初始宽度35（非暴击）
            'isCrit': False,
            'lastJudgmentTime': time.time(),  # 上次判定时间
            'hitEnemies': [],  # 本周期已击中的敌人ID列表（使用list而不是set，因为JSON无法序列化set）
            'hitPlayers': [],  # 本周期已治疗的玩家ID列表（使用list而不是set，因为JSON无法序列化set）
            'beam_type': 'star_beam'
        }
        print(f"✓ 星耀犊激活聚合光束: {request.sid}, 位置: ({player.get('x', 0)}, {player.get('y', 0)}), 角度: {data.get('angle', 0)}")

@socketio.on('update_beam')
def handle_update_beam(data):
    """更新光束位置和状态"""
    room_key = data.get('room_key')
    beam_type = data.get('beam_type', 'star_beam')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    # 确保beams字典存在
    if 'beams' not in room['game_state']:
        room['game_state']['beams'] = {}
    
    # 更新光束数据（如果不存在则创建）
    if request.sid not in room['game_state']['beams']:
        # 如果光束不存在，重新创建
        if beam_type == 'prince_purification':
            room['game_state']['beams'][request.sid] = {
                'x': data.get('x', 0),
                'y': data.get('y', 0),
                'angle': data.get('angle', 0),
                'width': data.get('beamWidth', 50),
                'isCrit': data.get('isCrit', False),
                'start_time': time.time(),
                'duration': 0.6,
                'hitEnemies': [],
                'beam_type': 'prince_purification'
            }
        else:
            room['game_state']['beams'][request.sid] = {
                'x': data.get('x', 0),
                'y': data.get('y', 0),
                'angle': data.get('angle', 0),
                'width': data.get('beamWidth', 35),
                'isCrit': data.get('isCrit', False),
                'lastJudgmentTime': time.time(),
                'hitEnemies': [],
                'hitPlayers': [],
                'beam_type': 'star_beam'
            }
    else:
        beam = room['game_state']['beams'][request.sid]
        beam['x'] = data.get('x', beam.get('x', 0))
        beam['y'] = data.get('y', beam.get('y', 0))
        beam['angle'] = data.get('angle', beam.get('angle', 0))
        beam['width'] = data.get('beamWidth', beam.get('width', 30))
        beam['isCrit'] = data.get('isCrit', beam.get('isCrit', False))

@socketio.on('deactivate_beam')
def handle_deactivate_beam(data):
    """结束聚合光束"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['beams']:
        return
    
    # 移除光束
    if request.sid in room['game_state']['beams']:
        del room['game_state']['beams'][request.sid]
        print(f"星耀犊结束聚合光束: {request.sid}")

@socketio.on('activate_q_skill')
def handle_activate_q_skill(data):
    """激活Q技能（公主蓉微笑拂晓约定或王子栗再创世）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    # 服务端驱动：根据角色子类的 skill_q 统一触发
    player = room['game_state']['players'][request.sid]
    character_name = player.get('avatar', {}).get('character', '未知')
    inst = get_character_instance(character_name)
    try:
        payload = inst.skill_q()
    except Exception as e:
        emit('error', {'message': str(e)})
        return
    if payload.get('event') == 'activate_q_skill' and payload.get('skill_type') == 'princess_aura':
        if 'q_skills' not in room['game_state']:
            room['game_state']['q_skills'] = {}
        room['game_state']['q_skills'][request.sid] = {
            'x': player.get('x', 0),
            'y': player.get('y', 0),
            'radius': 400,
            'start_time': time.time(),
            'duration': 8.0,
            'last_heal_time': time.time(),
            'last_damage_time': time.time()
        }
        socketio.emit('activate_q_skill', {'playerId': request.sid, 'skill': 'princess_aura'}, room=room_key)
    elif payload.get('event') == 'activate_q_skill' and payload.get('skill_type') == 'prince_recreation':
        if 'q_skills' not in room['game_state']:
            room['game_state']['q_skills'] = {}
        room['game_state']['q_skills'][request.sid] = {
            'player_id': request.sid,
            'start_time': time.time(),
            'shatter_count': 0,
            'max_shatters': 5,
            'shatters': [],
            'white_screen_start': 0,
            'damage_count': 0,
            'max_damages': 5,
            'last_damage_time': 0
        }
        socketio.emit('divine_mode_start', {'playerId': request.sid, 'x': player.get('x', 0), 'y': player.get('y', 0)}, room=room_key)

@socketio.on('revive_teammate')
def handle_revive_teammate(data):
    """王子栗E技能：复活队友"""
    room_key = data.get('room_key')
    soul_ball_id = data.get('soul_ball_id')
    x = data.get('x', 0)
    y = data.get('y', 0)
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    
    # 检查是否是王子栗玩家
    if request.sid not in game_state['players']:
        return
    
    player = game_state['players'][request.sid]
    if player.get('avatar', {}).get('character') != '王子栗':
        return
    
    # 检查E技能冷却
    # 这里简化处理，实际应该检查冷却时间
    
    # 检查灵魂球是否存在
    if 'soul_balls' not in game_state or soul_ball_id not in game_state['soul_balls']:
        print(f"❌ 灵魂球不存在: {soul_ball_id}")
        return
    
    soul_ball = game_state['soul_balls'][soul_ball_id]
    dead_player_id = soul_ball.get('dead_player_id')
    
    # 检查死亡玩家是否存在
    if not dead_player_id or dead_player_id not in game_state['players']:
        print(f"❌ 死亡玩家不存在: {dead_player_id}")
        return
    
    dead_player = game_state['players'][dead_player_id]
    
    # 复活玩家
    dead_player['hp'] = dead_player.get('maxHp', 1000)
    dead_player['x'] = x
    dead_player['y'] = y
    
    # 移除灵魂球
    del game_state['soul_balls'][soul_ball_id]
    
    # 通知客户端玩家复活（确保使用最新的玩家名字）
    player_name = dead_player.get('name', '未知')
    # 如果玩家名字为空，尝试从username获取
    if not player_name or player_name == '未知':
        username = dead_player.get('username')
        if username:
            player_name = username
    
    socketio.emit('player_revived', {
        'playerId': dead_player_id,
        'playerName': player_name,
        'hp': dead_player['hp'],
        'x': dead_player['x'],
        'y': dead_player['y'],
        'soulBallId': soul_ball_id
    }, room=room_key)
    
    print(f"💛 王子栗E技能：玩家 {player_name} 已复活")

@socketio.on('deactivate_q_skill')
def handle_deactivate_q_skill(data):
    """结束Q技能（公主蓉微笑拂晓约定）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    if skill_type == 'princess_aura':
        if 'q_skills' in room['game_state'] and request.sid in room['game_state']['q_skills']:
            del room['game_state']['q_skills'][request.sid]
            print(f"🌸 公主蓉结束Q技能: {request.sid}")

@socketio.on('interrupt_prince_q_skill')
def handle_interrupt_prince_q_skill(data):
    """中断王子栗Q技能并解除敌人禁锢状态"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    
    # 删除Q技能状态
    if 'q_skills' in game_state and request.sid in game_state['q_skills']:
        del game_state['q_skills'][request.sid]
        print(f"⚡ 王子栗Q技能被中断: {request.sid}")
    
    # 更新玩家技能状态：将Q技能充能设置为25%
    if request.sid in game_state['players']:
        player = game_state['players'][request.sid]
        if player.get('skills') is not None:
            if 'Q' in player['skills']:
                max_charge = player['skills']['Q'].get('maxCharge', 100)
                refund_charge = int(max_charge * 0.25)
                player['skills']['Q']['charge'] = refund_charge
                player['skills']['Q']['active'] = False
                print(f"⚡ 王子栗Q技能充能已更新为25%: {refund_charge}%")
    
    # 解除所有敌人的禁锢状态（同时解除frozen和stunned状态）
    enemies = game_state.get('enemies', [])
    for enemy in enemies:
        if enemy.get('frozen', False) or enemy.get('stunned', False):
            enemy['frozen'] = False
            enemy['frozen_end'] = 0
            enemy['stunned'] = False
            enemy['stun_end'] = 0
            print(f"⚡ 解除敌人禁锢: {enemy.get('type', '未知')}")
    
    # 通知所有客户端解除敌人禁锢并同步技能状态更新
    socketio.emit('enemies_unfrozen', {
        'playerId': request.sid
    }, room=room_key)
    
    # 同步更新玩家的技能状态（确保客户端收到充能更新）
    if request.sid in game_state['players']:
        player = game_state['players'][request.sid]
        if player.get('skills') is not None:
            socketio.emit('skill_state_updated', {
                'playerId': request.sid,
                'skills': player['skills']
            }, room=room_key)
    
    print(f"✓ 王子栗Q技能中断完成，已解除所有敌人禁锢状态，充能已更新为25%")

@socketio.on('activate_lock_skill')
def handle_activate_lock_skill(data):
    """激活锁定技能（公主蓉右键）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    if skill_type == 'princess_lock':
        # 初始化锁定状态
        if 'lock_skills' not in room['game_state']:
            room['game_state']['lock_skills'] = {}
        
        current_time = time.time()
        room['game_state']['lock_skills'][request.sid] = {
            'start_time': current_time,
            'duration': 1.0,
            'locked_targets': []  # 将在1秒后填充
        }
        print(f"🌸 公主蓉开始锁定: {request.sid}")

@socketio.on('deactivate_lock_skill')
def handle_deactivate_lock_skill(data):
    """解除锁定技能（公主蓉右键）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    if skill_type == 'princess_lock':
        game_state = room['game_state']
        if 'lock_skills' in game_state and request.sid in game_state['lock_skills']:
            del game_state['lock_skills'][request.sid]
            print(f"🌸 公主蓉解除锁定技能: {request.sid}")

@socketio.on('activate_e_skill')
def handle_activate_e_skill(data):
    """激活E技能（星耀犊强化增幅）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    if skill_type == 'star_boost':
        # 初始化E技能状态
        if 'e_skills' not in room['game_state']:
            room['game_state']['e_skills'] = {}
        
        current_time = time.time()
        room['game_state']['e_skills'][request.sid] = {
            'start_time': current_time,
            'duration': 10.0,  # 持续10秒
            'attribute_power_bonus': 200,  # 200点属性强度
            'healing_bonus': 0.20  # 20%治疗加成
        }
        print(f"🎵 星耀犊激活E技能: {request.sid}, 获得200点属性强度和20%治疗加成")

@socketio.on('deactivate_e_skill')
def handle_deactivate_e_skill(data):
    """结束E技能（星耀犊强化增幅）"""
    room_key = data.get('room_key')
    skill_type = data.get('skill_type')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    if skill_type == 'star_boost':
        game_state = room['game_state']
        if 'e_skills' in game_state and request.sid in game_state['e_skills']:
            del game_state['e_skills'][request.sid]
            print(f"🎵 星耀犊结束E技能: {request.sid}")

@socketio.on('apply_bubble_shield')
def handle_apply_bubble_shield(data):
    """赋予泡泡盾（幺幺俊羊羊右键）"""
    room_key = data.get('room_key')
    target_id = data.get('targetId')
    owner_attack = data.get('ownerAttack', 0)
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    if target_id not in room['game_state']['players']:
        return
    
    target_player = room['game_state']['players'][target_id]
    owner_player = room['game_state']['players'][request.sid]
    current_time = time.time()
    
    # 赋予泡泡盾：3秒无敌 + 伤害提高50% + 治疗幺幺俊羊羊
    target_player['bubble_shield_end'] = current_time + 3.0
    target_player['invincible'] = True
    target_player['bubble_shield_damage_bonus'] = 0.5  # 伤害提高50%
    target_player['bubble_shield_owner'] = request.sid  # 泡泡盾的拥有者（幺幺俊羊羊）
    target_player['bubble_shield_owner_attack'] = owner_attack  # 幺幺俊羊羊的攻击力（用于治疗）
    
    print(f"🍎 幺幺俊羊羊赋予泡泡盾给: {target_id}, 攻击力: {owner_attack}")

# 幺幺俊羊羊E技能现在是放置毒苹果，不再需要拉取队友功能，此函数已删除

@socketio.on('spawn_big_apple')
def handle_spawn_big_apple(data):
    """生成巨大苹果（幺幺俊羊羊Q技能）"""
    room_key = data.get('room_key')
    x = data.get('x')
    y = data.get('y')
    placement_damage = data.get('placementDamage', 1000)
    healing_amount = data.get('healingAmount', 100)
    explosion_damage = data.get('explosionDamage', 2000)
    duration = data.get('duration', 6.0)
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    player = room['game_state']['players'][request.sid]
    game_state = room['game_state']
    
    # 初始化巨大苹果字典
    if 'big_apples' not in game_state:
        game_state['big_apples'] = {}
    
    apple_id = f"big_apple_{request.sid}_{int(time.time() * 1000)}"
    current_time = time.time()
    
    # 创建巨大苹果
    game_state['big_apples'][apple_id] = {
        'x': x,
        'y': y,
        'size': 200,
        'start_time': current_time,
        'duration': duration,
        'placement_damage': placement_damage,
        'healing_amount': healing_amount,
        'explosion_damage': explosion_damage,
        'owner': request.sid,
        'owner_attack': player.get('attack', 0),
        'last_heal_time': current_time
    }
    
    # 放置时弹开敌人并造成伤害
    for enemy in game_state.get('enemies', []):
        if enemy.get('hp', 0) <= 0:
            continue
        
        dx = enemy.get('x', 0) - x
        dy = enemy.get('y', 0) - y
        distance = (dx * dx + dy * dy) ** 0.5
        
        if distance <= 200:  # 200像素范围内
            # 弹开敌人
            if distance > 0:
                knockback_dir_x = dx / distance
                knockback_dir_y = dy / distance
                # 击退速度：每秒667像素，持续0.3秒，总共击退200像素
                enemy['knockback_vx'] = knockback_dir_x * 667
                enemy['knockback_vy'] = knockback_dir_y * 667
                enemy['knockback_end'] = current_time + 0.9
            
            # 造成伤害（考虑属性克制）
            owner_player = game_state['players'][request.sid]
            attacker_attribute = owner_player.get('attribute', '无属性')
            defender_attribute = enemy.get('attribute', '无属性')
            attacker_attribute_power = owner_player.get('attributePower', 0)
            
            # 导入calculate_attribute_damage函数
            from game_combat import calculate_attribute_damage as calc_attr_dmg
            final_damage, is_advantage = calc_attr_dmg(
                placement_damage, attacker_attribute, defender_attribute, attacker_attribute_power
            )
            final_damage = int(final_damage)
            if final_damage < 1:
                final_damage = 1
            
            enemy['hp'] = max(0, enemy['hp'] - final_damage)
            enemy['hit_flash_end'] = current_time + 0.2
            
            # 发送伤害数字事件
            socketio.emit('enemy_hit', {
                'enemyId': enemy['id'],
                'x': enemy.get('x', x),
                'y': enemy.get('y', y),
                'damage': final_damage,
                'isCrit': False,
                'attribute': attacker_attribute
            }, room=room_key)
            
            if enemy['hp'] <= 0:
                socketio.emit('enemy_killed', {
                    'enemyId': enemy.get('id'),
                    'killerId': request.sid
                }, room=room_key)
    
    print(f"🍎 幺幺俊羊羊生成巨大苹果: {apple_id}, 位置: ({x}, {y})")

@socketio.on('spawn_poison_apple')
def handle_spawn_poison_apple(data):
    """生成毒苹果（幺幺俊羊羊E技能）"""
    room_key = data.get('room_key')
    x = data.get('x')
    y = data.get('y')
    explosion_damage = data.get('explosionDamage', 2000)
    duration = data.get('duration', 10.0)
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or request.sid not in room['game_state']['players']:
        return
    
    player = room['game_state']['players'][request.sid]
    game_state = room['game_state']
    
    # 初始化毒苹果字典
    if 'poison_apples' not in game_state:
        game_state['poison_apples'] = {}
    
    apple_id = f"poison_apple_{request.sid}_{int(time.time() * 1000)}"
    current_time = time.time()
    
    # 创建毒苹果
    game_state['poison_apples'][apple_id] = {
        'x': x,
        'y': y,
        'size': 100,
        'start_time': current_time,
        'duration': duration,
        'explosion_damage': explosion_damage,
        'owner': request.sid,
        'owner_attack': player.get('attack', 0),
        'owner_damage_bonus': player.get('damageBonus', 0.0)  # 保存伤害加成，用于刷新后计算
    }
    
    print(f"🍎 幺幺俊羊羊生成毒苹果: {apple_id}, 位置: ({x}, {y})")

@socketio.on('player_shoot')
def handle_player_shoot(data):
    """玩家射击"""
    room_key = data.get('room_key')
    bullet = data.get('bullet')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    # 检查是否是测试木桩（无法射击）
    player = room['game_state']['players'].get(request.sid)
    if player and (player.get('isDummy', False) or player.get('id', '').startswith('dummy_player_')):
        return  # 测试木桩无法射击
    
    # 获取玩家角色属性和属性强度
    # 注意：优先使用客户端发送的属性强度（因为可能包含E技能等临时加成）
    if player:
        player_character = player.get('avatar', {}).get('character', '勇者')
        # 如果客户端没有发送属性，则从玩家数据中获取
        if 'attribute' not in bullet or not bullet.get('attribute'):
            bullet['attribute'] = CHARACTER_ATTRIBUTES.get(player_character, '无属性')
        # 优先使用客户端发送的属性强度（可能包含E技能加成）
        if 'attributePower' not in bullet or bullet.get('attributePower') is None:
            bullet['attributePower'] = player.get('attributePower', 0)
    else:
        if 'attribute' not in bullet or not bullet.get('attribute'):
            bullet['attribute'] = '无属性'
        if 'attributePower' not in bullet or bullet.get('attributePower') is None:
            bullet['attributePower'] = 0
    
    # 添加子弹ID和初始位置（用于碰撞检测）
    bullet['id'] = f"{request.sid}_{len(room['game_state']['bullets'])}"
    bullet['prev_x'] = bullet.get('x', 0)  # 保存上一帧位置
    bullet['prev_y'] = bullet.get('y', 0)
    
    # 保存子弹的弹射属性
    bullet['canBounce'] = bullet.get('canBounce', False)
    bullet['bounceCount'] = bullet.get('bounceCount', 0)
    bullet['isCrit'] = bullet.get('isCrit', False)  # 暴击标记（包括治疗暴击）
    bullet['isQSkill'] = bullet.get('isQSkill', False)
    bullet['canPenetrate'] = bullet.get('canPenetrate', False)
    bullet['hitEnemies'] = bullet.get('hitEnemies', [])
    
    # 星耀犊音符子弹特殊属性
    bullet['isHealing'] = bullet.get('isHealing', False)
    bullet['healing'] = bullet.get('healing', 0)
    bullet['targetId'] = bullet.get('targetId', None)  # 锁定目标ID
    bullet['bulletImage'] = bullet.get('bulletImage', None)  # 子弹图标
    bullet['bulletSpeed'] = bullet.get('bulletSpeed', 3500)  # 保存子弹速度（用于追踪）
    
    # 星耀犊尖刺子弹特殊属性
    bullet['isSpike'] = bullet.get('isSpike', False)  # 是否为尖刺子弹
    
    # 确保isCrit是布尔值（修复JSON序列化问题）
    is_crit_value = bullet.get('isCrit', False)
    if isinstance(is_crit_value, str):
        bullet['isCrit'] = is_crit_value.lower() in ('true', '1', 'yes')
    else:
        bullet['isCrit'] = bool(is_crit_value)
    
    # 调试日志：检查暴击信息
    if bullet.get('isHealing', False):
        print(f"🎵 音符子弹创建: 治疗量={bullet.get('healing', 0)}, 是否暴击={bullet.get('isCrit')} (类型: {type(bullet.get('isCrit'))}), 目标ID={bullet.get('targetId', None)}")
    
    # 服务端技能驱动：若来自角色统一接口的弹药，则直接广播
    room['game_state']['bullets'].append(bullet)
    socketio.emit('player_shot', {'bullet': bullet}, room=room_key)

@socketio.on('player_hit')
def handle_player_hit(data):
    """玩家被击中"""
    room_key = data.get('room_key')
    target_id = data.get('targetId')
    damage = data.get('damage')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room or target_id not in room['game_state']['players']:
        return
    
    # 计算伤害
    player = room['game_state']['players'][target_id]
    player['hp'] -= damage
    
    print(f"玩家 {player['name']} 被击中，伤害: {damage}, 剩余HP: {player['hp']}")
    
    # 广播伤害信息
    socketio.emit('player_hit', {
        'playerId': target_id,
        'hp': player['hp'],
        'damage': damage
    }, room=room_key)
    
    # 设置玩家受击闪烁
    player['hit_flash_end'] = time.time() + 1.0
    
    # 检查是否死亡
    if player['hp'] <= 0:
        player['hp'] = 0
        print(f"玩家 {player['name']} 已被击败")
        
        # 王子栗E技能：队友死亡时生成灵魂球
        # 检查房间内是否有王子栗玩家
        game_state = room['game_state']
        for other_player_id, other_player in game_state['players'].items():
            if other_player_id == target_id:
                continue
            other_character = other_player.get('avatar', {}).get('character', '未知')
            if other_character == '王子栗':
                # 创建灵魂球
                if 'soul_balls' not in game_state:
                    game_state['soul_balls'] = {}
                soul_ball_id = f"soul_ball_{target_id}"
                # 确保玩家名字正确（优先使用name，如果为空则使用username）
                player_name = player.get('name') or player.get('username', '未知')
                # 如果是测试木桩，确保名字正确
                if player.get('isDummy', False) or target_id.startswith('dummy_player_'):
                    player_name = '测试木桩'
                
                game_state['soul_balls'][soul_ball_id] = {
                    'id': soul_ball_id,
                    'x': player.get('x', 0),
                    'y': player.get('y', 0),
                    'dead_player_id': target_id,
                    'dead_player_name': player_name,
                    'spawn_time': time.time()
                }
                # 通知客户端生成灵魂球
                socketio.emit('soul_ball_spawned', {
                    'soulBallId': soul_ball_id,
                    'x': player.get('x', 0),
                    'y': player.get('y', 0),
                    'deadPlayerId': target_id,
                    'deadPlayerName': player_name
                }, room=room_key)
                print(f"💛 王子栗E技能：玩家 {player['name']} 死亡，生成灵魂球")
                break
        
        check_game_over(room_key)

@socketio.on('game_tick')
def handle_game_tick(data):
    """游戏循环更新（客户端定期发送）"""
    room_key = data.get('room_key')
    canvas_width = data.get('canvas_width', 1920)
    canvas_height = data.get('canvas_height', 1080)
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    
    # 保存画布尺寸
    game_state['canvas_width'] = canvas_width
    game_state['canvas_height'] = canvas_height
    
    # 使用战斗模块处理游戏循环
    process_game_tick(room_key, rooms, socketio, check_game_over)

def check_game_over(room_key):
    """检查游戏是否结束（玩家死亡时调用）"""
    check_victory_defeat(room_key, rooms, socketio)

@socketio.on('disconnect')
def handle_disconnect():
    """玩家断开连接"""
    for room_key in list(rooms.keys()):
        room = rooms[room_key]
        if request.sid in room['players']:
            player_name = room['players'][request.sid].get('name', '未知玩家')
            player_is_host = room['players'][request.sid].get('is_host', False)
            
            print(f"\n{'='*60}")
            print(f"=== 玩家断开连接 ===")
            print(f"玩家: {player_name}")
            print(f"SID: {request.sid}")
            print(f"房间: {room_key}")
            print(f"是否房主: {player_is_host}")
            
            # 检查游戏是否已开始
            game_started = 'game_state' in room and room['game_state'].get('started', False)
            print(f"游戏是否已开始: {game_started}")
            
            if game_started:
                # 游戏已开始，不删除房间，只标记玩家离线
                print(f"⚠️ 游戏进行中，保留房间，等待玩家重新连接")
                print(f"提示：玩家可能正在跳转到游戏页面")
                # 暂时不从players中删除，等游戏页面重新连接
                print(f"{'='*60}\n")
            else:
                # 游戏未开始，从大厅移除玩家
                print(f"✓ 游戏未开始，从大厅移除玩家")
                leave_room(room_key)
                del room['players'][request.sid]
                
                # 如果是房主离开
                if player_is_host:
                    print(f"⚠️ 房主离开房间")
                    
                    # 如果房间里还有其他玩家，选择一个新房主
                    if len(room['players']) > 0:
                        # 选择第一个玩家作为新房主
                        new_host_sid = list(room['players'].keys())[0]
                        room['players'][new_host_sid]['is_host'] = True
                        room['host_name'] = room['players'][new_host_sid]['name']
                        
                        print(f"✓ 选择新房主: {room['host_name']} (SID: {new_host_sid})")
                        
                        # 通知所有玩家房主更换
                        socketio.emit('host_changed', {
                            'message': f'房主已离开，{room["host_name"]} 成为新房主',
                            'new_host': room['host_name']
                        }, room=room_key)
                        
                        # 更新房间信息
                        socketio.emit('update_room', get_room_info(room_key), room=room_key)
                    else:
                        # 房间空了，删除房间
                        print(f"⚠️ 房间无玩家，删除房间")
                        del rooms[room_key]
                else:
                    # 普通玩家离开，通知其他玩家
                    print(f"✓ 普通玩家离开，通知其他玩家更新")
                    socketio.emit('player_left_lobby', {
                        'message': f'{player_name} 离开了房间',
                        'player_name': player_name
                    }, room=room_key)
                    socketio.emit('update_room', get_room_info(room_key), room=room_key)
                
                print(f"{'='*60}\n")

@socketio.on('request_team_stats')
def handle_request_team_stats(data):
    """请求队伍角色数据"""
    room_key = data.get('room_key')
    
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    users = load_all_users()
    
    # 获取房间内所有玩家的角色数据
    team_stats = {}
    
    # 优先从game_state获取玩家列表（如果游戏已开始）
    players_to_iterate = {}
    if 'game_state' in room and 'players' in room['game_state']:
        # 游戏已开始，从game_state获取玩家
        for sid, game_player in room['game_state']['players'].items():
            # 从room['players']获取玩家基本信息
            if sid in room['players']:
                players_to_iterate[sid] = {
                    'pinfo': room['players'][sid],
                    'game_player': game_player
                }
            else:
                # 如果不在room['players']中，使用game_player的数据
                players_to_iterate[sid] = {
                    'pinfo': {
                        'name': game_player.get('name', '未知玩家'),
                        'avatar': game_player.get('avatar', {})
                    },
                    'game_player': game_player
                }
    else:
        # 游戏未开始，从room['players']获取
        for sid, pinfo in room['players'].items():
            players_to_iterate[sid] = {
                'pinfo': pinfo,
                'game_player': None
            }
    
    for sid, player_data in players_to_iterate.items():
        pinfo = player_data['pinfo']
        game_player = player_data['game_player']
        player_name = pinfo.get('name', '未知玩家')
        character_name = pinfo.get('avatar', {}).get('character', '勇者')
        
        # 尝试从game_state中获取玩家的属性（如果游戏已开始）
        player_stats = None
        if game_player:
            # 从游戏状态中获取计算后的属性
            player_stats = {
                'attack': game_player.get('attack', 0),  # 从游戏状态获取攻击力
                'critRate': game_player.get('critRate', 0.0),
                'critDamage': game_player.get('critDamage', 1.0),
                'attributePower': game_player.get('attributePower', 0),
                'hp': game_player.get('maxHp', 1000),
                'damageBonus': game_player.get('damageBonus', 0.0),
                'healingBonus': game_player.get('healingBonus', 0.0),
                'reloadReduction': game_player.get('reloadReduction', 0.0),
                'rapidFire': game_player.get('rapidFire', 0.0),
                'extraAmmo': game_player.get('extraAmmo', 0.0)
            }
        
        # 尝试从所有用户中找到匹配的角色数据
        player_username = None
        for uname, udata in users.items():
            if character_name in udata.get('characters', {}):
                char_data = udata['characters'][character_name]
                # 检查角色名是否匹配（更精确的匹配）
                if char_data.get('attribute') == CHARACTER_ATTRIBUTES.get(character_name):
                    player_username = uname
                    break
        
        # 如果找到了用户数据，计算最终属性
        if player_username and player_username in users:
            char_data = users[player_username]['characters'][character_name]
            base_stats = char_data.get('stats', {}).copy()
            equipment_dict = char_data.get('equipment', {})
            all_equipment = users[player_username].get('equipment', [])
            
            # 计算装备和套装效果（包含被动技能）
            final_stats = calculate_equipment_stats_server(base_stats, equipment_dict, all_equipment, character_name)
            
            # 如果游戏状态中有更准确的属性，使用游戏状态的值（如暴击率、属性强度等）
            if player_stats:
                final_stats['attack'] = player_stats.get('attack', final_stats.get('attack', 0))
                final_stats['critRate'] = player_stats.get('critRate', final_stats.get('critRate', 0.0))
                final_stats['critDamage'] = player_stats.get('critDamage', final_stats.get('critDamage', 1.0))
                final_stats['attributePower'] = player_stats.get('attributePower', final_stats.get('attributePower', 0))
                final_stats['hp'] = player_stats.get('hp', final_stats.get('hp', 1000))
                final_stats['damageBonus'] = player_stats.get('damageBonus', final_stats.get('damageBonus', 0.0))
                final_stats['healingBonus'] = player_stats.get('healingBonus', final_stats.get('healingBonus', 0.0))
                final_stats['reloadReduction'] = player_stats.get('reloadReduction', final_stats.get('reloadReduction', 0.0))
                final_stats['rapidFire'] = player_stats.get('rapidFire', final_stats.get('rapidFire', 0.0))
                final_stats['extraAmmo'] = player_stats.get('extraAmmo', final_stats.get('extraAmmo', 0.0))
        else:
            # 如果找不到用户数据，使用默认值
            default_stats = {
                'attack': 0,
                'critRate': 0.0,
                'critDamage': 1.0,
                'attributePower': 0,
                'hp': 1000,
                'damageBonus': 0.0,
                'healingBonus': 0.0,
                'reloadReduction': 0.0,
                'rapidFire': 0.0,
                'extraAmmo': 0.0
            }
            # 如果游戏状态中有数据，使用游戏状态的值
            if player_stats:
                default_stats.update(player_stats)
            final_stats = default_stats
        
        # 应用实时技能加成效果
        if 'game_state' in room and sid in room['game_state'].get('players', {}):
            game_player = room['game_state']['players'][sid]
            current_time = time.time()
            
            # 星耀犊E技能：属性强度+200，治疗加成+20%
            if 'e_skills' in room['game_state'] and sid in room['game_state']['e_skills']:
                e_skill = room['game_state']['e_skills'][sid]
                elapsed = current_time - e_skill.get('start_time', 0)
                if elapsed < e_skill.get('duration', 10.0):
                    final_stats['attributePower'] = final_stats.get('attributePower', 0) + e_skill.get('attribute_power_bonus', 0)
                    final_stats['healingBonus'] = final_stats.get('healingBonus', 0.0) + e_skill.get('healing_bonus', 0.0)
            
            # 幺幺俊羊羊护盾：伤害加成+50%
            bubble_shield_end = game_player.get('bubble_shield_end', 0)
            if current_time < bubble_shield_end:
                bubble_damage_bonus = game_player.get('bubble_shield_damage_bonus', 0.0)
                final_stats['damageBonus'] = final_stats.get('damageBonus', 0.0) + bubble_damage_bonus
        
        # 获取当前生命值（实时）
        current_hp = 0
        if 'game_state' in room and sid in room['game_state'].get('players', {}):
            current_hp = room['game_state']['players'][sid].get('hp', 0)
        
        team_stats[sid] = {
            'name': player_name,
            'character': character_name,
            'stats': final_stats,
            'currentHp': current_hp  # 添加当前生命值
        }
    
    # 发送队伍数据给请求者
    emit('team_stats', team_stats)

def get_room_info(room_key):
    """获取房间信息"""
    print(f"\n{'='*60}")
    print(f"=== get_room_info 函数 ===")
    print(f"房间密钥: {room_key}")
    
    if room_key not in rooms:
        print(f"❌ 错误：房间不存在")
        print(f"{'='*60}\n")
        return None
    
    room = rooms[room_key]
    print(f"✓ 房间存在，原始房间数据:")
    print(f"  host_name: '{room['host_name']}'")
    print(f"  max_players: {room['max_players']}")
    print(f"  map: '{room['map']}'")
    print(f"  monster: '{room['monster']}'")
    print(f"  players: {room['players']}")
    
    # 找到房主的session ID
    host_sid = None
    for sid, pinfo in room['players'].items():
            if pinfo.get('is_host', False):
                host_sid = sid
                break
    print(f"房主SID: {host_sid}")
    print(f"当前请求SID: {request.sid}")
    
    room_info = {
        'room_key': room_key,
        'host': host_sid,
        'host_name': room['host_name'],
        'max_players': room['max_players'],
        'map': room['map'],
        'monster': room['monster'],
        'players': [
            {
                'id': pid,
                'name': pinfo['name'],
                'ready': pinfo['ready'],
                'is_host': pinfo['is_host'],
                'avatar': pinfo.get('avatar', {'character': '勇者', 'color': 1})
            }
            for pid, pinfo in room['players'].items()
        ],
        'can_start': can_start_game(room_key),
        'current_player_id': request.sid
    }
    
    print(f"✓ 生成的房间信息:")
    print(f"  room_key: '{room_info['room_key']}'")
    print(f"  host_name: '{room_info['host_name']}'")
    print(f"  max_players: {room_info['max_players']}")
    print(f"  map: '{room_info['map']}'")
    print(f"  monster: '{room_info['monster']}'")
    print(f"  players数量: {len(room_info['players'])}")
    for i, p in enumerate(room_info['players']):
        print(f"    玩家{i+1}: id={p['id']}, name='{p['name']}', is_host={p['is_host']}")
    print(f"  can_start: {room_info['can_start']}")
    print(f"  current_player_id: {room_info['current_player_id']}")
    print(f"{'='*60}\n")
    
    return room_info

def can_start_game(room_key):
    """检查是否可以开始游戏"""
    if room_key not in rooms:
        return False
    
    room = rooms[room_key]
    
    # 检查玩家数量是否达到要求
    if len(room['players']) != room['max_players']:
        return False
    
    # 检查所有玩家是否都准备
    for player in room['players'].values():
        if not player['ready']:
            return False
    
    return True

def perform_gacha(users, username, count=1):
    """执行抽卡"""
    results = []
    pity_4star = users[username].get('gacha_pity_4star', 0)
    pity_5star = users[username].get('gacha_pity_5star', 0)
    
    log_gacha(username, f"========== 开始抽卡 ==========")
    log_gacha(username, f"抽卡数量: {count}, 初始保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")
    
    # 十连抽时，记录是否已经有四星或五星
    has_4star_in_batch = False
    has_5star_in_batch = False
    
    for i in range(count):
        log_gacha(username, f"--- 第 {i+1} 抽 --- 抽卡前保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")
        
        # 检查保底
        must_4star = (pity_4star >= 9)  # 第10抽必出四星
        must_5star = (pity_5star >= 49)  # 第50抽必出五星
        
        # 十连抽的特殊保底：如果前9抽都没有四星，第10抽必定是四星
        if count == 10 and i == 9 and not has_4star_in_batch:
            must_4star = True
        
        # 十连抽的特殊保底：如果前49抽都没有五星，第50抽必定是五星
        if count == 10 and i == 9 and not has_5star_in_batch and pity_5star >= 49:
            must_5star = True
        
        if must_4star or must_5star:
            log_gacha(username, f"保底检查 - must_4star: {must_4star}, must_5star: {must_5star}")
        
        # 先不设置保底计数，等确定抽到对应星级武器后再设置
        if must_5star:
            # 必出五星
            star = 5
            has_5star_in_batch = True
            # 保底时强制生成武器
            force_weapon = True
            # 临时保存保底状态，等确认抽到武器后再重置计数
            should_reset_5star_pity = True
            should_reset_4star_pity = True
            log_gacha(username, f"触发五星保底！star=5, force_weapon=True")
        elif must_4star:
            # 必出四星
            star = 4
            has_4star_in_batch = True
            # 保底时强制生成武器
            force_weapon = True
            # 临时保存保底状态，等确认抽到武器后再重置计数
            should_reset_4star_pity = True
            should_reset_5star_pity = False
            log_gacha(username, f"触发四星保底！star=4, force_weapon=True")
        else:
            # 正常抽卡
            # 概率：三星85%，四星12%，五星3%
            rand = random.random()
            should_reset_5star_pity = False
            should_reset_4star_pity = False
            if rand < 0.03:  # 3% 五星
                star = 5
                # 不立即重置保底计数，等确认抽到武器后再重置
                should_reset_5star_pity = True
                should_reset_4star_pity = True
                has_5star_in_batch = True
                force_weapon = False
                log_gacha(username, f"随机抽到五星！rand={rand:.4f}")
            elif rand < 0.15:  # 12% 四星 (0.03 + 0.12 = 0.15)
                star = 4
                # 不立即重置保底计数，等确认抽到武器后再重置
                should_reset_4star_pity = True
                should_reset_5star_pity = False
                has_4star_in_batch = True
                force_weapon = False
                log_gacha(username, f"随机抽到四星！rand={rand:.4f}")
            else:  # 85% 三星 (剩余概率)
                star = 3
                pity_4star += 1
                pity_5star += 1
        
        # 每次循环都获取最新的武器列表（因为可能在上一次循环中添加了新武器）
        user_weapons = users[username].get('weapons', [])
        
        # 生成奖励：四星和五星只能抽到武器，三星可以抽到各种道具
        if star == 5 or star == 4:
            # 四星和五星只能抽到武器
            reward_type = 'weapon'
        elif star == 3:
            # 三星可以抽到各种道具
            reward_type = random.choice(['emoji', 'material', 'equipment', 'weapon'])
        else:
            # 默认生成武器
            reward_type = 'weapon'
        
        if reward_type == 'emoji':
            # 随机表情包（固定3星，只在三星时出现）
            emoji_num = random.randint(1, 10)
            results.append({
                'type': 'emoji',
                'star': 3,  # 表情包固定3星
                'name': f'表情包{emoji_num}',
                'image': f'/static/表情包/{emoji_num}.png',
                'index': i + 1  # 抽卡序号（从1开始）
            })
            log_gacha(username, f"第{i+1}抽: 抽到表情包{emoji_num}，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        elif reward_type == 'material':
            # 叠志精心料x1（固定3星，只在三星时出现）
            users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 1
            results.append({
                'type': 'material',
                'star': 3,  # 叠志精心料固定3星
                'name': '叠志精心料',
                'count': 1,
                'index': i + 1  # 抽卡序号（从1开始）
            })
            log_gacha(username, f"第{i+1}抽: 抽到叠志精心料x1，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        elif reward_type == 'equipment':
            # 随机装备（固定3星，只在三星时出现）
            equipment = generate_random_equipment()
            if 'equipment' not in users[username]:
                users[username]['equipment'] = []
            users[username]['equipment'].append(equipment)
            results.append({
                'type': 'equipment',
                'star': 3,  # 装备固定3星
                'equipment': equipment,
                'index': i + 1  # 抽卡序号（从1开始）
            })
            log_gacha(username, f"第{i+1}抽: 抽到装备，当前保底计数 - 四星: {pity_4star}, 五星: {pity_5star}")
        else:  # weapon
            # 随机武器
            weapon_name = random.choice(WEAPONS[star])
            
            # 检查是否重复
            weapon_ids = [w.get('name') for w in user_weapons]
            is_duplicate = weapon_name in weapon_ids
            
            # 确认抽到了对应星级的武器，现在可以重置保底计数
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
                # 重复武器转换，但显示时仍显示武器
                compensation = None
                if star == 3:
                    users[username]['refinement_material'] = users[username].get('refinement_material', 0) + 5
                    compensation = {'type': 'material', 'name': '叠志精心料', 'count': 5}
                elif star == 4:
                    users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 1
                    compensation = {'type': 'ticket', 'name': '神兵许愿单', 'count': 1}
                else:  # star == 5
                    users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + 5
                    compensation = {'type': 'ticket', 'name': '神兵许愿单', 'count': 5}
                
                # 创建武器对象用于显示（但不添加到武器列表）
                weapon = {
                    'id': f"weapon_{int(time.time() * 1000)}_{random.randint(1000, 9999)}",
                    'name': weapon_name,
                    'star': star
                }
                results.append({
                    'type': 'weapon',
                    'star': star,
                    'weapon': weapon,
                    'is_duplicate': True,
                    'compensation': compensation,  # 补偿信息
                    'index': i + 1  # 抽卡序号（从1开始）
                })
            else:
                # 新武器
                weapon = {
                    'id': f"weapon_{int(time.time() * 1000)}_{random.randint(1000, 9999)}",
                    'name': weapon_name,
                    'star': star
                }
                user_weapons.append(weapon)
                results.append({
                    'type': 'weapon',
                    'star': star,
                    'weapon': weapon,
                    'index': i + 1  # 抽卡序号（从1开始）
                })
    
    # 更新保底计数
    users[username]['gacha_pity_4star'] = pity_4star
    users[username]['gacha_pity_5star'] = pity_5star
    users[username]['weapons'] = user_weapons
    
    log_gacha(username, f"========== 抽卡结束 ========== 最终保底计数 - 四星: {pity_4star}/10, 五星: {pity_5star}/50")
    
    return results

from routes import main_bp, auth_bp, room_bp, equipment_bp, gacha_bp
app.register_blueprint(main_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(room_bp)
app.register_blueprint(equipment_bp)
app.register_blueprint(gacha_bp)

# 保持原有端点名称兼容
from routes.main_routes import index as main_index
app.add_url_rule('/', endpoint='index', view_func=main_index)

if __name__ == '__main__':
    # 生产环境：设置环境变量 DEBUG=False 来关闭调试模式
    # 例如：export DEBUG=False 或在systemd服务文件中设置
    debug_mode = os.environ.get('DEBUG', 'True').lower() == 'true'
    socketio.run(app, debug=debug_mode, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
