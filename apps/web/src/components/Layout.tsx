import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  AppShell, Group, Text, Stack,
  Divider, Box, Tooltip,
} from '@mantine/core'
import {
  IconCalendar, IconUsers, IconChartBar, IconDeviceWatch,
  IconShield, IconChevronsLeft, IconChevronsRight, IconUser,
} from '@tabler/icons-react'
import { useAuthStore } from '../store/auth.js'
import logoSvg from '../assets/logo.svg'

const COLLAPSED_WIDTH = 60
const EXPANDED_WIDTH = 220

export function Layout() {
  const { user } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()

  const isTrainer = user?.role === 'TRAINER' || user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'

  const navItems = [
    { to: '/', label: 'Мій план', icon: <IconCalendar size={20} />, active: pathname === '/', show: true },
    { to: '/watch-workouts', label: 'Тренування', icon: <IconDeviceWatch size={20} />, active: pathname.startsWith('/watch-workouts'), show: true },
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

          {/* Profile nav */}
          <Box px="xs" pb="xs">
            <NavItem
              to="/profile"
              label={user?.name ?? 'Профіль'}
              icon={<IconUser size={20} />}
              active={pathname === '/profile'}
            />
          </Box>
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
        <Link
          to="/profile"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 2, padding: '0.5rem 0.25rem',
            textDecoration: 'none',
            color: pathname === '/profile' ? 'var(--color-primary)' : 'var(--mantine-color-gray-5)',
            fontSize: '0.625rem', fontWeight: pathname === '/profile' ? 600 : 400, minHeight: 56,
          }}
        >
          <IconUser size={20} />
          <span>Профіль</span>
        </Link>
      </Box>
    </>
  )
}
