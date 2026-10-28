# Task Manager — Build Spec

In-house tool for ~15 people across two companies (Piixel, Unwork). Each user belongs to one company.

## Stack
- Frontend: existing React + Vite + TS app at repo root (`src/`). Keep its UI design.
- Backend: `backend/` — FastAPI, Motor + Beanie, MongoDB Atlas. All routes under `/api/v1`.
- Already built (Phase 1): JWT auth (`/auth/login|refresh|me`), users + companies, file service (`/files`, `/files/link`, `/files/{id}/download`), notifications (`notify()` service, `/notifications`, WebSocket `/ws`), React auth, bell, toasts, `useConfirm()`.

## Working rules (every phase)
- Build each feature end-to-end: model → router → React screen wired to the real API. No mock data left.
- Every create/edit/delete: confirm dialog before (`useConfirm()`), success toast after, and `notify()` to everyone affected (live popup via WebSocket).
- Permission checks live in one helper: `can(user, action, subfolder)` in `backend/app/core/permissions.py`.
- Write pytest tests for each new router (use a separate test DB) and run them before finishing.
- Never return `password_hash`. Never commit `.env`.

## Roles
- Account roles: `admin`, `employee`, `client`.
- "Head" is NOT an account role. It is per subfolder (`subfolder.head_ids`). No company-wide head.

| Action | Admin | Head (own subfolder) | Employee | Client |
|---|---|---|---|---|
| Create/delete projects | Yes | No | No | No |
| Create first subfolder + appoint head | Yes | No | No | No |
| Create new subfolder in a project | Yes | Yes, if head of any subfolder in that project | No | No |
| Edit subfolder (name, members, heads) | Any | Only where head | No | No |
| View other subfolders in same project | Yes | Read-only | Read-only if project member | No |
| Add members / invite clients to groups | Yes | Yes | No | No |
| Assign tasks | Anyone | Members and other heads of their subfolder | Only themselves | No |
| Approve / request changes on tasks | Yes | Yes, when picked as approver | No | No |
| Create/edit deliverables | Yes | Yes | No | View only |
| Checklist add/tick/attach | Yes | Yes | Yes | No |
| Set daily status | Yes | Yes | Yes | No |
| View calendars + book slots | Yes | Yes | Yes | Book their project team only |
| Office board post | Yes | Yes | Yes | No |
| Chats | Only groups they're in | Groups they're in | Groups they're in | Invited groups |

## Projects → Subfolders
- All work (tasks, checklist, deliverables, chat group, members) lives in a subfolder, one level under a project.
- Admin creates project + first subfolder + appoints head(s).
- A head of any subfolder in a project can create sibling subfolders and appoint heads (may appoint themselves).
- Creating a subfolder gives no edit rights; only appointed heads (and admin) can edit it.
- Show a "Head" badge wherever a user is head.

## Features
- **Daily status** (replaces punch in/out — remove all punch/break/worked-hours UI and data): first login each day shows popup: present / wfh / half_day / leave. Changeable same day. Visible to everyone: dashboard "Today overview", profiles, calendars.
- **Calendar + booking:** anyone can open anyone's calendar from their profile. Shows daily status, task due dates, bookings. Employees (and later clients) book free slots on an employee's calendar; booked slots show busy to all. No overlapping bookings for the host.
- **Tasks:** create form = project → subfolder (filtered) → title, description (REQUIRED), assignee, due date, priority, assets (multiple files and/or URLs via file service, shown at top of task). Progress bar 0–100 (assignee sets; 100 on approval). Per-task timer start/stop. Reminder notification daily starting 2 days before due date until submitted.
- **Submission + review:** submit form = note, optional files, approver dropdown (heads of that subfolder). Head approves or requests changes with comments. Employee sees "Changes requested" section with all rounds, then resubmits. Admin can see all.
- **Checklist (per subfolder):** any member adds items, attaches files or URLs, edits/deletes their own; record who/when. No tick/done checkbox.
- **Deliverables (per subfolder, per month YYYY-MM):** head sets counts by type (e.g. 12 reels, 8 creatives), can add more, delete individual items, or remove a whole type. Each item moves through stages: writing → shoot_pending → shoot → editing → waiting_approval → approved → posted. Each item shows a stepper: completed stages with a green tick, current stage highlighted, remaining stages grey. Summary per type: done vs remaining. Visible in client portal.
- **Employees list (admin):** every column sortable (name, email, role, company, status, joined) plus search.
- **Office board:** anyone posts office issues/notices (coffee finished, AC broken). Highlighted card on everyone's dashboard, category emoji, reactions, seen-by count, resolved flag, history kept.
- **Chat:** WhatsApp-like groups (sent/delivered/seen ticks, seen-by, files, voice notes, forward, reactions, delete for me/everyone). Anyone creates groups. Clients join via invite link. Client approvals in chat: custom button labels, reject needs reason, reminder every 24h until answered.
- **Client portal:** chat groups, pending approvals, deliverables tracker, requirements list, book team slots.
- **Client requirements (per project):** a running record of what the client asked for. Client, admin and heads of any subfolder in that project can add a requirement: title, written details and/or attachments (any file: doc, pdf, excel, image, plus URLs via file service), optional subfolder tag. Project members can view. Author can edit their own; every edit keeps history. Only admin can delete. Shows author, role badge (Client/Head/Admin) and date; newest first, search + filter by subfolder. Visible in both client portal and the project page. New requirement → notify project heads and admin.
- **Emails (last):** via Google Workspace SMTP — task assigned, approval waiting, changes requested, client tagged, client approval pending.

