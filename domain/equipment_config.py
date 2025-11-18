from __future__ import annotations

from typing import Dict, List

EQUIPMENT_SETS: Dict[str, Dict] = {
    '世间真理的传授者': {
        'weapon': '量天尺',
        'accessory': '拂尘巾',
        'headwear': '诵音筒',
        'name': '世间真理的传授者',
        'effects': {
            'critRate': 0.20,
            'crit_cooldown_reduction': True,
        },
    },
    '黑色狭窄的小巷': {
        'weapon': '采访麦克风',
        'accessory': '洗脸巾',
        'headwear': '黑色面膜',
        'name': '黑色狭窄的小巷',
        'effects': {
            'attack_bonus': 0.50,
            'attribute_power_conditional': 100,
        },
    },
    '愿这一轮朝阳照亮明天': {
        'weapon': '寂明灯',
        'accessory': '虹气结',
        'headwear': '胡桃藤',
        'name': '愿这一轮朝阳照亮明天',
        'effects': {
            'hp_bonus': 0.50,
            'healingBonus': 0.30,
        },
    },
}

EQUIPMENT_MAIN_STATS: Dict[str, List[Dict]] = {
    'weapon': [
        {'name': '暴击率', 'value': 0.30, 'type': 'percent'},
        {'name': '暴击伤害', 'value': 0.60, 'type': 'percent'},
        {'name': '额外弹容', 'value': 0.20, 'type': 'percent'},
        {'name': '攻击力', 'value': 0.30, 'type': 'percent'},
        {'name': '生命值', 'value': 0.30, 'type': 'percent'},
        {'name': '属性强度', 'value': 50, 'type': 'flat'},
    ],
    'accessory': [
        {'name': '伤害加成', 'value': 0.25, 'type': 'percent'},
        {'name': '治疗加成', 'value': 0.20, 'type': 'percent'},
        {'name': '攻击力', 'value': 0.30, 'type': 'percent'},
        {'name': '生命值', 'value': 0.25, 'type': 'percent'},
        {'name': '属性强度', 'value': 50, 'type': 'flat'},
    ],
    'headwear': [
        {'name': '攻击力', 'value': 0.30, 'type': 'percent'},
        {'name': '生命值', 'value': 0.25, 'type': 'percent'},
        {'name': '快速射击', 'value': 0.20, 'type': 'time'},
        {'name': '换弹减免', 'value': 0.25, 'type': 'time'},
        {'name': '属性强度', 'value': 50, 'type': 'flat'},
    ],
}

EQUIPMENT_SUB_STATS: List[Dict] = [
    {'name': '暴击率', 'min': 0.025, 'max': 0.05, 'type': 'percent'},
    {'name': '暴击伤害', 'min': 0.05, 'max': 0.10, 'type': 'percent'},
    {'name': '换弹减免', 'min': 0.05, 'max': 0.10, 'type': 'time'},
    {'name': '攻击力', 'min': 0.05, 'max': 0.10, 'type': 'percent'},
    {'name': '生命值', 'min': 0.04, 'max': 0.08, 'type': 'percent'},
    {'name': '属性强度', 'min': 5, 'max': 10, 'type': 'flat'},
]