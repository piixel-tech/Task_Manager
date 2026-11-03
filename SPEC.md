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
- **Deliverables (per subfolder, per month YYYY-MM):** head sets counts by type (e.g. 12 reels, 8 creatives), can add more, delete individual items, or remove a whole type. Each item moves through the subfolder's stages (see Phase 14: editable; a new subfolder starts with Shooted → Editing → Reel → Posted, and subfolders made before that keep writing → shoot pending → shoot → editing → waiting approval → approved → posted until their stages are edited). The last stage is the finish line (done). Each item shows a stepper: completed stages with a green tick, current stage highlighted, remaining stages grey. Summary per type: done vs remaining. Visible in client portal.
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

## Phase 11b/11c — Google Drive, Docs, Sheets, Meet and booking invites
Extends the 11a Google connection (same OAuth app per company, same per-user connection).

- **One connection, one button.** Settings > Connected apps has a single **Connect to Google** that asks for every scope at once: `calendar.events`, `calendar.calendarlist.readonly` (Calendar, and Meet through its events), `drive.file` (files Task Manager creates) and `drive.readonly` (lets our own file browser list the person's Drive). One status (Connected / Needs reconnecting); there are no per-service buttons. Someone connected before Drive was added stays connected and sees one "Reconnect to Google once to turn on Drive, Docs & Sheets" prompt (`config.missing`); Drive actions answer `missing_scope` until then. Reconnecting keeps the same Google account (`login_hint`). If Google's screen is left partly unticked, Calendar still works and the app says what was not allowed (`result=partial`); with Calendar unticked the connection is refused (a working connection is never revoked by a failed attempt). A refresh that reports fewer scopes is remembered.
- **Drive-like file browser (ours, not Google's Picker).** `GET /integrations/google/drive/files?view=my|shared|recent|starred&parent=&q=&kind=any|document|spreadsheet&page_token=` lists the person's own Drive (read-only, 50 per page, folders first). The modal has a left nav (My Drive, Shared with me, Recent, Starred), search (debounced, looks through the whole view), grid/list toggle (remembered per browser), folder navigation with breadcrumbs, file-type icons and Google thumbnails, multi-select that survives navigation, and Load more. Opened from "Google Doc" or "Google Sheet" it lists only that type (plus folders so files can be found). Glass modal, theme tokens and the app's motion; no external script is loaded and no access token is sent to the browser.
- **One attach menu everywhere.** `AttachMenu` (src/features/google) is the only attach control: Upload from device, Google Drive, Google Doc, Google Sheet, Create new (New Google Doc / New Google Sheet). It is used by the task form assets, task page, chat composer, checklist items, mid-way changes, requirements and review submissions (all through `AssetPicker`), and the subfolder Google files card (Google items only). Clients get only the upload.
- **Attaching.** Only a link and facts are stored (name, Google mime type, kind, icon, modified time); the bytes stay in Drive. The browser sends just the file id: the server asks Google for the real name and address, so nothing can be forged. A Drive file is an ordinary `link` file with a `drive` block, so every screen that shows links already works; in chat it is sent as a file card (never as a photo). Docs, Sheets, Slides and other Drive files open in an inline preview dialog (Google's `/preview` embed, only for people Google lets in) with "Open in Google".
- **New Google Doc / Sheet.** In tasks, subfolders and every attach menu: creates an empty file in the person's own Drive (title optional) and links it. Files stay private to the creator until they share them in Google (the dialog says so).
- **Subfolders.** A "Google files" card on the subfolder overview. Members and admins add and remove, everyone who can open the subfolder sees the links; adding or removing notifies the subfolder's people. Removing only unlinks.
- **Meet.** Every booking gets a Google Meet: the first connected person's Google event is created with `conferenceData` (fixed request id, so a retry can't make a second Meet); everyone else's copy gets the same link as its location. If an account can't make Meet links the event is still written. The link is stored on the booking (`meet_url`) and shown as **Join Meet** to the host, the booker and admins; others see "Busy". **Start Meet** in the chat header makes an instant Meet (a one-hour event starting now on the sender's calendar, tagged so it is never pulled back in) and posts the link to the group. Team members only.
- **Booking from someone else's calendar.** Opening another person's calendar (or "Open calendar" from their profile, which lands on `#book` and scrolls straight to the free slots) shows a small, quiet **Scroll to book ↓** label at the bottom of the screen with a gently bouncing arrow (no bounce for reduced-motion users). It disappears as soon as the page is scrolled (any scrolling container), comes back on another person's calendar, is hidden when there is nothing to book (past day, on leave, no free time) and scrolls to the slots when clicked. Each free start time is a button ("Book 09:30"); a click opens the booking dialog with that day, time and length already filled in. The booking form is a normal dialog (it used to be a floating panel that could open off-screen).
- **Guests: two fields.** **Add members** is a searchable multi-select of the whole team. It loads from `GET /users/team`: every active admin and employee of every company (Piixel and Unwork), no paging or cut-off, never clients, never the caller, ordered by company then name (people without a company last, under "Other"). The list is grouped under company headers with counts (sticky while scrolling); each row shows avatar, name and job role (the profile job title, or the account role when there is none); chosen people become chips; search matches name or role. Only the host, who already has the booking, is left out of the list. **Invite by email** takes any address: type it and press Enter (or comma) to add it as a chip; the format is checked first (`name@company.com`), duplicates are refused, Backspace on an empty box removes the last chip, and Enter never submits the booking. Both lists become Google Calendar `attendees` of one event that also carries the Meet (`conferenceData`) and is created with `sendUpdates=all`, so Google emails every guest the invitation and it lands in their Google Calendar. The invitation comes from the event that owns the Meet (the host's, or the booker's when the host is not connected), so a guest is invited once; the host and booker are never added as guests, and a teammate picked and also typed by email is one guest. Cancelling a booking also uses `sendUpdates=all`. Rules: max 20 guests; addresses are validated and lower-cased; teammates must be active staff; clients can't add guests; saving with guests is refused with a message to connect Google if neither the host nor the booker has it connected. Teammate guests also get an in-app "Invited" notification. Guests are visible only to the people in the meeting and admins. (`GET /daily-status` rows also carry the person's `title`.)
- **Expired or revoked tokens.** Every Drive/Docs/Meet call refreshes the access token first and retries once if Google rejects it. A dead login marks the connection "needs reconnect" (Settings shows Reconnect, the person is told once) and the action answers 409 `{code: reconnect | not_connected | missing_scope, message, service}`; the UI shows a toast that opens Connected apps. A file Google won't show us says "pick it again".
- **Progress toast.** One shared component (`ProgressToastHost`, mounted once next to the other hosts; jobs are started with `runJob` in `services/jobs.ts`, state in `useJobsStore`): a glass card floating at the bottom right, one per job, stacked, with spring enter/exit animations (plain fades for reduced motion). Each card shows a title ("Uploading 3 files", "Assigning task"), "75% · 4 seconds left" (the estimate comes from the speed so far, excluding time spent paused; "Estimating time…" for the first second), and a thin progress bar along its bottom edge in the theme accent (`--tm-accent`; red on failure, green when done). Buttons: **Pause/Resume**, **Cancel**, **Expand/Collapse** (expanded shows every file with its own percent, Waiting, a tick or Failed) and a **⋮** menu (Retry, Cancel or Dismiss, Copy details). When a job finishes the card shows a tick and hides after 3 seconds. When it fails it shows the error and **Retry** (only unfinished files are tried again); the code that started the job keeps waiting, so the dialog or form that asked stays busy until the person retries (it then carries on as if nothing went wrong), dismisses (it receives the original error) or cancels (silently).
  - **Used for:** every file upload (`assetApi.upload`: attachments in tasks, chat, checklist, mid-way changes, requirements and submissions, voice notes, avatars, office photos, logos) uploaded one file at a time so each has real progress; adding files from Drive (progress by file; pauses between files); creating a Google Doc or Sheet; and creating a task, assigning a task (a task edit that changes the assignee) and submitting a task for review.
  - **Pause** on an upload stops the file in flight and starts it again from the beginning after Resume (a browser cannot freeze a request half-way). Single actions (assign, create, submit) have no pause, and show a moving bar with "Working…" instead of an invented percentage, because they have no real progress to report. Cancel on an action stops waiting for it; a request that already reached the server may still complete. If an upload is given up (cancelled or dismissed), the files already uploaded in that batch are removed again.
- **Restricted scope.** `drive.readonly` is a Google *restricted* scope. An **Internal** Workspace app can use it freely; an **External** app must pass Google's OAuth verification (and a security assessment) before more than 100 test users can use it, and refresh tokens of apps in *Testing* last 7 days. See backend/README.md.
- **Not done / by design.** Drive files are not shared automatically (sharing sends Google emails to people); creators share in Google. Clients have no Google connection, so they can't attach from Drive. The client meetings page has no list of bookings, and dashboard meeting rows don't show Join Meet yet (the calendar page does). Guests are not shown a busy/free check.

## Phase 12 — Visual polish (look only, no behaviour removed)

All of it is shared components in the current theme colours (`--tm-*`), so admin, employee and client get the same thing. Every animation honours `prefers-reduced-motion`.

- **Hold to Delete** (`components/ui/HoldToDelete.tsx`, used by `ConfirmDialog`, so it applies everywhere something is deleted). The delete confirm shows Cancel and a pill with a trash icon and "Hold to Delete". Holding it (mouse, touch, or Enter / Space) for about 1.2 s sweeps a soft red fill left to right; letting go early slides the fill back and nothing happens. When the fill completes the pill shakes once, then the delete runs (through the same `useConfirm` action, success toast and notifications as before). A confirm counts as a delete when it is `danger` and its label or title says delete / remove ("Hold to Delete task", "Hold to Remove"); other dangerous confirms (sign out, request changes, cancel booking…) keep the plain red button. Reduced motion: no shake, the fill snaps back.
- **Deliverables as a zigzag timeline** (subfolder, `ZigzagTimeline` + `DeliverableCard`). Each type's items are small numbered cards (01, 02…) with a coloured pin on top (grey before work starts, theme colour while in progress, green when done), alternating left and right and joined by dashed curved connectors. A card shows the title, a one-line description (the type and the stage it is in; deliverables have no free-text description), who changed it last, the stage ticks with a progress bar, the stage picker, "Show stages" and, for heads, the delete bin. Cards fade and float in as they scroll into view, lift slightly on hover, and a finished card glows in the theme accent. On phones it is a single column with straight dashed connectors. The client's read-only deliverables view is unchanged.
- **Focus mode toggle** (top bar, `FocusMenu` + `FocusToggle`). The moon button is now a dark pill switch: switched on, the knob slides across, the moon glows, tiny stars twinkle, a soft light beam spreads down from the switch, and the rest of the page dims and blurs slightly (the existing Focus veil gets a 1.5 px blur; the top bar stays above it so the switch keeps glowing). Switching off runs it all in reverse. Clicking still opens the same panel (pick how long, or End focus), because Focus mode has a duration.
- **Download button** (`components/ui/DownloadButton.tsx`; `AssetDownloadButton` for uploaded files). A rounded-square button with a download icon. On click it morphs into a round progress ring that fills with the real download progress (a spinning ring when the server does not send the size), then into a filled check circle, and returns to the download icon after 2 seconds. On failure it shows a red "!" (and the usual error toast); clicking again retries. Used for every uploaded file or asset download: task assets, requirement attachments, review submissions, activity files, chat files and the admin CSV exports. Links and Google Drive files still open in a tab.

## Phase 13 — Send animation, booking confirmation, floating scrollbar (look only)

Shared components in the current theme colours, the same for admin, employee and client. All of it honours `prefers-reduced-motion`.

- **Send button** (`components/ui/SendButton.tsx`, used by `ConfirmDialog` when a confirm has `send: true`). On click the plane icon flies off along a curved dashed trail, the button morphs into a pill with a check circle and "Sent!", and goes back to normal after 1.5 s. On failure it shakes and reads "Failed · Retry" (a click retries). The confirm dialog stays open about 1.2 s on "Sent!" before it closes. Used for: task submit, approval requests, booking save, client meeting booking and chat invite links. Deliverables have no submit action (their stage is changed with a picker), so nothing was changed there.
- **Chat send** (`SendFlight`, in the composer): a small plane leaves the send button in about 300 ms while the message bubble slides in (the existing `tm-msg-in`). It never delays sending.
- **Booking confirmed popup** (`BookingConfirmedModal`, Calendar). After a booking is saved: a confetti burst, a ticket-style card that flips in (date in large type, time, length, guest avatars, the Meet link with a copy button), a check that draws itself, and the buttons Open in Google Calendar (your calendar on that day), Join Meet and Done. It closes with a scale-out.
- **Floating scrollbar: removed.** The custom pill on the right (up-arrow, thumb, clock) is gone from the page and from dialogs; the browser's normal scrollbar is back everywhere. The Folders panel on the left still hides its own scrollbar (`scrollbar-none`, it still scrolls), and the left rail is unchanged.

## Phase 14 — Deliverable dropdowns and editable stages

- **Each type is a dropdown too.** In a subfolder's Deliverables, every type section (Creatives, Reels...) starts collapsed and shows only its header: the type name, "1 done / 4 remaining", "1 of 5 done", a small progress bar and a chevron. **Add more** and **Remove type** stay in the header (heads and admins). Opening it slides out that type's items (Creatives 1, Creatives 2...) exactly as before. Several types can be open at once; reduced motion opens and closes instantly (`TypeSection` in `DeliverablesTab.tsx`).
- **Each deliverable is its own dropdown.** The Deliverables section in a subfolder is always visible (there is no dropdown around it). Every deliverable card (Creatives 1, Reels 2…) starts collapsed and shows the coloured pin, its number (01, 02…), its name, its current stage, a small progress bar and a chevron. Clicking it opens it smoothly to the stage ticks, a line saying where it is and who changed it last, the stage picker, "Show stages" (the labelled stepper) and, for heads and admins, **Edit stages** and delete. Several can be open at once. Reduced motion: they open and close instantly. Deliverables have no attachments yet, so there is nothing to attach in the opened card.
- **Edit stages** (button inside an opened deliverable; admins and the heads of that subfolder only; members, clients and other subfolders cannot). It edits the stages of the whole subfolder, not just that deliverable. A dialog lists the stages in order: rename by typing, **Add stage**, drag the grip to reorder, and delete with **Hold to Delete** (the shared pill). Between 2 and 12 stages, names 1-30 characters and unique; the last stage is the finish line. Changes are saved together (after the usual confirm) and apply to every deliverable of the subfolder in all months; the team is notified.
  - Stages are stored on the subfolder as `{key, label}`; items point at the stable `key`, so renaming and reordering never move an item and its ticks stay on stages that still exist.
  - A stage with deliverables on it shows a warning before you delete it ("2 deliverables are on this stage…"), counted over all months (`GET /subfolders/{id}/deliverables/stages/usage`). Deleted stages are listed as "Will be deleted when you save" with Undo. On save, items on a deleted stage move to the nearest stage before it that still exists (or the first); the server refuses with 409 `stage_in_use` unless the request confirms with `move_items`.
  - `PUT /subfolders/{id}/deliverables/stages` takes `{stages: [{key?, label}], move_items}` (a `key` keeps a stage, none adds one, stages left out are deleted) and answers with the tracker. `GET .../deliverables` now also returns `stage_labels` (key to name); `stages` stays the ordered list of keys.
- **Defaults.** New subfolders start with Shooted → Editing → Reel → Posted. Subfolders created before this keep their seven original stages until someone edits them, so nothing already tracked changes. The client portal, CSV export (stage names, not keys) and the portal summary (counts by stage name) follow each subfolder's own stages.

## Collections
| Collection | Key fields |
|---|---|
| companies | name |
| users | name, email, password_hash, role, company_id, avatar_url, is_active, created_at |
| files | owner_id, name, mime, size, kind (upload/link), storage_key, url, drive{file_id, mime, kind, icon_url, modified_at} (Drive files: kind link + drive), created_at |
| notifications | user_id, type, title, body, link, actor_id, read, created_at |
| daily_status | user_id, date (YYYY-MM-DD), status, set_at — unique (user_id, date) |
| bookings | host_user_id, booked_by, start, end, title, note, attendees[{email, name, user_id}], meet_url, meet_owner_id, created_at |
| projects | name, company_id, client_ids, created_by |
| subfolders | project_id, name, head_ids, member_ids, file_ids (linked Google files), deliverable_stages[{key, label}] (null = the legacy seven), created_by |
| tasks | subfolder_id, project_id, title, description, assignee_id, created_by, due_date, priority, status (todo/in_progress/submitted/changes_requested/approved), progress, asset_ids, total_seconds |
| time_logs | task_id, user_id, started_at, ended_at, seconds |
| task_reviews | task_id, round, submitted_by, approver_id, note, file_ids, decision (pending/approved/changes_requested), comments, decided_at |
| checklist_items | subfolder_id, text, done, done_by, done_at, attachments, created_by |
| deliverable_plans | subfolder_id, month, items[{type, number, title, stage (a stage key of the subfolder), updated_by, updated_at}] |
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
11b. DONE — Google Drive, Docs/Sheets creation + inline preview, Meet links on bookings and Start Meet in chat, graceful revoked/expired tokens.
11c. DONE — one Connect to Google (all scopes at once), one shared attach menu, our own Drive-like file browser (drive.readonly), booking form fix + guests (members and email) invited through Google Calendar with Meet and sendUpdates=all, Scroll to book cue and clickable free slots (see Phase 11b/11c).
11d. DONE — Add members lists the whole team of both companies grouped by company (`GET /users/team`), a quiet Scroll to book cue, and a shared progress toast for uploads, Drive attaches and task create/assign/submit (see Phase 11b/11c).
12. DONE — visual polish: Hold to Delete, zigzag deliverables timeline, Focus mode pill toggle, morphing Download button (see Phase 12).
13. DONE — Send animation (+ chat mini plane), booking confirmed popup, floating scrollbar with back-to-top and clock (see Phase 13).
14. DONE — each deliverable is its own dropdown (collapsed by default, several can be open), and per-subfolder editable stages (rename, add, hold-to-delete, drag to reorder) from an opened deliverable (see Phase 14).