## Phase 10 — Upgrades (better than ClickUp + Slack)

### 10a Chat upgrades
- **Rich composer** (one shared React component, TipTap): bold, italic, underline, strike, link, numbered/bullet list, quote, inline code, code block, emoji picker, @mention, attach (+), voice note. Stored as sanitized HTML; render safely.
- **@mentions:** type @ → member picker; mentioned users get a notification (in Focus mode it goes to the bell only, no popup) and the message is highlighted for them; "Mentions" filter.
- **Schedule send:** dropdown on send button: Tomorrow 9:00 AM, Next Monday 9:00 AM, Custom date/time. "Scheduled" list per group to edit/cancel. Backend job sends at the time (APScheduler), as a normal message from the author.
- **Search:** global search across my groups (text, sender, date range) + search inside a group; click result → jump to that message.
- **Media, links & docs:** group info panel with tabs like WhatsApp: Media (image/video grid), Docs (files), Links (URLs auto-detected from messages, with preview title).
- **Pinned messages** per group.

### 10b Focus mode
- User toggles Focus: 30 min / 1 h / 2 h / until tomorrow 9 AM / custom. While on: no popups, sounds or badges bump live; notifications still save to the bell. Ends automatically. Others see a 🌙 on the avatar and "In focus until 3:30 PM" in chat/profile. Stored on user: focus_until.

### 10c Tasks: rich text + Activity panel
- Task description and comments use the same rich composer.
- **Activity panel** on every task (right side, like ClickUp): 
  - **Mid-way changes** box: anyone with view access to the task can post a change request (rich text + files/URLs). Each shows author, time, reactions, replies, and a **Resolved** checkbox (assignee/head ticks it). Unresolved count shows as a badge on the task card.
  - **Comments** with @mentions, replies, reactions; a comment can be assigned to a person (shows "Assigned to X", Resolve).
  - **Auto activity log:** created, assigned, due date changed (from → to), progress changed, submitted, approved/changes requested, asset added.
- Same Mid-way changes box also at subfolder level (for changes not tied to one task).

### 10d Sidebar + create menu (ClickUp-style)
- Left sidebar tree: Home, My Day, Inbox (notifications), Chats, Calendar, Office board, then **Projects** → expandable project → subfolders. Collapse/expand remembered per user.
- "+" next to Projects (admin): new project. "⋯"/"+" on a project/subfolder opens a Create menu: Subfolder, Task, Checklist item, Deliverables, Requirement, Chat group (only options the user is allowed by permissions). Rename / delete / move via ⋯ (permissions apply).

### 10e Profile & settings menu (avatar menu)
- **Me:** My profile (name, photo, title, phone, bio), Change password, Notifications (per type on/off: tasks, reviews, chat, mentions, office board, bookings; sound on/off), Focus mode, Appearance (light/dark/system, compact/comfortable), Keyboard shortcuts, Help, Log out.
- **Admin only:** People (list + Invite), Companies, Workspace settings (company name, logo, working hours, holidays), Trash (restore deleted tasks/projects/subfolders/messages for 30 days, then purge), Export (CSV of tasks, status/attendance, deliverables), Security (active sessions, force logout).
- Everything deleted becomes soft-deleted (deleted_at, deleted_by) so Trash can restore it.

