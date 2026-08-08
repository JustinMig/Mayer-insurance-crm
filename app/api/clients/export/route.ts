import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  county: string | null
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
}

type ExportFieldKey = 'first_name' | 'last_name' | 'mailing_address' | 'phone' | 'email' | 'date_of_birth' | 'county' | 'products'

const FIELD_LABELS: Record<ExportFieldKey, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  mailing_address: 'Mailing Address',
  phone: 'Phone',
  email: 'Email',
  date_of_birth: 'Date of Birth',
  county: 'County',
  products: 'Products'
}

const ALLOWED_PRODUCTS = new Set(['', 'life', 'medicare', 'retirement', 'life_medicare', 'non_life', 'non_medicare'])
const CLIENT_SELECT = 'id,assigned_agent_id,first_name,last_name,date_of_birth,email,phone,address_line1,city,state,zip_code,county,is_medicare,is_life,is_retirement'

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function products(client: ClientRow) {
  const values = []
  if (client.is_life) values.push('Life')
  if (client.is_medicare) values.push('Medicare')
  if (client.is_retirement) values.push('Retirement')
  return values.join('; ')
}

function mailingAddress(client: ClientRow) {
  const cityStateZip = [client.city, client.state, client.zip_code].filter(Boolean).join(' ')
  return [client.address_line1, cityStateZip].filter(Boolean).join(', ')
}

function fieldValue(client: ClientRow, field: ExportFieldKey) {
  switch (field) {
    case 'first_name': return client.first_name || ''
    case 'last_name': return client.last_name || ''
    case 'mailing_address': return mailingAddress(client)
    case 'phone': return client.phone || ''
    case 'email': return client.email || ''
    case 'date_of_birth': return client.date_of_birth || ''
    case 'county': return client.county || ''
    case 'products': return products(client)
  }
}

function wrapText(text: string, maxLength = 86) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if (`${current} ${word}`.length <= maxLength) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function pdfSafe(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function makePdf(clients: ClientRow[], fields: ExportFieldKey[]) {
  const lines: string[] = ['Mayer Insurance Group CRM - Client Export', `Clients: ${clients.length}`, '']

  clients.forEach((client, index) => {
    for (const field of fields) {
      const label = FIELD_LABELS[field]
      const value = fieldValue(client, field) || '-'
      const wrapped = wrapText(`${label}: ${value}`)
      lines.push(...wrapped)
    }
    if (index !== clients.length - 1) lines.push('')
  })

  const maxLinesPerPage = 49
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage))
  }
  if (pages.length === 0) pages.push(['Mayer Insurance Group CRM - Client Export', 'Clients: 0'])

  const pageObjectIds = pages.map((_, index) => 4 + (index * 2))
  const contentObjectIds = pages.map((_, index) => 5 + (index * 2))
  const objectCount = 3 + (pages.length * 2)
  const objects = new Map<number, string>()

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index]
    const contentId = contentObjectIds[index]
    const commands = [
      'BT',
      '/F1 10 Tf',
      '50 752 Td',
      '14 TL',
      ...pageLines.map((line) => `(${pdfSafe(line)}) Tj T*`),
      'ET'
    ].join('\n')
    const streamLength = Buffer.byteLength(commands, 'ascii')

    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.set(contentId, `<< /Length ${streamLength} >>\nstream\n${commands}\nendstream`)
  })

  let pdf = '%PDF-1.4\n%MIGCRM\n'
  const offsets: number[] = [0]
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii')
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii')
  pdf += `xref\n0 ${objectCount + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= objectCount; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'ascii')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.agency_id) return NextResponse.json({ error: 'CRM profile not found.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const format = body?.format === 'pdf' ? 'pdf' : body?.format === 'csv' ? 'csv' : ''
  const requestedFields: string[] = Array.isArray(body?.fields)
    ? body.fields.map((field: unknown) => String(field))
    : []
  const fields: ExportFieldKey[] = requestedFields.filter(
    (field): field is ExportFieldKey => field in FIELD_LABELS
  )
  const q = String(body?.q || '').trim()
  const product = String(body?.product || '')
  const turn65 = body?.turn65 === true
  const requestedAgent = String(body?.agent || '').trim()

  if (!format) return NextResponse.json({ error: 'Choose CSV or PDF.' }, { status: 400 })
  if (fields.length === 0) return NextResponse.json({ error: 'Select at least 1 export field.' }, { status: 400 })
  if (!ALLOWED_PRODUCTS.has(product)) return NextResponse.json({ error: 'Invalid product filter.' }, { status: 400 })

  const canFilterByAgent = profile.role === 'admin' || profile.role === 'manager'
  let selectedAgent = ''
  if (requestedAgent && canFilterByAgent) {
    const { data: agent } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', requestedAgent)
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .maybeSingle()

    if (!agent) return NextResponse.json({ error: 'The selected agent is not available.' }, { status: 400 })
    selectedAgent = agent.id
  }

  const allClients: ClientRow[] = []
  const pageSize = 1000
  const maxRows = 50000

  for (let start = 0; start < maxRows; start += pageSize) {
    let query = supabase
      .from('clients')
      .select(CLIENT_SELECT)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .range(start, start + pageSize - 1)

    if (q) {
      const safe = q.replace(/[,%()]/g, ' ').trim()
      if (safe) query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    }

    if (product === 'life') query = query.eq('is_life', true)
    if (product === 'medicare') query = query.eq('is_medicare', true)
    if (product === 'retirement') query = query.eq('is_retirement', true)
    if (product === 'life_medicare') query = query.eq('is_life', true).eq('is_medicare', true)
    if (product === 'non_life') query = query.eq('is_life', false)
    if (product === 'non_medicare') query = query.eq('is_medicare', false)
    if (selectedAgent) query = query.eq('assigned_agent_id', selectedAgent)

    if (turn65) {
      const birthYear = new Date().getFullYear() - 65
      query = query.gte('date_of_birth', `${birthYear}-01-01`).lte('date_of_birth', `${birthYear}-12-31`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data || []) as ClientRow[]
    allClients.push(...rows)
    if (rows.length < pageSize) break
  }

  const dateStamp = new Date().toISOString().slice(0, 10)

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    action: 'export_clients',
    details: {
      format,
      fields,
      product: product || null,
      turn65,
      selected_agent_id: selectedAgent || null,
      search_applied: Boolean(q),
      client_count: allClients.length
    }
  })

  if (format === 'csv') {
    const header = fields.map((field) => csvCell(FIELD_LABELS[field])).join(',')
    const rows = allClients.map((client) => fields.map((field) => csvCell(fieldValue(client, field))).join(','))
    const csv = `\uFEFF${[header, ...rows].join('\r\n')}`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mayer-client-export-${dateStamp}.csv"`,
        'Cache-Control': 'private, no-store'
      }
    })
  }

  const pdf = makePdf(allClients, fields)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="mayer-client-export-${dateStamp}.pdf"`,
      'Cache-Control': 'private, no-store'
    }
  })
}
