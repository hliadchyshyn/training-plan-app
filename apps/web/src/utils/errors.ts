type ApiError = { response?: { data?: { error?: string; details?: Array<{ message: string }> } } }

export function getErrorMessage(err: unknown, fallback = 'Помилка'): string {
  const data = (err as ApiError).response?.data
  return data?.details?.[0]?.message ?? data?.error ?? fallback
}
