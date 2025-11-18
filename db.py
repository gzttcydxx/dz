import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), 'user_data.sqlite3')

def _connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def init_db():
    conn = _connect()
    cur = conn.cursor()
    stmts = [
        '''CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            created_at REAL,
            last_login_date TEXT,
            gacha_pity_4star INTEGER DEFAULT 0,
            gacha_pity_5star INTEGER DEFAULT 0,
            refinement_material INTEGER DEFAULT 0,
            wish_ticket INTEGER DEFAULT 0,
            has_received_welcome_reward INTEGER DEFAULT 0
        )''',
        '''CREATE TABLE IF NOT EXISTS equipment (
            id TEXT PRIMARY KEY,
            user_username TEXT NOT NULL,
            name TEXT NOT NULL,
            set_name TEXT,
            slot TEXT NOT NULL,
            level INTEGER DEFAULT 0,
            main_stat_name TEXT,
            main_stat_value REAL,
            main_stat_type TEXT,
            FOREIGN KEY(user_username) REFERENCES users(username) ON DELETE CASCADE
        )''',
        '''CREATE TABLE IF NOT EXISTS equipment_substats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id TEXT NOT NULL,
            name TEXT NOT NULL,
            value REAL,
            type TEXT,
            upgrade_count INTEGER DEFAULT 0,
            FOREIGN KEY(equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
        )''',
        '''CREATE TABLE IF NOT EXISTS characters (
            user_username TEXT NOT NULL,
            name TEXT NOT NULL,
            attribute TEXT,
            attack INTEGER,
            critRate REAL,
            critDamage REAL,
            reloadReduction REAL,
            rapidFire REAL,
            extraAmmo REAL,
            attributePower INTEGER,
            hp INTEGER,
            healingBonus REAL,
            damageBonus REAL,
            equipped_weapon_id TEXT,
            equipped_accessory_id TEXT,
            equipped_headwear_id TEXT,
            PRIMARY KEY(user_username, name),
            FOREIGN KEY(user_username) REFERENCES users(username) ON DELETE CASCADE,
            FOREIGN KEY(equipped_weapon_id) REFERENCES equipment(id) ON DELETE NO ACTION,
            FOREIGN KEY(equipped_accessory_id) REFERENCES equipment(id) ON DELETE NO ACTION,
            FOREIGN KEY(equipped_headwear_id) REFERENCES equipment(id) ON DELETE NO ACTION
        )''',
        '''CREATE TABLE IF NOT EXISTS weapons (
            id TEXT PRIMARY KEY,
            user_username TEXT NOT NULL,
            name TEXT NOT NULL,
            star INTEGER NOT NULL,
            FOREIGN KEY(user_username) REFERENCES users(username) ON DELETE CASCADE
        )''',
        'CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_username)',
        'CREATE INDEX IF NOT EXISTS idx_equipment_user ON equipment(user_username)',
        'CREATE INDEX IF NOT EXISTS idx_equipment_slot_user ON equipment(slot, user_username)',
        'CREATE INDEX IF NOT EXISTS idx_substats_equipment ON equipment_substats(equipment_id)',
        'CREATE INDEX IF NOT EXISTS idx_weapons_user ON weapons(user_username)'
    ]
    for s in stmts:
        try:
            cur.execute(s)
        except Exception:
            pass
    conn.commit()
    conn.close()

