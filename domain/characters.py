import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Type
from abc import ABC, abstractmethod


class CharacterError(Exception):
    """技能使用失败时抛出，例如冷却中、弹药不足或充能不足。"""


@dataclass
class Character(ABC):
    name: str = ''
    type: str = ''

    attack: float = 0.0
    critRate: float = 0.0
    critDamage: float = 1.0
    reloadReduction: float = 0.0
    rapidFire: float = 0.0
    extraAmmo: float = 0.0
    attributePower: int = 0
    hp: float = 1000.0

    current_ammo: int = 0
    ammo_capacity: int = 0
    reload_time: float = 0.0
    left_click_interval: float = 0.0
    last_reload_start: float = 0.0
    last_left_click_time: float = 0.0
    e_active_end: float = 0.0
    e_cooldown_end: float = 0.0
    right_click_cooldown_end: float = 0.0
    q_charge: int = 0
    q_max_charge: int = 100
    burst_shots: int = 1
    burst_interval: float = 0.0
    spike_count: int = 0
    spike_limit: int = 80

    skill_config: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.current_ammo = 0
        self.ammo_capacity = 0
        self.reload_time = 0.0
        self.left_click_interval = 0.0
        self.burst_shots = 1
        self.burst_interval = 0.0

    def _now(self, now: Optional[float]) -> float:
        return time.time() if now is None else now

    def _is_reloading(self, now: Optional[float] = None) -> bool:
        t = self._now(now)
        return (t - self.last_reload_start) < self.reload_time if self.last_reload_start > 0 else False

    def _start_reload(self, now: Optional[float] = None) -> None:
        self.last_reload_start = self._now(now)

    def _finish_reload_if_ready(self, now: Optional[float] = None) -> None:
        t = self._now(now)
        if self.last_reload_start > 0 and (t - self.last_reload_start) >= self.reload_time:
            self.current_ammo = self.ammo_capacity
            self.last_reload_start = 0.0

    def _check_interval(self, last_time: float, interval: float, now: Optional[float] = None) -> None:
        t = self._now(now)
        if last_time > 0 and (t - last_time) < interval:
            raise CharacterError('技能尚未冷却')

    @abstractmethod
    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        pass

    @abstractmethod
    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        pass

    @abstractmethod
    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        pass

    @abstractmethod
    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        pass

    def add_q_charge(self, amount: int) -> None:
        self.q_charge = max(0, min(self.q_max_charge, self.q_charge + int(amount)))

    def refill_ammo(self) -> None:
        self.current_ammo = self.ammo_capacity

    def snapshot(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'type': self.type,
            'ammo': self.current_ammo,
            'ammoCapacity': self.ammo_capacity,
            'reloadTime': self.reload_time,
            'leftClickInterval': self.left_click_interval,
            'qCharge': self.q_charge,
            'qMaxCharge': self.q_max_charge,
            'eActiveEnd': self.e_active_end,
            'eCooldownEnd': self.e_cooldown_end,
            'rightClickCooldownEnd': self.right_click_cooldown_end,
        }

    @classmethod
    def create(cls) -> 'Character':
        return cls()


