'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Link } from '@/components/Link';
import { useSession, signOut } from '@/lib/auth-client';
import { User, Settings, Shield, CreditCard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { accountRoutes } from '@/config/routes';
import { useAuthDialogStore } from '@/store/auth-dialog-store';
import { useTranslations } from '@/lib/translations';

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openLoginDialog = useAuthDialogStore((s) => s.openLoginDialog);
  const openRegisterDialog = useAuthDialogStore((s) => s.openRegisterDialog);
  const __ = useTranslations();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPending) return null;

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={openLoginDialog}
          className="text-sm font-medium text-(--text-primary) hover:text-brand-500 transition-colors"
        >
          {__('Sign In')}
        </button>
        <button
          onClick={openRegisterDialog}
          className="text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {__('Sign Up')}
        </button>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const userImage = (session.user as { image?: string | null }).image;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 p-1.5 rounded-lg hover:bg-(--surface-secondary) transition-colors'
        )}
      >
        {userImage ? (
          <Image
            src={userImage}
            alt=""
            width={32}
            height={32}
            className="w-8 h-8 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-medium">
            {(session.user.name?.[0] ?? (session.user.email as string)?.[0] ?? '?').toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-(--border-primary) bg-(--surface-primary) shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-(--border-primary)">
            <p className="text-sm font-medium truncate">{session.user.name}</p>
            <p className="text-xs text-(--text-secondary) truncate">{session.user.email as string}</p>
          </div>

          <Link
            href={accountRoutes.home}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <User size={16} />
            {__('Account')}
          </Link>
          <Link
            href={accountRoutes.settings}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} />
            {__('Settings')}
          </Link>
          <Link
            href={accountRoutes.security}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <Shield size={16} />
            {__('Security')}
          </Link>
          <Link
            href={accountRoutes.billing}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <CreditCard size={16} />
            {__('Billing')}
          </Link>

          <div className="border-t border-(--border-primary) mt-1 pt-1">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-danger-500 hover:bg-(--surface-secondary) transition-colors"
            >
              <LogOut size={16} />
              {__('Sign Out')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
