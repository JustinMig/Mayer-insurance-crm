export function canSeeAllClients(role: string | null | undefined) {
  return role === 'manager'
}

export function canAssignClients(role: string | null | undefined) {
  return role === 'manager'
}

export function canDeleteClients(role: string | null | undefined) {
  return role === 'manager' || role === 'admin'
}
