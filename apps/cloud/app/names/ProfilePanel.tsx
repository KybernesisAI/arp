'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, FieldHint, Input, Label, Textarea } from '@/components/ui';

type Profile = { name: string; description: string; accent: string | null; picture: string | null; updated_at: string | null };

const SIZE = 512;

/** Resize any image file to a 512×512 PNG data URL (cover-cropped, centred). */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the image.');
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2;
    const sy = (img.naturalHeight - s) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The identity profile (AgentID S6c): what the name publishes about the agent.
 * Name, description, picture and accent. Saving rebuilds the identity's
 * documents, so the change shows on the badge, the public page, the agent
 * card and anything that reads the profile.
 */
export function ProfilePanel({ sld }: { sld: string }): React.JSX.Element {
  const router = useRouter();
  const api = `/api/names/${encodeURIComponent(sld)}/profile`;
  const [loaded, setLoaded] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accent, setAccent] = useState('');
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined); // undefined = unchanged, null = clear
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetch(api)
      .then(async (r) => (await r.json()) as { profile?: Profile })
      .then((b) => {
        if (!b.profile) return;
        setLoaded(b.profile);
        setName(b.profile.name);
        setDescription(b.profile.description);
        setAccent(b.profile.accent ?? '');
        setPreview(b.profile.picture ? `${b.profile.picture}?v=${encodeURIComponent(b.profile.updated_at ?? '')}` : null);
      })
      .catch(() => setError('The profile could not be loaded.'));
  }, [api]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await toAvatarDataUrl(file);
      setAvatar(dataUrl);
      setPreview(dataUrl);
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be used.');
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { name: name.trim(), description: description.trim(), accent: accent.trim() ? accent.trim() : null };
      if (avatar !== undefined) body['avatar'] = avatar;
      const res = await fetch(api, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = (await res.json()) as { ok?: boolean; profile?: Profile; message?: string };
      if (!res.ok || !b.ok || !b.profile) {
        setError(b.message ?? 'The profile could not be saved.');
        return;
      }
      setLoaded(b.profile);
      setAvatar(undefined);
      setPreview(b.profile.picture ? `${b.profile.picture}?v=${encodeURIComponent(b.profile.updated_at ?? '')}` : null);
      setSaved(true);
      router.refresh();
    } catch {
      setError('The profile could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const dirty = loaded !== null && (name.trim() !== loaded.name || description.trim() !== loaded.description || (accent.trim() || null) !== (loaded.accent ?? null) || avatar !== undefined);

  return (
    <div className="p-5">
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 md:col-span-3 flex flex-col items-start gap-3">
          <div className="font-mono text-kicker uppercase text-muted">PICTURE</div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-32 w-32 overflow-hidden rounded-full border border-rule bg-paper-2"
            aria-label="Choose a picture"
            style={accent.trim() && ACCENT.test(accent.trim()) ? { boxShadow: `0 0 0 3px ${accent.trim()}` } : undefined}
          >
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-h3 text-muted">{(name || sld).slice(0, 1).toUpperCase()}</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e)} />
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => fileRef.current?.click()}>
              {preview ? 'Change' : 'Upload'}
            </Button>
            {preview && (
              <Button type="button" variant="default" size="sm" onClick={() => { setAvatar(null); setPreview(null); setSaved(false); }}>
                Remove
              </Button>
            )}
          </div>
          <FieldHint>Square works best. Resized to 512×512 before upload.</FieldHint>
        </div>
        <div className="col-span-12 md:col-span-9 grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-7">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={80} placeholder={sld} />
          </div>
          <div className="col-span-12 md:col-span-5">
            <Label htmlFor="profile-accent">Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick an accent colour"
                value={ACCENT.test(accent.trim()) ? accent.trim() : '#10b981'}
                onChange={(e) => { setAccent(e.target.value); setSaved(false); }}
                className="h-9 w-10 cursor-pointer rounded border border-rule bg-paper p-0.5"
              />
              <Input id="profile-accent" value={accent} onChange={(e) => { setAccent(e.target.value); setSaved(false); }} placeholder="#10b981" className="font-mono text-[12px]" />
            </div>
          </div>
          <div className="col-span-12">
            <Label htmlFor="profile-description">Description</Label>
            <Textarea id="profile-description" value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} rows={3} maxLength={500} placeholder="What this agent does and who it represents." />
            <FieldHint>Shown on the badge, the public page and to other agents that look this name up.</FieldHint>
          </div>
          <div className="col-span-12 flex items-center justify-end gap-3">
            {saved && <span className="font-mono text-kicker uppercase text-signal-blue">SAVED · PUBLISHED WITH THE NAME</span>}
            <Button type="button" variant="primary" size="sm" disabled={busy || !dirty || !name.trim()} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </div>
      </div>
      {error && <div className="mt-3"><FieldError>{error}</FieldError></div>}
    </div>
  );
}

const ACCENT = /^#[0-9a-f]{6}$/i;
