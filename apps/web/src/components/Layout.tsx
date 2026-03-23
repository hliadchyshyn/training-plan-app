import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  AppShell, Burger, Group, Text, Stack, NavLink, Button, Popover,
  PasswordInput, Divider, Box, Avatar,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendar, IconUsers, IconChartBar,
  IconShield, IconLogout, IconLock,
} from '@tabler/icons-react'
import { useAuthStore } from '../store/auth.js'
import logoSvg from '../assets/logo.svg'
import { api } from '../api/client.js'

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [opened, { toggle }] = useDisclosure()
  const [pwPopover, setPwPopover] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => {})
    logout()
    navigate('/login')
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    if (pwForm.newPassword.length < 8) { setPwError('Мінімум 8 символів'); return }
    try {
      await api.put('/auth/password', pwForm)
      setPwSuccess(true)
      setPwForm({ currentPassword: '', newPassword: '' })
      setTimeout(() => { setPwPopover(false); setPwSuccess(false) }, 1500)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setPwError(msg ?? 'Помилка')
    }
  }

  const isTrainer = user?.role === 'TRAINER' || user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'
  const { pathname } = useLocation()

  return (
    <AppShell
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
    >
      <AppShell.Navbar p="sm" style={{ borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
        <Group mb="md" px="xs">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <img src={logoSvg} alt="Training Plan" style={{ height: 36 }} />
          <Text fw={600} size="sm" c="dark" style={{ letterSpacing: '-0.01em' }}>Training Plan</Text>
        </Group>

        <Stack gap={2} style={{ flex: 1 }}>
          <NavLink
            component={Link}
            to="/"
            label="Мій план"
            leftSection={<IconCalendar size={16} />}
            active={pathname === '/'}
            style={{ borderRadius: 8 }}
          />
          {isTrainer && (
            <>
              <NavLink
                component={Link}
                to="/trainer"
                label="Тренер"
                leftSection={<IconChartBar size={16} />}
                active={pathname === '/trainer'}
                style={{ borderRadius: 8 }}
              />
              <NavLink
                component={Link}
                to="/trainer/athletes"
                label="Команди"
                leftSection={<IconUsers size={16} />}
                active={pathname.startsWith('/trainer/athletes')}
                style={{ borderRadius: 8 }}
              />
            </>
          )}
          {isAdmin && (
            <NavLink
              component={Link}
              to="/admin"
              label="Адмін"
              leftSection={<IconShield size={16} />}
              active={pathname.startsWith('/admin')}
              style={{ borderRadius: 8 }}
            />
          )}
        </Stack>

        <Divider my="sm" />

        <Box px="xs">
          <Group mb="xs" gap="xs">
            <Avatar size="sm" color="blue" radius="xl">
              {user?.name?.[0]?.toUpperCase()}
            </Avatar>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>{user?.name}</Text>
              <Text size="xs" c="dimmed" truncate>{user?.email}</Text>
            </Box>
          </Group>

          <Popover opened={pwPopover} onChange={setPwPopover} width={280} position="top-start">
            <Popover.Target>
              <NavLink
                label="Змінити пароль"
                leftSection={<IconLock size={14} />}
                onClick={() => { setPwPopover((v) => !v); setPwError('') }}
                style={{ borderRadius: 8, fontSize: '0.8125rem' }}
              />
            </Popover.Target>
            <Popover.Dropdown>
              <form onSubmit={handlePasswordChange}>
                <Stack gap="xs">
                  <Text fw={600} size="sm">Змінити пароль</Text>
                  <PasswordInput
                    placeholder="Поточний пароль"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    required
                    size="xs"
                  />
                  <PasswordInput
                    placeholder="Новий пароль (мін. 8)"
                    value={pwForm.newPassword}
                    onChange={(e) => { setPwForm((f) => ({ ...f, newPassword: e.target.value })); setPwError('') }}
                    required
                    size="xs"
                  />
                  {pwError && <Text c="red" size="xs">{pwError}</Text>}
                  {pwSuccess && <Text c="green" size="xs">Пароль змінено ✓</Text>}
                  <Button type="submit" size="xs" fullWidth>Зберегти</Button>
                </Stack>
              </form>
            </Popover.Dropdown>
          </Popover>

          <NavLink
            label="Вийти"
            leftSection={<IconLogout size={14} />}
            onClick={handleLogout}
            c="red"
            style={{ borderRadius: 8, fontSize: '0.8125rem' }}
          />
        </Box>
      </AppShell.Navbar>

      <AppShell.Main style={{ background: 'var(--color-bg)' }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
