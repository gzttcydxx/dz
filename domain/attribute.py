from enum import IntEnum

class Attribute(IntEnum):
    # 超能
    SUPERNATURAL = 0
    # 自然
    NATURE = 1
    # 物理
    PHYSICAL = 2
    # 无属性
    NONE = 3

def is_stronger(attacker: Element, defender: Element) -> bool:
    return attacker != Attribute.NONE and defender != Attribute.NONE and (attacker - defender) % 3 == 1
