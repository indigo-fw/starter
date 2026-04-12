'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { slugify } from '@/core/lib/content/slug';
import { toast } from '@/store/toast-store';
import { MediaPickerButton } from '@/core/components/media/MediaPickerButton';

interface AuthorData {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar: string | null;
  socialUrls: string | null;
}

function AuthorForm({ author, isNew }: { author?: AuthorData; isNew: boolean }) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const utils = trpc.useUtils();

  const social = author?.socialUrls ? JSON.parse(author.socialUrls) as Record<string, string> : {};

  const [name, setName] = useState(author?.name ?? '');
  const [slug, setSlug] = useState(author?.slug ?? '');
  const [slugManual, setSlugManual] = useState(!isNew);
  const [bio, setBio] = useState(author?.bio ?? '');
  const [avatar, setAvatar] = useState(author?.avatar ?? '');
  const [website, setWebsite] = useState(social.website ?? '');
  const [twitter, setTwitter] = useState(social.twitter ?? '');
  const [github, setGithub] = useState(social.github ?? '');
  const [linkedin, setLinkedin] = useState(social.linkedin ?? '');

  const createMutation = trpc.authors.create.useMutation({
    onSuccess: (created) => {
      toast.success(__('Author created'));
      router.push(`/dashboard/authors/${created.id}`);
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
    const s: Record<string, string> = {};
    if (website) s.website = website;
    if (twitter) s.twitter = twitter;
    if (github) s.github = github;
    if (linkedin) s.linkedin = linkedin;
    return Object.keys(s).length > 0 ? JSON.stringify(s) : undefined;
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

  // Auto-slug from name (new authors only)
  const handleNameChange = (value: string) => {
    setName(value);
    if (isNew && !slugManual) {
      setSlug(slugify(value));
    }
  };

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
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isNew ? __('Create') : __('Save')}
        </button>
      </div>

      <div className="dash-main">
        <div className="dash-inner max-w-2xl space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="label">{__('Name')}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="input w-full"
              />
            </label>
            <label className="space-y-1">
              <span className="label">{__('Slug')}</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                className="input w-full font-mono"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="label">{__('Bio')}</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="textarea w-full"
            />
          </label>

          <div className="space-y-1">
            <span className="label">{__('Avatar')}</span>
            <div className="flex items-center gap-3">
              <MediaPickerButton
                value={avatar}
                onChange={setAvatar}
                accept="image/*"
              />
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar('')}
                  className="text-xs text-(--text-muted) hover:text-(--text-primary)"
                >
                  {__('Remove')}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-(--border-primary) pt-4">
            <h2 className="text-sm font-semibold text-(--text-secondary) mb-3">{__('Social Links')}</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="label">{__('Website')}</span>
                <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="input w-full" />
              </label>
              <label className="space-y-1">
                <span className="label">{__('Twitter')}</span>
                <input type="url" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="input w-full" />
              </label>
              <label className="space-y-1">
                <span className="label">{__('GitHub')}</span>
                <input type="url" value={github} onChange={(e) => setGithub(e.target.value)} className="input w-full" />
              </label>
              <label className="space-y-1">
                <span className="label">{__('LinkedIn')}</span>
                <input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className="input w-full" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthorEditPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();
  const isNew = params.id === 'new';

  const { data: author, isLoading } = trpc.authors.get.useQuery(
    { id: params.id },
    { enabled: !isNew },
  );

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
      </div>
    );
  }

  return <AuthorForm key={author?.id ?? 'new'} author={author} isNew={isNew} />;
}
