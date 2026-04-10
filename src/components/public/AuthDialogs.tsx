'use client';

import { Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog } from '@/core/components/overlays/Dialog';
import { useAuthDialogStore } from '@/store/auth-dialog-store';
import { LoginForm } from '@/app/(public)/login/LoginForm';
import { RegisterForm } from '@/app/(public)/register/RegisterForm';
import { useTranslations } from '@/lib/translations';

function LoginDialogInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { showLoginDialog, closeDialog, openRegisterDialog } = useAuthDialogStore();
  const __ = useTranslations();

  const handleSuccess = () => {
    closeDialog();
    router.refresh();
  };

  return (
    <Dialog open={showLoginDialog} onClose={closeDialog} size="sm" zoomFromClick>
      <Dialog.Header onClose={closeDialog}>{__('Sign In')}</Dialog.Header>
      <Dialog.Body>
        <Suspense fallback={null}>
          <LoginForm
            onSuccess={handleSuccess}
            onSwitchToRegister={openRegisterDialog}
            socialCallbackUrl={pathname}
          />
        </Suspense>
      </Dialog.Body>
    </Dialog>
  );
}

function RegisterDialogInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { showRegisterDialog, closeDialog, openLoginDialog } = useAuthDialogStore();
  const __ = useTranslations();

  const registrationEnabled = process.env.NEXT_PUBLIC_REGISTRATION_ENABLED !== 'false';

  const handleSuccess = () => {
    closeDialog();
    router.refresh();
  };

  return (
    <Dialog open={showRegisterDialog} onClose={closeDialog} size="sm" zoomFromClick>
      <Dialog.Header onClose={closeDialog}>{__('Create Account')}</Dialog.Header>
      <Dialog.Body>
        {registrationEnabled ? (
          <Suspense fallback={null}>
            <RegisterForm
              onSuccess={handleSuccess}
              onSwitchToLogin={openLoginDialog}
              socialCallbackUrl={pathname}
            />
          </Suspense>
        ) : (
          <p className="text-(--text-secondary) text-sm">
            {__('Registration is currently not available. Please contact us for access.')}
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}

export function AuthDialogs() {
  return (
    <>
      <LoginDialogInner />
      <RegisterDialogInner />
    </>
  );
}
