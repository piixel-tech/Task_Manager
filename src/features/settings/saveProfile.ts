import type { User } from '../../types';
import { authService } from '../../services';
import { accountApi, type ProfileInput } from '../../services/http/accountApi';
import { assetApi } from '../../services/http/taskApi';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/useUserStore';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO = /\/files\/([0-9a-f]{24})\/download$/;

/** Reload the signed-in person after a change, so every avatar and name on screen updates. */
async function refreshMe(): Promise<void> {
  const fresh = await authService.getCurrentUser();
  if (fresh) {
    useAuthStore.getState().setUser(fresh);
    useUserStore.getState().setUser(fresh);
  }
}

/** Save profile text fields. */
export async function saveProfile(input: ProfileInput): Promise<void> {
  await accountApi.updateProfile(input);
  await refreshMe();
}

/**
 * Save a new picture: a preset (emoji / icon / initials) or an uploaded photo. A photo is uploaded first and only kept
 * if saving works; the photo it replaces is deleted.
 */
export async function saveAvatar(user: User, preset: string, photo?: File | null): Promise<void> {
  let value = preset;
  let uploaded: string | null = null;
  if (photo) {
    if (!photo.type.startsWith('image/')) throw new Error('Choose an image file');
    if (photo.size > MAX_PHOTO_BYTES) throw new Error('Pick a photo under 2 MB');
    uploaded = (await assetApi.upload([photo]))[0].id;
    value = `/api/v1/files/${uploaded}/download`;
  }
  try {
    await accountApi.updateProfile({ avatar_url: value });
  } catch (err) {
    if (uploaded) assetApi.remove(uploaded).catch(() => {});
    throw err;
  }
  const old = PHOTO.exec(user.avatarUrl ?? '')?.[1];
  if (old && old !== uploaded) assetApi.remove(old).catch(() => {});
  await refreshMe();
}
