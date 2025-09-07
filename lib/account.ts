import { Prisma } from '@prisma/client'
import prisma from './prisma'

interface TxOptions {
  from?: Date
  to?: Date
  cursor?: string
  take?: number
}

export async function getAccountWithTransactions(accountId: string, opts: TxOptions = {}) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) return null

  const { from, to, cursor, take } = opts

  const where: Prisma.TransactionWhereInput = { accountId }
  if (from || to) {
    where.bookedAt = {}
    if (from) (where.bookedAt as any).gte = from
    if (to) (where.bookedAt as any).lte = to
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { bookedAt: 'desc' },
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : undefined,
    take,
  })

  return { ...account, transactions }
}

export async function recordTransaction(
  accountId: string,
  data: Omit<Prisma.TransactionCreateInput, 'account' | 'accountId' | 'balanceAfterMinor'>,
) {
  return prisma.$transaction(async (tx) => {
    const delta = data.direction === 'credit' ? data.amountMinor : -data.amountMinor

    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { balanceMinor: true },
    })
    if (!account) throw new Error('Account not found')

    const creditAgg = await tx.transaction.aggregate({
      where: { accountId, bookedAt: { gt: data.bookedAt }, direction: 'credit' },
      _sum: { amountMinor: true },
    })
    const debitAgg = await tx.transaction.aggregate({
      where: { accountId, bookedAt: { gt: data.bookedAt }, direction: 'debit' },
      _sum: { amountMinor: true },
    })
    const futureDelta = (creditAgg._sum.amountMinor || 0) - (debitAgg._sum.amountMinor || 0)

    const balanceAfter = account.balanceMinor - futureDelta + delta

    const created = await tx.transaction.create({
      data: { ...data, accountId, balanceAfterMinor: balanceAfter },
    })

    await tx.transaction.updateMany({
      where: { accountId, bookedAt: { gt: data.bookedAt } },
      data: { balanceAfterMinor: { increment: delta } },
    })

    await tx.account.update({
      where: { id: accountId },
      data: { balanceMinor: { increment: delta } },
    })

    return created
  })
}