def save_all_users(users):
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute('BEGIN')
        for username, u in users.items():
            cur.execute(
                'INSERT INTO users(username,password,created_at,last_login_date,gacha_pity_4star,gacha_pity_5star,refinement_material,wish_ticket,has_received_welcome_reward) VALUES(?,?,?,?,?,?,?,?,?) '
                'ON CONFLICT(username) DO UPDATE SET password=excluded.password, created_at=excluded.created_at, last_login_date=excluded.last_login_date, gacha_pity_4star=excluded.gacha_pity_4star, gacha_pity_5star=excluded.gacha_pity_5star, refinement_material=excluded.refinement_material, wish_ticket=excluded.wish_ticket, has_received_welcome_reward=excluded.has_received_welcome_reward',
                (
                    username,
                    u.get('password',''),
                    u.get('created_at'),
                    u.get('last_login_date'),
                    int(u.get('gacha_pity_4star', 0) or 0),
                    int(u.get('gacha_pity_5star', 0) or 0),
                    int(u.get('refinement_material', 0) or 0),
                    int(u.get('wish_ticket', 0) or 0),
                    1 if u.get('has_received_welcome_reward') else 0,
                )
            )
            cur.execute('DELETE FROM characters WHERE user_username=?', (username,))
            cur.execute('DELETE FROM equipment WHERE user_username=?', (username,))
            eq_list = u.get('equipment', []) or []
            for e in eq_list:
                main = e.get('mainStat') or {}
                cur.execute(
                    'INSERT INTO equipment(id,user_username,name,set_name,slot,level,main_stat_name,main_stat_value,main_stat_type) VALUES(?,?,?,?,?,?,?,?,?)',
                    (
                        e.get('id'),
                        username,
                        e.get('name'),
                        e.get('set'),
                        e.get('slot'),
                        int(e.get('level', 0) or 0),
                        main.get('name'),
                        main.get('value'),
                        main.get('type'),
                    )
                )
                subs = e.get('subStats', []) or []
                for s in subs:
                    cur.execute(
                        'INSERT INTO equipment_substats(equipment_id,name,value,type,upgrade_count) VALUES(?,?,?,?,?)',
                        (
                            e.get('id'),
                            s.get('name'),
                            s.get('value'),
                            s.get('type'),
                            int(s.get('upgradeCount', 0) or 0),
                        )
                    )

            chars = u.get('characters', {}) or {}
            for cname, c in chars.items():
                eq = c.get('equipment', {}) or {}
                st = c.get('stats', {}) or {}
                cur.execute(
                    'INSERT INTO characters(user_username,name,attribute,attack,critRate,critDamage,reloadReduction,rapidFire,extraAmmo,attributePower,hp,healingBonus,damageBonus,equipped_weapon_id,equipped_accessory_id,equipped_headwear_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (
                        username,
                        cname,
                        c.get('attribute'),
                        st.get('attack'),
                        st.get('critRate'),
                        st.get('critDamage'),
                        st.get('reloadReduction'),
                        st.get('rapidFire'),
                        st.get('extraAmmo'),
                        st.get('attributePower'),
                        st.get('hp'),
                        st.get('healingBonus'),
                        st.get('damageBonus'),
                        eq.get('weapon'),
                        eq.get('accessory'),
                        eq.get('headwear'),
                    )
                )

            cur.execute('DELETE FROM weapons WHERE user_username=?', (username,))
            wlist = u.get('weapons', []) or []
            for w in wlist:
                cur.execute(
                    'INSERT INTO weapons(id,user_username,name,star) VALUES(?,?,?,?)',
                    (w.get('id'), username, w.get('name'), int(w.get('star', 0) or 0))
                )

        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()

def load_all_users():
    conn = _connect()
    cur = conn.cursor()
    users = {}
    for row in cur.execute('SELECT * FROM users'):
        users[row['username']] = {
            'password': row['password'],
            'created_at': row['created_at'],
            'characters': {},
            'equipment': [],
            'weapons': [],
            'refinement_material': row['refinement_material'],
            'wish_ticket': row['wish_ticket'],
            'last_login_date': row['last_login_date'],
            'gacha_pity_4star': row['gacha_pity_4star'],
            'gacha_pity_5star': row['gacha_pity_5star'],
            'has_received_welcome_reward': bool(row['has_received_welcome_reward'])
        }
    for username in list(users.keys()):
        chars = {}
        for c in cur.execute('SELECT * FROM characters WHERE user_username=?', (username,)):
            chars[c['name']] = {
                'equipment': {
                    'weapon': c['equipped_weapon_id'],
                    'accessory': c['equipped_accessory_id'],
                    'headwear': c['equipped_headwear_id']
                },
                'stats': {
                    'attack': c['attack'],
                    'critRate': c['critRate'],
                    'critDamage': c['critDamage'],
                    'reloadReduction': c['reloadReduction'],
                    'rapidFire': c['rapidFire'],
                    'extraAmmo': c['extraAmmo'],
                    'attributePower': c['attributePower'],
                    'hp': c['hp'],
                    'healingBonus': c['healingBonus'],
                    'damageBonus': c['damageBonus']
                },
                'attribute': c['attribute']
            }
        users[username]['characters'] = chars
        eq_rows = list(cur.execute('SELECT * FROM equipment WHERE user_username=?', (username,)))
        eqs = []
        for e in eq_rows:
            subs = []
            for s in cur.execute('SELECT * FROM equipment_substats WHERE equipment_id=?', (e['id'],)):
                subs.append({
                    'name': s['name'],
                    'value': s['value'],
                    'type': s['type'],
                    'upgradeCount': s['upgrade_count']
                })
            main_stat = None
            if e['main_stat_name'] is not None:
                main_stat = {
                    'name': e['main_stat_name'],
                    'value': e['main_stat_value'],
                    'type': e['main_stat_type']
                }
            eqs.append({
                'id': e['id'],
                'name': e['name'],
                'set': e['set_name'],
                'slot': e['slot'],
                'mainStat': main_stat,
                'subStats': subs,
                'level': e['level']
            })
        users[username]['equipment'] = eqs
        ws = []
        for w in cur.execute('SELECT * FROM weapons WHERE user_username=?', (username,)):
            ws.append({'id': w['id'], 'name': w['name'], 'star': w['star']})
        users[username]['weapons'] = ws
    conn.close()
    return users