class YongZhe(Character):
    def __post_init__(self) -> None:
        super().__post_init__()
        self.name = '勇者'
        self.type = '物理系'
        self.attack = 53.0
        self.critRate = 0.20
        self.critDamage = 1.0
        self.reloadReduction = 0.2
        self.rapidFire = 0.0
        self.extraAmmo = 0.0
        self.attributePower = 100
        self.hp = 1000.0
        self.ammo_capacity = 6
        self.current_ammo = self.ammo_capacity
        self.reload_time = 1.2
        self.left_click_interval = 0.7
        self.skill_config = {
            '左键': {
                'name': '左轮射击',
                'description': '发射普通左轮子弹，伤害500+攻击力，射击间隔0.7秒，弹夹容量6发，换弹时间1.2秒',
                'cooldown': '无'
            },
            'Q': {
                'name': '击破射击',
                'description': '发射一枚穿透性子弹，伤害3000+攻击力，大小比普通子弹大100%，可穿透敌人，碰到地图边界会向最近敌人弹射一次，被击中的敌人将被禁锢3秒。充能：每秒1%，每次普通子弹命中敌人+3%',
                'cooldown': '充能制（100%）'
            },
            'E': {
                'name': '强化射击',
                'description': '激活后持续10秒，立即填满子弹。期间子弹可弹射一次，暴击率提高50%。冷却8秒',
                'cooldown': '8秒'
            },
            '右键': {
                'name': '快速连射',
                'description': '将当前剩余的所有子弹一次性快速全部打出。子弹伤害为左键的70%。换弹时无法使用',
                'cooldown': '无'
            },
            '被动': {
                'name': '赏金猎人',
                'description': '当暴击率超过100%时，根据超出的部分获得双倍的暴击伤害加成'
            }
        }

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        s = dict(stats)
        r = float(s.get('critRate', 0.0))
        if r > 1.0:
            s['critDamage'] = float(s.get('critDamage', 1.0)) + (r - 1.0) * 2.0
        return s

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        self._finish_reload_if_ready(now)
        if self._is_reloading(now):
            raise CharacterError('换弹中，无法使用左键')
        self._check_interval(self.last_left_click_time, self.left_click_interval, now)
        if self.current_ammo <= 0:
            self._start_reload(now)
            raise CharacterError('弹药不足，开始换弹')
        t = self._now(now)
        self.last_left_click_time = t
        self.current_ammo -= 1
        return {'event': 'player_shoot', 'bullet': {'damage': 500 + self.attack, 'attribute': self.type, 'attributePower': int(self.attributePower), 'canBounce': bool(t < self.e_active_end), 'isCrit': False, 'canPenetrate': False}}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        if self.q_charge < self.q_max_charge:
            raise CharacterError('Q技能充能不足')
        self.q_charge = 0
        return {'event': 'player_shoot', 'bullet': {'damage': 3000 + self.attack, 'attribute': self.type, 'attributePower': int(self.attributePower), 'canPenetrate': True, 'canBounce': True, 'isQSkill': True}}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')
        self.e_active_end = t + 10.0
        self.e_cooldown_end = t + 8.0
        self.current_ammo = self.ammo_capacity
        return {'event': 'activate_e_skill', 'skill_type': 'brave_enhanced', 'duration': 10.0, 'critBonus': 0.5, 'extraBounce': True}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        if self._is_reloading(now):
            raise CharacterError('换弹中无法使用快速连射')
        shots = self.current_ammo
        self.current_ammo = 0
        self._start_reload(now)
        bullets = [{'damage': int((500 + self.attack) * 0.7), 'attribute': self.type, 'attributePower': int(self.attributePower)} for _ in range(shots)]
        return {'event': 'player_shoot', 'rapidFire': True, 'bullets': bullets}



class GongZhuRong(Character):
    def __post_init__(self) -> None:
        super().__post_init__()
        self.name = '公主蓉'
        self.type = '自然系'
        self.attack = 32.0
        self.critRate = 0.0
        self.critDamage = 1.0
        self.reloadReduction = 0.0
        self.rapidFire = 0.0
        self.extraAmmo = 0.0
        self.attributePower = 0
        self.hp = 2000.0
        self.ammo_capacity = 60
        self.current_ammo = self.ammo_capacity
        self.reload_time = 2.1
        self.left_click_interval = 1.0
        self.burst_shots = 4
        self.burst_interval = 0.0
        self.skill_config = {
            '左键': {
                'name': '四连发射击',
                'description': '每次射击4发连续。每次4连发需要间隔1秒。每颗子弹造成50+（公主蓉生命值上限的5%）点伤害，若击中队友则造成20+（公主蓉生命值上限的1%）点治疗。子弹速度42，弹容60，换弹时间2.1秒',
                'cooldown': '无'
            },
            'Q': {
                'name': '微笑拂晓约定',
                'description': '展开一个半径800的圆形光环，范围内的队友每秒恢复200点生命值，敌人每秒收到1000点伤害。持续期间内公主蓉为无敌状态。持续8秒。充能：每秒恢复5%',
                'cooldown': '充能制（100%）'
            },
            'E': {
                'name': '火力优化',
                'description': '每次4连射改为8连射，连射射击间隔改为0.05秒（并非开枪的间隔）。持续8秒，冷却10秒',
                'cooldown': '10秒'
            },
            '右键': {
                'name': '锁定射击',
                'description': '点击右键后进入激活状态，激活状态下会开始锁定界面上的所有队友和敌人，在1秒后完成锁定并向所有锁定目标都发射粉色桃心炮弹，被击中的敌人将收到800+（公主蓉生命值上限的10%）点伤害，队友获得100+（公主蓉生命值上限的1%）点治疗。冷却8秒',
                'cooldown': '8秒'
            }
        }

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        s = dict(stats)
        s['critRate'] = float(s.get('critRate', 0.0)) + float(s.get('healingBonus', 0.0))
        return s

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        self._finish_reload_if_ready(now)
        if self._is_reloading(now):
            raise CharacterError('换弹中，无法使用左键')
        self._check_interval(self.last_left_click_time, self.left_click_interval, now)
        if self.current_ammo <= 0:
            self._start_reload(now)
            raise CharacterError('弹药不足，开始换弹')
        t = self._now(now)
        self.last_left_click_time = t
        self.current_ammo -= 1
        max_hp = int(self.hp)
        per_bullet_damage = 50 + int(max_hp * 0.05)
        per_bullet_heal = 20 + int(max_hp * 0.01)
        shots = self.burst_shots if t < self.e_active_end else (self.burst_shots * 2)
        bullets = [{'damage': per_bullet_damage if target_is_enemy else 0, 'isHealing': not target_is_enemy, 'healing': per_bullet_heal if not target_is_enemy else 0, 'attribute': self.type, 'attributePower': int(self.attributePower), 'isCrit': False} for _ in range(shots)]
        return {'event': 'player_shoot', 'burst': True, 'bullets': bullets}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        if self.q_charge < self.q_max_charge:
            raise CharacterError('Q技能充能不足')
        self.q_charge = 0
        return {'event': 'activate_q_skill', 'skill_type': 'princess_aura', 'aura': {'radius': 800, 'duration': 8.0, 'healPerSec': 200, 'damagePerSec': 1000}}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')
        self.e_active_end = t + 8.0
        self.e_cooldown_end = t + 10.0
        return {'event': 'activate_e_skill', 'skill_type': 'princess_fire_opt', 'duration': 8.0, 'burstShots': 8, 'burstInterval': 0.05}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.right_click_cooldown_end:
            raise CharacterError('右键技能冷却中')
        self.right_click_cooldown_end = t + 8.0
        return {'event': 'activate_lock_skill', 'skill_type': 'princess_lock', 'lockingDuration': 1.0, 'targets': targets or []}



