import SoaSigner from './SoaSigner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SoaSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SoaSigner token={token} />
}
