import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  AppShell, Group, Text, Stack, Button, Popover, Drawer,
  PasswordInput, Divider, Box, Avatar, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendar, IconUsers, IconChartBar, IconDeviceWatch,
  IconShield, IconLogout, IconLock, IconChevronsLeft, IconChevronsRight, IconDownload, IconUser,
} from '@tabler/icons-react'
import { IconStrava } from './IconStrava.js'
import { useAuthStore } from '../store/auth.js'
import logoSvg from '../assets/logo.svg'
import { api } from '../api/client.js'
import { usePWAInstall } from '../hooks/usePWAInstall.js'

const COLLAPSED_WIDTH = 60
const EXPANDED_WIDTH = 220

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [pwPopover, setPwPopover] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const { canInstall, install } = usePWAInstall()
  const [profileDrawer, { open: openProfile, close: closeProfile }] = useDisclosure(false)

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
    { to: '/', label: 'Мій план', icon: <IconCalendar size={20} />, active: pathname === '/', show: true },
    { to: '/watch-workouts', label: 'Годинник', icon: <IconDeviceWatch size={20} />, active: pathname.startsWith('/watch-workouts'), show: true },
    { to: '/trainer', label: 'Тренер', icon: <IconChartBar size={20} />, active: pathname === '/trainer', show: isTrainer },
    { to: '/trainer/athletes', label: 'Команди', icon: <IconUsers size={20} />, active: pathname.startsWith('/trainer/athletes'), show: isTrainer },
    { to: '/admin', label: 'Адмін', icon: <IconShield size={20} />, active: pathname.startsWith('/admin'), show: isAdmin },
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
    <>
      <AppShell
        navbar={{ width: navWidth, breakpoint: 'sm', collapsed: { mobile: true } }}
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
            {collapsed ? (
              <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <img src={logoSvg} alt="Splitly" style={{ height: 32 }} />
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
              <Group style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Group gap="xs" style={{ flexWrap: 'nowrap', overflow: 'hidden' }}>
                  <img src={logoSvg} alt="Splitly" style={{ height: 32, flexShrink: 0 }} />
                  <Text fw={600} size="sm" c="dark" style={{ letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                    Splitly
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
          <Box px="xs" pb="xs">
            {collapsed ? (
              <Stack gap={4} align="center">
                <Tooltip label={user?.name ?? ''} position="right" withArrow>
                  <Avatar size="sm" color="blue" radius="xl" style={{ cursor: 'default' }}>
                    {user?.name?.[0]?.toUpperCase()}
                  </Avatar>
                </Tooltip>
                {canInstall && (
                  <Tooltip label="Встановити додаток" position="right" withArrow>
                    <Box
                      onClick={install}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-blue-6)', padding: '0.375rem', borderRadius: 6 }}
                    >
                      <IconDownload size={16} />
                    </Box>
                  </Tooltip>
                )}
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

                {canInstall && (
                  <Box
                    onClick={install}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.375rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                      fontSize: '0.8125rem', color: 'var(--mantine-color-blue-6)',
                      marginBottom: '0.25rem',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--mantine-color-blue-0)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <IconDownload size={14} />
                    Встановити додаток
                  </Box>
                )}

                <Link to="/strava/connect" style={{ textDecoration: 'none' }}>
                  <Box
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.375rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                      fontSize: '0.8125rem', color: 'var(--color-strava)',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff4ef' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <IconStrava size={14} color="var(--color-strava)" />
                    Strava
                  </Box>
                </Link>

                <Link to="/intervals" style={{ textDecoration: 'none' }}>
                  <Box
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.375rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                      fontSize: '0.8125rem', color: '#e8420a',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff4ef' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <IconDeviceWatch size={14} style={{ color: '#e8420a' }} />
                    Intervals.icu
                  </Box>
                </Link>

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
          <Text size="xs" c="dimmed" style={{ padding: '0.5rem 0.75rem', marginTop: 'auto' }}>
            v{__APP_VERSION__}
          </Text>
        </AppShell.Navbar>

        <AppShell.Main style={{ background: 'var(--color-bg)' }}>
          <Outlet />
        </AppShell.Main>
      </AppShell>

      {/* Mobile bottom navigation */}
      <Box
        hiddenFrom="sm"
        component="nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 200,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navItems.filter((n) => n.show).map((n) => (
          <Link
            key={n.to}
            to={n.to}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '0.5rem 0.25rem',
              textDecoration: 'none',
              color: n.active ? 'var(--color-primary)' : 'var(--mantine-color-gray-5)',
              fontSize: '0.625rem',
              fontWeight: n.active ? 600 : 400,
              minHeight: 56,
            }}
          >
            {n.icon}
            <span>{n.label}</span>
          </Link>
        ))}
        <Box
          onClick={openProfile}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 2, padding: '0.5rem 0.25rem',
            cursor: 'pointer', color: 'var(--mantine-color-gray-5)', fontSize: '0.625rem', minHeight: 56,
          }}
        >
          <IconUser size={20} />
          <span>Профіль</span>
        </Box>
      </Box>

      {/* Mobile profile drawer */}
      <Drawer opened={profileDrawer} onClose={closeProfile} position="bottom" size="auto" title={null} hiddenFrom="sm">
        <Stack gap="xs" pb="md">
          <Group gap="sm">
            <Avatar size="md" color="blue" radius="xl">{user?.name?.[0]?.toUpperCase()}</Avatar>
            <Box>
              <Text fw={600} size="sm">{user?.name}</Text>
              <Text size="xs" c="dimmed">{user?.email}</Text>
            </Box>
          </Group>
          <Divider />
          {canInstall && (
            <Box onClick={() => { install(); closeProfile() }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', color: 'var(--mantine-color-blue-6)' }}>
              <IconDownload size={18} />
              <Text size="sm">Встановити додаток</Text>
            </Box>
          )}
          <Link to="/strava/connect" style={{ textDecoration: 'none', color: 'var(--color-strava)' }} onClick={closeProfile}>
            <Box style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }}>
              <IconStrava size={18} color="var(--color-strava)" />
              <Text size="sm" style={{ color: 'var(--color-strava)' }}>Strava</Text>
            </Box>
          </Link>
          <Link to="/intervals" style={{ textDecoration: 'none', color: '#e8420a' }} onClick={closeProfile}>
            <Box style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }}>
              <IconDeviceWatch size={18} style={{ color: '#e8420a' }} />
              <Text size="sm" style={{ color: '#e8420a' }}>Intervals.icu</Text>
            </Box>
          </Link>
          <Popover opened={pwPopover} onChange={setPwPopover} width="100%" position="top">
            <Popover.Target>
              <Box onClick={() => { setPwPopover((v) => !v); setPwError('') }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }}>
                <IconLock size={18} style={{ color: 'var(--mantine-color-gray-6)' }} />
                <Text size="sm">Змінити пароль</Text>
              </Box>
            </Popover.Target>
            <Popover.Dropdown>
              <form onSubmit={handlePasswordChange}>
                <Stack gap="xs">
                  <Text fw={600} size="sm">Змінити пароль</Text>
                  <PasswordInput placeholder="Поточний пароль" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} required size="xs" />
                  <PasswordInput placeholder="Новий пароль (мін. 8)" value={pwForm.newPassword} onChange={(e) => { setPwForm((f) => ({ ...f, newPassword: e.target.value })); setPwError('') }} required size="xs" />
                  {pwError && <Text c="red" size="xs">{pwError}</Text>}
                  {pwSuccess && <Text c="green" size="xs">Пароль змінено ✓</Text>}
                  <Button type="submit" size="xs" fullWidth>Зберегти</Button>
                </Stack>
              </form>
            </Popover.Dropdown>
          </Popover>
          <Box onClick={() => { handleLogout(); closeProfile() }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', color: 'var(--mantine-color-red-6)' }}>
            <IconLogout size={18} />
            <Text size="sm">Вийти</Text>
          </Box>
          <Text size="xs" c="dimmed" style={{ paddingTop: '0.75rem' }}>v{__APP_VERSION__}</Text>
        </Stack>
      </Drawer>
    </>
  )
}