class WangZiLi(Character):
    def __post_init__(self) -> None:
        super().__post_init__()
        self.name = '王子栗'
        self.type = '无属性'
        self.attack = 49.0
        self.critRate = 0.50
        self.critDamage = 1.0
        self.reloadReduction = 0.0
        self.rapidFire = 0.0
        self.extraAmmo = 0.0
        self.attributePower = 0
        self.hp = 1000.0
        self.ammo_capacity = 6
        self.current_ammo = self.ammo_capacity
        self.reload_time = 2.5
        self.left_click_interval = 1.5
        self.skill_config = {
            '左键': {
                'name': '火炮弹',
                'description': '发射一枚火炮弹，击中敌人后会造成200+攻击力的命中伤害，然后爆炸，造成范围伤害，伤害为500+攻击力。发射间隔1.5秒，有后坐力，弹夹容量6发，换弹时间2.5秒',
                'cooldown': '无'
            },
            'Q': {
                'name': '再创世',
                'description': '激活后，击碎屏幕并定格敌人，随后释放创世白光，对所有敌人造成5次伤害，每次伤害为1000+攻击力。充能：每秒3%，左键每次命中敌人时恢复2%',
                'cooldown': '充能制（100%）'
            },
            'E': {
                'name': '重生',
                'description': '当任意队友阵亡时，会在原处留下一个黄色的灵魂球。存在灵魂球时，E技能变为可使用状态。按下E技能后，将该队友在灵魂球的位置复活。冷却20秒',
                'cooldown': '20秒（需要灵魂球）'
            },
            '右键': {
                'name': '净灭射线',
                'description': '发射一道光束，持续0.6秒，对接触到光束的敌人造成1000+攻击力点伤害，有后坐力。冷却时间5秒',
                'cooldown': '5秒'
            },
            '被动': {
                'name': '救世主',
                'description': '对物理/自然/超能属性的敌人造成伤害时，该伤害转变为克制敌人的属性'
            }
        }

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        s = dict(stats)
        s['convertToCounterAttribute'] = True
        return s

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        self._finish_reload_if_ready(now)
        if self._is_reloading(now):
            raise CharacterError('换弹中，无法使用左键')
        self._check_interval(self.last_left_click_time, self.left_click_interval, now)
        if self.current_ammo <= 0:
            self._start_reload(now)
            raise CharacterError('弹药不足，开始换弹')
        self.last_left_click_time = self._now(now)
        self.current_ammo -= 1
        return {'event': 'player_shoot', 'bullet': {'damage': 200 + self.attack, 'explosion': 500 + self.attack, 'attribute': self.type, 'attributePower': int(self.attributePower), 'isCrit': False}}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        if self.q_charge < self.q_max_charge:
            raise CharacterError('Q技能充能不足')
        self.q_charge = 0
        return {'event': 'activate_q_skill', 'skill_type': 'prince_recreation', 'stun': 3.0, 'multiHits': [{'damage': 1000 + self.attack} for _ in range(5)]}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')
        self.e_cooldown_end = t + 20.0
        return {'event': 'revive_ready', 'cooldown': 20.0}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.right_click_cooldown_end:
            raise CharacterError('右键技能冷却中')
        self.right_click_cooldown_end = t + 5.0
        return {'event': 'activate_beam', 'beam_type': 'prince_purification', 'beam': {'duration': 0.6, 'damage': 1000 + self.attack}}



