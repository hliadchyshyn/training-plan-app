import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Modal, Stack, Text, Button, Group, Divider } from '@mantine/core'
import { IconDeviceWatch, IconCopy, IconCalendar } from '@tabler/icons-react'
import { api } from '../api/client.js'

interface Props {
  templateId: string
  templateName: string
  opened: boolean
  onClose: () => void
}

export default function UseTemplateModal({ templateId, templateName, opened, onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [calDate, setCalDate] = useState(() => new Date().toISOString().slice(0, 10))

  const toWatchMutation = useMutation({
    mutationFn: () => api.post('/templates/apply/watch', { templateId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['watch-workouts'] })
      onClose()
      navigate(`/watch-workouts/${res.data.id}`)
    },
    onError: () => setError('Помилка створення тренування для годинника'),
  })

  const toCalendarMutation = useMutation({
    mutationFn: () => api.post('/templates/apply/calendar', { templateId, date: calDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['week'] })
      onClose()
      navigate('/')
    },
    onError: () => setError('Помилка планування тренування'),
  })

  const forkMutation = useMutation({
    mutationFn: () => api.post(`/templates/${templateId}/fork`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      onClose()
      navigate(`/templates/${res.data.id}/edit`)
    },
    onError: () => setError('Помилка збереження копії'),
  })

  const isPending = toWatchMutation.isPending || toCalendarMutation.isPending || forkMutation.isPending

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Використати шаблон</Text>}
      size="sm"
      centered
    >
      <Stack gap="xs">
        <Text size="sm" c="dimmed" mb={4}>«{templateName}»</Text>

        {error && <Text c="red" size="sm">{error}</Text>}

        {/* Schedule to calendar */}
        <div style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, padding: '10px 12px' }}>
          <Text size="sm" fw={500} mb={8} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCalendar size={15} /> Запланувати на дату
          </Text>
          <Group gap={8} align="flex-end">
            <input
              type="date"
              value={calDate}
              onChange={(e) => setCalDate(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 6 }}
              disabled={isPending}
            />
            <Button
              size="sm"
              onClick={() => toCalendarMutation.mutate()}
              loading={toCalendarMutation.isPending}
              disabled={isPending}
            >
              Додати
            </Button>
          </Group>
        </div>

        <Divider label="або" labelPosition="center" />

        <Button
          variant="filled"
          leftSection={<IconDeviceWatch size={16} />}
          onClick={() => toWatchMutation.mutate()}
          loading={toWatchMutation.isPending}
          disabled={isPending}
          fullWidth
        >
          Синхронізувати на годинник
        </Button>

        <Button
          variant="light"
          leftSection={<IconCopy size={16} />}
          onClick={() => forkMutation.mutate()}
          loading={forkMutation.isPending}
          disabled={isPending}
          fullWidth
        >
          Зберегти як особистий шаблон
        </Button>

        <Group justify="flex-end" mt={4}>
          <Button variant="subtle" color="gray" onClick={onClose} disabled={isPending} size="sm">
            Скасувати
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
