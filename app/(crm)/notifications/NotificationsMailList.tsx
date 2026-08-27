'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './Notifications.module.css'

type MailRow = {
  id: string
  sender_name: string | null
  sender_email: string | null
  subject: string | null
  snippet: string | null
  received_at: string
  read_at: string | null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function NotificationsMailList({ initialMail }: { initialMail: MailRow[] }) {
  const router = useRouter()
  const [mail, setMail] = useState(initialMail)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = mail.length > 0 && mail.every((item) => selectedSet.has(item.id))

  function toggle(id: string) {
    setMessage('')
    setError(false)
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function toggleAll() {
    setMessage('')
    setError(false)
    setSelectedIds(allSelected ? [] : mail.map((item) => item.id))
  }

  async function deleteSelected() {
    if (!selectedIds.length || deleting) return
    const count = selectedIds.length
    const confirmed = window.confirm(`Remove ${count} selected message${count === 1 ? '' : 's'} from the CRM mailbox?\n\nThis uses the same removal behavior as deleting a message from its detail screen. It does not delete the original message from Gmail.`)
    if (!confirmed) return

    setDeleting(true)
    setMessage('')
    setError(false)
    try {
      const response = await fetch('/api/mail-center/bulk-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: selectedIds })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to remove selected messages.')
      const removedIds = new Set<string>(Array.isArray(data.removed_ids) ? data.removed_ids : selectedIds)
      const removedCount = Number(data.removed_count || removedIds.size)
      setMail((current) => current.filter((item) => !removedIds.has(item.id)))
      setSelectedIds([])
      setMessage(`${removedCount} message${removedCount === 1 ? '' : 's'} removed from the CRM mailbox.`)
      router.refresh()
    } catch (deleteError) {
      setError(true)
      setMessage(deleteError instanceof Error ? deleteError.message : 'Unable to remove selected messages.')
    } finally {
      setDeleting(false)
    }
  }

  if (!mail.length) {
    return (
      <div className={styles.listShell}>
        {message ? <div className={`${styles.message}${error ? ` ${styles.errorMessage}` : ''}`}>{message}</div> : null}
        <div className={styles.empty}>No CRM mail yet.</div>
      </div>
    )
  }

  return (
    <div className={styles.listShell}>
      <div className={styles.mailToolbar}>
        <label className={styles.selectAll}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all mail shown" />
          <span>Select all</span>
        </label>
        <div className={styles.bulkActions}>
          <span className={styles.selectionCount}>{selectedIds.length} selected</span>
          <button className={styles.deleteButton} type="button" disabled={!selectedIds.length || deleting} onClick={() => void deleteSelected()}>
            {deleting ? 'Removing…' : `Delete Selected${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
          </button>
        </div>
      </div>
      {message ? <div className={`${styles.message}${error ? ` ${styles.errorMessage}` : ''}`} style={{ margin: '10px 12px 0' }}>{message}</div> : null}
      <div className={styles.mailList}>
        {mail.map((item) => {
          const selected = selectedSet.has(item.id)
          return (
            <div className={`${styles.mailRow}${item.read_at ? '' : ` ${styles.mailRowUnread}`}`} key={item.id}>
              <label className={styles.mailCheckbox} onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={selected} onChange={() => toggle(item.id)} aria-label={`Select message from ${item.sender_name || item.sender_email || 'unknown sender'}`} />
              </label>
              <div className={styles.sender}>
                <div className={styles.senderLine}>
                  <strong>{item.sender_name || item.sender_email || 'Unknown sender'}</strong>
                  {!item.read_at ? <span className={styles.newBadge}>NEW</span> : null}
                </div>
                {item.sender_name && item.sender_email ? <span>{item.sender_email}</span> : null}
              </div>
              <Link prefetch={false} className={styles.mailLink} href={`/mail-center/${item.id}`}>
                <span className={styles.subject}>{item.subject || '(No subject)'}</span>
                {item.snippet ? <span className={styles.snippet}>{item.snippet}</span> : null}
              </Link>
              <Link prefetch={false} className={styles.mailMeta} href={`/mail-center/${item.id}`}>
                <span>{formatDate(item.received_at)}</span>
                <b>Open ›</b>
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
