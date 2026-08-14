'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteSubmissionButton({
  submissionId,
  submissionName,
}: {
  submissionId: string
  submissionName: string
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function deleteSubmission() {
    const confirmed = window.confirm(
      `Delete the form submission from ${submissionName}?\n\nThis permanently removes this website form submission from the CRM. This cannot be undone.`
    )

    if (!confirmed) return

    setDeleting(true)
    setError('')

    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('website_leads')
        .delete()
        .eq('id', submissionId)

      if (deleteError) throw deleteError

      window.location.href = '/website-leads?deleted=1'
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete this submission.'
      )
      setDeleting(false)
    }
  }

  return (
    <div className="delete-client-wrap">
      <button
        type="button"
        className="btn btn-danger"
        onClick={deleteSubmission}
        disabled={deleting}
      >
        {deleting ? 'Deleting…' : 'Delete Submission'}
      </button>
      {error ? <span className="delete-client-error">{error}</span> : null}
    </div>
  )
}
