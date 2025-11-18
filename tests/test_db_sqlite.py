import unittest
import os

from db import init_db, load_all_users, save_all_users, set_character_equipment, upgrade_equipment_for_user

class TestSQLiteDB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        from main import _bootstrap_db_from_json
        _bootstrap_db_from_json()

    def test_load_users(self):
        users = load_all_users()
        self.assertTrue(len(users) >= 1)
        self.assertIn('admin', users)

    def test_set_character_equipment(self):
        users = load_all_users()
        admin = users.get('admin')
        self.assertIsNotNone(admin)
        eqs = admin.get('equipment', [])
        self.assertTrue(len(eqs) > 0)
        occupied = set()
        for cname, c in admin.get('characters', {}).items():
            for s, eid in c.get('equipment', {}).items():
                if eid:
                    occupied.add(eid)
        e = next((x for x in eqs if x['level'] < 5 and x['id'] not in occupied), eqs[0])
        slot = e['slot']
        ok, msg = set_character_equipment('admin', '公主蓉', slot, e['id'])
        self.assertTrue(ok, msg)
        users2 = load_all_users()
        equipped = users2['admin']['characters']['公主蓉']['equipment'][slot]
        self.assertEqual(e['id'], equipped)

    def test_upgrade_equipment(self):
        users = load_all_users()
        admin = users.get('admin')
        eqs = admin.get('equipment', [])
        self.assertTrue(len(eqs) > 0)
        target = next((x for x in eqs if x['level'] < 5), eqs[0])
        old_level = target.get('level', 0)
        old_rm = admin.get('refinement_material', 0)
        ok, res = upgrade_equipment_for_user('admin', target['id'])
        self.assertTrue(ok, res)
        users3 = load_all_users()
        admin3 = users3['admin']
        target3 = next((x for x in admin3['equipment'] if x['id'] == target['id']), None)
        self.assertIsNotNone(target3)
        self.assertEqual(target3['level'], old_level + 1)
        self.assertEqual(admin3.get('refinement_material', 0), old_rm - 1)

if __name__ == '__main__':
    unittest.main()