class YaoYaoJunYangYang(Character):
    def __post_init__(self) -> None:
        super().__post_init__()
        self.name = '幺幺俊羊羊'
        self.type = '物理系'
        self.attack = 48.0
        self.critRate = 0.15
        self.critDamage = 1.0
        self.reloadReduction = 0.0
        self.rapidFire = 0.0
        self.extraAmmo = 0.0
        self.attributePower = 100
        self.hp = 1200.0
        self.ammo_capacity = 15
        self.current_ammo = self.ammo_capacity
        self.reload_time = 1.78
        self.left_click_interval = 1.5
        self.skill_config = {
            '左键': {
                'name': '你吃苹果不？',
                'description': '发射苹果子弹，命中敌人时将击退敌人并造成800+（幺幺俊羊羊攻击力）点的伤害，命中队友时治疗40+（幺幺俊羊羊攻击力）点生命值。射击间隔1.5秒，弹容15，子弹速度为33，换弹时间1.78秒',
                'cooldown': '无'
            },
            'Q': {
                'name': '巨大苹果',
                'description': '按下Q激活技能，在准星位置会出现巨大苹果的虚影。点击左键在虚影位置生成巨大苹果实体，点击右键取消。巨大苹果放置时弹开敌人并造成1000+（幺幺俊羊羊攻击力）点伤害，存在6秒，每秒对所有玩家治疗100+（幺幺俊羊羊攻击力）点生命值，6秒后爆炸对所有敌人造成5000+（幺幺俊羊羊攻击力）点伤害。充能：每秒1%，每次发射苹果击中敌人恢复5%',
                'cooldown': '充能制（100%）'
            },
            'E': {
                'name': '毒苹果',
                'description': '按下E激活技能，在准星位置会出现毒苹果的虚影。点击左键在虚影位置生成毒苹果实体，点击右键取消。毒苹果使界面上的所有敌人移动速度降低20%，并且受到苹果子弹攻击后会进入中毒状态，每隔0.3秒受到300+（幺幺俊羊羊攻击力）点伤害。中毒效果持续到毒苹果消失。毒苹果持续8秒后爆炸，对所有敌人造成2000+（幺幺俊羊羊攻击力）点伤害。',
                'cooldown': '8秒'
            },
            '右键': {
                'name': '泡泡盾',
                'description': '选择一名玩家赋予泡泡盾，该玩家在三秒内处于无敌状态并在此期间获得100点属性强度。冷却8秒',
                'cooldown': '8秒'
            }
        }

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        s = dict(stats)
        if float(s.get('attack', 0)) > 100.0:
            s['critRate'] = float(s.get('critRate', 0.0)) + 0.5
        return s

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        self._finish_reload_if_ready(now)
        if self._is_reloading(now):
            raise CharacterError('换弹中，无法使用左键')
        self._check_interval(self.last_left_click_time, self.left_click_interval, now)
        if self.current_ammo <= 0:
            self._start_reload(now)
            raise CharacterError('弹药不足，开始换弹')
        self.last_left_click_time = self._now(now)
        self.current_ammo -= 1
        return {'event': 'player_shoot', 'bullet': {'damage': (800 + self.attack) if target_is_enemy else 0, 'isHealing': not target_is_enemy, 'healing': (40 + self.attack) if not target_is_enemy else 0, 'knockback': 200 if target_is_enemy else 0, 'attribute': self.type, 'attributePower': int(self.attributePower), 'isCrit': False}}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        if self.q_charge < self.q_max_charge:
            raise CharacterError('Q技能充能不足')
        self.q_charge = 0
        return {'event': 'spawn_big_apple', 'apple': {'placementDamage': 1000 + self.attack, 'healingPerSec': 100 + self.attack, 'explosionDamage': 5000 + self.attack, 'duration': 6.0}}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')
        self.e_cooldown_end = t + 8.0
        return {'event': 'spawn_poison_apple', 'duration': 8.0, 'slowPercent': 0.20, 'poisonTick': 0.3, 'poisonDamage': 300 + int(self.base_stats.get('attack', 0))}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.right_click_cooldown_end:
            raise CharacterError('右键技能冷却中')
        self.right_click_cooldown_end = t + 8.0
        return {'event': 'apply_bubble_shield', 'shield': {'duration': 3.0, 'attributePowerBonus': 100, 'ownerAttack': self.attack}, 'targets': targets or []}



