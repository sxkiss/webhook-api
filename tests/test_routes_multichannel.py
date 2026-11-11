import sqlite3
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import console


class RoutesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)
        with sqlite3.connect(self.path / "webhook.db") as conn:
            conn.executescript("""
                CREATE TABLE messages (name TEXT, direction TEXT, timestamp REAL);
                CREATE TABLE wechat_routes (
                    route_id TEXT PRIMARY KEY, wx_account_id TEXT NOT NULL,
                    conversation_id TEXT NOT NULL,
                    conversation_type TEXT NOT NULL DEFAULT 'direct',
                    instance_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    UNIQUE(wx_account_id, conversation_id)
                );
                INSERT INTO wechat_routes VALUES ('old-route', 'same-account',
                    'same-chat', 'group', 'm1', 1, 1, 2);
            """)
        console._last_legacy_sync = 0
        console.configure(self.path, api_key="local-test-only")
        console._exec("INSERT INTO muse_instances VALUES ('m1','muse1号','one','active',0,1,1)")
        console._exec("INSERT INTO muse_instances VALUES ('m2','muse2号','two','active',0,1,1)")
        app = FastAPI()
        app.include_router(console.registry_router)
        self.client = TestClient(app, headers={"Authorization": "Bearer local-test-only"})

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def test_migration_idempotent_and_legacy(self):
        console._init_db()
        console._init_db()
        rows = self.client.get('/api/registry/routes').json()['routes']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['route_id'], 'old-route')
        self.assertEqual(rows[0]['platform'], 'wechat')
        self.assertEqual(rows[0]['created_at'], 1)
        result = self.client.post('/api/registry/resolve', json={
            'wx_account_id': 'same-account', 'conversation_id': 'same-chat'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['channel_id'], 'muse1号')

    def test_platform_isolation_and_filters(self):
        for platform in ['feishu', 'dingtalk', 'wecom', 'custom_im']:
            payload = dict(platform=platform, account_id='same-account',
                           conversation_id='same-chat', channel_id='muse2号')
            first = self.client.post('/api/registry/routes/bind', json=payload)
            self.assertEqual(first.status_code, 200, first.text)
            again = self.client.post('/api/registry/routes/bind', json=payload)
            self.assertEqual(first.json()['route']['route_id'], again.json()['route']['route_id'])
            for method in ['get', 'post']:
                result = getattr(self.client, method)('/api/registry/resolve', params={
                    'platform': platform, 'account_id': 'same-account', 'conversation_id': 'same-chat'})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()['channel_id'], 'muse2号')
            result = self.client.post('/api/registry/resolve', json=payload)
            self.assertEqual(result.json()['route']['platform'], platform)
            routes = self.client.get('/api/registry/routes', params={'platform': platform}).json()['routes']
            self.assertEqual(len(routes), 1)
            self.assertEqual(routes[0]['account_id'], 'same-account')
        self.assertEqual(len(self.client.get('/api/registry/routes').json()['routes']), 5)
        legacy = self.client.get('/api/registry/routes', params={'wx_account_id': 'same-account'}).json()['routes']
        self.assertEqual(len(legacy), 1)
        self.assertEqual(legacy[0]['platform'], 'wechat')
        self.assertEqual(self.client.get('/api/registry/resolve', params={
            'account_id': 'same-account', 'conversation_id': 'same-chat'}).json()['channel_id'], 'muse1号')

    def test_validation_disable_permissions(self):
        for payload in [
            dict(platform='../bad', account_id='bot', conversation_id='chat'),
            dict(account_id='one', wx_account_id='two', conversation_id='chat'),
            dict(account_id='', conversation_id='chat'),
        ]:
            result = self.client.post('/api/registry/routes/bind', json={**payload, 'channel_id': 'muse1号'})
            self.assertEqual(result.status_code, 400, result.text)
        self.assertEqual(self.client.patch('/api/registry/routes/old-route', json={'enabled': False}).status_code, 200)
        result = self.client.get('/api/registry/resolve', params={'wx_account_id':'same-account', 'conversation_id':'same-chat'})
        self.assertEqual(result.status_code, 404)
        with TestClient(self.client.app) as anonymous:
            self.assertIn(anonymous.post('/api/registry/routes/bind', json={
                'account_id':'bot', 'conversation_id':'chat', 'channel_id':'muse1号'}).status_code, [401, 403])


if __name__ == '__main__':
    unittest.main()
