import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button, TextInput, Group, Text, Stack, Divider, ActionIcon,
  Table, Badge, Input,
} from '@mantine/core'
import { IconPlus, IconTrash, IconUserPlus, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { api } from '../../api/client.js'

interface Athlete { id: string; name: string; email: string; role: string }
interface Team {
  id: string
  name: string
  members: Array<{ athlete: Athlete }>
}

export function TeamManagementPage() {
  const qc = useQueryClient()
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data),
  })

  const { data: availableAthletes = [] } = useQuery<Athlete[]>({
    queryKey: ['team-athletes', selectedTeam],
    queryFn: () => api.get(`/teams/${selectedTeam}/athletes`).then((r) => r.data),
    enabled: !!selectedTeam,
  })

  const createTeam = useMutation({
    mutationFn: () => api.post('/teams', { name: newTeamName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      setNewTeamName('')
      setCreateError('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
      setCreateError(msg ?? 'Помилка створення команди')
    },
  })

  const addMember = useMutation({
    mutationFn: ({ teamId, athleteId }: { teamId: string; athleteId: string }) =>
      api.post(`/teams/${teamId}/members`, { athleteId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-athletes', selectedTeam] })
    },
  })

  const removeMember = useMutation({
    mutationFn: ({ teamId, athleteId }: { teamId: string; athleteId: string }) =>
      api.delete(`/teams/${teamId}/members/${athleteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-athletes', selectedTeam] })
    },
  })

  return (
    <div className="page">
      <Text fw={700} size="xl" mb="lg">Команди</Text>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <Text fw={600} size="sm" mb="sm">Нова команда</Text>
        <form onSubmit={(e) => {
          e.preventDefault()
          const name = newTeamName.trim()
          if (!name) { setCreateError('Введіть назву команди'); return }
          setCreateError('')
          createTeam.mutate()
        }}>
          <Group gap="sm">
            <Input
              value={newTeamName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTeamName(e.target.value)}
              placeholder="Назва команди"
              style={{ flex: 1 }}
            />
            <Button
              type="submit"
              leftSection={<IconPlus size={14} />}
              loading={createTeam.isPending}
              disabled={!newTeamName.trim()}
            >
              Створити
            </Button>
          </Group>
        </form>
        {createError && <Text c="red" size="sm" mt="xs">{createError}</Text>}
      </div>

      {isLoading && <Text c="dimmed">Завантаження...</Text>}

      <Stack gap="md">
        {teams.map((team) => (
          <div key={team.id} className="card">
            <Group justify="space-between" mb="sm">
              <Group gap="sm">
                <Text fw={600}>{team.name}</Text>
                <Badge variant="light" color="blue" size="sm">
                  {team.members.length} спортсменів
                </Badge>
              </Group>
              <Button
                variant="light"
                size="xs"
                rightSection={selectedTeam === team.id ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
              >
                {selectedTeam === team.id ? 'Зберегти' : 'Додати спортсмена'}
              </Button>
            </Group>

            {team.members.length === 0 ? (
              <Text c="dimmed" size="sm">Немає спортсменів</Text>
            ) : (
              <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
                <Table.Tbody>
                  {team.members.map(({ athlete }) => (
                    <Table.Tr key={athlete.id}>
                      <Table.Td style={{ paddingLeft: 0 }}>
                        <Text size="sm" fw={500}>{athlete.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{athlete.email}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: 40, paddingRight: 0 }}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => removeMember.mutate({ teamId: team.id, athleteId: athlete.id })}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            {selectedTeam === team.id && (
              <>
                <Divider my="sm" />
                <Text size="sm" fw={600} mb="xs">Доступні спортсмени:</Text>
                {availableAthletes.length === 0 ? (
                  <Text c="dimmed" size="sm">Всі зареєстровані спортсмени вже в цій команді</Text>
                ) : (
                  <Stack gap="xs">
                    {availableAthletes.map((athlete) => (
                      <Group key={athlete.id} justify="space-between" px="xs" py={6}
                        style={{ borderRadius: 6, border: '1px solid var(--color-border)' }}>
                        <div>
                          <Text size="sm" fw={500}>{athlete.name}</Text>
                          <Text size="xs" c="dimmed">{athlete.email}</Text>
                        </div>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconUserPlus size={14} />}
                          onClick={() => addMember.mutate({ teamId: team.id, athleteId: athlete.id })}
                          loading={addMember.isPending}
                        >
                          Додати
                        </Button>
                      </Group>
                    ))}
                  </Stack>
                )}
              </>
            )}
          </div>
        ))}
      </Stack>
    </div>
  )
}
