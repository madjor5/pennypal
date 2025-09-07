import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AccountPage({ params }: { params: { account: string } }) {
  const { account } = await params
  const accountData = await prisma.account.findUnique({
    where: { id: account },
    include: {
      transactions: {
        orderBy: {
          bookedAt: 'desc',
        },
      },
    },
  })
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 w-full max-w-lg">
      <h1 className="flex justify-between items-center">
        {accountData ? (
          <>
            <span>Account: {accountData.name}</span>
            <span className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: accountData.currencyCode,
              }).format(accountData.balanceMinor / 100)}
            </span>
          </>
        ) : (
          'Account not found'
        )}
      </h1>
      <div>{accountData ? `${accountData.transactions.length} transactions` : 'Account not found'}</div>
      <div className="space-y-3">
        {accountData?.transactions.map((transaction) => (
          <div key={transaction.id} className="grid grid-cols-[150px_1fr_120px] items-center py-2 border-b border-gray-100 last:border-b-0">
            <div className="text-sm text-gray-500">
              {transaction.bookedAt ? new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(transaction.bookedAt) : 'N/A'}
            </div>
            <div className="truncate pr-2">
              {transaction.merchantName || transaction.description}
            </div>
            <div className="text-right font-medium">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: transaction.currencyCode,
              }).format(
                (transaction.direction === 'debit' ? -1 : 1) * (transaction.amountMinor / 100)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}