### 10f Extra ideas (optional, build only if chosen)
- **My Day:** one home screen per person: today's tasks + due soon, reviews waiting on me, unresolved mid-way changes on my tasks, mentions, my bookings, team status.
- **Message → task (CHOSEN — build in 10c):** ⋯ on any chat message → "Create task": opens the normal task form prefilled (title from first line, description = message text, message files as assets, project/subfolder from the group's linked subfolder if any). Task shows "Created from chat" link that jumps to the message; the message shows a small "Task created" chip linking to the task (live for everyone in the group). Assign rules still apply.
- **Workload view for heads:** each member's open tasks, due this week, status today; warn when assigning a task due on a day the person is on leave.
- **Ctrl+K command palette:** search and jump to any project, task, person, chat, or run actions.
- **Saved replies:** reusable message templates for common client updates.
- **Installable app (PWA)** with push notifications on phones.

## Collections
| Collection | Key fields |
|---|---|
| companies | name |
| users | name, email, password_hash, role, company_id, avatar_url, is_active, created_at |
| files | owner_id, name, mime, size, kind (upload/link), storage_key, url, created_at |
| notifications | user_id, type, title, body, link, actor_id, read, created_at |
| daily_status | user_id, date (YYYY-MM-DD), status, set_at — unique (user_id, date) |
| bookings | host_user_id, booked_by, start, end, title, note, created_at |
| projects | name, company_id, client_ids, created_by |
| subfolders | project_id, name, head_ids, member_ids, created_by |
| tasks | subfolder_id, project_id, title, description, assignee_id, created_by, due_date, priority, status (todo/in_progress/submitted/changes_requested/approved), progress, asset_ids, total_seconds |
| time_logs | task_id, user_id, started_at, ended_at, seconds |
| task_reviews | task_id, round, submitted_by, approver_id, note, file_ids, decision (pending/approved/changes_requested), comments, decided_at |
| checklist_items | subfolder_id, text, done, done_by, done_at, attachments, created_by |
| deliverable_plans | subfolder_id, month, items[{type, number, title, stage, updated_by, updated_at}] |
| office_posts | author_id, text, category, emoji, reactions, seen_by, resolved, created_at |
| chat_groups | name, member_ids, client_ids, subfolder_id, created_by |
| messages | group_id, sender_id, type, body, file_id, reply_to, forwarded_from, reactions, delivered_to, seen_by, deleted_for, deleted_for_all |
| client_approvals | message_id, group_id, question, approve_label, reject_label, status, reason, answered_by, next_reminder_at |
| invites | group_id, token, created_by, expires_at, used_by |
| scheduled_messages | group_id, author_id, body_html, file_ids, send_at, status (scheduled/sent/cancelled) |
| task_activity | task_id or subfolder_id, kind (change_request/comment/log), body_html, file_ids, author_id, assigned_to, resolved, resolved_by, reactions, parent_id, created_at |
| (users extra fields) | title, phone, bio, focus_until, settings{theme, density, notif_prefs, sound}, sidebar_state |
| requirements | project_id, subfolder_id (optional), title, details, attachment_ids, created_by, history[{details, attachment_ids, edited_by, edited_at}], created_at |

## Phases
1. DONE — setup, auth, users, files, notifications, bell/toasts/confirm.
2. Daily status + login popup + Today overview + calendars + bookings; remove punch/break.
3. Projects, subfolders, heads, members, permissions helper; project → subfolder UI, head badges.
4. Tasks: create form, assets, progress bars, timers, due-date reminders (APScheduler).
5. Submission + head review rounds; approver dropdown, review inbox, Changes requested section.
6. Checklist + deliverables tabs in subfolder.
7. Office board page + dashboard card.
8. Chat, invites, client approvals + 24h reminders, client portal.
10. Upgrades (see Phase 10 section), built as 10a–10f.
11a. DONE — Google Calendar (Piixel) via reusable integrations module; same settings for all roles.
