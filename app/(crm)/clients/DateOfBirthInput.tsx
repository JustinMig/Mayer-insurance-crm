'use client'

import ManualDateInput from './ManualDateInput'

export default function DateOfBirthInput({ defaultValue = '' }: { defaultValue?: string | null }) {
  return (
    <ManualDateInput
      name="date_of_birth"
      defaultValue={defaultValue}
      autoComplete="bday"
      title="Enter the date of birth as MM/DD/YYYY"
    />
  )
}
