'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import type { CompanyContact } from '@/lib/company-contacts'

const NASSAU_CONTACT: CompanyContact = {
  company: 'Nassau',
  phones: ['(800) 541-0171'],
  faxes: [],
  emails: [],
  notes: []
}

const CICA_CITIZENS_LIFE_CONTACT: CompanyContact = {
  company: 'CICA / Citizens Life',
  phones: ['Agents: (737) 289-4670', 'Clients: (877) 282-7127'],
  faxes: [],
  emails: [],
  notes: []
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim()
}

function searchableText(contact: CompanyContact) {
  return normalized([
    contact.company,
    ...contact.phones,
    ...contact.faxes,
    ...contact.emails,
    ...contact.notes
  ].join(' '))
}

export default function CompanyDirectory({ contacts }: { contacts: CompanyContact[] }) {
  const [query, setQuery] = useState('')
  const [selectedCompany, setSelectedCompany] = useState('')

  const directoryContacts = useMemo(() => {
    const extras = [NASSAU_CONTACT, CICA_CITIZENS_LIFE_CONTACT]
    const extraNames = new Set(extras.map((contact) => contact.company.trim().toLowerCase()))
    const withoutDuplicates = contacts.filter((contact) => !extraNames.has(contact.company.trim().toLowerCase()))
    return [...withoutDuplicates, ...extras]
  }, [contacts])

  const selected = useMemo(
    () => directoryContacts.find((contact) => contact.company === selectedCompany) || null,
    [directoryContacts, selectedCompany]
  )

  const matches = useMemo(() => {
    const needle = normalized(query)
    if (!needle) return []
    const terms = needle.split(/\s+/).filter(Boolean)
    return directoryContacts
      .filter((contact) => {
        const haystack = searchableText(contact)
        return terms.every((term) => haystack.includes(term))
      })
      .slice(0, 12)
  }, [directoryContacts, query])

  function choose(contact: CompanyContact) {
    setSelectedCompany(contact.company)
    setQuery(contact.company)
  }

  return (
    <section className="card card-pad company-directory-card dashboard-lookup-accent dashboard-lookup-accent-directory" style={{ marginTop: 20 }}>
      <div className="company-directory-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>Company Contact Directory</h2>
          <p className="subtle" style={{ margin: 0 }}>Search an insurance company to find its phone, fax, email, and notes.</p>
        </div>
        <span className="company-directory-count">{directoryContacts.length} companies</span>
      </div>

      <div className="company-directory-search-wrap">
        <input
          className="input company-directory-search dashboard-field dashboard-field-directory"
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value)
            if (event.target.value !== selectedCompany) setSelectedCompany('')
          }}
          placeholder="Search company name, phone, fax, or email"
          autoComplete="off"
          aria-label="Search company contact directory"
        />
        {query.trim() && !selected ? (
          <div className="company-directory-results" role="listbox" aria-label="Company search results">
            {matches.length ? matches.map((contact) => (
              <button key={contact.company} type="button" onClick={() => choose(contact)}>
                <strong>{contact.company}</strong>
                <span>{contact.phones[0] || contact.emails[0] || contact.faxes[0] || 'Contact details available'}</span>
              </button>
            )) : <div className="company-directory-no-results">No matching company found.</div>}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="company-directory-details">
          <div className="company-directory-company">{selected.company}</div>
          <div className="company-directory-grid">
            <div>
              <span>Phone</span>
              {selected.phones.length ? selected.phones.map((value) => <strong key={value}>{value}</strong>) : <strong>—</strong>}
            </div>
            <div>
              <span>Fax</span>
              {selected.faxes.length ? selected.faxes.map((value) => <strong key={value}>{value}</strong>) : <strong>—</strong>}
            </div>
            <div>
              <span>Email</span>
              {selected.emails.length ? selected.emails.map((value) => <a key={value} href={`mailto:${value}`}>{value}</a>) : <strong>—</strong>}
            </div>
          </div>
          {selected.notes.length ? (
            <div className="company-directory-notes">
              <span>Notes</span>
              {selected.notes.map((note) => <p key={note}>{note}</p>)}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="company-directory-empty">Start typing a company name above.</div>
      )}
    </section>
  )
}
