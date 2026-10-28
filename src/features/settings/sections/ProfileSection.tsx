import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { AvatarPickerModal } from '../../../components/ui/AvatarPickerModal';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { saveAvatar, saveProfile } from '../saveProfile';

const BIO_MAX = 500;

/** Your name, job title, phone, short bio and picture. Email, role and company are changed by an admin. */
export const ProfileSection: React.FC = () => {
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user)!;
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.jobTitle === user.role ? '' : user.jobTitle);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [picking, setPicking] = useState(false);

  // Follow the saved profile when it is reloaded (after saving, or from another tab).
  useEffect(() => {
    setName(user.name);
    setTitle(user.jobTitle === user.role ? '' : user.jobTitle);
    setPhone(user.phone ?? '');
    setBio(user.bio ?? '');
  }, [user.name, user.jobTitle, user.role, user.phone, user.bio]);

  const dirty = name.trim() !== user.name || title.trim() !== (user.jobTitle === user.role ? '' : user.jobTitle) || phone.trim() !== (user.phone ?? '') || bio.trim() !== (user.bio ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dirty) return;
    await confirm({
      title: 'Save your profile?',
      message: 'Colleagues will see the new details.',
      confirmLabel: 'Save',
      action: () => saveProfile({ name: name.trim(), title: title.trim(), phone: phone.trim(), bio: bio.trim() }),
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
        <CardDescription>This is what your colleagues see on your profile, in chats and on tasks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={user.name} src={user.avatarUrl} size="2xl" />
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

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
          <Input label="Job title" value={title} maxLength={100} placeholder="e.g. Designer" onChange={(e) => setTitle(e.target.value)} />
          <Input label="Phone" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" value={user.loginId} disabled helperText="An admin changes this." />
          <div className="sm:col-span-2">
            <label htmlFor="bio" className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
              About me
            </label>
            <textarea
              id="bio"
              value={bio}
              rows={4}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
            />
            <p className="mt-1 text-right text-[11.5px] text-[var(--tm-ink-muted)]">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={!dirty || !name.trim()}>
              Save changes
            </Button>
          </div>
        </form>
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
