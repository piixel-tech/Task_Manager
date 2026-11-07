import json

import pytest
from pywebpush import WebPushException

from app.core.config import settings
from app.models import PushSubscription
from app.services import push as push_service
from app.services.notify import notify
from app.services.push import wait_for_pushes
from app.services.ws_manager import manager

SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "key-p256dh", "auth": "key-auth"}}


@pytest.fixture
def vapid(monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "public-key")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "private-key")


@pytest.fixture
def sent(monkeypatch):
    """Replaces the network call; `sent` collects (endpoint, payload) and `fail_with` makes the push service refuse."""
    class Calls(list):
        fail_with = None

    calls = Calls()

    def fake_webpush(subscription_info, data, **kwargs):
        if calls.fail_with:
            class R:
                status_code = calls.fail_with

            raise WebPushException("gone", response=R())
        calls.append((subscription_info["endpoint"], json.loads(data)))

    monkeypatch.setattr(push_service, "webpush", fake_webpush)
    return calls


async def test_public_key_is_off_until_the_server_has_keys(client, alice, monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "")
    r = await client.get("/push/public-key", headers=alice.headers)
    assert r.json() == {"enabled": False, "public_key": None}
    assert (await client.post("/push/subscribe", json=SUB, headers=alice.headers)).status_code == 503


async def test_subscribing_saves_it_per_user_and_moves_it_to_the_next_person_on_that_browser(client, alice, bob, vapid):
    assert (await client.get("/push/public-key", headers=alice.headers)).json() == {"enabled": True, "public_key": "public-key"}
    assert (await client.post("/push/subscribe", json=SUB, headers=alice.headers)).status_code == 204
    assert (await client.post("/push/subscribe", json=SUB, headers=alice.headers)).status_code == 204  # idempotent
    subs = await PushSubscription.find_all().to_list()
    assert len(subs) == 1 and subs[0].user_id == alice.user.id
    await client.post("/push/subscribe", json=SUB, headers=bob.headers)
    subs = await PushSubscription.find_all().to_list()
    assert len(subs) == 1 and subs[0].user_id == bob.user.id


async def test_only_the_owner_can_unsubscribe(client, alice, bob, vapid):
    await client.post("/push/subscribe", json=SUB, headers=alice.headers)
    await client.post("/push/unsubscribe", json={"endpoint": SUB["endpoint"]}, headers=bob.headers)
    assert await PushSubscription.find_all().count() == 1
    assert (await client.post("/push/unsubscribe", json={"endpoint": SUB["endpoint"]}, headers=alice.headers)).status_code == 204
    assert await PushSubscription.find_all().count() == 0


async def test_notify_pushes_to_a_person_whose_app_is_closed(client, alice, vapid, sent):
    await client.post("/push/subscribe", json=SUB, headers=alice.headers)
    await notify([alice.user.id], "task_due", "Task due today", "Write the brief", "/app/tasks/1")
    await wait_for_pushes()
    assert len(sent) == 1
    endpoint, payload = sent[0]
    assert endpoint == SUB["endpoint"]
    assert payload["title"] == "Task due today" and payload["body"] == "Write the brief" and payload["url"] == "/app/tasks/1"


async def test_notify_does_not_push_when_the_app_is_open(client, alice, vapid, sent):
    await client.post("/push/subscribe", json=SUB, headers=alice.headers)
    class OpenTab:
        async def send_json(self, message):
            pass

    manager.connect(alice.user.id, OpenTab())  # type: ignore[arg-type]
    try:
        await notify([alice.user.id], "task_due", "Task due today")
        await wait_for_pushes()
    finally:
        manager._connections.pop(alice.user.id, None)
    assert sent == []


async def test_notify_still_works_without_vapid_keys(client, alice, monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
    docs = await notify([alice.user.id], "task_due", "Task due today")
    assert len(docs) == 1


async def test_a_gone_subscription_is_removed(client, alice, vapid, sent):
    await client.post("/push/subscribe", json=SUB, headers=alice.headers)
    sent.fail_with = 410
    await notify([alice.user.id], "task_due", "Task due today")
    await wait_for_pushes()
    assert await PushSubscription.find_all().count() == 0


async def test_a_temporary_failure_keeps_the_subscription(client, alice, vapid, sent):
    await client.post("/push/subscribe", json=SUB, headers=alice.headers)
    sent.fail_with = 500
    await notify([alice.user.id], "task_due", "Task due today")
    await wait_for_pushes()
    assert await PushSubscription.find_all().count() == 1
