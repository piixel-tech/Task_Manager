import { describe, expect, it } from 'vitest';
import { isGoogleUrl, isMeetUrl, previewUrl } from './googleUtils';
import type { DriveMeta } from '../../services/http/googleApi';

const drive = (kind: DriveMeta['kind'], file_id = 'abc123'): DriveMeta => ({ file_id, mime: '', kind, icon_url: null, modified_at: null });

describe('previewUrl', () => {
  it('uses the matching Google editor in preview mode', () => {
    expect(previewUrl(drive('document'))).toBe('https://docs.google.com/document/d/abc123/preview');
    expect(previewUrl(drive('spreadsheet'))).toBe('https://docs.google.com/spreadsheets/d/abc123/preview');
    expect(previewUrl(drive('presentation'))).toBe('https://docs.google.com/presentation/d/abc123/preview');
  });

  it('falls back to the Drive viewer for other files, and escapes the id', () => {
    expect(previewUrl(drive('pdf'))).toBe('https://drive.google.com/file/d/abc123/preview');
    expect(previewUrl(drive('other', 'a/b?c'))).toBe('https://drive.google.com/file/d/a%2Fb%3Fc/preview');
  });
});

describe('isGoogleUrl / isMeetUrl', () => {
  it('only trusts https addresses on google.com', () => {
    expect(isGoogleUrl('https://docs.google.com/document/d/x/edit')).toBe(true);
    expect(isGoogleUrl('https://drive.google.com/file/d/x/view')).toBe(true);
    expect(isGoogleUrl('http://docs.google.com/x')).toBe(false);
    expect(isGoogleUrl('javascript:alert(1)')).toBe(false);
    expect(isGoogleUrl('https://google.com.evil.example/x')).toBe(false);
    expect(isGoogleUrl('https://evilgoogle.com/x')).toBe(false);
    expect(isGoogleUrl('not a url')).toBe(false);
  });

  it('only accepts Meet links for Join', () => {
    expect(isMeetUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isMeetUrl('https://meet.google.com.evil.example/abc')).toBe(false);
    expect(isMeetUrl('https://docs.google.com/x')).toBe(false);
    expect(isMeetUrl('')).toBe(false);
    expect(isMeetUrl(undefined)).toBe(false);
  });
});
