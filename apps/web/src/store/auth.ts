import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@training-plan/shared'

interface User {
  id: string
  email: string
  name: string
  role: Role
}

interface AuthState {
  accessToken: string | null
  user: User | null
  _hasHydrated: boolean
  setAuth: (token: string, user: User) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      _hasHydrated: false,
      setAuth: (token, user) => set({ accessToken: token, user }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ _hasHydrated: true })
      },
    },
  ),
)
