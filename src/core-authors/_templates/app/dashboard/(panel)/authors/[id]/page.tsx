'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { slugify } from '@/core/lib/content/slug';
import { toast } from '@/store/toast-store';
import { MediaPickerButton } from '@/core/components/media/MediaPickerButton';

export default function AuthorEditPage() {
  const __ = useAdminTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isNew = params.id === 'new';

  const existing = trpc.authors.get.useQuery(
    { id: params.id },
    { enabled: !isNew },
  );

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');

  useEffect(() => {
    if (existing.data) {
      const a = existing.data;
      setName(a.name);
      setSlug(a.slug);
      setSlugManual(true);
      setBio(a.bio ?? '');
      setAvatar(a.avatar ?? '');
      const social = a.socialUrls ? JSON.parse(a.socialUrls) as Record<string, string> : {};
      setWebsite(social.website ?? '');
      setTwitter(social.twitter ?? '');
      setGithub(social.github ?? '');
      setLinkedin(social.linkedin ?? '');
    }
  }, [existing.data]);

  // Auto-slug from name
  useEffect(() => {
    if (isNew && !slugManual && name) {
      setSlug(slugify(name));
    }
  }, [name, isNew, slugManual]);

  const utils = trpc.useUtils();

  const createMutation = trpc.authors.create.useMutation({
    onSuccess: (author) => {
      toast.success(__('Author created'));
      router.push(`/dashboard/authors/${author.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.authors.update.useMutation({
    onSuccess: () => {
      toast.success(__('Author saved'));
      utils.authors.get.invalidate({ id: params.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  function buildSocialUrls(): string | undefined {
    const social: Record<string, string> = {};
    if (website) social.website = website;
    if (twitter) social.twitter = twitter;
    if (github) social.github = github;
    if (linkedin) social.linkedin = linkedin;
    return Object.keys(social).length > 0 ? JSON.stringify(social) : undefined;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const socialUrls = buildSocialUrls();

    if (isNew) {
      createMutation.mutate({ name, slug, bio: bio || undefined, avatar: avatar || undefined, socialUrls });
    } else {
      updateMutation.mutate({
        id: params.id,
        name,
        slug,
        bio: bio || null,
        avatar: avatar || null,
        socialUrls: socialUrls ?? null,
      });
    }
  }

  return (
    <div className="dash-container">
      <div className="dash-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/authors')} className="icon-btn">
            <ArrowLeft size={18} />
          </button>
          <h1 className="dash-title">{isNew ? __('New Author') : name || __('Edit Author')}</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || !name || !slug}
          className="btn btn-primary rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {__('Save')}
        </button>
      </div>

      <div className="dash-main">
        <div className="dash-inner">
          <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
            <div>
              <label className="label">{__('Name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="label">{__('Slug')}</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                className="input w-full font-mono text-sm"
                required
              />
            </div>

            <div>
              <label className="label">{__('Avatar')}</label>
              <MediaPickerButton
                value={avatar || undefined}
                onChange={(url) => setAvatar(url)}
                lockFileType
              />
            </div>

            <div>
              <label className="label">{__('Bio')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="textarea w-full"
                rows={4}
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="label">{__('Social Links')}</legend>
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className="input w-full text-sm" />
              <input type="text" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" className="input w-full text-sm" />
              <input type="url" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/..." className="input w-full text-sm" />
              <input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." className="input w-full text-sm" />
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}
