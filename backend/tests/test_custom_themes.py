from app.services import festivals

GOOD = {"name": "Ocean", "primary": "#2563eb", "accent": "#f59e0b", "bg": "#eff6ff"}


async def settings_of(client, who):
    return (await client.get("/auth/me", headers=who.headers)).json()["settings"]


async def test_preview_generates_readable_light_and_dark(client, alice):
    r = await client.post("/themes/preview", json={k: GOOD[k] for k in ("primary", "accent", "bg")}, headers=alice.headers)
    assert r.status_code == 200
    L, D = r.json()["light"], r.json()["dark"]
    assert set(L) == set(festivals.KEYS) == set(D)
    assert festivals.contrast(L["text"], L["bg"]) >= 7 and festivals.contrast(L["primary"], L["surface"]) >= 4.5 and festivals.contrast(L["text"], L["accent"]) >= 4.5
    assert festivals.contrast(D["text"], D["bg"]) >= 7 and festivals.contrast(D["primary"], D["surface"]) >= 4.5 and festivals.contrast(D["bg"], D["accent"]) >= 4.5


async def test_unreadable_colours_are_adjusted_and_reported(client, alice):
    r = await client.post("/themes/preview", json={"primary": "#ffee00", "accent": "#101010", "bg": "#ffffff"}, headers=alice.headers)
    body = r.json()
    assert body["warnings"]
    assert festivals.contrast(body["light"]["primary"], body["light"]["surface"]) >= 4.5
    assert festivals.contrast(body["light"]["text"], body["light"]["accent"]) >= 4.5
    assert (await client.post("/themes/preview", json={"primary": "blue", "accent": "#f59e0b", "bg": "#fff"}, headers=alice.headers)).status_code == 422


async def test_create_edit_delete_and_the_limit_of_five(client, alice):
    ids = []
    for i in range(5):
        r = await client.post("/themes", json={**GOOD, "name": f"T{i}"}, headers=alice.headers)
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    r = await client.post("/themes", json=GOOD, headers=alice.headers)
    assert r.status_code == 422 and "up to 5" in r.json()["detail"]

    r = await client.put(f"/themes/{ids[0]}", json={**GOOD, "name": "Renamed", "primary": "#16a34a"}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["name"] == "Renamed" and r.json()["light"]["primary"] != GOOD["primary"]
    assert [t["name"] for t in (await client.get("/themes", headers=alice.headers)).json()["mine"]][0] == "Renamed"

    assert (await client.delete(f"/themes/{ids[1]}", headers=alice.headers)).status_code == 204
    assert (await client.delete(f"/themes/{ids[1]}", headers=alice.headers)).status_code == 404
    assert (await client.post("/themes", json=GOOD, headers=alice.headers)).status_code == 201  # room again


async def test_only_the_owner_can_change_a_theme(client, alice, bob):
    t = (await client.post("/themes", json=GOOD, headers=alice.headers)).json()
    assert (await client.put(f"/themes/{t['id']}", json=GOOD, headers=bob.headers)).status_code == 404
    assert (await client.delete(f"/themes/{t['id']}", headers=bob.headers)).status_code == 404


async def test_using_a_custom_theme_is_saved_on_the_account(client, alice, bob):
    t = (await client.post("/themes", json=GOOD, headers=alice.headers)).json()
    body = {**(await settings_of(client, alice)), "palette": f"custom:{t['id']}"}
    assert (await client.put("/me/settings", json=body, headers=alice.headers)).status_code == 200
    assert (await settings_of(client, alice))["palette"] == f"custom:{t['id']}"
    # someone else can't use a theme that isn't shared with them
    r = await client.put("/me/settings", json={**(await settings_of(client, bob)), "palette": f"custom:{t['id']}"}, headers=bob.headers)
    assert r.status_code == 422
    assert (await client.put("/me/settings", json={**body, "palette": "custom:nonsense"}, headers=alice.headers)).status_code == 422


async def test_shared_themes_show_for_the_team_with_the_creators_name(client, alice, bob, admin):
    mine = (await client.post("/themes", json={**GOOD, "name": "Private"}, headers=alice.headers)).json()
    shared = (await client.post("/themes", json={**GOOD, "name": "For all", "shared": True}, headers=alice.headers)).json()
    for who in (bob, admin):
        lst = (await client.get("/themes", headers=who.headers)).json()
        assert [t["name"] for t in lst["team"]] == ["For all"] and lst["team"][0]["owner_name"] == "Alice Employee" and not lst["team"][0]["mine"]
    assert (await client.get("/themes", headers=alice.headers)).json()["team"] == []  # your own show under "mine"

    r = await client.put("/me/settings", json={**(await settings_of(client, bob)), "palette": f"custom:{shared['id']}"}, headers=bob.headers)
    assert r.status_code == 200
    # unsharing puts the people using it back on purple; the owner keeps their own
    await client.put("/me/settings", json={**(await settings_of(client, alice)), "palette": f"custom:{shared['id']}"}, headers=alice.headers)
    await client.put(f"/themes/{shared['id']}", json={**GOOD, "name": "For all", "shared": False}, headers=alice.headers)
    assert (await settings_of(client, bob))["palette"] == "purple"
    assert (await settings_of(client, alice))["palette"] == f"custom:{shared['id']}"
    assert (await client.get("/themes", headers=bob.headers)).json()["team"] == []
    assert mine["id"]


async def test_deleting_a_theme_moves_everyone_using_it_back_to_purple(client, alice, bob):
    t = (await client.post("/themes", json={**GOOD, "shared": True}, headers=alice.headers)).json()
    for who in (alice, bob):
        await client.put("/me/settings", json={**(await settings_of(client, who)), "palette": f"custom:{t['id']}"}, headers=who.headers)
    assert (await client.delete(f"/themes/{t['id']}", headers=alice.headers)).status_code == 204
    assert (await settings_of(client, alice))["palette"] == "purple" and (await settings_of(client, bob))["palette"] == "purple"


async def test_clients_only_see_themes_shared_by_their_own_team(client, alice, client_user):
    await client.post("/themes", json={**GOOD, "shared": True}, headers=alice.headers)
    assert (await client.get("/themes", headers=client_user.headers)).json()["team"] == []
    r = await client.post("/themes", json={**GOOD, "name": "Client's own"}, headers=client_user.headers)
    assert r.status_code == 201  # clients can build their own
