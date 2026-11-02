from app.services.notify import notify


async def test_notifications_carry_who_triggered_them(client, alice, bob):
    await notify([alice.user.id], "mention", "Bob mentioned you", "in a task", "/app/tasks/1", actor_id=bob.user.id)
    await notify([alice.user.id], "task_due", "Task due today", "Write the brief")  # raised by the app: no person
    r = await client.get("/notifications", headers=alice.headers)
    assert r.status_code == 200
    by_type = {n["type"]: n for n in r.json()["items"]}
    assert by_type["mention"]["actor"]["name"] == "Bob Employee" and by_type["mention"]["actor"]["id"] == bob.id
    assert by_type["task_due"]["actor"] is None
    assert not any(ch for n in r.json()["items"] for ch in n["title"] if ord(ch) > 0x2000)  # no emoji in notification titles
