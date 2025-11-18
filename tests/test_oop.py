import unittest

from domain.equipment_config import EQUIPMENT_SETS, EQUIPMENT_MAIN_STATS, EQUIPMENT_SUB_STATS


class TestEquipmentConfig(unittest.TestCase):
    def test_sets_exist(self):
        self.assertIn('世间真理的传授者', EQUIPMENT_SETS)
        self.assertIn('黑色狭窄的小巷', EQUIPMENT_SETS)
        self.assertIn('愿这一轮朝阳照亮明天', EQUIPMENT_SETS)

    def test_main_stats_headwear(self):
        headwear = EQUIPMENT_MAIN_STATS['headwear']
        names = [s['name'] for s in headwear]
        self.assertIn('攻击力', names)
        self.assertIn('快速射击', names)

    def test_sub_stats_range(self):
        crit_rate = next(s for s in EQUIPMENT_SUB_STATS if s['name'] == '暴击率')
        self.assertGreater(crit_rate['max'], crit_rate['min'])


if __name__ == '__main__':
    unittest.main()