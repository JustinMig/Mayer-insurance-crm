'use client'

import { useRef, useState, type DragEvent } from 'react'

type Props = {
  label: string
  accept?: string
  disabled?: boolean
  onFile: (file: File) => void | Promise<void>
}

export default function FileDropZone({ label, accept = 'image/*,.pdf,.txt,.doc,.docx', disabled = false, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  function chooseFile(file?: File) {
    if (!file || disabled) return
    void onFile(file)
  }

  function openPicker() {
    if (disabled || !inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className={`file-drop-zone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) event.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={handleDrop}
      onClick={openPicker}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPicker() } }}
      aria-disabled={disabled}
    >
      <strong>{label}</strong>
      <span>Drag &amp; drop a file here, or tap/click to choose</span>
      <input
        ref={inputRef}
        type="file"
        hidden
        disabled={disabled}
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          chooseFile(file)
        }}
      />
    </div>
  )
}
