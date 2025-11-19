from dataclasses import dataclass
from abc import ABC, abstractmethod
from enum import Enum

from attribute import Attribute
from characters import Character

class TEnum(Enum):
    # 子弹类
    BULLET = 0
    # 近战类
    MELEE = 1
    # 光束类
    BEAM = 2
    # 持续伤害类
    DOT = 3


class KDEnum(Enum):
    # 击退方向与攻击方向一致
    SAME = 0
    # 击退方向与攻击方向相反
    OPPOSITE = 1


@dataclass
class AttackType(ABC):
    # 大小（子弹大小、图标大小、光束宽度）
    size: int or tuple[int, int] = 0
    # 类型
    type: TEnum = TEnum.BULLET
    # 伤害
    demage: float = 0.0
    # 效果（TODO: 后续修改为函数）
    effect: str = ''
    # 后坐力
    recoil: int = 0
    # 击退力
    knockback: int = 0
    # 击退方向
    knockback_direction: KDEnum = KDEnum.SAME
    # 持续时间
    duration: float = 0.0
    # 友军特效（TODO: 后续修改为函数）
    friend_effect: str = ''
    # 攻击属性
    attribute: Attribute = Attribute.NONE
    # 暴击率
    crit_rate: float = 0.0

    @abstractmethod
    def execute(self, character: Character) -> None:
        pass


@dataclass
class BulletType(AttackType):
    size: int
    demage: float

    # 持续时间
    duration: float = 60
    # 飞行速度
    speed: int = 5
    # 穿透率
    penetration: float = 0.0
    # 弹射次数
    bounce: int = 0

    type: TEnum = TEnum.BULLET
    
    # 子弹弹射
    # TODO: 如果触发穿透，则不弹射
    def bounce(
        self,
        # 已打中目标
        target: list(Character)
    ) -> None:
        if self.bounce > 0:
            self.bounce -= 1
            self.execute(character)


@dataclass
class MELEEType(AttackType):
    size: tuple[int, int]
    demage: float

    # 持续时间
    duration: float = 0.5
    
    type: TEnum = TEnum.MELEE


@dataclass
class BEAMType(AttackType):
    size: int
    demage: float

    # 穿透率
    penetration: float = 0.0
    # 伤害间隔
    interval: float = 0.5
    # 持续时间
    duration: float = 3

    type: TEnum = TEnum.BEAM


@dataclass
class DOTType(AttackType):
    demage: float

    # 伤害间隔
    interval: float = 0.5
    # 持续时间
    duration: float = 3

    type: TEnum = TEnum.DOT
