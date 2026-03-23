import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  AppShell, Burger, Group, Text, Stack, Button, Popover,
  PasswordInput, Divider, Box, Avatar, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendar, IconUsers, IconChartBar,
  IconShield, IconLogout, IconLock, IconChevronsLeft, IconChevronsRight,
} from '@tabler/icons-react'
import { useAuthStore } from '../store/auth.js'
import logoSvg from '../assets/logo.svg'
import { api } from '../api/client.js'

const COLLAPSED_WIDTH = 60
const EXPANDED_WIDTH = 220

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [opened, { toggle }] = useDisclosure()
  const [collapsed, setCollapsed] = useState(false)
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

  const navItems = [
    { to: '/', label: 'Мій план', icon: <IconCalendar size={18} />, active: pathname === '/', show: true },
    { to: '/trainer', label: 'Тренер', icon: <IconChartBar size={18} />, active: pathname === '/trainer', show: isTrainer },
    { to: '/trainer/athletes', label: 'Команди', icon: <IconUsers size={18} />, active: pathname.startsWith('/trainer/athletes'), show: isTrainer },
    { to: '/admin', label: 'Адмін', icon: <IconShield size={18} />, active: pathname.startsWith('/admin'), show: isAdmin },
  ]

  const navWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH

  const NavItem = ({ to, label, icon, active }: { to: string; label: string; icon: React.ReactNode; active: boolean }) => {
    const item = (
      <Link
        to={to}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : '0.625rem',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
          borderRadius: 8,
          textDecoration: 'none',
          color: active ? 'var(--mantine-color-blue-6)' : 'var(--color-text)',
          background: active ? 'var(--mantine-color-blue-0)' : 'transparent',
          fontWeight: active ? 600 : 400,
          fontSize: '0.875rem',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'var(--mantine-color-gray-0)' }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: active ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-6)' }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
      </Link>
    )
    return collapsed ? <Tooltip label={label} position="right" withArrow>{item}</Tooltip> : item
  }

  return (
    <AppShell
      navbar={{ width: navWidth, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={0}
      style={{ '--app-shell-transition-duration': '0.2s' } as React.CSSProperties}
    >
      <AppShell.Navbar
        style={{
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          width: navWidth,
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Logo header */}
        <Box mb="md" style={{ padding: collapsed ? '0.75rem 0' : '0.75rem 0.5rem 0.75rem 0.75rem' }}>
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          {collapsed ? (
            <Box visibleFrom="sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <img src={logoSvg} alt="Training Plan" style={{ height: 32 }} />
              <Tooltip label="Розгорнути" position="right" withArrow>
                <Box
                  onClick={() => setCollapsed(false)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-gray-5)', padding: '0.25rem', borderRadius: 6 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-blue-6)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-gray-5)' }}
                >
                  <IconChevronsRight size={16} />
                </Box>
              </Tooltip>
            </Box>
          ) : (
            <Group visibleFrom="sm" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Group gap="xs" style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
                <img src={logoSvg} alt="Training Plan" style={{ height: 32, flexShrink: 0 }} />
                <Text fw={600} size="sm" c="dark" style={{ letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                  Training Plan
                </Text>
              </Group>
              <Tooltip label="Згорнути" position="right" withArrow>
                <Box
                  onClick={() => setCollapsed(true)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-gray-5)', padding: '0.25rem', borderRadius: 6, flexShrink: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-blue-6)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-gray-5)' }}
                >
                  <IconChevronsLeft size={16} />
                </Box>
              </Tooltip>
            </Group>
          )}
        </Box>

        {/* Nav items */}
        <Stack gap={2} style={{ flex: 1, padding: collapsed ? '0 0.375rem' : '0 0.5rem' }}>
          {navItems.filter((n) => n.show).map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </Stack>

        <Divider my="sm" />

        {/* User section */}
        <Box px={collapsed ? 'xs' : 'xs'} pb="xs">
          {collapsed ? (
            <Stack gap={4} align="center">
              <Tooltip label={user?.name ?? ''} position="right" withArrow>
                <Avatar size="sm" color="blue" radius="xl" style={{ cursor: 'default' }}>
                  {user?.name?.[0]?.toUpperCase()}
                </Avatar>
              </Tooltip>
              <Tooltip label="Змінити пароль" position="right" withArrow>
                <Box
                  onClick={() => { setPwPopover((v) => !v); setPwError('') }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-gray-6)', padding: '0.375rem', borderRadius: 6 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-blue-6)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'var(--mantine-color-gray-6)' }}
                >
                  <IconLock size={16} />
                </Box>
              </Tooltip>
              <Tooltip label="Вийти" position="right" withArrow>
                <Box
                  onClick={handleLogout}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-red-5)', padding: '0.375rem', borderRadius: 6 }}
                >
                  <IconLogout size={16} />
                </Box>
              </Tooltip>
            </Stack>
          ) : (
            <>
              <Group mb="xs" gap="xs" style={{ flexWrap: 'nowrap' }}>
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
                  <Box
                    onClick={() => { setPwPopover((v) => !v); setPwError('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.375rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                      fontSize: '0.8125rem', color: 'var(--color-text)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-gray-0)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <IconLock size={14} style={{ color: 'var(--mantine-color-gray-6)' }} />
                    Змінити пароль
                  </Box>
                </Popover.Target>
                <Popover.Dropdown>
                  <form onSubmit={handlePasswordChange}>
                    <Stack gap="xs">
                      <Text fw={600} size="sm">Змінити пароль</Text>
                      <PasswordInput
                        placeholder="Поточний пароль"
                        value={pwForm.currentPassword}
                        onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                        required size="xs"
                      />
                      <PasswordInput
                        placeholder="Новий пароль (мін. 8)"
                        value={pwForm.newPassword}
                        onChange={(e) => { setPwForm((f) => ({ ...f, newPassword: e.target.value })); setPwError('') }}
                        required size="xs"
                      />
                      {pwError && <Text c="red" size="xs">{pwError}</Text>}
                      {pwSuccess && <Text c="green" size="xs">Пароль змінено ✓</Text>}
                      <Button type="submit" size="xs" fullWidth>Зберегти</Button>
                    </Stack>
                  </form>
                </Popover.Dropdown>
              </Popover>

              <Box
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.375rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                  fontSize: '0.8125rem', color: 'var(--mantine-color-red-6)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-red-0)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <IconLogout size={14} />
                Вийти
              </Box>
            </>
          )}
        </Box>
      </AppShell.Navbar>

      <AppShell.Main style={{ background: 'var(--color-bg)' }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}