class XingYaoDu(Character):
    def __post_init__(self) -> None:
        super().__post_init__()
        self.name = '星耀犊'
        self.type = '超能系'
        self.attack = 0.0
        self.critRate = 0.30
        self.critDamage = 1.5
        self.reloadReduction = 0.0
        self.rapidFire = 0.0
        self.extraAmmo = 0.0
        self.attributePower = 0
        self.hp = 1500.0
        self.ammo_capacity = 20
        self.current_ammo = self.ammo_capacity
        self.reload_time = 2.0
        self.left_click_interval = 1.0
        self.skill_config = {
            '左键': {
                'name': '音符治疗',
                'description': '发射一枚音符，不会造成伤害，会穿过敌人，击中玩家时回复10+(星耀犊生命值上限的1%)点生命值。可以长按鼠标左键进行蓄力，至多2秒，蓄力后的音符造成的治疗量会提高（根据蓄力时间提高蓄力秒数*20点）。射击间隔1秒，弹容20发，换弹时间2秒。治疗可以暴击。',
                'cooldown': '无'
            },
            'Q': {
                'name': '聚合光束',
                'description': '发射一道聚合光束，持续4秒。光束每0.3秒判定一次，对敌人造成400+(星耀犊生命值上限的10%)点伤害，对玩家治疗120点生命值。基础暴击率50%，可叠加角色暴击率。暴击时光束宽度45，非暴击35。激活期间每秒恢复50生命值。充能：每秒1%，每次左键治疗命中玩家+2%，音爆触发+2%',
                'cooldown': '充能制（100%）'
            },
            'E': {
                'name': '强化增幅',
                'description': '激活后持续10秒，期间星耀犊获得200点属性强度和20%治疗加成。冷却8秒',
                'cooldown': '8秒'
            },
            '右键': {
                'name': '尖刺发射',
                'description': '按住右键持续发射尖刺，每0.075秒发射一枚，伤害50+（星耀犊攻击力）点。最多发射80枚后进入3秒冷却。尖刺命中敌人5次后触发音爆，造成300点伤害。',
                'cooldown': '3秒（发射80枚后）'
            }
        }

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        return dict(stats)

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        self._finish_reload_if_ready(now)
        if self._is_reloading(now):
            raise CharacterError('换弹中，无法使用左键')
        self._check_interval(self.last_left_click_time, self.left_click_interval, now)
        if self.current_ammo <= 0:
            self._start_reload(now)
            raise CharacterError('弹药不足，开始换弹')
        self.last_left_click_time = self._now(now)
        self.current_ammo -= 1
        max_hp = int(self.hp)
        heal = 10 + int(max_hp * 0.01)
        if charge_seconds > 0:
            heal += int(min(charge_seconds, 2.0) * 20)
        return {'event': 'player_shoot', 'bullet': {'isHealing': True, 'healing': heal, 'attribute': self.type, 'attributePower': int(self.attributePower), 'isCrit': False}}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        if self.q_charge < self.q_max_charge:
            raise CharacterError('Q技能充能不足')
        self.q_charge = 0
        max_hp = int(self.hp)
        return {'event': 'activate_beam', 'beam_type': 'star_beam', 'beam': {'duration': 4.0, 'tick': 0.3, 'damagePerTick': 400 + int(max_hp * 0.10), 'healingPerTick': 120, 'baseCritRate': 0.50}}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')
        self.e_active_end = t + 10.0
        self.e_cooldown_end = t + 8.0
        return {'event': 'activate_e_skill', 'skill_type': 'star_boost', 'duration': 10.0, 'attributePowerBonus': 200, 'healingBonus': 0.20}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        t = self._now(now)
        if self.spike_count >= self.spike_limit:
            self.right_click_cooldown_end = t + 3.0
            self.spike_count = 0
            raise CharacterError('尖刺进入冷却')
        self.spike_count += 1
        return {'event': 'player_shoot', 'bullet': {'isSpike': True, 'damage': 50 + self.attack, 'attribute': self.type}}


CHARACTER_CLASS_MAP: Dict[str, Type[Character]] = {
    '勇者': YongZhe,
    '公主蓉': GongZhuRong,
    '王子栗': WangZiLi,
    '幺幺俊羊羊': YaoYaoJunYangYang,
    '星耀犊': XingYaoDu,
}