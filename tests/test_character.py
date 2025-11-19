import unittest
import time

from domain.characters import Character, CharacterError
from main import CHARACTERS, CHARACTER_ATTRIBUTES, get_character_instance


class TestCharacter(unittest.TestCase):
    def test_instances_exist(self):
        for name in CHARACTERS:
            inst = get_character_instance(name)
            self.assertIsInstance(inst, Character)
            self.assertEqual(inst.name, name)
            self.assertEqual(inst.type, CHARACTER_ATTRIBUTES.get(name, '无属性'))
            self.assertTrue(hasattr(inst, 'attack'))
            self.assertTrue(hasattr(inst, 'hp'))
            self.assertTrue(hasattr(inst, 'attributePower'))

    def test_passive_skill(self):
        brave = get_character_instance('勇者')
        stats = {'critRate': 1.2, 'critDamage': 1.0}
        out = brave.passive_skill(stats)
        self.assertGreater(out['critDamage'], 1.0)

        princess = get_character_instance('公主蓉')
        s2 = {'healingBonus': 0.20, 'critRate': 0.0}
        o2 = princess.passive_skill(s2)
        self.assertAlmostEqual(o2['critRate'], 0.20)

        sheep = get_character_instance('幺幺俊羊羊')
        s3 = {'attack': 101, 'critRate': 0.0}
        o3 = sheep.passive_skill(s3)
        self.assertGreaterEqual(o3['critRate'], 0.5)

        prince = get_character_instance('王子栗')
        s4 = {}
        o4 = prince.passive_skill(s4)
        self.assertTrue(o4.get('convertToCounterAttribute', False))

    def test_left_click_ammo_and_reload(self):
        brave = get_character_instance('勇者')
        brave.refill_ammo()
        brave.last_reload_start = 0.0
        brave.last_left_click_time = 0.0
        ammo_before = brave.current_ammo
        payload = brave.left_click(now=0)
        self.assertEqual(payload['event'], 'player_shoot')
        self.assertEqual(brave.current_ammo, ammo_before - 1)
        # drain ammo with interval respected
        t = 101.0
        while brave.current_ammo > 0:
            brave.left_click(now=t)
            t += 1.0
        with self.assertRaises(CharacterError):
            brave.left_click(now=t)
        brave._finish_reload_if_ready(now=t + brave.reload_time)
        self.assertEqual(brave.current_ammo, brave.ammo_capacity)

    def test_q_skill_charge_required(self):
        brave = get_character_instance('勇者')
        brave.q_charge = 0
        with self.assertRaises(CharacterError):
            brave.skill_q(now=0)
        brave.add_q_charge(100)
        out = brave.skill_q(now=1)
        self.assertEqual(out['event'], 'player_shoot')
        self.assertTrue(out['bullet']['isQSkill'])
        self.assertTrue(out['bullet']['canPenetrate'])

    def test_e_skill_cooldown(self):
        brave = get_character_instance('勇者')
        out = brave.skill_e(now=10)
        self.assertEqual(out['event'], 'activate_e_skill')
        with self.assertRaises(CharacterError):
            brave.skill_e(now=11)

    def test_right_click_variants(self):
        # brave rapid fire
        brave = get_character_instance('勇者')
        brave.refill_ammo()
        out = brave.right_click(now=200)
        self.assertEqual(out['event'], 'player_shoot')
        self.assertTrue(out.get('rapidFire', False))
        # princess lock
        princess = get_character_instance('公主蓉')
        out2 = princess.right_click(now=300, targets=['t1','t2'])
        self.assertEqual(out2['event'], 'activate_lock_skill')
        self.assertEqual(out2['skill_type'], 'princess_lock')
        # prince beam
        prince = get_character_instance('王子栗')
        out3 = prince.right_click(now=400)
        self.assertEqual(out3['event'], 'activate_beam')
        self.assertEqual(out3['beam_type'], 'prince_purification')
        # sheep shield
        sheep = get_character_instance('幺幺俊羊羊')
        out4 = sheep.right_click(now=500, targets=['p1'])
        self.assertEqual(out4['event'], 'apply_bubble_shield')
        # star spike
        star = get_character_instance('星耀犊')
        star.spike_count = 0
        b = star.right_click(now=600)
        self.assertEqual(b['event'], 'player_shoot')
        self.assertTrue(b['bullet']['isSpike'])
        star.spike_count = star.spike_limit
        with self.assertRaises(CharacterError):
            star.right_click(now=601)

    def test_skill_events_alignment(self):
        brave = get_character_instance('勇者')
        brave.refill_ammo()
        brave.last_reload_start = 0.0
        brave.last_left_click_time = 0.0
        brave.add_q_charge(100)
        events = set()
        events.add(brave.left_click(now=0)['event'])
        events.add(brave.skill_q(now=1)['event'])
        events.add(brave.skill_e(now=20)['event'])
        events.add(brave.right_click(now=30)['event'])
        allowed = {'player_shoot', 'activate_beam', 'activate_q_skill', 'apply_bubble_shield', 'spawn_big_apple', 'spawn_poison_apple', 'activate_e_skill'}
        for ev in events:
            self.assertIn(ev, allowed)

    def test_server_use_skill_entry(self):
        app = Flask(__name__)
        socketio = SocketIO(app, async_mode='threading')
        brave = get_character_instance('勇者')
        brave.refill_ammo()
        out = brave.left_click(now=time.time())
        self.assertEqual(out['event'], 'player_shoot')


if __name__ == '__main__':
    unittest.main()
import time
from flask import Flask
from flask_socketio import SocketIO