'use client'

function formatDate(value: string) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`

  const digits = trimmed.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

type Props = {
  name: string
  defaultValue?: string | null
  autoComplete?: string
  title?: string
}

export default function ManualDateInput({ name, defaultValue = '', autoComplete = 'off', title = 'Enter date as MM/DD/YYYY' }: Props) {
  return (
    <input
      className="input"
      type="text"
      name={name}
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder="MM/DD/YYYY"
      maxLength={10}
      pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
      title={title}
      defaultValue={formatDate(defaultValue || '')}
      onInput={(event) => {
        event.currentTarget.value = formatDate(event.currentTarget.value)
      }}
    />
  )
}
