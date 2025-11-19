from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List


class CharacterError(Exception):
    """技能使用失败时抛出，例如冷却中、弹药不足或充能不足。"""


@dataclass
class Character:
    """服务端角色模型，封装基础属性、冷却与技能逻辑。方法返回可用于触发游戏事件的载荷。"""

    name: str
    type: str
    base_stats: Dict[str, Any]
    skill_config: Dict[str, Dict[str, Any]] = field(default_factory=dict)

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

    def __post_init__(self) -> None:
        """Initialize capacity/cooldowns based on character name."""
        self.current_ammo = 0
        self.ammo_capacity = 0
        self.reload_time = 0.0
        self.left_click_interval = 0.0
        self.burst_shots = 1
        self.burst_interval = 0.0
        if self.name == '勇者':
            self.ammo_capacity = 6
            self.current_ammo = self.ammo_capacity
            self.reload_time = 1.2
            self.left_click_interval = 0.7
        elif self.name == '公主蓉':
            self.ammo_capacity = 60
            self.current_ammo = self.ammo_capacity
            self.reload_time = 2.1
            self.left_click_interval = 1.0
            self.burst_shots = 4
            self.burst_interval = 0.0
        elif self.name == '王子栗':
            self.ammo_capacity = 6
            self.current_ammo = self.ammo_capacity
            self.reload_time = 2.5
            self.left_click_interval = 1.5
        elif self.name == '幺幺俊羊羊':
            self.ammo_capacity = 15
            self.current_ammo = self.ammo_capacity
            self.reload_time = 1.78
            self.left_click_interval = 1.5
        elif self.name == '星耀犊':
            self.ammo_capacity = 20
            self.current_ammo = self.ammo_capacity
            self.reload_time = 2.0
            self.left_click_interval = 1.0
        else:
            self.ammo_capacity = 10
            self.current_ammo = self.ammo_capacity
            self.reload_time = 2.0
            self.left_click_interval = 1.0

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

    def passive_skill(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Apply passive to stats and return updated stats."""
        final_stats = dict(stats)
        if self.name == '公主蓉':
            healing_bonus = float(final_stats.get('healingBonus', 0.0))
            final_stats['critRate'] = float(final_stats.get('critRate', 0.0)) + healing_bonus
        elif self.name == '幺幺俊羊羊':
            if float(final_stats.get('attack', 0)) > 100.0:
                final_stats['critRate'] = float(final_stats.get('critRate', 0.0)) + 0.5
        elif self.name == '勇者':
            crit_rate = float(final_stats.get('critRate', 0.0))
            if crit_rate > 1.0:
                excess = crit_rate - 1.0
                final_stats['critDamage'] = float(final_stats.get('critDamage', 1.0)) + (excess * 2.0)
        elif self.name == '王子栗':
            # 转换为克制属性由战斗模块处理，这里打标以便事件层识别
            final_stats['convertToCounterAttribute'] = True
        return final_stats

    def left_click(self, target_is_enemy: bool = True, charge_seconds: float = 0.0, now: Optional[float] = None) -> Dict[str, Any]:
        """左键攻击。支持治疗型子弹返回`isHealing`与`healing`字段。包含弹药与换弹校验。"""
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

        atk = int(self.base_stats.get('attack', 0))
        max_hp = int(self.base_stats.get('hp', 1000))
        crit_rate = float(self.base_stats.get('critRate', 0.0))
        crit_dmg = float(self.base_stats.get('critDamage', 1.0))

        if self.name == '勇者':
            dmg = 500 + atk
            payload = {
                'event': 'player_shoot',
                'bullet': {
                    'damage': dmg,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'canBounce': bool(t < self.e_active_end),
                    'isCrit': False,
                    'canPenetrate': False,
                }
            }
            return payload
        elif self.name == '公主蓉':
            per_bullet_damage = 50 + int(max_hp * 0.05)
            per_bullet_heal = 20 + int(max_hp * 0.01)
            shots = self.burst_shots if t < self.e_active_end else (self.burst_shots * 2)
            bullets: List[Dict[str, Any]] = []
            for _ in range(shots):
                bullets.append({
                    'damage': per_bullet_damage if target_is_enemy else 0,
                    'isHealing': not target_is_enemy,
                    'healing': per_bullet_heal if not target_is_enemy else 0,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'isCrit': False,
                })
            return {'event': 'player_shoot', 'burst': True, 'bullets': bullets}
        elif self.name == '王子栗':
            payload = {
                'event': 'player_shoot',
                'bullet': {
                    'damage': 200 + atk,
                    'explosion': 500 + atk,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'isCrit': False,
                }
            }
            return payload
        elif self.name == '幺幺俊羊羊':
            payload = {
                'event': 'player_shoot',
                'bullet': {
                    'damage': (800 + atk) if target_is_enemy else 0,
                    'isHealing': not target_is_enemy,
                    'healing': (40 + atk) if not target_is_enemy else 0,
                    'knockback': 200 if target_is_enemy else 0,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'isCrit': False,
                }
            }
            return payload
        elif self.name == '星耀犊':
            heal = 10 + int(max_hp * 0.01)
            if charge_seconds > 0:
                heal += int(min(charge_seconds, 2.0) * 20)
            payload = {
                'event': 'player_shoot',
                'bullet': {
                    'isHealing': True,
                    'healing': heal,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'isCrit': False,
                }
            }
            return payload
        else:
            return {'event': 'player_shoot', 'bullet': {'damage': atk, 'attribute': self.type}}

    def skill_q(self, now: Optional[float] = None) -> Dict[str, Any]:
        """使用Q技能。充能类技能需`q_charge >= q_max_charge`。"""
        t = self._now(now)
        if self.name in ('勇者', '公主蓉', '王子栗', '幺幺俊羊羊', '星耀犊'):
            if self.q_charge < self.q_max_charge:
                raise CharacterError('Q技能充能不足')
            self.q_charge = 0

        atk = int(self.base_stats.get('attack', 0))
        max_hp = int(self.base_stats.get('hp', 1000))

        if self.name == '勇者':
            return {
                'event': 'player_shoot',
                'bullet': {
                    'damage': 3000 + atk,
                    'attribute': self.type,
                    'attributePower': int(self.base_stats.get('attributePower', 0)),
                    'canPenetrate': True,
                    'canBounce': True,
                    'isQSkill': True,
                }
            }
        elif self.name == '公主蓉':
            # Aura around player for 8 seconds
            return {
                'event': 'activate_q_skill',
                'skill_type': 'princess_aura',
                'aura': {
                    'radius': 800,
                    'duration': 8.0,
                    'healPerSec': 200,
                    'damagePerSec': 1000,
                }
            }
        elif self.name == '王子栗':
            return {
                'event': 'activate_q_skill',
                'skill_type': 'prince_recreation',
                'stun': 3.0,
                'multiHits': [{'damage': 1000 + atk} for _ in range(5)],
            }
        elif self.name == '幺幺俊羊羊':
            return {
                'event': 'spawn_big_apple',
                'apple': {
                    'placementDamage': 1000 + atk,
                    'healingPerSec': 100 + atk,
                    'explosionDamage': 5000 + atk,
                    'duration': 6.0,
                }
            }
        elif self.name == '星耀犊':
            return {
                'event': 'activate_beam',
                'beam_type': 'star_beam',
                'beam': {
                    'duration': 4.0,
                    'tick': 0.3,
                    'damagePerTick': 400 + int(max_hp * 0.10),
                    'healingPerTick': 120,
                    'baseCritRate': 0.50,
                }
            }
        else:
            return {'event': 'noop'}

    def skill_e(self, now: Optional[float] = None) -> Dict[str, Any]:
        """使用E技能，包含冷却校验与效果时窗。"""
        t = self._now(now)
        if t < self.e_cooldown_end:
            raise CharacterError('E技能冷却中')

        if self.name == '勇者':
            self.e_active_end = t + 10.0
            self.e_cooldown_end = t + 8.0
            self.current_ammo = self.ammo_capacity
            return {'event': 'activate_e_skill', 'skill_type': 'brave_enhanced', 'duration': 10.0, 'critBonus': 0.5, 'extraBounce': True}
        elif self.name == '公主蓉':
            self.e_active_end = t + 8.0
            self.e_cooldown_end = t + 10.0
            return {'event': 'activate_e_skill', 'skill_type': 'princess_fire_opt', 'duration': 8.0, 'burstShots': 8, 'burstInterval': 0.05}
        elif self.name == '王子栗':
            self.e_cooldown_end = t + 20.0
            return {'event': 'revive_ready', 'cooldown': 20.0}
        elif self.name == '幺幺俊羊羊':
            self.e_cooldown_end = t + 8.0
            return {'event': 'spawn_poison_apple', 'duration': 8.0, 'slowPercent': 0.20, 'poisonTick': 0.3, 'poisonDamage': 300 + int(self.base_stats.get('attack', 0))}
        elif self.name == '星耀犊':
            self.e_active_end = t + 10.0
            self.e_cooldown_end = t + 8.0
            return {'event': 'activate_e_skill', 'skill_type': 'star_boost', 'duration': 10.0, 'attributePowerBonus': 200, 'healingBonus': 0.20}
        else:
            return {'event': 'noop'}

    def right_click(self, now: Optional[float] = None, targets: Optional[List[str]] = None) -> Dict[str, Any]:
        """使用右键技能。快速连射与锁定/光束等效果以事件载荷返回。"""
        t = self._now(now)
        if t < self.right_click_cooldown_end and self.name in ('公主蓉', '王子栗', '幺幺俊羊羊'):
            raise CharacterError('右键技能冷却中')

        atk = int(self.base_stats.get('attack', 0))
        max_hp = int(self.base_stats.get('hp', 1000))

        if self.name == '勇者':
            if self._is_reloading(now):
                raise CharacterError('换弹中无法使用快速连射')
            shots = self.current_ammo
            self.current_ammo = 0
            self._start_reload(now)
            bullets = []
            for _ in range(shots):
                bullets.append({'damage': int((500 + atk) * 0.7), 'attribute': self.type, 'attributePower': int(self.base_stats.get('attributePower', 0))})
            return {'event': 'player_shoot', 'rapidFire': True, 'bullets': bullets}
        elif self.name == '公主蓉':
            self.right_click_cooldown_end = t + 8.0
            return {'event': 'activate_lock_skill', 'skill_type': 'princess_lock', 'lockingDuration': 1.0, 'targets': targets or []}
        elif self.name == '王子栗':
            self.right_click_cooldown_end = t + 5.0
            return {'event': 'activate_beam', 'beam_type': 'prince_purification', 'beam': {'duration': 0.6, 'damage': 1000 + atk}}
        elif self.name == '幺幺俊羊羊':
            self.right_click_cooldown_end = t + 8.0
            return {'event': 'apply_bubble_shield', 'shield': {'duration': 3.0, 'attributePowerBonus': 100, 'ownerAttack': atk}, 'targets': targets or []}
        elif self.name == '星耀犊':
            if self.spike_count >= self.spike_limit:
                self.right_click_cooldown_end = t + 3.0
                self.spike_count = 0
                raise CharacterError('尖刺进入冷却')
            self.spike_count += 1
            return {'event': 'player_shoot', 'bullet': {'isSpike': True, 'damage': 50 + atk, 'attribute': self.type}}
        else:
            return {'event': 'noop'}

    def add_q_charge(self, amount: int) -> None:
        """增加Q充能，封顶至最大值。"""
        self.q_charge = max(0, min(self.q_max_charge, self.q_charge + int(amount)))

    def refill_ammo(self) -> None:
        """填满弹药，不改变冷却计时。"""
        self.current_ammo = self.ammo_capacity

    def snapshot(self) -> Dict[str, Any]:
        """返回当前状态快照，便于调试与测试。"""
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