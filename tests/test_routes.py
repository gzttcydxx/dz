import re
import json
from main import app, load_user_data


def _extract_location(resp):
    return resp.headers.get('Location', '')


def test_index_ok():
    client = app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200


def test_register_login_and_gacha_draw():
    client = app.test_client()
    resp = client.post('/register', data={'username': 'pytest_user', 'password': 'p'})
    assert resp.status_code == 302
    resp = client.post('/login', data={'username': 'pytest_user', 'password': 'p'})
    assert resp.status_code == 302
    resp = client.get('/gacha')
    assert resp.status_code == 200
    resp = client.post('/gacha/draw', json={'count': 1})
    assert resp.status_code == 200
    data = json.loads(resp.data.decode('utf-8'))
    assert data.get('success') is True


def test_room_flow():
    client = app.test_client()
    client.post('/register', data={'username': 'pytest_room', 'password': 'p'})
    client.post('/login', data={'username': 'pytest_room', 'password': 'p'})
    resp = client.post('/create_room', data={'playerName': 'P', 'maxPlayers': '2', 'mapSelect': '寒清境', 'monsterSelect': '杂鱼蕉形脸'})
    assert resp.status_code == 302
    loc = _extract_location(resp)
    assert '/lobby/' in loc
    room_key = loc.rsplit('/', 1)[-1]
    assert client.get(f'/lobby/{room_key}').status_code == 200
    assert client.get(f'/game/{room_key}').status_code == 200
    resp = client.post('/join_room', data={'roomKey': room_key, 'playerName': 'P2'})
    assert resp.status_code == 302


def test_equipment_endpoints():
    client = app.test_client()
    client.post('/register', data={'username': 'pytest_eq', 'password': 'p'})
    client.post('/login', data={'username': 'pytest_eq', 'password': 'p'})
    users = load_user_data()
    eq_user = users.get('pytest_eq', {})
    equipment_list = eq_user.get('equipment', [])
    equip_weapon = next((e for e in equipment_list if e.get('slot') == 'weapon'), None)
    if equip_weapon:
        resp = client.post('/equip_character', json={'character': '勇者', 'slot': 'weapon', 'equipment_id': equip_weapon['id']})
        assert resp.status_code in (200, 400)
    if equipment_list:
        resp = client.post('/upgrade_equipment', json={'equipment_id': equipment_list[0]['id']})
        assert resp.status_code in (200, 400)