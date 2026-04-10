import Image from 'next/image';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { serverTRPC } from '@/lib/trpc/server';
import { CreateOrgCard } from '@/components/public/CreateOrgCard';
import { accountRoutes } from '@/config/routes';
import { getServerTranslations } from '@/core/lib/i18n/translations-server';

export default async function AccountPage() {
  const __ = await getServerTranslations();
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session!.user;
  const userImage = (user as { image?: string | null }).image;

  // Check if user has any organizations
  const api = await serverTRPC();
  const orgs = await api.organizations.list();
  const hasOrgs = orgs.length > 0;

  if (!hasOrgs) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">{__('Welcome')}, {user.name ?? __('there')}!</h1>
        <CreateOrgCard />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('Account Overview')}</h1>

      <div className="account-card rounded-lg border border-(--border-primary) p-6 mb-6">
        <div className="flex items-center gap-4">
          {userImage ? (
            <Image src={userImage} alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover" unoptimized />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center text-white text-2xl font-medium">
              {(user.name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold">{user.name}</h2>
            <p className="text-sm text-(--text-secondary)">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href={accountRoutes.settings} className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">{__('Profile Settings')}</h3>
          <p className="text-sm text-(--text-secondary) mt-1">{__('Update your name and profile information.')}</p>
        </a>
        <a href={accountRoutes.security} className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">{__('Security')}</h3>
          <p className="text-sm text-(--text-secondary) mt-1">{__('Change your password and manage sessions.')}</p>
        </a>
        <a href={accountRoutes.billing} className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">{__('Billing')}</h3>
          <p className="text-sm text-(--text-secondary) mt-1">{__('Manage your subscription and payment methods.')}</p>
        </a>
        <a href={accountRoutes.support} className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">{__('Support')}</h3>
          <p className="text-sm text-(--text-secondary) mt-1">{__('View your support tickets or create a new one.')}</p>
        </a>
      </div>
    </div>
  );
}
