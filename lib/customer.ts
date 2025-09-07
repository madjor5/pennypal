import prisma from './prisma'

export async function getCustomerOverview(customerId?: string) {
  return prisma.account.findMany({
    where: customerId ? { customerId } : undefined,
    select: {
      id: true,
      name: true,
      balanceMinor: true,
      currencyCode: true,
    },
    orderBy: { name: 'asc' },
  })
}

