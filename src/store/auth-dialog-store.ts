import { create } from 'zustand';

interface AuthDialogStore {
  showLoginDialog: boolean;
  showRegisterDialog: boolean;
  openLoginDialog: () => void;
  openRegisterDialog: () => void;
  closeDialog: () => void;
}

export const useAuthDialogStore = create<AuthDialogStore>((set) => ({
  showLoginDialog: false,
  showRegisterDialog: false,
  openLoginDialog: () => set({ showLoginDialog: true, showRegisterDialog: false }),
  openRegisterDialog: () => set({ showRegisterDialog: true, showLoginDialog: false }),
  closeDialog: () => set({ showLoginDialog: false, showRegisterDialog: false }),
}));
