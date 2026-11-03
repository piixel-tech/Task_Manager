"""GET /users/team: the whole active team of every company for the booking guest picker."""
from app.models import Company


async def make_company(name: str):
    return await Company(name=name).insert()


async def test_lists_everyone_active_from_every_company_without_a_cut_off(client, make_user):
    piixel, unwork = await make_company("Piixel"), await make_company("Unwork")
    me = await make_user("employee", "Me Myself", company_id=piixel.id)
    for i in range(60):  # far more than any page size
        await make_user("employee", f"Pia {i:02d}", company_id=piixel.id)
        await make_user("employee" if i % 2 else "admin", f"Una {i:02d}", company_id=unwork.id, title="Editor")
    r = await client.get("/users/team", headers=me.headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 120  # everyone except the caller
    assert {row["company_name"] for row in rows} == {"Piixel", "Unwork"}
    assert all(row["id"] != me.id for row in rows)
    assert next(row for row in rows if row["name"] == "Una 01")["title"] == "Editor"


async def test_ordered_by_company_then_name_with_the_companyless_last(client, make_user):
    piixel, unwork = await make_company("Piixel"), await make_company("Unwork")
    me = await make_user("employee", "Me Myself")
    await make_user("employee", "Zed", company_id=piixel.id)
    await make_user("employee", "Amy", company_id=unwork.id)
    await make_user("employee", "Bea", company_id=piixel.id)
    await make_user("employee", "Cam")
    rows = (await client.get("/users/team", headers=me.headers)).json()
    assert [(r["company_name"], r["name"]) for r in rows] == [("Piixel", "Bea"), ("Piixel", "Zed"), ("Unwork", "Amy"), ("", "Cam")]


async def test_leaves_out_clients_and_deactivated_people_and_is_closed_to_clients(client, make_user):
    me = await make_user("admin", "Ada Admin")
    await make_user("client", "Cleo Client")
    await make_user("employee", "Gone Gary", is_active=False)
    await make_user("employee", "Eve Employee")
    assert [r["name"] for r in (await client.get("/users/team", headers=me.headers)).json()] == ["Eve Employee"]
    cleo = await make_user("client", "Other Client")
    assert (await client.get("/users/team", headers=cleo.headers)).status_code == 403
    assert (await client.get("/users/team")).status_code == 401