def get_user(username):
    conn = _connect()
    cur = conn.cursor()
    row = cur.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
    if not row:
        conn.close()
        return None
    user = {
        'password': row['password'],
        'created_at': row['created_at'],
        'characters': {},
        'equipment': [],
        'weapons': [],
        'refinement_material': row['refinement_material'],
        'wish_ticket': row['wish_ticket'],
        'last_login_date': row['last_login_date'],
        'gacha_pity_4star': row['gacha_pity_4star'],
        'gacha_pity_5star': row['gacha_pity_5star'],
        'has_received_welcome_reward': bool(row['has_received_welcome_reward'])
    }
    chars = {}
    for c in cur.execute('SELECT * FROM characters WHERE user_username=?', (username,)):
        chars[c['name']] = {
            'equipment': {
                'weapon': c['equipped_weapon_id'],
                'accessory': c['equipped_accessory_id'],
                'headwear': c['equipped_headwear_id']
            },
            'stats': {
                'attack': c['attack'],
                'critRate': c['critRate'],
                'critDamage': c['critDamage'],
                'reloadReduction': c['reloadReduction'],
                'rapidFire': c['rapidFire'],
                'extraAmmo': c['extraAmmo'],
                'attributePower': c['attributePower'],
                'hp': c['hp'],
                'healingBonus': c['healingBonus'],
                'damageBonus': c['damageBonus']
            },
            'attribute': c['attribute']
        }
    user['characters'] = chars
    eq_rows = list(cur.execute('SELECT * FROM equipment WHERE user_username=?', (username,)))
    eqs = []
    for e in eq_rows:
        subs = []
        for s in cur.execute('SELECT * FROM equipment_substats WHERE equipment_id=?', (e['id'],)):
            subs.append({
                'name': s['name'],
                'value': s['value'],
                'type': s['type'],
                'upgradeCount': s['upgrade_count']
            })
        main_stat = None
        if e['main_stat_name'] is not None:
            main_stat = {
                'name': e['main_stat_name'],
                'value': e['main_stat_value'],
                'type': e['main_stat_type']
            }
        eqs.append({
            'id': e['id'],
            'name': e['name'],
            'set': e['set'],
            'slot': e['slot'],
            'mainStat': main_stat,
            'subStats': subs,
            'level': e['level']
        })
    user['equipment'] = eqs
    ws = []
    for w in cur.execute('SELECT * FROM weapons WHERE user_username=?', (username,)):
        ws.append({'id': w['id'], 'name': w['name'], 'star': w['star']})
    user['weapons'] = ws
    conn.close()
    return user

def set_character_equipment(username, character, slot, equipment_id):
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute('BEGIN')
        if equipment_id is not None:
            e = cur.execute('SELECT id, slot FROM equipment WHERE id=? AND user_username=?', (equipment_id, username)).fetchone()
            if not e:
                raise ValueError('装备不存在')
            if e['slot'] != slot:
                raise ValueError('装备部位不匹配')
            dup = cur.execute('SELECT name FROM characters WHERE user_username=? AND (equipped_'+slot+'_id)=?', (username, equipment_id)).fetchone()
            if dup:
                raise ValueError('该装备已被其他角色佩戴')
        c = cur.execute('SELECT name FROM characters WHERE user_username=? AND name=?', (username, character)).fetchone()
        if not c:
            raise ValueError('角色不存在')
        cur.execute('UPDATE characters SET equipped_'+slot+'_id=? WHERE user_username=? AND name=?', (equipment_id, username, character))
        conn.commit()
        return True, '装备成功'
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def upgrade_equipment_for_user(username, equipment_id):
    import random
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute('BEGIN')
        u = cur.execute('SELECT refinement_material FROM users WHERE username=?', (username,)).fetchone()
        if not u:
            raise ValueError('用户不存在')
        if (u['refinement_material'] or 0) < 1:
            raise ValueError('叠志精心料不足，需要1个')
        eq = cur.execute('SELECT level FROM equipment WHERE id=? AND user_username=?', (equipment_id, username)).fetchone()
        if not eq:
            raise ValueError('装备不存在')
        if eq['level'] >= 5:
            raise ValueError('装备已达到最高等级')
        cur.execute('UPDATE users SET refinement_material = refinement_material - 1 WHERE username=?', (username,))
        cur.execute('UPDATE equipment SET level = level + 1 WHERE id=?', (equipment_id,))
        subs = list(cur.execute('SELECT id,name,type,value,upgrade_count FROM equipment_substats WHERE equipment_id=?', (equipment_id,)))
        if not subs:
            raise ValueError('装备副词条不存在')
        sel = random.choice(subs)
        name = sel['name']
        typ = sel['type']
        if name == '暴击率':
            boost = random.uniform(0.025, 0.05)
        elif name == '暴击伤害':
            boost = random.uniform(0.05, 0.10)
        elif name == '换弹减免':
            boost = random.uniform(0.05, 0.10)
        elif name == '攻击力':
            boost = random.uniform(0.05, 0.10)
        elif name == '生命值':
            boost = random.uniform(0.04, 0.08)
        elif name == '属性强度':
            boost = random.randint(5, 10)
        else:
            if typ == 'percent':
                boost = random.uniform(0.05, 0.10)
            elif typ == 'time':
                boost = random.uniform(0.05, 0.10)
            else:
                boost = random.randint(5, 10)
        new_val = (sel['value'] or 0) + boost
        cur.execute('UPDATE equipment_substats SET value=?, upgrade_count=upgrade_count+1 WHERE id=?', (new_val, sel['id']))
        conn.commit()
        return True, {'name': name, 'boost': boost, 'type': typ}
    except Exception as e:
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()
