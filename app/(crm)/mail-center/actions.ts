'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'

export async function markMailRead(id: string) {
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/mail-center')
}

export async function moveMail(formData: FormData) {
  const id = String(formData.get('id') || '')
  const folder = String(formData.get('folder') || 'Inbox')
  const allowed = ['Inbox', 'Medicare', 'Life', 'Commissions', 'Underwriting', 'Carrier Notices', 'Client Documents']
  if (!id || !allowed.includes(folder)) return
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ folder, archived_at: null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/mail-center')
  redirect(`/mail-center/${id}`)
}

export async function archiveMail(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/mail-center')
  redirect('/mail-center?folder=Archived')
}

export async function removeMail(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/mail-center')
  redirect('/mail-center')
}
