import secrets
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.core.timeutil import as_utc
from app.models import Invite, Project, Subfolder, User
from app.models.chat import ChatGroup
from app.schemas.invite import InviteOut, InvitePreview, JoinOut, SignupBody, SignupOut
from app.services.chat import everyone, member_group, notify_members, publish
from app.services.projects import brief, load_users

router = APIRouter(tags=["invites"])


# --- Making and revoking links (team) -------------------------------------------------------------------
async def _manageable_group(group_id: PydanticObjectId, user: User) -> ChatGroup:
    """The group, if you are in it and may invite clients: admins, and heads of its linked subfolder."""
    group = await member_group(group_id, user)
    sub = await Subfolder.get(group.subfolder_id) if group.subfolder_id else None
    require(user, "chat.invite", sub)
    return group


async def _outs(invites: list[Invite]) -> list[InviteOut]:
    people = await load_users(i.created_by for i in invites)
    return [
        InviteOut(
            id=i.id,
            group_id=i.group_id,
            token=i.token,
            expires_at=as_utc(i.expires_at),
            created_at=as_utc(i.created_at),
            created_by=brief(people[i.created_by]) if i.created_by in people else None,
            used_count=len(i.used_by),
        )
        for i in invites
    ]


def _active(i: Invite) -> bool:
    return not i.revoked and as_utc(i.expires_at) > datetime.now(timezone.utc)


@router.post("/chat/groups/{group_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> InviteOut:
    """A link that lets clients join this group for the next 7 days. Anyone who has it can use it, so share it carefully."""
    group = await _manageable_group(group_id, user)
    invite = await Invite(group_id=group.id, token=secrets.token_urlsafe(24), created_by=user.id).insert()
    return (await _outs([invite]))[0]


@router.get("/chat/groups/{group_id}/invites", response_model=list[InviteOut])
async def list_invites(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[InviteOut]:
    """The links that still work (not revoked, not expired), newest first."""
    group = await _manageable_group(group_id, user)
    invites = await Invite.find(Invite.group_id == group.id).sort("-created_at").to_list()
    return await _outs([i for i in invites if _active(i)])


@router.delete("/chat/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(invite_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Kill a link. Clients who already joined stay in the group."""
    invite = await Invite.get(invite_id)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found")
    await _manageable_group(invite.group_id, user)
    if not invite.revoked:
        await Invite.find({"_id": invite.id}).update({"$set": {"revoked": True}})


# --- Using a link (clients) -------------------------------------------------------------------------------
async def _live_invite(token: str) -> tuple[Invite, ChatGroup]:
    invite = await Invite.find_one(Invite.token == token)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invite link is not valid")
    if invite.revoked:
        raise HTTPException(status.HTTP_410_GONE, "This invite link was revoked")
    if as_utc(invite.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "This invite link has expired")
    group = await ChatGroup.get(invite.group_id)
    if group is None:
        raise HTTPException(status.HTTP_410_GONE, "This group no longer exists")
    return invite, group


async def _project_of(group: ChatGroup) -> Project | None:
    sub = await Subfolder.get(group.subfolder_id) if group.subfolder_id else None
    return await Project.get(sub.project_id) if sub else None


async def join_group(group: ChatGroup, invite: Invite, client: User) -> None:
    """Put a client in the group (once), and on the project if the group is linked to a subfolder."""
    already = client.id in group.client_ids
    if not already:
        await ChatGroup.find({"_id": group.id}).update(
            {"$addToSet": {"client_ids": client.id}, "$set": {f"joined_at.{client.id}": datetime.now(timezone.utc)}}
        )
    await Invite.find({"_id": invite.id}).update({"$addToSet": {"used_by": client.id}})
    project = await _project_of(group)
    if project:
        await Project.find({"_id": project.id}).update({"$addToSet": {"client_ids": client.id}})
    if not already:
        group = await ChatGroup.get(group.id)
        await notify_members(
            group.member_ids,
            client,
            type="chat_client_joined",
            title=f"{client.name} joined {group.name}",
            body=f"{client.name} joined “{group.name}” with an invite link.",
            group_id=group.id,
        )
        await publish(everyone(group), "chat:group", {"group_id": str(group.id)})


@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(token: str) -> InvitePreview:
    """Public: what the link is for, so the join page can say so before anyone signs in."""
    invite, group = await _live_invite(token)
    inviter = await User.get(invite.created_by)
    project = await _project_of(group)
    return InvitePreview(
        group_name=group.name,
        invited_by=inviter.name if inviter else None,
        project_name=project.name if project else None,
        expires_at=as_utc(invite.expires_at),
    )


@router.post("/invites/{token}/signup", response_model=SignupOut, status_code=status.HTTP_201_CREATED)
async def signup_with_invite(token: str, body: SignupBody) -> SignupOut:
    """New client: create the account (role client) and join the group in one step."""
    invite, group = await _live_invite(token)
    email = body.email.lower()
    if await User.find_one(User.email == email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Log in instead.")
    project = await _project_of(group)
    user = User(name=body.name, email=email, password_hash=hash_password(body.password), role="client", company_id=project.company_id if project else None)
    try:
        await user.insert()
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Log in instead.")
    await join_group(group, invite, user)
    uid = str(user.id)
    return SignupOut(access_token=create_access_token(uid), refresh_token=create_refresh_token(uid), group_id=group.id)


@router.post("/invites/{token}/join", response_model=JoinOut)
async def join_with_invite(token: str, user: User = Depends(get_current_user)) -> JoinOut:
    """Existing client (logged in): join the group. Joining twice is harmless."""
    invite, group = await _live_invite(token)
    if user.role != "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invite links are for clients. Team members are added to groups from inside the chat.")
    await join_group(group, invite, user)
    return JoinOut(group_id=group.id)
