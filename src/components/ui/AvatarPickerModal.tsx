import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Avatar, AVATAR_ICONS } from './Avatar';
import { Camera, Type, Smile, Sparkles } from 'lucide-react';

export interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  currentAvatarUrl?: string;
  /** `photo` is set when a picture was chosen from the device: upload it, then save. */
  onSave: (newAvatarUrl: string, photo?: File) => Promise<void>;
}

const PRESET_COLORS = [
  '#0F3D27', // Forest
  '#1e40af', // Blue
  '#6b21a8', // Purple
  '#991b1b', // Red
  '#9a3412', // Orange
  '#065f46', // Emerald
  '#374151', // Dark Gray
  '#831843', // Pink
  '#0284c7', // Sky Blue
  '#4d7c0f'  // Lime
];

const PRESET_EMOJIS = ['🚀', '💻', '🎯', '🔥', '🎨', '⭐', '👑', '🦄', '⚡', '🦊', '🐶', '🍕', '💡', '🏆', '🌈', '💼'];

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen,
  onClose,
  userName,
  currentAvatarUrl = '',
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'photo' | 'initials' | 'icon' | 'emoji'>('initials');
  
  // Custom states
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('#0F3D27');
  const [selectedIcon, setSelectedIcon] = useState<string>('Star');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('🚀');
  const [saving, setSaving] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setError('');
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const computeResultingAvatarUrl = () => {
    if (activeTab === 'photo') {
      return photoUrl || currentAvatarUrl || `initials:${selectedColor}`;
    }
    if (activeTab === 'initials') {
      return `initials:${selectedColor}`;
    }
    if (activeTab === 'icon') {
      return `icon:${selectedIcon}:${selectedColor}`;
    }
    if (activeTab === 'emoji') {
      return `emoji:${selectedEmoji}:${selectedColor}`;
    }
    return '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setError('');
      if (activeTab === 'photo' && photoFile) await onSave('', photoFile);
      else await onSave(computeResultingAvatarUrl());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your picture');
    } finally {
      setSaving(false);
    }
  };

  const previewUrl = computeResultingAvatarUrl();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Profile Picture"
      description="Choose your avatar style contact-style"
      maxWidth="md"
    >
      <div className="space-y-6">
        {/* Live Preview Circle */}
        <div className="flex flex-col items-center justify-center space-y-2 py-4 bg-[var(--tm-card-muted)] rounded-2xl border border-[var(--tm-border)]">
          <Avatar name={userName} src={previewUrl} size="2xl" ring />
          <span className="text-xs font-semibold text-[var(--tm-ink-muted)]">Live Preview</span>
        </div>

        {/* 4 iPhone style Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--tm-bg-sunken)] rounded-xl border border-[var(--tm-border)]">
          {[
            { id: 'photo', label: 'Photo', icon: Camera },
            { id: 'initials', label: 'Initials', icon: Type },
            { id: 'icon', label: 'Icon', icon: Sparkles },
            { id: 'emoji', label: 'Emoji', icon: Smile }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center gap-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  active
                    ? 'bg-white text-[var(--tm-primary)] shadow-xs'
                    : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Photo Upload */}
        {activeTab === 'photo' && (
          <div className="space-y-3 text-center">
            <p className="text-xs text-[var(--tm-ink-muted)]">Upload a photo to crop and use as avatar</p>
            <input
              type="file"
              accept="image/*"
              id="avatar-photo-input"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="avatar-photo-input"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--tm-card)] border border-[var(--tm-border-strong)] rounded-xl text-xs font-bold text-[var(--tm-ink)] cursor-pointer hover:bg-[var(--tm-bg-sunken)] transition-colors"
            >
              <Camera className="w-4 h-4 text-[var(--tm-primary)]" />
              Select Photo from Device
            </label>
          </div>
        )}

        {/* Tab 2: Initials & Background Color */}
        {activeTab === 'initials' && (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider">
              Background Color
            </label>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-9 h-9 rounded-full transition-transform ${
                    selectedColor === c ? 'scale-115 ring-2 ring-offset-2 ring-[var(--tm-primary)]' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Icon + Color */}
        {activeTab === 'icon' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider mb-2">
                Choose Icon
              </label>
              <div className="grid grid-cols-7 gap-2">
                {Object.keys(AVATAR_ICONS).map((iconName) => {
                  const IconComp = AVATAR_ICONS[iconName];
                  const selected = selectedIcon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelectedIcon(iconName)}
                      className={`h-10 rounded-xl flex items-center justify-center transition-all ${
                        selected
                          ? 'bg-[var(--tm-primary)] text-white shadow-soft-xs'
                          : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'
                      }`}
                    >
                      <IconComp className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider mb-2">
                Background Color
              </label>
              <div className="flex flex-wrap gap-2.5 justify-center">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${
                      selectedColor === c ? 'scale-115 ring-2 ring-offset-2 ring-[var(--tm-primary)]' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Emoji + Color */}
        {activeTab === 'emoji' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider mb-2">
                Choose Emoji
              </label>
              <div className="grid grid-cols-8 gap-2 text-xl">
                {PRESET_EMOJIS.map((em) => {
                  const selected = selectedEmoji === em;
                  return (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setSelectedEmoji(em)}
                      className={`h-10 rounded-xl flex items-center justify-center transition-all ${
                        selected
                          ? 'bg-[var(--tm-primary-soft)] border-2 border-[var(--tm-primary)]'
                          : 'bg-[var(--tm-card-muted)] hover:bg-[var(--tm-bg-sunken)]'
                      }`}
                    >
                      {em}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider mb-2">
                Background Color
              </label>
              <div className="flex flex-wrap gap-2.5 justify-center">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${
                      selectedColor === c ? 'scale-115 ring-2 ring-offset-2 ring-[var(--tm-primary)]' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--tm-border)]">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="button" isLoading={saving} onClick={handleSave}>
            Save Avatar
          </Button>
        </div>
      </div>
    </Modal>
  );
};
