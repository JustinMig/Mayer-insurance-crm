'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'

export async function markMailRead(id: string) {
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/notifications')
}

export async function removeMail(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return
  const { supabase, userId } = await getCrmSession()
  await supabase.from('crm_mail').update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  revalidatePath('/notifications')
  redirect('/notifications?tab=mail')
}
