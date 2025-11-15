"""
游戏战斗模块
处理敌人生成、移动、碰撞检测等战斗逻辑
"""
import time
import random
import math
import json
import os
from flask_socketio import emit

# 用户数据文件路径（与main.py保持一致）
USER_DATA_FILE = 'user_data.json'

def load_user_data():
    """从文件加载用户数据"""
    if os.path.exists(USER_DATA_FILE):
        try:
            with open(USER_DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"加载用户数据失败: {e}")
            return {}
    return {}

def save_user_data(data):
    """保存用户数据到文件"""
    try:
        with open(USER_DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存用户数据失败: {e}")
        return False

# 敌人配置
ENEMY_CONFIG = {
    '杂鱼蕉形脸': {
        'size': 150,
        'speed_multiplier': 1.0,  # 和玩家一样的速度
        'hp': 50000,
        'attribute': '无属性',
        'attributePower': 0  # 属性强度
    },
    '热辣蕉形脸': {
        'size': 150,
        'speed_multiplier': 1.25,  # 比玩家快25%
        'hp': 50000,
        'attribute': '物理系',
        'attributePower': 0  # 属性强度
    },
    '诗宝蕉形脸': {
        'size': 250,
        'speed_multiplier': 0.7,  # 比玩家慢30%
        'hp': 60000,
        'attribute': '自然系',
        'attributePower': 0  # 属性强度
    },
    '笛者蕉形脸': {
        'size': 250,
        'speed_multiplier': 0.5,  # 比玩家慢50%
        'hp': 60000,
        'attribute': '超能系',
        'attributePower': 0  # 属性强度
    },
    '沙壁蕉形脸': {
        'size': 200,
        'speed_multiplier': 1.5,  # 比玩家快50%
        'hp': 80000,
        'attribute': '自然系',
        'attributePower': 0  # 属性强度
    }
}

# 属性克制关系
ATTRIBUTE_ADVANTAGE = {
    '物理系': '自然系',  # 物理系克制自然系
    '自然系': '超能系',  # 自然系克制超能系
    '超能系': '物理系'   # 超能系克制物理系
    # 无属性不克制也不被克制
}

# 属性伤害颜色
ATTRIBUTE_COLORS = {
    '物理系': '#ffffff',      # 白色
    '自然系': '#00ffcc',      # 青绿色
    '超能系': '#ff00ff',      # 紫粉色
    '无属性': '#87ceeb'       # 天蓝色
}

def calculate_attribute_damage(base_damage, attacker_attribute, defender_attribute, attacker_attribute_power=0):
    """
    计算属性克制后的伤害
    参数:
        base_damage: 基础伤害（已计算攻击力、增伤、暴击后的伤害）
        attacker_attribute: 攻击者属性
        defender_attribute: 防御者属性
        attacker_attribute_power: 攻击者属性强度
    返回: (最终伤害, 是否克制)
    """
    # 无属性不参与克制
    if attacker_attribute == '无属性' or defender_attribute == '无属性':
        return base_damage, False
    
    # 检查是否克制
    if ATTRIBUTE_ADVANTAGE.get(attacker_attribute) == defender_attribute:
        # 克制：伤害加成 = 25% + (属性强度 * 0.2%)
        advantage_multiplier = 0.25 + (attacker_attribute_power * 0.002)
        final_damage = int(base_damage * (1 + advantage_multiplier))
        print(f"  💥 克制计算: 基础伤害={base_damage}, 加成倍率={advantage_multiplier:.1%}, 最终伤害={final_damage}")
        return final_damage, True
    elif ATTRIBUTE_ADVANTAGE.get(defender_attribute) == attacker_attribute:
        # 被克制：伤害减少25%
        final_damage = int(base_damage * 0.75)
        print(f"  ⚠ 被克制: 基础伤害={base_damage}, 最终伤害={final_damage}")
        return final_damage, False
    else:
        # 无克制关系
        return base_damage, False

# 玩家基础移动速度
PLAYER_BASE_SPEED = 5

# 速度倍数（再加快10倍，总共100倍）
SPEED_MULTIPLIER = 100

def spawn_enemies(room_key, rooms, socketio):
    """生成敌人"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    monster_type = game_state.get('monster_type', '杂鱼蕉形脸')
    
    if monster_type not in ENEMY_CONFIG:
        print(f"❌ 未知的怪物类型: {monster_type}")
        return
    
    config = ENEMY_CONFIG[monster_type]
    # 使用动态画布尺寸（从客户端获取或使用默认值）
    canvas_width = game_state.get('canvas_width', 1920)
    canvas_height = game_state.get('canvas_height', 1080)
    
    # 生成一个敌人（可以根据需要生成多个）
    enemy_speed = PLAYER_BASE_SPEED * config['speed_multiplier'] * SPEED_MULTIPLIER  # 加快100倍
    enemy = {
        'id': f"enemy_{len(game_state['enemies'])}",
        'type': monster_type,
        'x': random.randint(config['size'], canvas_width - config['size']),
        'y': random.randint(config['size'], canvas_height - config['size']),
        'hp': config['hp'],
        'maxHp': config['hp'],
        'size': config['size'],
        'speed': enemy_speed,
        'vx': (random.random() - 0.5) * enemy_speed * 2,
        'vy': (random.random() - 0.5) * enemy_speed * 2,
        'direction_change_timer': 0,
        'direction_change_interval': random.uniform(1.0, 3.0),  # 1-3秒改变方向
        'hit_flash_end': 0,  # 受击闪烁结束时间
        'attribute': config.get('attribute', '无属性'),  # 敌人属性
        'attributePower': config.get('attributePower', 0),  # 敌人属性强度
        'spawn_time': time.time(),  # 生成时间（用于分裂判断）
        'can_split': monster_type == '杂鱼蕉形脸'  # 只有杂鱼蕉形脸可以分裂
    }
    
    game_state['enemies'].append(enemy)
    print(f"✓ 生成敌人: {monster_type}, HP: {enemy['hp']}, 属性: {enemy['attribute']}, 位置: ({enemy['x']}, {enemy['y']})")

def update_enemies(room_key, rooms):
    """更新敌人位置（不规则移动）"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    canvas_width = game_state.get('canvas_width', 1920)
    canvas_height = game_state.get('canvas_height', 1080)
    
    current_time = time.time()
    
    # 初始化last_enemy_update_time（如果不存在）
    if 'last_enemy_update_time' not in game_state:
        game_state['last_enemy_update_time'] = current_time
    
    delta_time = current_time - game_state['last_enemy_update_time']
    game_state['last_enemy_update_time'] = current_time
    
    # 限制delta_time，防止过大（例如客户端长时间未发送tick）
    delta_time = min(delta_time, 0.1)  # 最大100ms
    
    for enemy in game_state['enemies']:
        # 检查是否被眩晕/禁锢
        if enemy.get('stunned', False):
            stun_end = enemy.get('stun_end', 0)
            if current_time >= stun_end:
                enemy['stunned'] = False
                enemy['stun_end'] = 0
            else:
                # 被禁锢，不移动
                continue
        
        # 检查击退状态（幺幺俊羊羊苹果子弹）
        knockback_end = enemy.get('knockback_end', 0)
        if current_time < knockback_end:
            # 正在击退中，应用击退速度
            knockback_vx = enemy.get('knockback_vx', 0)
            knockback_vy = enemy.get('knockback_vy', 0)
            enemy['x'] += knockback_vx * delta_time
            enemy['y'] += knockback_vy * delta_time
            # 衰减击退速度
            enemy['knockback_vx'] *= 0.9
            enemy['knockback_vy'] *= 0.9
            # 边界检查
            half_size = enemy['size'] / 2
            if enemy['x'] < half_size or enemy['x'] > canvas_width - half_size:
                enemy['knockback_vx'] = -enemy['knockback_vx']
                enemy['x'] = max(half_size, min(canvas_width - half_size, enemy['x']))
            if enemy['y'] < half_size or enemy['y'] > canvas_height - half_size:
                enemy['knockback_vy'] = -enemy['knockback_vy']
                enemy['y'] = max(half_size, min(canvas_height - half_size, enemy['y']))
            continue  # 击退期间不进行正常移动
        
        # 检查毒苹果减速效果（所有敌人移动速度降低20%）
        speed_multiplier = 1.0
        if 'poison_apples' in game_state and len(game_state.get('poison_apples', {})) > 0:
            speed_multiplier = 0.8  # 降低20%移动速度
        
        # 更新方向改变计时器
        enemy['direction_change_timer'] += delta_time
        
        # 随机改变方向
        if enemy['direction_change_timer'] >= enemy['direction_change_interval']:
            enemy['vx'] = (random.random() - 0.5) * enemy['speed'] * 2
            enemy['vy'] = (random.random() - 0.5) * enemy['speed'] * 2
            enemy['direction_change_timer'] = 0
            enemy['direction_change_interval'] = random.uniform(1.0, 3.0)
        
        # 更新位置
        # 应用毒苹果减速效果
        enemy['x'] += enemy['vx'] * delta_time * speed_multiplier
        enemy['y'] += enemy['vy'] * delta_time * speed_multiplier
        
        # 边界反弹
        half_size = enemy['size'] / 2
        if enemy['x'] < half_size or enemy['x'] > canvas_width - half_size:
            enemy['vx'] = -enemy['vx']
            enemy['x'] = max(half_size, min(canvas_width - half_size, enemy['x']))
        if enemy['y'] < half_size or enemy['y'] > canvas_height - half_size:
            enemy['vy'] = -enemy['vy']
            enemy['y'] = max(half_size, min(canvas_height - half_size, enemy['y']))

def check_enemy_player_collisions(room_key, rooms, socketio, check_game_over):
    """检查敌人与玩家的碰撞"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    current_time = time.time()
    
    # 初始化碰撞冷却字典
    if 'enemy_collision_cooldowns' not in game_state:
        game_state['enemy_collision_cooldowns'] = {}
    
    for enemy in game_state['enemies']:
        # 被禁锢的敌人不能对玩家造成碰撞伤害
        if enemy.get('stunned', False):
            continue
        
        enemy_radius = enemy['size'] / 2
        for player_id, player in game_state['players'].items():
            if player['hp'] <= 0:
                continue
            
            dx = enemy['x'] - player['x']
            dy = enemy['y'] - player['y']
            distance = (dx * dx + dy * dy) ** 0.5
            
            player_radius = 50  # 玩家半径
            if distance < enemy_radius + player_radius:
                # 检查碰撞冷却（1秒内只能造成一次伤害）
                collision_key = f"{enemy['id']}_{player_id}"
                last_collision_time = game_state['enemy_collision_cooldowns'].get(collision_key, 0)
                
                if current_time - last_collision_time >= 1.0:  # 1秒冷却
                    # 检查玩家是否处于无敌状态（泡泡盾保护）
                    if player.get('invincible', False):
                        print(f"玩家 {player['name']} 处于无敌状态，免疫碰撞伤害")
                        continue  # 跳过伤害处理
                    
                    # 碰撞伤害（敌人碰撞玩家）
                    base_damage = 200
                    attacker_attribute = enemy.get('attribute', '无属性')
                    attacker_attribute_power = enemy.get('attributePower', 0)  # 敌人属性强度
                    # 获取玩家属性（从avatar中获取角色名，然后查找属性）
                    player_character = player.get('avatar', {}).get('character', '勇者')
                    # 角色属性映射
                    character_attributes = {
                        '勇者': '物理系',
                        '幺幺俊羊羊': '物理系',
                        '公主蓉': '自然系',
                        '星耀犊': '超能系',
                        '王子栗': '无属性'
                    }
                    defender_attribute = character_attributes.get(player_character, '无属性')
                    
                    # 计算属性克制伤害
                    final_damage, is_advantage = calculate_attribute_damage(
                        base_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                    )
                    
                    player['hp'] -= final_damage
                    if player['hp'] < 0:
                        player['hp'] = 0
                    
                    # 设置玩家受击闪烁（如果特效尚未结束则不重复触发）
                    if current_time >= player.get('hit_flash_end', 0):
                        player['hit_flash_end'] = current_time + 1.0
                    
                    # 更新碰撞时间
                    game_state['enemy_collision_cooldowns'][collision_key] = current_time
                    
                    print(f"敌人 {enemy['type']} 碰撞玩家 {player['name']}, 伤害: {final_damage}, 剩余HP: {player['hp']}")
                    
                    # 广播伤害
                    socketio.emit('player_hit', {
                        'playerId': player_id,
                        'hp': player['hp'],
                        'damage': final_damage,
                        'isCrit': False,
                        'attribute': attacker_attribute  # 传递攻击者属性，用于显示颜色
                    }, room=room_key)
                    
                    # 检查玩家是否死亡
                    if player['hp'] <= 0:
                        # 王子栗E技能：队友死亡时生成灵魂球
                        # 检查房间内是否有王子栗玩家
                        for other_player_id, other_player in game_state['players'].items():
                            if other_player_id == player_id:
                                continue
                            other_character = other_player.get('avatar', {}).get('character', '未知')
                            if other_character == '王子栗':
                                # 创建灵魂球
                                if 'soul_balls' not in game_state:
                                    game_state['soul_balls'] = {}
                                soul_ball_id = f"soul_ball_{player_id}"
                                game_state['soul_balls'][soul_ball_id] = {
                                    'id': soul_ball_id,
                                    'x': player.get('x', 0),
                                    'y': player.get('y', 0),
                                    'dead_player_id': player_id,
                                    'dead_player_name': player.get('name', '未知'),
                                    'spawn_time': current_time
                                }
                                # 通知客户端生成灵魂球
                                socketio.emit('soul_ball_spawned', {
                                    'soulBallId': soul_ball_id,
                                    'x': player.get('x', 0),
                                    'y': player.get('y', 0),
                                    'deadPlayerId': player_id,
                                    'deadPlayerName': player.get('name', '未知')
                                }, room=room_key)
                                print(f"💛 王子栗E技能：玩家 {player['name']} 死亡，生成灵魂球")
                                break
                        check_game_over(room_key)
                    break  # 一个敌人一次只碰撞一个玩家

def check_bullet_enemy_collisions(room_key, rooms, socketio):
    """检查子弹与敌人的碰撞（子弹命中后消失，不穿透）"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    current_time = time.time()
    
    # 初始化尖刺击中计数（如果不存在）
    if 'spike_hit_count' not in game_state:
        game_state['spike_hit_count'] = {}  # {enemy_id: count}
    
    bullets_to_remove = []
    enemies_to_remove = []
    
    for i, bullet in enumerate(game_state['bullets']):
        if i in bullets_to_remove:
            continue
        
        # 音符子弹（治疗子弹）穿过敌人，不检测与敌人的碰撞
        if bullet.get('isHealing', False):
            continue
        
        # 更新子弹的上一帧位置（用于下一帧的碰撞检测）
        bullet['prev_x'] = bullet.get('prev_x', bullet['x'])
        bullet['prev_y'] = bullet.get('prev_y', bullet['y'])
            
        # 子弹只伤害敌人，不伤害玩家
        for j, enemy in enumerate(game_state['enemies']):
            if enemy['hp'] <= 0 or j in enemies_to_remove:
                continue
            
            enemy_radius = enemy['size'] / 2
            bullet_radius = bullet.get('size', 10) / 2
            
            # 计算子弹当前位置到敌人的距离
            dx = bullet['x'] - enemy['x']
            dy = bullet['y'] - enemy['y']
            distance = (dx * dx + dy * dy) ** 0.5
            
            # 如果距离小于半径之和，说明碰撞
            # 对于高速子弹，也检查上一帧位置到当前位置的路径是否与敌人相交
            prev_dx = bullet['prev_x'] - enemy['x']
            prev_dy = bullet['prev_y'] - enemy['y']
            prev_distance = (prev_dx * prev_dx + prev_dy * prev_dy) ** 0.5
            
            # 如果当前帧或上一帧在碰撞范围内，都认为碰撞
            if distance < enemy_radius + bullet_radius or prev_distance < enemy_radius + bullet_radius:
                # 检查是否是Q技能穿透子弹
                is_q_skill = bullet.get('isQSkill', False)
                hit_enemies = bullet.get('hitEnemies', [])
                
                # 如果是Q技能子弹，检查是否已经击中过这个敌人
                if is_q_skill and enemy['id'] in hit_enemies:
                    continue  # 跳过已击中的敌人
                
                # 检查是否是尖刺子弹
                is_spike = bullet.get('isSpike', False)
                
                # 击中敌人
                base_damage = bullet.get('damage', 200)
                is_crit = bullet.get('isCrit', False)
                
                # 调试日志：服务器端接收到的伤害值
                player_id = bullet.get('owner')
                player_name = '未知'
                character_name = '未知'  # 初始化character_name，避免未定义错误
                if player_id and player_id in game_state['players']:
                    player = game_state['players'][player_id]
                    player_name = player.get('name', '未知')
                    character_name = player.get('avatar', {}).get('character', '未知')
                    print(f"\n{'='*60}")
                    print(f"🎯 服务器端伤害计算 - {player_name} ({character_name})")
                    print(f"  接收到的伤害值: {base_damage}")
                    print(f"  是否暴击: {is_crit}")
                    print(f"  子弹ID: {bullet.get('id', 'unknown')}")
                
                # 计算属性克制伤害（在攻击力、增伤、暴击之后计算）
                attacker_attribute = bullet.get('attribute', '无属性')
                defender_attribute = enemy.get('attribute', '无属性')
                attacker_attribute_power = bullet.get('attributePower', 0)  # 从子弹中获取属性强度
                
                # 王子栗被动：对物理/自然/超能属性的敌人造成伤害时，该伤害转变为克制敌人的属性
                if character_name == '王子栗' and defender_attribute in ['物理系', '自然系', '超能系']:
                    # 查找克制该敌人的属性
                    for attr, countered in ATTRIBUTE_ADVANTAGE.items():
                        if countered == defender_attribute:
                            attacker_attribute = attr
                            # 属性强度设为100（被动转换的属性强度）
                            attacker_attribute_power = 100
                            break
                
                # 检查星耀犊E技能是否激活（服务器端验证并补充属性强度加成）
                if player_id and player_id in game_state['players']:
                    player = game_state['players'][player_id]
                    if player.get('avatar', {}).get('character') == '星耀犊':
                        # 检查E技能是否激活
                        if 'e_skills' in game_state and player_id in game_state['e_skills']:
                            e_skill = game_state['e_skills'][player_id]
                            # 检查E技能是否还在持续时间内
                            if current_time - e_skill['start_time'] < e_skill['duration']:
                                # 服务器端强制应用E技能属性强度加成（确保正确应用）
                                base_attribute_power = player.get('attributePower', 0)
                                e_skill_bonus = e_skill.get('attribute_power_bonus', 200)
                                expected_attribute_power = base_attribute_power + e_skill_bonus
                                # 强制使用服务器端计算的属性强度（确保E技能加成被应用）
                                attacker_attribute_power = expected_attribute_power
                                print(f"  🎵 星耀犊E技能激活，属性强度: {base_attribute_power} + {e_skill_bonus} = {attacker_attribute_power}")
                            else:
                                print(f"  ⚠️ 星耀犊E技能已过期，属性强度: {attacker_attribute_power}")
                        else:
                            print(f"  ⚠️ 星耀犊E技能未激活，属性强度: {attacker_attribute_power}")
                
                # 调试日志：属性克制计算
                print(f"  🔍 属性克制计算:")
                print(f"    攻击者属性: {attacker_attribute}")
                print(f"    属性强度: {attacker_attribute_power}")
                print(f"    防御者属性: {defender_attribute}")
                print(f"    接收到的伤害值: {base_damage}")
                
                final_damage, is_advantage = calculate_attribute_damage(
                    base_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                )
                
                # 伤害向上取整，避免小数
                final_damage = int(final_damage)
                if final_damage < 1:
                    final_damage = 1  # 至少造成1点伤害
                
                if is_advantage:
                    advantage_percent = (final_damage / base_damage - 1) * 100
                    print(f"    ✓ 触发克制！伤害加成: +{advantage_percent:.1f}%")
                    print(f"    最终伤害: {base_damage} -> {final_damage}")
                elif attacker_attribute != '无属性' and defender_attribute != '无属性':
                    print(f"    ⚠ 无克制关系，最终伤害: {final_damage}")
                else:
                    print(f"    最终伤害: {final_damage} (无属性，无克制)")
                
                print(f"  💥 敌人受到伤害: {final_damage} (原始: {base_damage}, 是否暴击: {is_crit})")
                print(f"{'='*60}\n")
                
                enemy['hp'] -= final_damage
                
                # 设置敌人受击闪烁（如果特效尚未结束则不重复触发）
                if current_time >= enemy.get('hit_flash_end', 0):
                    enemy['hit_flash_end'] = current_time + 1.0
                # 如果是暴击，设置抖动效果（如果特效尚未结束则不重复触发）
                if is_crit and current_time >= enemy.get('crit_shake_end', 0):
                    enemy['crit_shake_end'] = current_time + 1.0
                
                # 发送命中伤害数字事件（所有子弹都需要显示伤害）
                socketio.emit('enemy_hit', {
                    'enemyId': enemy['id'],
                    'x': enemy['x'],
                    'y': enemy['y'],
                    'damage': final_damage,
                    'isCrit': is_crit,
                    'attribute': attacker_attribute
                }, room=room_key)
                
                # 检查是否是火炮弹（王子栗左键技能）
                is_cannonball = bullet.get('isCannonball', False)
                
                # 如果是火炮弹，在击中敌人后触发爆炸
                if is_cannonball:
                    # 命中伤害已经在上面的代码中处理并发送了
                    # 然后创建爆炸特效并造成范围伤害
                    explosion_radius = bullet.get('explosionRadius', 180)  # 默认180（缩小40%）
                    explosion_base_damage = bullet.get('explosionDamage', 500)  # 改为500
                    
                    # 获取玩家攻击力
                    if player_id and player_id in game_state['players']:
                        player = game_state['players'][player_id]
                        attack_power = player.get('attack', 0)
                        explosion_damage = explosion_base_damage + attack_power
                        
                        # 应用伤害加成
                        damage_bonus = player.get('damageBonus', 0.0)
                        if damage_bonus > 0:
                            explosion_damage = int(explosion_damage * (1 + damage_bonus))
                        
                        # 计算暴击
                        crit_rate = player.get('critRate', 0.0)
                        crit_damage = player.get('critDamage', 1.0)
                        is_explosion_crit = False
                        if random.random() < crit_rate:
                            explosion_damage = int(explosion_damage * (1 + crit_damage))
                            is_explosion_crit = True
                        
                        # 创建爆炸特效
                        if 'explosions' not in game_state:
                            game_state['explosions'] = {}
                        explosion_id = f"cannonball_explosion_{bullet.get('id', 'unknown')}"
                        game_state['explosions'][explosion_id] = {
                            'x': bullet['x'],
                            'y': bullet['y'],
                            'start_time': current_time,
                            'duration': 0.5,  # 爆炸特效持续0.5秒
                            'radius': explosion_radius,
                            'size': explosion_radius * 2
                        }
                        
                        # 对范围内的所有敌人造成爆炸伤害
                        for other_enemy in game_state['enemies']:
                            if other_enemy['hp'] <= 0:
                                continue
                            
                            # 计算距离
                            ex = other_enemy['x'] - bullet['x']
                            ey = other_enemy['y'] - bullet['y']
                            enemy_distance = (ex * ex + ey * ey) ** 0.5
                            
                            if enemy_distance <= explosion_radius:
                                # 在爆炸范围内，计算属性克制伤害
                                attacker_attribute = bullet.get('attribute', '无属性')
                                defender_attribute = other_enemy.get('attribute', '无属性')
                                attacker_attribute_power = bullet.get('attributePower', 0)
                                
                                # 应用王子栗被动
                                if character_name == '王子栗' and defender_attribute in ['物理系', '自然系', '超能系']:
                                    for attr, countered in ATTRIBUTE_ADVANTAGE.items():
                                        if countered == defender_attribute:
                                            attacker_attribute = attr
                                            attacker_attribute_power = 100
                                            break
                                
                                final_explosion_damage, _ = calculate_attribute_damage(
                                    explosion_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                                )
                                final_explosion_damage = int(final_explosion_damage)
                                if final_explosion_damage < 1:
                                    final_explosion_damage = 1
                                
                                other_enemy['hp'] -= final_explosion_damage
                                other_enemy['hit_flash_end'] = current_time + 0.2
                                
                                # 发送伤害数字事件
                                socketio.emit('enemy_hit', {
                                    'enemyId': other_enemy['id'],
                                    'x': other_enemy['x'],
                                    'y': other_enemy['y'],
                                    'damage': final_explosion_damage,
                                    'isCrit': is_explosion_crit,
                                    'attribute': attacker_attribute
                                }, room=room_key)
                                
                                if other_enemy['hp'] <= 0:
                                    socketio.emit('enemy_killed', {
                                        'enemyId': other_enemy['id'],
                                        'killerId': player_id
                                    }, room=room_key)
                        
                        # 发送爆炸特效事件
                        socketio.emit('explosion', {
                            'x': bullet['x'],
                            'y': bullet['y'],
                            'radius': explosion_radius,
                            'duration': 0.5
                        }, room=room_key)
                    
                    # 火炮弹击中后，发送Q技能充能事件（+2%）
                    player_id = bullet.get('owner')
                    if player_id and player_id in game_state['players']:
                        player = game_state['players'][player_id]
                        character_name = player.get('avatar', {}).get('character', '未知')
                        if character_name == '王子栗':
                            socketio.emit('q_skill_charge', {
                                'playerId': player_id,
                                'charge': 2  # 2%充能
                            }, room=room_key)
                    
                    # 火炮弹击中后消失
                    bullets_to_remove.append(i)
                    continue
                
                # 如果是尖刺子弹，增加击中计数并检查音爆
                if is_spike:
                    enemy_id = enemy['id']
                    if enemy_id not in game_state['spike_hit_count']:
                        game_state['spike_hit_count'][enemy_id] = 0
                    game_state['spike_hit_count'][enemy_id] += 1
                    hit_count = game_state['spike_hit_count'][enemy_id]
                    
                    print(f"尖刺击中敌人 {enemy['type']}, 击中次数: {hit_count}/5")
                    
                    # 注意：尖刺命中不再充能，只有音爆时才充能
                    
                    # 如果达到5次，触发音爆
                    if hit_count >= 5:
                        # 重置计数
                        game_state['spike_hit_count'][enemy_id] = 0
                        
                        # 计算音爆伤害（300点，可以暴击）
                        sonic_boom_base_damage = 300
                        sonic_boom_damage = sonic_boom_base_damage
                        sonic_boom_is_crit = False
                        
                        # 音爆也可以暴击（使用玩家的暴击率和暴击伤害）
                        player_id = bullet.get('owner')
                        if player_id and player_id in game_state['players']:
                            player = game_state['players'][player_id]
                            # 从玩家数据获取暴击率和暴击伤害
                            crit_rate = player.get('critRate', 0.30)  # 默认30%暴击率
                            crit_damage = player.get('critDamage', 1.5)  # 默认150%暴击伤害
                            
                            if random.random() < crit_rate:
                                sonic_boom_damage = int(sonic_boom_base_damage * (1 + crit_damage))
                                sonic_boom_is_crit = True
                                print(f"  💥 音爆暴击！暴击率={crit_rate:.1%}, 暴击伤害倍率={1+crit_damage:.1%}")
                        
                        # 计算属性克制伤害
                        sonic_boom_final_damage, _ = calculate_attribute_damage(
                            sonic_boom_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                        )
                        
                        enemy['hp'] -= sonic_boom_final_damage
                        
                        # 设置音爆视觉效果（持续0.5秒）
                        enemy['sonic_boom_end'] = current_time + 0.5
                        
                        # 设置受击闪烁和暴击抖动（如果特效尚未结束则不重复触发）
                        if current_time >= enemy.get('hit_flash_end', 0):
                            enemy['hit_flash_end'] = current_time + 1.0
                        if sonic_boom_is_crit and current_time >= enemy.get('crit_shake_end', 0):
                            enemy['crit_shake_end'] = current_time + 1.0
                        
                        print(f"💥 音爆触发！敌人 {enemy['type']}, 音爆伤害: {sonic_boom_final_damage}, 是否暴击: {sonic_boom_is_crit}, 剩余HP: {enemy['hp']}")
                        
                        # 星耀犊音爆触发后获得2%Q技能充能
                        if player_id and player_id in game_state['players']:
                            player = game_state['players'][player_id]
                            if player.get('avatar', {}).get('character') == '星耀犊':
                                # 发送充能事件给客户端
                                socketio.emit('q_skill_charge', {
                                    'playerId': player_id,
                                    'charge': 2  # 2%充能
                                }, room=room_key)
                        
                        # 发送音爆伤害事件
                        socketio.emit('enemy_hit', {
                            'enemyId': enemy['id'],
                            'x': enemy['x'],
                            'y': enemy['y'],
                            'damage': sonic_boom_final_damage,
                            'isCrit': sonic_boom_is_crit,
                            'attribute': attacker_attribute,
                            'isSonicBoom': True  # 标记为音爆伤害
                        }, room=room_key)
                
                # 如果是Q技能子弹，禁锢并眩晕敌人3秒
                if is_q_skill:
                    enemy['stunned'] = True
                    enemy['stun_end'] = current_time + 3.0
                    print(f"敌人 {enemy['type']} 被Q技能子弹击中，禁锢3秒")
                
                # 注意：伤害数字事件已在第532行发送，这里不再重复发送
                
                print(f"子弹击中敌人 {enemy['type']}, 基础伤害: {base_damage}, 最终伤害: {final_damage}, 剩余HP: {enemy['hp']}")
                
                # 杂鱼蕉形脸分裂逻辑：检查是否应该分裂（在受到伤害时，存活超过10秒）
                if enemy.get('can_split', False) and enemy.get('type') == '杂鱼蕉形脸' and enemy['hp'] > 0:
                    spawn_time = enemy.get('spawn_time', current_time)
                    time_alive = current_time - spawn_time
                    if time_alive >= 10.0:  # 存活超过10秒
                        # 分裂出一个新的杂鱼蕉形脸
                        # 分裂体的生命值上限为本体当前生命值的30%
                        split_enemy_max_hp = int(enemy['hp'] * 0.3)  # 生命值上限为本体当前生命值的30%
                        split_enemy_hp = split_enemy_max_hp  # 分裂体初始生命值等于上限
                        if split_enemy_hp > 0:
                            # 生成新的敌人
                            canvas_width = game_state.get('canvas_width', 1920)
                            canvas_height = game_state.get('canvas_height', 1080)
                            config = ENEMY_CONFIG['杂鱼蕉形脸']
                            enemy_speed = PLAYER_BASE_SPEED * config['speed_multiplier'] * SPEED_MULTIPLIER
                            # 分裂体要比本体缩小50%
                            split_size = int(config['size'] * 0.5)  # 缩小50%
                            split_enemy = {
                                'id': f"enemy_{len(game_state['enemies'])}",
                                'type': '杂鱼蕉形脸',
                                'x': enemy['x'] + random.randint(-50, 50),  # 在母体附近生成
                                'y': enemy['y'] + random.randint(-50, 50),
                                'hp': split_enemy_hp,
                                'maxHp': split_enemy_max_hp,
                                'size': split_size,  # 缩小50%
                                'speed': enemy_speed,
                                'vx': (random.random() - 0.5) * enemy_speed * 2,
                                'vy': (random.random() - 0.5) * enemy_speed * 2,
                                'direction_change_timer': 0,
                                'direction_change_interval': random.uniform(1.0, 3.0),
                                'hit_flash_end': 0,
                                'attribute': config.get('attribute', '无属性'),
                                'attributePower': config.get('attributePower', 0),
                                'spawn_time': current_time,
                                'can_split': False  # 分裂出的敌人不具有分裂能力
                            }
                            # 边界检查（使用分裂体的大小）
                            split_enemy['x'] = max(split_size, min(canvas_width - split_size, split_enemy['x']))
                            split_enemy['y'] = max(split_size, min(canvas_height - split_size, split_enemy['y']))
                            game_state['enemies'].append(split_enemy)
                            print(f"🍌 杂鱼蕉形脸分裂！生成新敌人，大小: {split_size} (缩小50%), HP: {split_enemy_hp}/{split_enemy_max_hp} (本体当前HP的30%)")
                            # 重置母体的生成时间，避免重复分裂
                            enemy['spawn_time'] = current_time
                
                # 幺幺俊羊羊苹果子弹：击退敌人（往苹果子弹飞行的方向击退200）
                can_knockback = bullet.get('canKnockback', False)
                if can_knockback:
                    # 计算击退方向（子弹飞行的方向，即从子弹指向敌人）
                    knockback_distance = 200  # 击退距离（像素）
                    if distance > 0:
                        # 归一化方向（子弹飞行的方向：从子弹指向敌人）
                        # dx = bullet['x'] - enemy['x']，所以方向应该是 -dx/distance（从子弹指向敌人）
                        knockback_dir_x = -dx / distance  # 从子弹指向敌人
                        knockback_dir_y = -dy / distance
                        # 应用击退（给敌人一个速度，击退100像素）
                        # 使用子弹速度方向，确保击退方向与子弹飞行方向一致
                        bullet_vx = bullet.get('vx', 0)
                        bullet_vy = bullet.get('vy', 0)
                        bullet_speed = (bullet_vx * bullet_vx + bullet_vy * bullet_vy) ** 0.5
                        if bullet_speed > 0:
                            # 使用子弹速度方向
                            knockback_dir_x = bullet_vx / bullet_speed
                            knockback_dir_y = bullet_vy / bullet_speed
                        # 击退速度：200像素/0.3秒 = 667像素/秒
                        enemy['knockback_vx'] = knockback_dir_x * 667
                        enemy['knockback_vy'] = knockback_dir_y * 667
                        enemy['knockback_end'] = current_time + 0.3  # 击退持续0.3秒
                        print(f"🍎 苹果子弹击退敌人 {enemy['type']}，方向: ({knockback_dir_x:.2f}, {knockback_dir_y:.2f})")
                    
                    # 幺幺俊羊羊苹果击中敌人恢复5%Q技能充能
                    player_id = bullet.get('owner')
                    if player_id and player_id in game_state['players']:
                        player = game_state['players'][player_id]
                        if player.get('avatar', {}).get('character') == '幺幺俊羊羊':
                            socketio.emit('q_skill_charge', {
                                'playerId': player_id,
                                'charge': 5  # 5%充能
                            }, room=room_key)
                            
                            # 如果存在毒苹果，敌人进入中毒状态
                            if 'poison_apples' in game_state and len(game_state.get('poison_apples', {})) > 0:
                                if not enemy.get('poisoned', False):
                                    enemy['poisoned'] = True  # 标记为中毒状态
                                    # 立即通知客户端敌人中毒状态
                                    socketio.emit('enemy_poisoned', {
                                        'enemyId': enemy['id']
                                    }, room=room_key)
                                    print(f"🍎 敌人 {enemy['type']} 进入中毒状态")
                
                # 如果是Q技能子弹，添加到已击中列表，但不移除子弹（穿透）
                if is_q_skill:
                    hit_enemies.append(enemy['id'])
                    bullet['hitEnemies'] = hit_enemies
                    # 设置碎裂视觉效果（持续1.5秒，延长1秒）
                    enemy['shatter_end'] = current_time + 1.5
                    # 发送Q技能充能事件（普通子弹击中敌人+3%）
                    socketio.emit('q_skill_charge', {
                        'playerId': bullet.get('owner'),
                        'charge': 3
                    }, room=room_key)
                else:
                    # 普通子弹（包括尖刺、苹果），命中后移除（不穿透）
                    bullets_to_remove.append(i)
                    # 发送Q技能充能事件（普通子弹击中敌人+3%，但幺幺俊羊羊已经在上面处理了）
                    if not can_knockback:  # 如果不是苹果子弹，才发送3%充能
                        charge_amount = 3
                        # 王子栗左键命中敌人+2%充能
                        if character_name == '王子栗' and is_cannonball:
                            charge_amount = 2
                        socketio.emit('q_skill_charge', {
                            'playerId': bullet.get('owner'),
                            'charge': charge_amount
                        }, room=room_key)
                
                if enemy['hp'] <= 0:
                    enemy['hp'] = 0
                    enemies_to_remove.append(j)
                    print(f"敌人 {enemy['type']} 被击败")
                
                # 如果不是Q技能子弹，只击中一个敌人就退出
                if not is_q_skill:
                    break
    
    # 移除已处理的子弹和敌人
    for i in sorted(bullets_to_remove, reverse=True):
        if i < len(game_state['bullets']):
            game_state['bullets'].pop(i)
    
    for j in sorted(enemies_to_remove, reverse=True):
        if j < len(game_state['enemies']):
            game_state['enemies'].pop(j)

def check_beam_collisions(room_key, rooms, socketio):
    """检查光束与敌人和玩家的碰撞（星耀犊Q技能或王子栗右键技能）"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    current_time = time.time()
    
    # 初始化光束字典（如果不存在）
    if 'beams' not in game_state:
        game_state['beams'] = {}
    
    for player_id, beam in list(game_state['beams'].items()):  # 使用list()避免迭代时修改字典
        if player_id not in game_state['players']:
            # 玩家不存在，移除光束
            if player_id in game_state['beams']:
                del game_state['beams'][player_id]
            continue
        
        player = game_state['players'][player_id]
        character_name = player.get('avatar', {}).get('character', '未知')
        beam_type = beam.get('beam_type', 'star_beam')
        
        # 王子栗净灭射线：检查持续时间
        if beam_type == 'prince_purification':
            elapsed = current_time - beam.get('start_time', current_time)
            if elapsed >= beam.get('duration', 0.6):
                # 持续时间结束，移除光束
                del game_state['beams'][player_id]
                continue
            
            # 净灭射线只对敌人造成伤害（每次发射只生效一次伤害）
            if 'hitEnemies' not in beam:
                beam['hitEnemies'] = []
            
            # 光束参数
            beam_x = beam.get('x', player.get('x', 0))
            beam_y = beam.get('y', player.get('y', 0))
            beam_angle = beam.get('angle', 0)
            beam_width = beam.get('width', 50)
            beam_length = 2000  # 光束长度
            
            # 计算光束终点
            end_x = beam_x + math.cos(beam_angle) * beam_length
            end_y = beam_y + math.sin(beam_angle) * beam_length
            
            # 对范围内的敌人造成伤害（每个敌人只生效一次）
            for enemy in game_state['enemies']:
                if enemy.get('hp', 0) <= 0:
                    continue
                
                # 如果已经击中过，跳过
                if enemy['id'] in beam['hitEnemies']:
                    continue
                
                # 检查敌人是否在光束范围内
                if is_point_in_beam(enemy['x'], enemy['y'], beam_x, beam_y, end_x, end_y, beam_width):
                    # 计算伤害：1000 + 攻击力
                    base_damage = 1000
                    attack_power = player.get('attack', 0)
                    damage = base_damage + attack_power
                    
                    # 应用伤害加成
                    damage_bonus = player.get('damageBonus', 0.0)
                    if damage_bonus > 0:
                        damage = int(damage * (1 + damage_bonus))
                    
                    # 计算暴击
                    crit_rate = player.get('critRate', 0.0)
                    crit_damage = player.get('critDamage', 1.0)
                    is_crit = False
                    if random.random() < crit_rate:
                        damage = int(damage * (1 + crit_damage))
                        is_crit = True
                    
                    # 计算属性克制伤害（应用王子栗被动）
                    attacker_attribute = '无属性'
                    defender_attribute = enemy.get('attribute', '无属性')
                    attacker_attribute_power = 0
                    
                    # 王子栗被动：对物理/自然/超能属性的敌人造成伤害时，该伤害转变为克制敌人的属性
                    if defender_attribute in ['物理系', '自然系', '超能系']:
                        for attr, countered in ATTRIBUTE_ADVANTAGE.items():
                            if countered == defender_attribute:
                                attacker_attribute = attr
                                attacker_attribute_power = 100
                                break
                    
                    final_damage, _ = calculate_attribute_damage(
                        damage, attacker_attribute, defender_attribute, attacker_attribute_power
                    )
                    final_damage = int(final_damage)
                    if final_damage < 1:
                        final_damage = 1
                    
                    enemy['hp'] -= final_damage
                    enemy['hit_flash_end'] = current_time + 0.2
                    
                    # 标记为已击中
                    beam['hitEnemies'].append(enemy['id'])
                    
                    # 发送伤害数字事件
                    socketio.emit('enemy_hit', {
                        'enemyId': enemy['id'],
                        'x': enemy['x'],
                        'y': enemy['y'],
                        'damage': final_damage,
                        'isCrit': is_crit,
                        'attribute': attacker_attribute
                    }, room=room_key)
                    
                    if enemy['hp'] <= 0:
                        socketio.emit('enemy_killed', {
                            'enemyId': enemy['id'],
                            'killerId': player_id
                        }, room=room_key)
            
            continue  # 王子栗光束处理完成，跳过星耀犊的处理
        
        # 星耀犊Q技能处理
        if character_name != '星耀犊':
            continue
        
        # 星耀犊Q技能期间，每秒恢复50点生命值
        if 'beam_last_heal_time' not in beam:
            beam['beam_last_heal_time'] = current_time
        if current_time - beam['beam_last_heal_time'] >= 1.0:
            heal_amount = 50
            old_hp = player.get('hp', 0)
            max_hp = player.get('maxHp', 1500)
            player['hp'] = min(max_hp, old_hp + heal_amount)
            actual_healing = player['hp'] - old_hp
            if actual_healing > 0:
                beam['beam_last_heal_time'] = current_time
                # 发送治疗事件
                socketio.emit('player_healed', {
                    'playerId': player_id,
                    'hp': player['hp'],
                    'healing': actual_healing,
                    'isCrit': False,
                    'x': player.get('x', 0),
                    'y': player.get('y', 0)
                }, room=room_key)
                print(f"🎵 星耀犊Q技能期间恢复生命值: +{actual_healing}, 当前HP: {player['hp']}/{max_hp}")
        
        # 光束参数
        beam_x = beam.get('x', player.get('x', 0))
        beam_y = beam.get('y', player.get('y', 0))
        beam_angle = beam.get('angle', 0)
        beam_width = beam.get('width', 35)  # 使用当前宽度（默认35）
        beam_length = 2000  # 光束长度（足够长）
        
        # 计算光束终点
        end_x = beam_x + math.cos(beam_angle) * beam_length
        end_y = beam_y + math.sin(beam_angle) * beam_length
        
        # 光束基础暴击率50%
        base_crit_rate = 0.50
        player_crit_rate = player.get('critRate', 0.30)
        total_crit_rate = min(1.0, base_crit_rate + player_crit_rate)
        
        # 初始化时间戳（如果不存在）
        if 'lastJudgmentTime' not in beam:
            beam['lastJudgmentTime'] = current_time
        if 'hitEnemies' not in beam:
            beam['hitEnemies'] = []  # 本周期已击中的敌人ID列表（使用list而不是set，因为JSON无法序列化set）
        if 'hitPlayers' not in beam:
            beam['hitPlayers'] = []  # 本周期已治疗的玩家ID列表（使用list而不是set，因为JSON无法序列化set）
        
        # 每0.3秒进行一次判定
        if current_time - beam['lastJudgmentTime'] >= 0.3:
            # 重置本周期击中记录
            beam['hitEnemies'] = []
            beam['hitPlayers'] = []
            
            # 进行暴击判定
            is_crit = random.random() < total_crit_rate
            beam['isCrit'] = is_crit
            beam['width'] = 45 if is_crit else 35  # 暴击45宽，非暴击35宽
            
            if is_crit:
                print(f"光束判定：暴击！宽度45，紫色")
            else:
                print(f"光束判定：非暴击，宽度35，蓝色")
            
            beam['lastJudgmentTime'] = current_time
        
        # 检查对敌人的伤害（每个0.3秒周期内最多1次）
        for enemy in game_state['enemies']:
            if enemy['hp'] <= 0:
                continue
            
            # 如果本周期已击中过，跳过
            if enemy['id'] in beam['hitEnemies']:
                continue
            
            # 检查敌人是否在光束范围内
            if is_point_in_beam(enemy['x'], enemy['y'], beam_x, beam_y, end_x, end_y, beam_width):
                # 计算伤害（400点）
                damage = 400
                is_crit = beam['isCrit']
                
                if is_crit:
                    crit_damage = player.get('critDamage', 1.5)
                    damage = int(damage * (1 + crit_damage))
                
                # 添加生命值上限10%的额外伤害
                max_hp = player.get('maxHp', 1500)
                hp_bonus_damage = int(max_hp * 0.1)
                damage += hp_bonus_damage
                print(f"🎵 星耀犊光束伤害: 基础={damage - hp_bonus_damage}, 生命值加成={hp_bonus_damage}({max_hp}*10%), 总计={damage}")
                
                # 计算属性克制伤害
                attacker_attribute = '超能系'  # 星耀犊是超能系
                defender_attribute = enemy.get('attribute', '无属性')
                attacker_attribute_power = player.get('attributePower', 0)
                
                # 检查E技能是否激活（星耀犊E技能提供200点属性强度）
                if 'e_skills' in game_state and player_id in game_state['e_skills']:
                    e_skill = game_state['e_skills'][player_id]
                    # 检查E技能是否还在持续时间内（current_time已在函数开头定义）
                    if current_time - e_skill['start_time'] < e_skill['duration']:
                        attacker_attribute_power += e_skill.get('attribute_power_bonus', 200)
                        print(f"🎵 星耀犊光束E技能激活，属性强度加成: +{e_skill.get('attribute_power_bonus', 200)}, 最终属性强度={attacker_attribute_power}")
                
                final_damage, _ = calculate_attribute_damage(
                    damage, attacker_attribute, defender_attribute, attacker_attribute_power
                )
                
                enemy['hp'] -= final_damage
                # 设置受击闪烁（如果特效尚未结束则不重复触发）
                if current_time >= enemy.get('hit_flash_end', 0):
                    enemy['hit_flash_end'] = current_time + 1.0
                if is_crit and current_time >= enemy.get('crit_shake_end', 0):
                    enemy['crit_shake_end'] = current_time + 1.0
                
                # 标记本周期已击中
                if enemy['id'] not in beam['hitEnemies']:
                    beam['hitEnemies'].append(enemy['id'])
                
                # 发送伤害事件
                socketio.emit('enemy_hit', {
                    'enemyId': enemy['id'],
                    'x': enemy['x'],
                    'y': enemy['y'],
                    'damage': final_damage,
                    'isCrit': is_crit,
                    'attribute': attacker_attribute
                }, room=room_key)
                
                if enemy['hp'] <= 0:
                    enemy['hp'] = 0
                    print(f"敌人 {enemy['type']} 被光束击败")
        
        # 检查对玩家的治疗（每个0.3秒周期内最多1次）
        for target_player_id, target_player in game_state['players'].items():
            if target_player_id == player_id or target_player['hp'] <= 0:
                continue
            
            # 如果本周期已治疗过，跳过
            if target_player_id in beam['hitPlayers']:
                continue
            
            # 检查玩家是否在光束范围内
            if is_point_in_beam(target_player['x'], target_player['y'], beam_x, beam_y, end_x, end_y, beam_width):
                # 治疗120点
                healing = 120
                # 检查星耀犊E技能是否激活（提供20%治疗加成）
                if 'e_skills' in game_state and player_id in game_state['e_skills']:
                    e_skill = game_state['e_skills'][player_id]
                    # 检查E技能是否还在持续时间内
                    if current_time - e_skill['start_time'] < e_skill['duration']:
                        healing_bonus = e_skill.get('healing_bonus', 0.20)
                        healing = int(healing * (1 + healing_bonus))
                        print(f"🎵 星耀犊E技能激活，治疗加成: +{healing_bonus:.0%}, 最终治疗量: {healing}")
                old_hp = target_player['hp']
                target_player['hp'] = min(target_player['hp'] + healing, target_player.get('maxHp', 1000))
                actual_healing = target_player['hp'] - old_hp
                
                # 设置治疗闪烁效果（如果特效尚未结束则不重复触发）
                if current_time >= target_player.get('heal_flash_end', 0):
                    target_player['heal_flash_end'] = current_time + 1.0
                
                # 标记本周期已治疗
                if target_player_id not in beam['hitPlayers']:
                    beam['hitPlayers'].append(target_player_id)
                
                # 发送治疗事件
                socketio.emit('player_healed', {
                    'playerId': target_player_id,
                        'hp': target_player['hp'],
                        'healing': actual_healing,
                        'isCrit': False,
                        'x': target_player['x'],
                        'y': target_player['y']
                    }, room=room_key)
            
            beam['lastHealTime'] = current_time

def is_point_in_beam(px, py, bx1, by1, bx2, by2, width):
    """检查点是否在光束范围内"""
    # 计算点到光束线段的距离
    dx = bx2 - bx1
    dy = by2 - by1
    length_sq = dx * dx + dy * dy
    
    if length_sq == 0:
        # 光束长度为0，检查是否在起点附近
        dist = math.sqrt((px - bx1) ** 2 + (py - by1) ** 2)
        return dist <= width / 2
    
    # 计算投影参数
    t = max(0, min(1, ((px - bx1) * dx + (py - by1) * dy) / length_sq))
    
    # 计算最近点
    proj_x = bx1 + t * dx
    proj_y = by1 + t * dy
    
    # 计算距离
    dist = math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2)
    
    return dist <= width / 2

def check_bullet_player_collisions(room_key, rooms, socketio):
    """检查音符子弹与玩家的碰撞（治疗）"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    current_time = time.time()
    
    bullets_to_remove = []
    
    for i, bullet in enumerate(game_state['bullets']):
        # 处理治疗子弹和爱心飞弹（对队友的治疗）
        is_healing_bullet = bullet.get('isHealing', False)
        is_heart_missile = bullet.get('isHeartMissile', False)
        if not is_healing_bullet and not is_heart_missile:
            continue
        
        # 更新子弹的上一帧位置
        bullet['prev_x'] = bullet.get('prev_x', bullet['x'])
        bullet['prev_y'] = bullet.get('prev_y', bullet['y'])
        
        # 检查与所有玩家的碰撞
        for player_id, player in game_state['players'].items():
            if player['hp'] <= 0:
                continue
            
            # 跳过射击者自己
            if bullet.get('owner') == player_id:
                continue
            
            player_radius = 50  # 玩家半径
            bullet_radius = bullet.get('size', 20) / 2
            
            # 计算子弹当前位置到玩家的距离
            dx = bullet['x'] - player['x']
            dy = bullet['y'] - player['y']
            distance = (dx * dx + dy * dy) ** 0.5
            
            # 检查上一帧位置
            prev_dx = bullet['prev_x'] - player['x']
            prev_dy = bullet['prev_y'] - player['y']
            prev_distance = (prev_dx * prev_dx + prev_dy * prev_dy) ** 0.5
            
            # 如果当前帧或上一帧在碰撞范围内，认为碰撞
            if distance < player_radius + bullet_radius or prev_distance < player_radius + bullet_radius:
                # 爱心飞弹：检查目标ID，确保每名队友仅发射一枚
                if is_heart_missile:
                    target_id = bullet.get('targetId')
                    target_type = bullet.get('targetType', 'enemy')
                    # 如果是玩家目标，检查是否匹配
                    if target_type == 'player' and target_id != player_id:
                        continue  # 不是目标玩家，跳过
                    # 如果是敌人目标，跳过（爱心飞弹对敌人不在这里处理）
                    if target_type == 'enemy':
                        continue
                
                # 治疗玩家
                healing = bullet.get('healing', 0)
                # 检查星耀犊E技能是否激活（提供20%治疗加成）
                owner_id = bullet.get('owner')
                if owner_id and owner_id in game_state['players']:
                    owner_player = game_state['players'][owner_id]
                    if owner_player.get('avatar', {}).get('character') == '星耀犊':
                        if 'e_skills' in game_state and owner_id in game_state['e_skills']:
                            e_skill = game_state['e_skills'][owner_id]
                            # 检查E技能是否还在持续时间内
                            if current_time - e_skill['start_time'] < e_skill['duration']:
                                healing_bonus = e_skill.get('healing_bonus', 0.20)
                                healing = int(healing * (1 + healing_bonus))
                                print(f"🎵 星耀犊音符子弹E技能激活，治疗加成: +{healing_bonus:.0%}, 最终治疗量: {healing}")
                is_crit = bullet.get('isCrit', False)
                
                # 调试日志：检查子弹的暴击信息（只对音符子弹打印）
                if is_healing_bullet:
                    print(f"🔍 治疗碰撞检测:")
                    print(f"  子弹ID: {bullet.get('id', 'unknown')}")
                    print(f"  子弹isCrit值: {bullet.get('isCrit')} (类型: {type(bullet.get('isCrit'))})")
                    print(f"  读取的is_crit: {is_crit} (类型: {type(is_crit)})")
                    print(f"  治疗量: {healing}")
                
                # 计算实际治疗量（不能超过最大生命值）
                old_hp = player['hp']
                player['hp'] = min(player['hp'] + healing, player.get('maxHp', 1000))
                actual_healing = player['hp'] - old_hp
                
                # 设置玩家治疗闪烁（黄色闪烁，不是受击闪烁）（如果特效尚未结束则不重复触发）
                if current_time >= player.get('heal_flash_end', 0):
                    player['heal_flash_end'] = current_time + 1.0
                if is_crit and current_time >= player.get('crit_shake_end', 0):
                    player['crit_shake_end'] = current_time + 1.0  # 暴击治疗也抖动
                
                if is_healing_bullet:
                    print(f"音符击中玩家 {player['name']}, 治疗量: {actual_healing}, 是否暴击: {is_crit}, 剩余HP: {player['hp']}")
                elif is_heart_missile:
                    print(f"🌸 爱心飞弹击中玩家 {player['name']}, 治疗量: {actual_healing}, 剩余HP: {player['hp']}")
                
                # 广播治疗信息（显示黄色数字）
                socketio.emit('player_healed', {
                    'playerId': player_id,
                    'hp': player['hp'],
                    'healing': actual_healing,
                    'isCrit': is_crit,
                    'x': player['x'],
                    'y': player['y']
                }, room=room_key)
                
                # 移除子弹（击中玩家后消失）
                bullets_to_remove.append(i)
                break  # 一个子弹只能治疗一个玩家
    
    # 移除已处理的子弹
    for i in sorted(bullets_to_remove, reverse=True):
        if i < len(game_state['bullets']):
            game_state['bullets'].pop(i)

def check_victory_defeat(room_key, rooms, socketio):
    """检查胜利/失败条件"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    
    # 检查是否所有敌人被击败（胜利）
    # 需要检查是否已经生成过敌人，且现在没有活着的敌人
    if game_state.get('enemies_spawned', False):
        alive_enemies = [e for e in game_state['enemies'] if e.get('hp', 0) > 0]
        if len(alive_enemies) == 0:
            # 所有敌人都被击败
            print("✓ 所有敌人被击败，玩家胜利！")
            
            # 给所有参与的玩家发放胜利奖励
            users = load_user_data()
            players_to_reward = []
            for pid, player in game_state['players'].items():
                username = player.get('username')
                # 只给已登录的玩家（有username）且不是测试木桩的玩家发放奖励
                if username and not player.get('isDummy', False):
                    if username in users:
                        # 随机奖励：3-5个叠志精心料，1-3个神兵许愿单
                        refinement_reward = random.randint(3, 5)
                        ticket_reward = random.randint(1, 3)
                        
                        users[username]['refinement_material'] = users[username].get('refinement_material', 0) + refinement_reward
                        users[username]['wish_ticket'] = users[username].get('wish_ticket', 0) + ticket_reward
                        
                        players_to_reward.append({
                            'username': username,
                            'name': player.get('name', '未知玩家'),
                            'refinement_material': refinement_reward,
                            'wish_ticket': ticket_reward
                        })
                        print(f"✓ 玩家 {username} ({player.get('name', '未知玩家')}) 获得胜利奖励：{refinement_reward}个叠志精心料，{ticket_reward}个神兵许愿单")
            
            # 保存用户数据
            if players_to_reward:
                save_user_data(users)
                # 通知所有玩家奖励信息
                socketio.emit('victory_rewards', {
                    'players': players_to_reward
                }, room=room_key)
            
            socketio.emit('game_result', {
                'result': 'victory',
                'message': '胜利'
            }, room=room_key)
            return True
    
    # 检查是否所有玩家都死亡（失败）
    if len(game_state['players']) > 0:
        alive_players = [p for p in game_state['players'].values() if p['hp'] > 0]
        if len(alive_players) == 0:
            print("❌ 所有玩家被击败，游戏失败！")
            socketio.emit('game_result', {
                'result': 'defeat',
                'message': '失败'
            }, room=room_key)
            return True
    
    return False

def process_game_tick(room_key, rooms, socketio, check_game_over):
    """处理游戏循环更新"""
    if room_key not in rooms:
        return
    
    room = rooms[room_key]
    if 'game_state' not in room:
        return
    
    game_state = room['game_state']
    
    # 处理倒计时
    if game_state.get('game_start_time') is None:
        game_state['game_start_time'] = time.time()
    
    elapsed = time.time() - game_state['game_start_time']
    if elapsed < 3:
        game_state['countdown'] = max(0, int(3 - elapsed) + 1)  # +1 显示3,2,1
    else:
        game_state['countdown'] = 0
        # 倒计时结束，生成敌人（只在游戏未结束时生成，且从未生成过敌人）
        if len(game_state['enemies']) == 0 and not game_state.get('game_ended', False) and not game_state.get('enemies_spawned', False):
            spawn_enemies(room_key, rooms, socketio)
            game_state['enemies_spawned'] = True  # 标记已生成过敌人
    
    # 检查游戏是否已结束
    if game_state.get('game_ended', False):
        return
    
    # 更新敌人位置（如果倒计时结束）
    if game_state['countdown'] == 0:
        update_enemies(room_key, rooms)
        check_enemy_player_collisions(room_key, rooms, socketio, check_game_over)
        
        # 更新子弹位置（服务器端也需要更新以进行准确的碰撞检测）
        # 使用固定的delta_time（假设60fps，约16ms）
        bullet_delta_time = 0.016
        for bullet in game_state['bullets']:
            # 保存上一帧位置用于碰撞检测
            bullet['prev_x'] = bullet.get('x', bullet.get('prev_x', bullet['x']))
            bullet['prev_y'] = bullet.get('y', bullet.get('prev_y', bullet['y']))
            
            # 星耀犊音符子弹追踪锁定玩家
            if bullet.get('isHealing', False) and bullet.get('targetId'):
                target_id = bullet['targetId']
                if target_id in game_state['players']:
                    target_player = game_state['players'][target_id]
                    if target_player.get('hp', 0) > 0:  # 目标还活着
                        # 计算朝向目标的方向
                        dx = target_player['x'] - bullet['x']
                        dy = target_player['y'] - bullet['y']
                        distance = (dx * dx + dy * dy) ** 0.5
                        if distance > 0:
                            # 归一化方向
                            dir_x = dx / distance
                            dir_y = dy / distance
                            # 更新速度方向（保持速度大小）
                            # 优先使用保存的bulletSpeed，否则计算当前速度
                            speed = bullet.get('bulletSpeed', 0)
                            if speed == 0:
                                current_speed = (bullet.get('vx', 0) ** 2 + bullet.get('vy', 0) ** 2) ** 0.5
                                if current_speed > 0:
                                    speed = current_speed
                                else:
                                    speed = 3500  # 默认速度（音符子弹35*100）
                            bullet['vx'] = dir_x * speed
                            bullet['vy'] = dir_y * speed
            
            # 公主蓉爱心飞弹追踪锁定目标
            if bullet.get('isHeartMissile', False) and bullet.get('targetId'):
                target_id = bullet['targetId']
                target_type = bullet.get('targetType', 'enemy')
                
                # 根据目标类型查找目标
                target = None
                if target_type == 'enemy':
                    for enemy in game_state.get('enemies', []):
                        if enemy.get('id') == target_id and enemy.get('hp', 0) > 0:
                            target = enemy
                            break
                elif target_type == 'player':
                    if target_id in game_state['players']:
                        target = game_state['players'][target_id]
                        if target.get('hp', 0) <= 0:
                            target = None
                
                if target:
                    # 计算朝向目标的方向
                    dx = target.get('x', 0) - bullet['x']
                    dy = target.get('y', 0) - bullet['y']
                    distance = (dx * dx + dy * dy) ** 0.5
                    if distance > 0:
                        # 归一化方向
                        dir_x = dx / distance
                        dir_y = dy / distance
                        # 更新速度方向（保持速度大小）
                        current_speed = (bullet.get('vx', 0) ** 2 + bullet.get('vy', 0) ** 2) ** 0.5
                        if current_speed > 0:
                            bullet['vx'] = dir_x * current_speed
                            bullet['vy'] = dir_y * current_speed
                        else:
                            speed = bullet.get('bulletSpeed', 2000)  # 使用保存的速度，默认2000（20*100）
                            bullet['vx'] = dir_x * speed
                            bullet['vy'] = dir_y * speed
            
            # 更新位置（加快100倍）
            bullet['x'] += bullet.get('vx', 0) * bullet_delta_time
            bullet['y'] += bullet.get('vy', 0) * bullet_delta_time
        
        check_bullet_enemy_collisions(room_key, rooms, socketio)
        check_bullet_player_collisions(room_key, rooms, socketio)  # 检查音符子弹击中玩家
        
        # 检查胜利/失败条件，如果游戏结束则设置标志
        result = check_victory_defeat(room_key, rooms, socketio)
        if result:
            game_state['game_ended'] = True
            return  # 游戏结束，不再继续处理
    
    # 处理子弹边界和弹射
    canvas_width = game_state.get('canvas_width', 1920)
    canvas_height = game_state.get('canvas_height', 1080)
    
    bullets_to_remove = []
    for i, bullet in enumerate(game_state['bullets']):
        # 检查是否超出边界
        if bullet['x'] < 0 or bullet['x'] > canvas_width or \
           bullet['y'] < 0 or bullet['y'] > canvas_height:
            
            # 如果子弹可以弹射（Q技能子弹或E技能期间的子弹）
            can_bounce = bullet.get('canBounce', False)
            bounce_count = bullet.get('bounceCount', 0)
            is_q_skill = bullet.get('isQSkill', False)
            
            # Q技能子弹只能弹射1次，E技能期间的子弹也可以弹射
            max_bounces = 1
            
            if can_bounce and bounce_count < max_bounces:
                # 寻找最近的敌人
                nearest_enemy = None
                min_distance = float('inf')
                
                for enemy in game_state['enemies']:
                    if enemy['hp'] <= 0:
                        continue
                    
                    # 确定子弹在哪条边界
                    boundary_x = 0 if bullet['x'] < 0 else (canvas_width if bullet['x'] > canvas_width else bullet['x'])
                    boundary_y = 0 if bullet['y'] < 0 else (canvas_height if bullet['y'] > canvas_height else bullet['y'])
                    
                    dx = enemy['x'] - boundary_x
                    dy = enemy['y'] - boundary_y
                    distance = (dx * dx + dy * dy) ** 0.5
                    
                    if distance < min_distance:
                        min_distance = distance
                        nearest_enemy = enemy
                
                if nearest_enemy:
                    # 计算弹射方向
                    boundary_x = 0 if bullet['x'] < 0 else (canvas_width if bullet['x'] > canvas_width else bullet['x'])
                    boundary_y = 0 if bullet['y'] < 0 else (canvas_height if bullet['y'] > canvas_height else bullet['y'])
                    
                    dx = nearest_enemy['x'] - boundary_x
                    dy = nearest_enemy['y'] - boundary_y
                    distance = (dx * dx + dy * dy) ** 0.5
                    
                    if distance > 0:
                        # 归一化方向
                        dir_x = dx / distance
                        dir_y = dy / distance
                        
                        # 更新子弹速度和位置
                        speed = (bullet['vx'] * bullet['vx'] + bullet['vy'] * bullet['vy']) ** 0.5
                        bullet['vx'] = dir_x * speed
                        bullet['vy'] = dir_y * speed
                        
                        # 将子弹位置调整到边界内
                        bullet['x'] = max(0, min(canvas_width, bullet['x']))
                        bullet['y'] = max(0, min(canvas_height, bullet['y']))
                        
                        bullet['bounceCount'] = bullet.get('bounceCount', 0) + 1
                        # 弹射后，Q技能子弹不清空hitEnemies（防止重复伤害），普通子弹也不清空（因为普通子弹击中后会被移除）
                        # 注意：普通子弹（包括E技能期间的子弹）击中敌人后会被移除，所以不会弹射
                        print(f"子弹弹射向敌人 {nearest_enemy['type']}")
                        continue
            
            # 无法弹射或弹射失败，移除子弹
            bullets_to_remove.append(i)
    
    # 移除超出边界的子弹
    for i in sorted(bullets_to_remove, reverse=True):
        if i < len(game_state['bullets']):
            game_state['bullets'].pop(i)
    
    # 处理光束碰撞（星耀犊Q技能）
    check_beam_collisions(room_key, rooms, socketio)
    
    # 处理Q技能（公主蓉微笑拂晓约定或王子栗再创世）
    current_time = time.time()
    if 'q_skills' in game_state:
        for player_id, q_skill in list(game_state['q_skills'].items()):
            if player_id not in game_state['players']:
                del game_state['q_skills'][player_id]
                continue
            
            player = game_state['players'][player_id]
            character_name = player.get('avatar', {}).get('character', '未知')
            
            # 王子栗Q技能：再创世
            if character_name == '王子栗' and 'shatter_count' in q_skill:
                # 生成碎裂特效（每0.3秒一个，共5个）
                if q_skill['shatter_count'] < q_skill['max_shatters']:
                    if current_time - q_skill.get('last_shatter_time', q_skill['start_time']) >= 0.3:
                        # 在屏幕上随机位置生成碎裂特效
                        canvas_width = game_state.get('canvas_width', 1920)
                        canvas_height = game_state.get('canvas_height', 1080)
                        shatter_x = random.randint(150, canvas_width - 150)
                        shatter_y = random.randint(150, canvas_height - 150)
                        shatter_size = random.randint(225, 600)  # 225*225到600*600（增加50%：150*1.5=225, 400*1.5=600）
                        
                        shatter_id = f"shatter_{player_id}_{q_skill['shatter_count']}"
                        q_skill['shatters'].append({
                            'id': shatter_id,
                            'x': shatter_x,
                            'y': shatter_y,
                            'size': shatter_size,
                            'spawn_time': current_time
                        })
                        q_skill['shatter_count'] += 1
                        q_skill['last_shatter_time'] = current_time
                        
                        # 通知客户端生成碎裂特效
                        socketio.emit('shatter_spawned', {
                            'shatterId': shatter_id,
                            'x': shatter_x,
                            'y': shatter_y,
                            'size': shatter_size
                        }, room=room_key)
                        
                        # 第一个碎裂特效生成时，禁锢所有敌人
                        if q_skill['shatter_count'] == 1:
                            for enemy in game_state['enemies']:
                                if enemy.get('hp', 0) > 0:
                                    enemy['stunned'] = True
                                    enemy['stun_end'] = current_time + 1000.0  # 设置一个很长的持续时间，在技能结束时清除
                                    print(f"⚡ 王子栗Q技能：敌人 {enemy.get('type', '未知')} 被禁锢")
                
                # 生成5个碎裂特效后，开始白光笼罩和伤害
                if q_skill['shatter_count'] >= q_skill['max_shatters']:
                    if q_skill['white_screen_start'] == 0:
                        q_skill['white_screen_start'] = current_time
                        socketio.emit('white_screen_start', {
                            'playerId': player_id
                        }, room=room_key)
                    
                    # 计算白光阶段
                    white_screen_elapsed = current_time - q_skill['white_screen_start']
                    fade_in_duration = 1.0  # 白光淡入持续时间1秒
                    freeze_duration = 0.25  # 定格持续时间0.25秒
                    fade_out_duration = 1.5  # 淡出持续时间1.5秒
                    damage_duration = 0.5  # 5次伤害，每次间隔0.1秒，总共0.5秒
                    
                    # 计算各阶段的相对时间点
                    damage_start_time = fade_in_duration  # 伤害阶段开始（相对时间）
                    freeze_start_time = damage_start_time + damage_duration  # 定格阶段开始（相对时间）
                    fade_out_start_time = freeze_start_time + freeze_duration  # 淡出阶段开始（相对时间）
                    skill_end_time = fade_out_start_time + fade_out_duration  # 技能完全结束（相对时间）
                    
                    # 阶段1：白光淡入（1秒），不造成伤害
                    if white_screen_elapsed < fade_in_duration:
                        # 等待白光完全变白
                        pass
                    
                    # 阶段2：造成5次伤害（在白光完全变白后）
                    elif white_screen_elapsed >= damage_start_time and white_screen_elapsed < freeze_start_time:
                        if q_skill['damage_count'] < q_skill['max_damages']:
                            # 计算第一次伤害的绝对时间
                            first_damage_time = q_skill['white_screen_start'] + damage_start_time
                            if current_time - q_skill.get('last_damage_time', first_damage_time) >= 0.1:
                                # 计算伤害：1000 + 攻击力
                                base_damage = 1000
                                attack_power = player.get('attack', 0)
                                damage = base_damage + attack_power
                                
                                # 应用伤害加成
                                damage_bonus = player.get('damageBonus', 0.0)
                                if damage_bonus > 0:
                                    damage = int(damage * (1 + damage_bonus))
                                
                                # 计算暴击
                                crit_rate = player.get('critRate', 0.0)
                                crit_damage = player.get('critDamage', 1.0)
                                is_crit = False
                                if random.random() < crit_rate:
                                    damage = int(damage * (1 + crit_damage))
                                    is_crit = True
                                
                                # 对所有敌人造成伤害
                                for enemy in game_state['enemies']:
                                    if enemy.get('hp', 0) <= 0:
                                        continue
                                    
                                    # 计算属性克制伤害（应用王子栗被动）
                                    attacker_attribute = '无属性'
                                    defender_attribute = enemy.get('attribute', '无属性')
                                    attacker_attribute_power = 0
                                    
                                    if defender_attribute in ['物理系', '自然系', '超能系']:
                                        for attr, countered in ATTRIBUTE_ADVANTAGE.items():
                                            if countered == defender_attribute:
                                                attacker_attribute = attr
                                                attacker_attribute_power = 100
                                                break
                                    
                                    final_damage, _ = calculate_attribute_damage(
                                        damage, attacker_attribute, defender_attribute, attacker_attribute_power
                                    )
                                    final_damage = int(final_damage)
                                    if final_damage < 1:
                                        final_damage = 1
                                    
                                    enemy['hp'] -= final_damage
                                    enemy['hit_flash_end'] = current_time + 0.2
                                    
                                    socketio.emit('enemy_hit', {
                                        'enemyId': enemy['id'],
                                        'x': enemy['x'],
                                        'y': enemy['y'],
                                        'damage': final_damage,
                                        'isCrit': is_crit,
                                        'attribute': attacker_attribute
                                    }, room=room_key)
                                    
                                    if enemy['hp'] <= 0:
                                        socketio.emit('enemy_killed', {
                                            'enemyId': enemy['id'],
                                            'killerId': player_id
                                        }, room=room_key)
                                
                                q_skill['damage_count'] += 1
                                q_skill['last_damage_time'] = current_time
                    
                    # 阶段3：定格（0.25秒），白色界面保持
                    elif white_screen_elapsed >= freeze_start_time and white_screen_elapsed < fade_out_start_time:
                        # 定格阶段，在定格结束后立即解除敌人禁锢
                        if not q_skill.get('freeze_ended', False):
                            q_skill['freeze_ended'] = True
                            # 解除所有敌人的禁锢
                            for enemy in game_state['enemies']:
                                if enemy.get('stunned', False):
                                    enemy['stunned'] = False
                                    enemy['stun_end'] = 0
                                    print(f"⚡ 王子栗Q技能：敌人 {enemy.get('type', '未知')} 解除禁锢")
                            # 在定格结束的瞬间立即移除神人模式和神人剪影
                            socketio.emit('divine_mode_end', {
                                'playerId': player_id
                            }, room=room_key)
                            print(f"⚡ 王子栗Q技能：定格结束，立即移除神人模式")
                    
                    # 阶段4：淡出开始，碎片特效和白色界面一起逐渐淡去（1.5秒）
                    elif white_screen_elapsed >= fade_out_start_time and white_screen_elapsed < skill_end_time:
                        # 只在淡出开始时执行一次（通知客户端开始淡出，碎片特效和白色界面一起淡出）
                        if not q_skill.get('fade_out_started', False):
                            q_skill['fade_out_started'] = True
                            # 通知客户端开始淡出（碎片特效和白色界面一起淡出，不立即移除碎片特效）
                            socketio.emit('white_screen_fade_out', {
                                'playerId': player_id,
                                'fadeOutStartTime': q_skill['white_screen_start'] + fade_out_start_time
                            }, room=room_key)
                    
                    # 阶段5：技能完全结束
                    elif white_screen_elapsed >= skill_end_time:
                        # 通知客户端完全结束技能
                        socketio.emit('q_skill_end', {
                            'playerId': player_id
                        }, room=room_key)
                        # 通知客户端结束神人模式
                        socketio.emit('divine_mode_end', {
                            'playerId': player_id
                        }, room=room_key)
                        del game_state['q_skills'][player_id]
                        continue
            
            # 公主蓉Q技能：微笑拂晓约定
            elif character_name == '公主蓉':
                elapsed = current_time - q_skill['start_time']
                if elapsed >= q_skill['duration']:
                    # 技能结束，移除
                    del game_state['q_skills'][player_id]
                    continue
                
                # 更新光环位置（跟随玩家）
                if player_id in game_state['players']:
                    player = game_state['players'][player_id]
                q_skill['x'] = player.get('x', 0)
                q_skill['y'] = player.get('y', 0)
                
                # 移除公主蓉Q技能的无敌效果（不再提供无敌）
                
                # 每0.5秒治疗队友和伤害敌人
                radius = q_skill.get('radius', 400)  # 默认400（800*800范围）
                heal_interval = 0.5  # 每0.5秒一次
                damage_interval = 0.5  # 每0.5秒一次
                
                # 获取玩家面板属性（用于计算伤害和治疗）
                damage_bonus = player.get('damageBonus', 0.0)  # 伤害加成
                healing_bonus = player.get('healingBonus', 0.0)  # 治疗加成
                crit_rate = player.get('critRate', 0.0)  # 暴击率
                crit_damage = player.get('critDamage', 1.0)  # 暴击伤害
                attribute_power = player.get('attributePower', 0)  # 属性强度
                
                # 治疗队友和公主蓉自己
                if current_time - q_skill['last_heal_time'] >= heal_interval:
                    # 基础治疗量：100点
                    base_healing = 100
                    
                    # 应用治疗加成
                    healing = base_healing
                    if healing_bonus > 0:
                        healing = int(base_healing * (1 + healing_bonus))
                    
                    # 计算暴击（治疗也可以暴击）
                    is_crit_heal = False
                    if random.random() < crit_rate:
                        healing = int(healing * (1 + crit_damage))
                        is_crit_heal = True
                    
                    for pid, p in game_state['players'].items():
                        if p.get('hp', 0) <= 0:
                            continue
                        
                        dx = p.get('x', 0) - q_skill['x']
                        dy = p.get('y', 0) - q_skill['y']
                        distance = (dx * dx + dy * dy) ** 0.5
                        
                        if distance <= radius:
                            # 在范围内，应用计算后的治疗量（包括公主蓉自己）
                            old_hp = p['hp']
                            p['hp'] = min(p['hp'] + healing, p.get('maxHp', 2000))
                            actual_healing = p['hp'] - old_hp
                            
                            if actual_healing > 0:
                                socketio.emit('player_healed', {
                                    'playerId': pid,
                                    'hp': p['hp'],
                                    'healing': actual_healing,
                                    'isCrit': is_crit_heal,
                                    'x': p.get('x', 0),
                                    'y': p.get('y', 0)
                                }, room=room_key)
                    
                    q_skill['last_heal_time'] = current_time
                
                # 伤害敌人
                if current_time - q_skill['last_damage_time'] >= damage_interval:
                    # 基础伤害量：500点
                    base_damage = 500
                    
                    # 应用伤害加成
                    damage = base_damage
                    if damage_bonus > 0:
                        damage = int(base_damage * (1 + damage_bonus))
                    
                    # 计算暴击
                    is_crit = False
                    if random.random() < crit_rate:
                        damage = int(damage * (1 + crit_damage))
                        is_crit = True
                    
                    for enemy in game_state['enemies']:
                        if enemy.get('hp', 0) <= 0:
                            continue
                        
                        dx = enemy.get('x', 0) - q_skill['x']
                        dy = enemy.get('y', 0) - q_skill['y']
                        distance = (dx * dx + dy * dy) ** 0.5
                        
                        if distance <= radius:
                            # 计算属性克制伤害
                            attacker_attribute = '自然系'  # 公主蓉是自然系
                            defender_attribute = enemy.get('attribute', '无属性')
                            
                            final_damage, is_advantage = calculate_attribute_damage(
                                damage, attacker_attribute, defender_attribute, attribute_power
                            )
                            
                            enemy['hp'] = max(0, enemy['hp'] - final_damage)
                            
                            # 设置受击闪烁
                            enemy['hit_flash_end'] = current_time + 0.2
                            
                            # 发送伤害数字事件（客户端显示）
                            socketio.emit('enemy_hit', {
                                'enemyId': enemy.get('id'),
                                'x': enemy.get('x', 0),
                                'y': enemy.get('y', 0),
                                'damage': final_damage,
                                'isCrit': is_crit,
                                'attribute': attacker_attribute
                            }, room=room_key)
                            
                            if enemy['hp'] <= 0:
                                # 敌人死亡
                                socketio.emit('enemy_killed', {
                                    'enemyId': enemy.get('id'),
                                    'killerId': player_id
                                }, room=room_key)
                    
                    q_skill['last_damage_time'] = current_time
            else:
                # 玩家不存在，移除技能
                del game_state['q_skills'][player_id]
    
    # 处理公主蓉子弹击中队友的治疗逻辑
    for bullet in game_state['bullets']:
        if bullet.get('canHealTeammates', False):
            # 公主蓉的子弹可以治疗队友
            bullet_owner = bullet.get('owner')
            if not bullet_owner:
                continue
            
            # 更新子弹的上一帧位置
            bullet['prev_x'] = bullet.get('prev_x', bullet['x'])
            bullet['prev_y'] = bullet.get('prev_y', bullet['y'])
            
            # 检查与所有队友的碰撞
            for player_id, player in game_state['players'].items():
                if player['hp'] <= 0:
                    continue
                
                # 跳过射击者自己
                if bullet_owner == player_id:
                    continue
                
                player_radius = 50
                bullet_radius = bullet.get('size', 12) / 2
                
                # 计算距离
                dx = bullet['x'] - player['x']
                dy = bullet['y'] - player['y']
                distance = (dx * dx + dy * dy) ** 0.5
                
                # 检查上一帧位置
                prev_dx = bullet['prev_x'] - player['x']
                prev_dy = bullet['prev_y'] - player['y']
                prev_distance = (prev_dx * prev_dx + prev_dy * prev_dy) ** 0.5
                
                # 如果碰撞
                if distance < player_radius + bullet_radius or prev_distance < player_radius + bullet_radius:
                    # 治疗队友
                    healing = bullet.get('healing', 0)
                    if healing > 0:
                        old_hp = player['hp']
                        player['hp'] = min(player['hp'] + healing, player.get('maxHp', 2000))
                        actual_healing = player['hp'] - old_hp
                        
                        if actual_healing > 0:
                            # 设置治疗闪烁
                            
                            # 幺幺俊羊羊苹果击中玩家恢复5%Q技能充能
                            if bullet.get('canKnockback', False):  # 苹果子弹
                                bullet_owner_id = bullet.get('owner')
                                if bullet_owner_id and bullet_owner_id in game_state['players']:
                                    owner_player = game_state['players'][bullet_owner_id]
                                    if owner_player.get('avatar', {}).get('character') == '幺幺俊羊羊':
                                        socketio.emit('q_skill_charge', {
                                            'playerId': bullet_owner_id,
                                            'charge': 5  # 5%充能
                                        }, room=room_key)
                                        print(f"🍎 苹果子弹击中玩家，幺幺俊羊羊获得5%Q技能充能")
                            if current_time >= player.get('heal_flash_end', 0):
                                player['heal_flash_end'] = current_time + 1.0
                            
                            socketio.emit('player_healed', {
                                'playerId': player_id,
                                'hp': player['hp'],
                                'healing': actual_healing,
                                'isCrit': bullet.get('isCrit', False),
                                'x': player['x'],
                                'y': player['y']
                            }, room=room_key)
                    
                    # 移除子弹（击中队友后消失）
                    if bullet in game_state['bullets']:
                        game_state['bullets'].remove(bullet)
                    break
    
    # 处理幺幺俊羊羊巨大苹果
    current_time = time.time()
    if 'big_apples' in game_state:
        for apple_id, apple in list(game_state['big_apples'].items()):
            elapsed = current_time - apple['start_time']
            
            if elapsed >= apple['duration']:
                # 6秒后爆炸
                explosion_damage = apple['explosion_damage']
                apple_x = apple['x']
                apple_y = apple['y']
                
                # 设置爆炸特效（持续1秒）
                if 'explosions' not in game_state:
                    game_state['explosions'] = {}
                explosion_id = f"explosion_{apple_id}"
                game_state['explosions'][explosion_id] = {
                    'x': apple_x,
                    'y': apple_y,
                    'start_time': current_time,
                    'duration': 1.0,
                    'size': 300  # 爆炸特效大小
                }
                
                # 对所有敌人造成伤害并显示伤害数字
                for enemy in game_state.get('enemies', []):
                    if enemy.get('hp', 0) <= 0:
                        continue
                    
                    # 计算最终伤害（考虑属性克制）
                    final_damage = explosion_damage
                    owner_id = apple.get('owner')
                    if owner_id and owner_id in game_state['players']:
                        owner_player = game_state['players'][owner_id]
                        attacker_attribute = owner_player.get('attribute', '无属性')
                        defender_attribute = enemy.get('attribute', '无属性')
                        attacker_attribute_power = owner_player.get('attributePower', 0)
                        
                        # calculate_attribute_damage 函数已在文件开头定义，直接使用
                        final_damage, is_advantage = calculate_attribute_damage(
                            explosion_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                        )
                        final_damage = int(final_damage)
                        if final_damage < 1:
                            final_damage = 1
                    
                    enemy['hp'] = max(0, enemy['hp'] - final_damage)
                    enemy['hit_flash_end'] = current_time + 0.2
                    
                    # 发送伤害数字事件
                    socketio.emit('enemy_hit', {
                        'enemyId': enemy['id'],
                        'x': enemy['x'],
                        'y': enemy['y'],
                        'damage': final_damage,
                        'isCrit': False,
                        'attribute': owner_player.get('attribute', '无属性') if owner_id and owner_id in game_state['players'] else '无属性'
                    }, room=room_key)
                    
                    if enemy['hp'] <= 0:
                        socketio.emit('enemy_killed', {
                            'enemyId': enemy.get('id'),
                            'killerId': apple.get('owner')
                        }, room=room_key)
                
                # 移除巨大苹果
                del game_state['big_apples'][apple_id]
                print(f"🍎 巨大苹果爆炸: {apple_id}, 伤害: {explosion_damage}")
            else:
                # 每秒对所有玩家治疗
                heal_interval = 1.0
                if current_time - apple['last_heal_time'] >= heal_interval:
                    healing_amount = apple['healing_amount']
                    
                    for player_id, player in game_state['players'].items():
                        if player.get('hp', 0) <= 0:
                            continue
                        
                        old_hp = player['hp']
                        player['hp'] = min(player['hp'] + healing_amount, player.get('maxHp', 1200))
                        actual_healing = player['hp'] - old_hp
                        
                        if actual_healing > 0:
                            socketio.emit('player_healed', {
                                'playerId': player_id,
                                'hp': player['hp'],
                                'healing': actual_healing,
                                'isCrit': False,
                                'x': player.get('x', 0),
                                'y': player.get('y', 0)
                            }, room=room_key)
                    
                    apple['last_heal_time'] = current_time
    
    # 处理幺幺俊羊羊毒苹果
    current_time = time.time()
    if 'poison_apples' in game_state:
        for apple_id, apple in list(game_state['poison_apples'].items()):
            elapsed = current_time - apple['start_time']
            
            if elapsed >= apple['duration']:
                # 10秒后爆炸
                explosion_damage = apple['explosion_damage']
                apple_x = apple['x']
                apple_y = apple['y']
                
                # 设置爆炸特效（持续1秒）
                if 'explosions' not in game_state:
                    game_state['explosions'] = {}
                explosion_id = f"explosion_{apple_id}"
                game_state['explosions'][explosion_id] = {
                    'x': apple_x,
                    'y': apple_y,
                    'start_time': current_time,
                    'duration': 1.0,
                    'size': 200  # 爆炸特效大小
                }
                
                # 对所有敌人造成伤害并显示伤害数字
                owner_id = apple.get('owner')
                owner_player = None
                if owner_id and owner_id in game_state['players']:
                    owner_player = game_state['players'][owner_id]
                
                for enemy in game_state.get('enemies', []):
                    if enemy.get('hp', 0) <= 0:
                        continue
                    
                    # 计算最终伤害（考虑属性克制）
                    final_damage = explosion_damage
                    if owner_player:
                        attacker_attribute = owner_player.get('attribute', '无属性')
                        defender_attribute = enemy.get('attribute', '无属性')
                        attacker_attribute_power = owner_player.get('attributePower', 0)
                        
                        final_damage, is_advantage = calculate_attribute_damage(
                            explosion_damage, attacker_attribute, defender_attribute, attacker_attribute_power
                        )
                        final_damage = int(final_damage)
                        if final_damage < 1:
                            final_damage = 1
                    
                    enemy['hp'] = max(0, enemy['hp'] - final_damage)
                    enemy['hit_flash_end'] = current_time + 0.2
                    
                    # 发送伤害数字事件
                    socketio.emit('enemy_hit', {
                        'enemyId': enemy['id'],
                        'x': enemy['x'],
                        'y': enemy['y'],
                        'damage': final_damage,
                        'isCrit': False,
                        'attribute': owner_player.get('attribute', '无属性') if owner_player else '无属性'
                    }, room=room_key)
                    
                    if enemy['hp'] <= 0:
                        socketio.emit('enemy_killed', {
                            'enemyId': enemy.get('id'),
                            'killerId': apple.get('owner')
                        }, room=room_key)
                
                # 移除毒苹果，清除所有敌人的中毒状态
                for enemy in game_state.get('enemies', []):
                    if enemy.get('poisoned', False):
                        enemy['poisoned'] = False
                        # 通知客户端清除该敌人的中毒状态
                        socketio.emit('enemy_poison_cleared', {
                            'enemyId': enemy.get('id')
                        }, room=room_key)
                
                del game_state['poison_apples'][apple_id]
                print(f"🍎 毒苹果爆炸: {apple_id}, 伤害: {explosion_damage}, 已清除所有敌人中毒状态")
            else:
                # 处理中毒状态（每0.3秒造成伤害）
                poison_interval = 0.3
                if 'poison_last_damage_time' not in apple:
                    apple['poison_last_damage_time'] = apple['start_time']
                
                if current_time - apple['poison_last_damage_time'] >= poison_interval:
                    apple['poison_last_damage_time'] = current_time
                    # 优先使用毒苹果保存的owner_attack，如果没有则从玩家数据获取
                    owner_id = apple.get('owner')
                    owner_player = None
                    owner_attack = apple.get('owner_attack', 0)
                    
                    print(f"🍎 [中毒伤害计算] 毒苹果 {apple_id}: 初始owner_attack={owner_attack}")
                    
                    if owner_id and owner_id in game_state['players']:
                        owner_player = game_state['players'][owner_id]
                        # 始终从玩家数据获取最新的attack值（确保刷新后伤害正确）
                        current_attack = owner_player.get('attack', 0)
                        damage_bonus = owner_player.get('damageBonus', 0.0)
                        
                        print(f"🍎 [中毒伤害计算] 玩家 {owner_id}: current_attack={current_attack}, damageBonus={damage_bonus}")
                        
                        if current_attack > 0:
                            owner_attack = current_attack
                            apple['owner_attack'] = owner_attack  # 更新毒苹果的owner_attack
                            print(f"🍎 [中毒伤害计算] 更新owner_attack: {owner_attack}")
                        elif owner_attack == 0:
                            # 如果都没有，使用0
                            owner_attack = 0
                            print(f"🍎 [中毒伤害计算] owner_attack保持为0")
                    else:
                        # 如果找不到玩家，使用保存的owner_attack和damageBonus
                        print(f"🍎 [中毒伤害计算] 警告: 玩家 {owner_id} 不存在，使用保存的值")
                        # 尝试从毒苹果中获取保存的damageBonus
                        saved_damage_bonus = apple.get('owner_damage_bonus', 0.0)
                        if owner_attack > 0:
                            print(f"🍎 [中毒伤害计算] 使用保存的owner_attack: {owner_attack}, damageBonus: {saved_damage_bonus}")
                            # 创建一个临时的owner_player对象用于应用伤害加成
                            owner_player = {
                                'attack': owner_attack,
                                'damageBonus': saved_damage_bonus
                            }
                        else:
                            print(f"🍎 [中毒伤害计算] 无法找到玩家且owner_attack为0，使用默认值")
                            owner_attack = 0
                            owner_player = None
                    
                    poison_damage = 300 + owner_attack
                    print(f"🍎 [中毒伤害计算] 基础中毒伤害: 300 + {owner_attack} = {poison_damage}")
                    
                    # 对所有中毒的敌人造成伤害
                    for enemy in game_state.get('enemies', []):
                        if enemy.get('hp', 0) <= 0:
                            continue
                        
                        # 检查敌人是否中毒（被苹果子弹击中过）
                        if enemy.get('poisoned', False):
                            # 中毒伤害：无属性伤害，不可暴击，但可以受到伤害加成
                            final_damage = poison_damage
                            
                            if owner_player:
                                # 应用伤害加成（但不考虑属性克制）
                                damage_bonus = owner_player.get('damageBonus', 0.0)
                                
                                # 检查是否有护盾的伤害加成（幺幺俊羊羊护盾）
                                current_time_check = time.time()
                                bubble_shield_end = owner_player.get('bubble_shield_end', 0)
                                if current_time_check < bubble_shield_end:
                                    bubble_damage_bonus = owner_player.get('bubble_shield_damage_bonus', 0.0)
                                    damage_bonus = damage_bonus + bubble_damage_bonus
                                    print(f"🍎 [中毒伤害计算] 检测到护盾伤害加成: {bubble_damage_bonus}")
                                
                                print(f"🍎 [中毒伤害计算] 敌人 {enemy.get('id')}: 基础伤害={final_damage}, 总伤害加成={damage_bonus}")
                                
                                if damage_bonus > 0:
                                    final_damage = int(final_damage * (1 + damage_bonus))
                                    print(f"🍎 [中毒伤害计算] 应用伤害加成后: {final_damage}")
                                else:
                                    print(f"🍎 [中毒伤害计算] 无伤害加成，保持原伤害: {final_damage}")
                            else:
                                print(f"🍎 [中毒伤害计算] 警告: owner_player为None，无法应用伤害加成")
                            
                            final_damage = int(final_damage)
                            if final_damage < 1:
                                final_damage = 1
                            
                            print(f"🍎 [中毒伤害计算] 最终伤害: {final_damage} (敌人 {enemy.get('id')})")
                            
                            enemy['hp'] = max(0, enemy['hp'] - final_damage)
                            enemy['hit_flash_end'] = current_time + 0.2
                            
                            # 发送伤害数字事件（无属性，蓝色字体，不可暴击）
                            socketio.emit('enemy_hit', {
                                'enemyId': enemy['id'],
                                'x': enemy['x'],
                                'y': enemy['y'],
                                'damage': final_damage,
                                'isCrit': False,
                                'attribute': '无属性',  # 中毒伤害始终为无属性
                                'isPoison': True  # 标记为中毒伤害
                            }, room=room_key)
                            
                            if enemy['hp'] <= 0:
                                socketio.emit('enemy_killed', {
                                    'enemyId': enemy.get('id'),
                                    'killerId': apple.get('owner')
                                }, room=room_key)
    
    # 处理泡泡盾（幺幺俊羊羊右键和E技能）
    for player_id, player in game_state['players'].items():
        bubble_shield_end = player.get('bubble_shield_end', 0)
        if current_time < bubble_shield_end:
            player['invincible'] = True
            # 泡泡盾期间，每秒治疗幺幺俊羊羊（右键技能）
            owner_id = player.get('bubble_shield_owner')
            owner_attack = player.get('bubble_shield_owner_attack', 0)
            if owner_id and owner_id in game_state['players'] and owner_attack > 0:
                # 每秒治疗一次（每0.1秒检查一次，累计1秒后治疗）
                last_heal_time = player.get('bubble_shield_last_heal_time', current_time)
                if current_time - last_heal_time >= 1.0:
                    owner_player = game_state['players'][owner_id]
                    heal_amount = owner_attack  # 治疗量等于幺幺俊羊羊的攻击力
                    max_hp = owner_player.get('maxHp', 1000)
                    owner_player['hp'] = min(max_hp, owner_player['hp'] + heal_amount)
                    owner_player['heal_flash_end'] = current_time + 0.5
                    player['bubble_shield_last_heal_time'] = current_time
                    print(f"🍎 泡泡盾治疗幺幺俊羊羊: {heal_amount} HP")
        else:
            if bubble_shield_end > 0:
                player['invincible'] = False
                player['bubble_shield_damage_bonus'] = 0
                player['bubble_shield_owner'] = None
                player['bubble_shield_owner_attack'] = 0
                player['bubble_shield_last_heal_time'] = 0
    
    # 处理爆炸特效（幺幺俊羊羊Q技能）
    if 'explosions' in game_state:
        for explosion_id, explosion in list(game_state['explosions'].items()):
            elapsed = current_time - explosion['start_time']
            if elapsed >= explosion['duration']:
                # 爆炸特效结束，移除
                del game_state['explosions'][explosion_id]
    
    # 处理拉取效果（幺幺俊羊羊E技能）
    # 使用固定的delta_time（假设60fps，约16ms）
    pull_delta_time = 0.016  # 固定时间步长
    for player_id, player in game_state['players'].items():
        if player.get('pulling', False):
            pull_target_x = player.get('pull_target_x')
            pull_target_y = player.get('pull_target_y')
            pull_speed = player.get('pull_speed', 20000)  # 每秒200像素，加快100倍
            
            if pull_target_x is not None and pull_target_y is not None:
                # 计算方向
                dx = pull_target_x - player['x']
                dy = pull_target_y - player['y']
                distance = (dx * dx + dy * dy) ** 0.5
                
                if distance > 10:  # 如果距离目标超过10像素，继续拉取
                    # 归一化方向
                    if distance > 0:
                        dir_x = dx / distance
                        dir_y = dy / distance
                        
                        # 计算移动距离（每帧）
                        # pull_speed是每秒200像素，加快100倍后是20000，所以实际速度是200像素/秒
                        # 每帧移动距离 = 200像素/秒 * pull_delta_time
                        move_distance = 200 * pull_delta_time  # 每秒200像素
                        if move_distance > distance:
                            move_distance = distance
                        
                        # 更新位置
                        player['x'] += dir_x * move_distance
                        player['y'] += dir_y * move_distance
                        print(f"🍎 拉取中: {player_id}, 距离: {distance:.1f}, 移动: {move_distance:.1f}")
                else:
                    # 到达目标位置，停止拉取
                    player['x'] = pull_target_x
                    player['y'] = pull_target_y
                    player['pulling'] = False
                    player['pull_target_x'] = None
                    player['pull_target_y'] = None
                    print(f"🍎 拉取完成: {player_id}")
    
    # 广播游戏状态更新
    socketio.emit('game_state_update', {
        'enemies': [{  # 同步敌人状态（包括音爆效果和碎裂特效）
            'id': e['id'],
            'type': e['type'],
            'x': e['x'],
            'y': e['y'],
            'hp': e['hp'],
            'maxHp': e['maxHp'],
            'size': e['size'],
            'sonic_boom_end': e.get('sonic_boom_end', 0),  # 音爆效果结束时间
            'shatter_end': e.get('shatter_end', 0),  # 碎裂特效结束时间
            'hit_flash_end': e.get('hit_flash_end', 0),
            'crit_shake_end': e.get('crit_shake_end', 0),
            'heal_flash_end': e.get('heal_flash_end', 0),  # 治疗闪烁结束时间
            'poisoned': e.get('poisoned', False)  # 中毒状态
        } for e in game_state['enemies']],
        'countdown': game_state['countdown'],
        'bullets': game_state['bullets'],  # 同步子弹状态（包括弹射后的位置和速度）
        'beams': game_state.get('beams', {}),  # 同步光束状态
        'q_skills': game_state.get('q_skills', {}),  # 同步Q技能状态（公主蓉光环）
        'lock_skills': game_state.get('lock_skills', {}),  # 同步锁定技能状态（公主蓉右键）
        'big_apples': game_state.get('big_apples', {}),  # 同步巨大苹果状态（幺幺俊羊羊Q技能）
        'poison_apples': game_state.get('poison_apples', {}),  # 同步毒苹果状态（幺幺俊羊羊E技能）
        'explosions': game_state.get('explosions', {}),  # 同步爆炸特效（幺幺俊羊羊Q技能）
        'players': {pid: {'hp': p['hp'], 'maxHp': p.get('maxHp', 1000), 'hit_flash_end': p.get('hit_flash_end', 0), 'heal_flash_end': p.get('heal_flash_end', 0), 'invincible': p.get('invincible', False), 'bubble_shield_end': p.get('bubble_shield_end', 0), 'bubble_shield_damage_bonus': p.get('bubble_shield_damage_bonus', 0), 'pulling': p.get('pulling', False)} for pid, p in game_state['players'].items()}
    }, room=room_key)

