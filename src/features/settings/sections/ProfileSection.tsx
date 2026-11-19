import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { AvatarPickerModal } from '../../../components/ui/AvatarPickerModal';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { BirthdayFields } from '../../../components/ui/BirthdayFields';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { saveAvatar, saveProfile } from '../saveProfile';
import { Switch } from '../../../components/ui/Switch';
import { useSettingsStore } from '../../../store/useSettingsStore';

const BIO_MAX = 500;

/** Your name, job title, phone, short bio and picture. Email, role and company are changed by an admin. */
export const ProfileSection: React.FC = () => {
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user)!;
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.jobTitle === user.role ? '' : user.jobTitle);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [birthday, setBirthday] = useState(user.birthday ?? '');
  const [birthYear, setBirthYear] = useState(user.birthYear ? String(user.birthYear) : '');
  const [joined, setJoined] = useState(user.joiningDate ?? '');
  const [picking, setPicking] = useState(false);
  const rotate = useSettingsStore((s) => s.settings.greeting.rotate);
  const update = useSettingsStore((s) => s.update);

  // Follow the saved profile when it is reloaded (after saving, or from another tab).
  useEffect(() => {
    setName(user.name);
    setTitle(user.jobTitle === user.role ? '' : user.jobTitle);
    setPhone(user.phone ?? '');
    setBio(user.bio ?? '');
    setBirthday(user.birthday ?? '');
    setBirthYear(user.birthYear ? String(user.birthYear) : '');
    setJoined(user.joiningDate ?? '');
  }, [user.name, user.jobTitle, user.role, user.phone, user.bio, user.birthday, user.birthYear, user.joiningDate]);

  const dirty = name.trim() !== user.name || title.trim() !== (user.jobTitle === user.role ? '' : user.jobTitle) || phone.trim() !== (user.phone ?? '') || bio.trim() !== (user.bio ?? '')
    || birthday !== (user.birthday ?? '') || birthYear !== (user.birthYear ? String(user.birthYear) : '') || joined !== (user.joiningDate ?? '');
  const yearInvalid = birthYear !== '' && birthYear.length !== 4;
  const joinedInFuture = joined !== '' && joined > new Date().toISOString().slice(0, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dirty || yearInvalid || joinedInFuture) return;
    await confirm({
      title: 'Save your profile?',
      message: 'Colleagues will see the new details.',
      confirmLabel: 'Save',
      action: () =>
        saveProfile({
          name: name.trim(),
          title: title.trim(),
          phone: phone.trim(),
          bio: bio.trim(),
          birthday,
          birth_year: birthday && birthYear ? Number(birthYear) : null,
          joined_on: joined
        }),
      successTitle: 'Profile saved'
    });
  };

  const clearPhoto = () =>
    confirm({
      title: 'Remove your picture?',
      message: 'Your initials are shown instead.',
      confirmLabel: 'Remove',
      danger: true,
      action: () => saveAvatar(user, ''),
      successTitle: 'Picture removed'
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My profile</CardTitle>
        <CardDescription>What colleagues see on your profile and in chats.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-5 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-5">
          <div className="rounded-full bg-[var(--tm-bg-sunken)] p-2.5">
            <Avatar name={user.name} src={user.avatarUrl} size="2xl" ring />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" leftIcon={<Camera className="h-4 w-4" />} onClick={() => setPicking(true)}>
                Change picture
              </Button>
              {user.avatarUrl && (
                <Button size="sm" variant="ghost" onClick={() => void clearPhoto()}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[12px] text-[var(--tm-ink-muted)]">Upload a photo (up to 2 MB) or pick an emoji, icon or initials.</p>
          </div>
        </div>

        <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
          <Input label="Job title" value={title} maxLength={100} placeholder="e.g. Designer" onChange={(e) => setTitle(e.target.value)} />
          <Input label="Phone" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" value={user.loginId} disabled helperText="An admin changes this." />
          <div>
            <BirthdayFields value={birthday} year={birthYear} onChange={(b, y) => { setBirthday(b); setBirthYear(y); }} />
            <p className="mt-1.5 pl-1 text-[11.5px] text-[var(--tm-ink-muted)]">
              {yearInvalid ? 'Enter a 4-digit year, or leave it empty.' : 'Colleagues see the day and month only. The year is never shown.'}
            </p>
          </div>
          <Input
            label="Joining date"
            type="date"
            value={joined}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setJoined(e.target.value)}
            helperText={joinedInFuture ? 'This cannot be in the future.' : 'Used for work anniversaries.'}
            error={joinedInFuture ? 'This cannot be in the future.' : undefined}
          />
          <div className="sm:col-span-2">


            <p className="mt-1 text-right text-[11.5px] text-[var(--tm-ink-muted)]">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={!dirty || !name.trim() || yearInvalid || joinedInFuture}>
              Save changes
            </Button>
          </div>
        </form>
        <div className="space-y-3 border-t border-[var(--tm-border)] pt-6">
          <div>
            <h3 className="text-[14px] font-bold text-[var(--tm-ink)]">Dashboard greeting</h3>
            <p className="text-[12px] text-[var(--tm-ink-muted)]">Your dashboard greets you by your name. Only you see this.</p>
          </div>
          <div className="flex max-w-md items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--tm-ink)]">Change the greeting daily</p>
              <p className="text-[12px] text-[var(--tm-ink-muted)]">A different friendly opener each day.</p>
            </div>
            <Switch label="Change the greeting daily" checked={rotate} onChange={(next) => void update({ greeting: { rotate: next } })} />
          </div>
        </div>
      </CardContent>

      <AvatarPickerModal
        isOpen={picking}
        onClose={() => setPicking(false)}
        userName={user.name}
        currentAvatarUrl={user.avatarUrl}
        onSave={(preset, photo) => saveAvatar(user, preset, photo)}
      />
    </Card>
  );
};
