'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type StoredField = {
  name: string
  index: number
  value: string
  checked?: boolean
}

type ClientDraft = {
  fields: StoredField[]
  openDetails: number[]
  scrollY: number
  dirty: boolean
}

const SENSITIVE_FIELD_PATTERN = /(ssn|drivers_license|medicare_number|medicaid_number|member_id|routing_number|account_number|debit_card|bank_)/i

function isPersistableControl(element: Element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return false
  if (!element.name || element.disabled) return false
  if (SENSITIVE_FIELD_PATTERN.test(element.name)) return false
  if (element instanceof HTMLInputElement && ['file', 'password', 'hidden', 'submit', 'button', 'reset'].includes(element.type)) return false
  return true
}

function collectDraft(form: HTMLFormElement, dirty: boolean): ClientDraft {
  const counts = new Map<string, number>()
  const fields: StoredField[] = []

  Array.from(form.elements).forEach(element => {
    if (!isPersistableControl(element)) return
    const index = counts.get(element.name) || 0
    counts.set(element.name, index + 1)
    fields.push({
      name: element.name,
      index,
      value: element.value,
      checked: element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio') ? element.checked : undefined
    })
  })

  const details = Array.from(form.querySelectorAll('details'))
  const openDetails = details.flatMap((detail, index) => detail.open ? [index] : [])

  return { fields, openDetails, scrollY: window.scrollY, dirty }
}

function restoreFields(form: HTMLFormElement, draft: ClientDraft) {
  const byName = new Map<string, Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>>()
  Array.from(form.elements).forEach(element => {
    if (!isPersistableControl(element)) return
    const current = byName.get(element.name) || []
    current.push(element)
    byName.set(element.name, current)
  })

  draft.fields.forEach(field => {
    const element = byName.get(field.name)?.[field.index]
    if (!element) return
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      element.checked = Boolean(field.checked)
    } else {
      element.value = field.value
    }
  })

  Array.from(form.querySelectorAll('details')).forEach((detail, index) => {
    detail.open = draft.openDetails.includes(index)
  })

  requestAnimationFrame(() => window.scrollTo({ top: draft.scrollY, behavior: 'auto' }))
}

export default function ClientDraftGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const [showPrompt, setShowPrompt] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const dirtyRef = useRef(false)
  const draftKeyRef = useRef('')
  const afterSaveKeyRef = useRef('')

  useEffect(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    if (!match) {
      setShowPrompt(false)
      formRef.current = null
      dirtyRef.current = false
      return
    }

    const clientId = match[1]
    const draftKey = `crm-client-draft:${clientId}`
    const afterSaveKey = `crm-client-save-to-search:${clientId}`
    draftKeyRef.current = draftKey
    afterSaveKeyRef.current = afterSaveKey

    const savedToSearch = sessionStorage.getItem(afterSaveKey) === '1'
    if (searchParams.get('updated') === '1' && savedToSearch) {
      sessionStorage.removeItem(afterSaveKey)
      sessionStorage.removeItem(draftKey)
      router.replace('/clients')
      return
    }
    if (savedToSearch && searchParams.get('updated') !== '1') {
      sessionStorage.removeItem(afterSaveKey)
    }

    const form = document.querySelector<HTMLFormElement>('form.client-profile-form')
    if (!form) return
    formRef.current = form

    let timer: ReturnType<typeof setTimeout> | null = null
    const stored = sessionStorage.getItem(draftKey)
    if (stored) {
      try {
        const draft = JSON.parse(stored) as ClientDraft
        dirtyRef.current = Boolean(draft.dirty)

        const storedMedicationCount = draft.fields.filter(field => field.name === 'medication_name').length
        const currentMedicationCount = form.querySelectorAll('[name="medication_name"]').length
        const addMedicationButton = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find(button => button.textContent?.includes('Add Medication'))
        if (addMedicationButton && storedMedicationCount > currentMedicationCount) {
          for (let index = currentMedicationCount; index < storedMedicationCount; index += 1) addMedicationButton.click()
          setTimeout(() => restoreFields(form, draft), 0)
        } else {
          restoreFields(form, draft)
        }
      } catch {
        sessionStorage.removeItem(draftKey)
      }
    } else {
      dirtyRef.current = false
    }

    const writeDraft = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(draftKey, JSON.stringify(collectDraft(form, dirtyRef.current)))
        } catch {
          // If browser storage is unavailable, leave the live form untouched.
        }
      }, 180)
    }

    const onFieldChange = () => {
      dirtyRef.current = true
      writeDraft()
    }
    const onUiChange = () => writeDraft()
    const onSubmit = () => {
      if (timer) clearTimeout(timer)
      sessionStorage.removeItem(draftKey)
      dirtyRef.current = false
    }

    form.addEventListener('input', onFieldChange)
    form.addEventListener('change', onFieldChange)
    form.addEventListener('toggle', onUiChange, true)
    form.addEventListener('submit', onSubmit)

    const backLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/clients"]')).find(link => link.textContent?.trim().toLowerCase() === 'back to search')
    const onBackToSearch = (event: MouseEvent) => {
      if (!dirtyRef.current) {
        sessionStorage.removeItem(draftKey)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      writeDraft()
      setShowPrompt(true)
    }
    backLink?.addEventListener('click', onBackToSearch)

    return () => {
      if (timer) clearTimeout(timer)
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(collectDraft(form, dirtyRef.current)))
      } catch {
        // Ignore storage failures during navigation.
      }
      form.removeEventListener('input', onFieldChange)
      form.removeEventListener('change', onFieldChange)
      form.removeEventListener('toggle', onUiChange, true)
      form.removeEventListener('submit', onSubmit)
      backLink?.removeEventListener('click', onBackToSearch)
    }
  }, [pathname, router, searchKey, searchParams])

  function discardAndSearch() {
    if (draftKeyRef.current) sessionStorage.removeItem(draftKeyRef.current)
    if (afterSaveKeyRef.current) sessionStorage.removeItem(afterSaveKeyRef.current)
    dirtyRef.current = false
    setShowPrompt(false)
    router.push('/clients')
  }

  function saveAndSearch() {
    const form = formRef.current
    if (!form) return
    if (afterSaveKeyRef.current) sessionStorage.setItem(afterSaveKeyRef.current, '1')
    setShowPrompt(false)
    form.requestSubmit()
  }

  if (!showPrompt) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-save-prompt-title"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.48)' }}
      onMouseDown={event => { if (event.target === event.currentTarget) setShowPrompt(false) }}
    >
      <div style={{ width: 'min(440px, 100%)', borderRadius: 18, background: '#fff', padding: 22, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)' }}>
        <h2 id="client-save-prompt-title" style={{ margin: 0, fontSize: 22 }}>Save client changes?</h2>
        <p style={{ margin: '10px 0 20px', color: '#475569', lineHeight: 1.5 }}>You have unsaved changes. Save them before going back to Client Records?</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowPrompt(false)}>Cancel</button>
          <button type="button" className="btn btn-secondary" onClick={discardAndSearch}>Don&apos;t Save</button>
          <button type="button" className="btn btn-primary" onClick={saveAndSearch}>Save</button>
        </div>
      </div>
    </div>
  )
}
