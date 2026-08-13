'use client'

function formatDob(value: string) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`

  const digits = trimmed.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export default function DateOfBirthInput({ defaultValue = '' }: { defaultValue?: string | null }) {
  return (
    <input
      className="input"
      type="text"
      name="date_of_birth"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="MM/DD/YYYY"
      maxLength={10}
      pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
      title="Enter the date of birth as MM/DD/YYYY"
      defaultValue={formatDob(defaultValue || '')}
      onInput={(event) => {
        event.currentTarget.value = formatDob(event.currentTarget.value)
      }}
    />
  )
}
