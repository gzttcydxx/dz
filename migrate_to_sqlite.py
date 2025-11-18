import json
import os
from db import init_db, save_all_users

def run():
    init_db()
    path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    if not os.path.exists(path):
        return True
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return save_all_users(data)

if __name__ == '__main__':
    ok = run()
    print('ok' if ok else 'failed')