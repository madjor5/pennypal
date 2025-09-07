import prisma from '@/lib/prisma'
import Link from 'next/link'
  
export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      balanceMinor: true,
      currencyCode: true,
    },
    orderBy: { name: 'asc' },
  })

  return (
    <main className="p-6 mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Accounts</h1>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left border-b py-2">Name</th>
            <th className="text-right border-b py-2">Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => (
            <tr key={acc.id}>
              <td className="py-2 border-b"><Link href={`/accounts/${acc.id}`}>{acc.name}</Link></td>
              <td className="py-2 border-b text-right">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: acc.currencyCode,
                }).format(acc.balanceMinor / 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

