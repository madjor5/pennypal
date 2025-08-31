// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ---------- helpers ----------
const kr = (n: number) => Math.round(n * 100); // kroner -> minor units
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const choice = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const sampleN = <T>(arr: T[], n: number) => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const j = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(j, 1)[0]);
  }
  return out;
};
// giv “menneskelig” variation
const jitter = (base: number, pct = 0.1) => base * (1 + rand(-pct, pct));

// generer lokal dato (lagres som timestamptz i PG)
function atLocal(year: number, monthIdx0: number, day: number, hour = 10, min = 0) {
  return new Date(Date.UTC(year, monthIdx0, day, hour, min));
}

type Accounts = { budget: string; food: string; credit: string; savings: string; car: string };

// ---------- Realistisk REMA 1000 produktkatalog ----------
type Product = { description: string; unitKr: number; sku?: string };
const catalog = {
  dairy: <Product[]>[
    { description: "Arla Letmælk 1L", unitKr: 9.5 },
    { description: "Arla Minimælk 1L", unitKr: 10.0 },
    { description: "Cheasy Skyr 150g", unitKr: 7.95 },
    { description: "Arla Karoline's Piskefløde 250ml", unitKr: 13.5 },
    { description: "Lurpak Smør 200g", unitKr: 22.0 },
    { description: "Arla Danbo 45+ 300g", unitKr: 28.0 },
  ],
  produce: <Product[]>[
    { description: "Chiquita Bananer 1kg", unitKr: 18.5 },
    { description: "Danske Æbler 1kg", unitKr: 21.0 },
    { description: "Agurk stk", unitKr: 12.0 },
    { description: "Peberfrugt rød stk", unitKr: 8.0 },
    { description: "Kartofler 2kg", unitKr: 24.0 },
    { description: "Isbergsalat stk", unitKr: 14.0 },
  ],
  meat: <Product[]>[
    { description: "Friland Øko Hakket Oksekød 8-12% 400g", unitKr: 39.95 },
    { description: "Tulip Bacon i skiver 140g", unitKr: 22.5 },
    { description: "Løgismose Kyllingebryst 500g", unitKr: 59.0 },
    { description: "Gøl Pølser 300g", unitKr: 18.0 },
  ],
  bakery: <Product[]>[
    { description: "Pågen Hvedebrød 600g", unitKr: 16.0 },
    { description: "Fuldkorns Rugbrød 1kg", unitKr: 18.0 },
    { description: "Pågen Gifflar Kanel 300g", unitKr: 18.5 },
  ],
  pantry: <Product[]>[
    { description: "Pasta Barilla Penne 500g", unitKr: 12.95 },
    { description: "Urtekram Øko Havregryn 1kg", unitKr: 19.95 },
    { description: "Knorr Tomatsuppe 1L", unitKr: 15.0 },
    { description: "Heinz Ketchup 570g", unitKr: 19.0 },
    { description: "K-salat Italiensk Salat 400g", unitKr: 17.0 },
    { description: "K-Salat Remoulade 375g", unitKr: 14.0 },
    { description: "Karry 50g", unitKr: 9.0 },
  ],
  snacks: <Product[]>[
    { description: "Haribo Matador Mix 375g", unitKr: 29.95 },
    { description: "Coca Cola 1.5L", unitKr: 17.95 },
    { description: "Kims Chips Sour Cream 175g", unitKr: 18.0 },
    { description: "Marabou Mælkechokolade 200g", unitKr: 22.0 },
  ],
  household: <Product[]>[
    { description: "Neutral Vaskemiddel 1,5L", unitKr: 39.0 },
    { description: "Tandpasta Colgate 75ml", unitKr: 12.0 },
    { description: "Toiletruller 8 stk", unitKr: 22.0 },
  ],
};

// ---------- interne overførsler (to-ben) ----------
async function internalTransfer(
  accounts: Accounts,
  fromKey: keyof Accounts,
  toKey: keyof Accounts,
  amountMinor: number,
  bookedAt: Date,
  label: string,
  groupId: string
) {
  await prisma.transaction.createMany({
    data: [
      {
        accountId: accounts[fromKey],
        bookedAt,
        direction: "debit",
        amountMinor,
        currencyCode: "DKK",
        description: label,
        isInternalTransfer: true,
        transferGroup: groupId,
        raw: {},
      },
      {
        accountId: accounts[toKey],
        bookedAt,
        direction: "credit",
        amountMinor,
        currencyCode: "DKK",
        description: label,
        isInternalTransfer: true,
        transferGroup: groupId,
        raw: {},
      },
    ],
  });
}

// ---------- realistisk REMA 1000-kvittering ----------
async function groceriesWithReceipt(foodAccountId: string, dt: Date, store: string) {
  // vælg 1–2 varer fra udvalgte kategorier
  const basket: { description: string; qty: number; unitKr: number }[] = [
    ...sampleN(catalog.dairy, Math.random() < 0.5 ? 1 : 2),
    ...sampleN(catalog.produce, 2),
    ...sampleN(catalog.meat, 1),
    ...sampleN(catalog.bakery, Math.random() < 0.6 ? 1 : 0),
    ...sampleN(catalog.pantry, 1),
    ...sampleN(catalog.snacks, Math.random() < 0.6 ? 1 : 0),
    ...sampleN(catalog.household, Math.random() < 0.4 ? 1 : 0),
  ].map((p) => {
    // 20–30% chance for at købe 2 stk af en billig vare
    const mult = p.unitKr < 20 && Math.random() < 0.3 ? 2 : 1;
    // lidt prisjitter for kampagner
    const unit = Number(jitter(p.unitKr, 0.08).toFixed(2));
    return { description: p.description, qty: mult, unitKr: unit };
  });

  const totalKr = basket.reduce((s, i) => s + i.qty * i.unitKr, 0);
  const txn = await prisma.transaction.create({
    data: {
      accountId: foodAccountId,
      bookedAt: dt,
      direction: "debit",
      amountMinor: kr(totalKr),
      currencyCode: "DKK",
      merchantName: store,
      description: "Dagligvarer",
      raw: {},
    },
  });

  await prisma.receiptItem.createMany({
    data: basket.map((item, idx) => ({
      transactionId: txn.id,
      lineNo: idx + 1,
      description: item.description,
      qty: item.qty.toFixed(3),
      unitPriceMinor: kr(item.unitKr),
      totalMinor: kr(item.qty * item.unitKr),
      raw: {},
    })),
  });

  return txn.id;
}

// ---------- månedlig seed ----------
async function monthSeed(year: number, monthIdx0: number, accounts: Accounts) {
  // 1) Løn
  await prisma.transaction.createMany({
    data: [
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 1, 8, 0),
        direction: "credit",
        amountMinor: kr(jitter(26000, 0.03)),
        currencyCode: "DKK",
        merchantName: "Virksomhed A/S",
        description: "Månedsløn Mette",
        raw: {},
      },
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 1, 8, 5),
        direction: "credit",
        amountMinor: kr(jitter(28000, 0.03)),
        currencyCode: "DKK",
        merchantName: "IT Konsulentfirma",
        description: "Månedsløn Mads",
        raw: {},
      },
    ],
  });

  // 2) Budget til Madkonto
  await internalTransfer(
    accounts,
    "budget",
    "food",
    kr(8000),
    atLocal(year, monthIdx0, 2, 9, 0),
    "Madbudget",
    `xfer_food_${year}_${monthIdx0 + 1}`
  );

  // 3) Opsparing
  await internalTransfer(
    accounts,
    "budget",
    "savings",
    kr(3000),
    atLocal(year, monthIdx0, 3, 9, 15),
    "Automatisk opsparing",
    `xfer_savings_${year}_${monthIdx0 + 1}`
  );

  // 4) Faste udgifter
  await prisma.transaction.createMany({
    data: [
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 4, 11, 0),
        direction: "debit",
        amountMinor: kr(11500),
        currencyCode: "DKK",
        merchantName: "AAB Bolig",
        description: "Husleje",
        raw: {},
      },
      {
        accountId: accounts.car,
        bookedAt: atLocal(year, monthIdx0, 6, 11, 0),
        direction: "debit",
        amountMinor: kr(jitter(1350, 0.15)),
        currencyCode: "DKK",
        merchantName: "OK El",
        description: "El-regning",
        raw: {},
      },
      {
        accountId: accounts.car,
        bookedAt: atLocal(year, monthIdx0, 12, 11, 0),
        direction: "debit",
        amountMinor: kr(850),
        currencyCode: "DKK",
        merchantName: "Tryg",
        description: "Familieforsikring",
        raw: {},
      },
    ],
  });

  // 5) Abonnementer
  await prisma.transaction.createMany({
    data: [
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 5, 7, 30),
        direction: "debit",
        amountMinor: kr(129),
        currencyCode: "DKK",
        merchantName: "Netflix",
        description: "Abonnement",
        raw: {},
      },
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 5, 7, 32),
        direction: "debit",
        amountMinor: kr(59),
        currencyCode: "DKK",
        merchantName: "Spotify",
        description: "Abonnement",
        raw: {},
      },
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 6, 8, 0),
        direction: "debit",
        amountMinor: kr(399),
        currencyCode: "DKK",
        merchantName: "YouSee",
        description: "Internet",
        raw: {},
      },
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 7, 8, 0),
        direction: "debit",
        amountMinor: kr(2 * 129),
        currencyCode: "DKK",
        merchantName: "TDC Mobil",
        description: "Mobilabonnementer (2)",
        raw: {},
      },
    ],
  });

  // 6) Dagligvarer – 4 uger
  const weekDays = [5, 12, 19, 26].filter((d) => d <= 28);
  for (const d of weekDays) {
    await groceriesWithReceipt(accounts.food, atLocal(year, monthIdx0, d, 16, 30), "REMA 1000");
  }

  // 7) Benzin
  for (const d of [8, 22].filter((x) => x <= 28)) {
    await prisma.transaction.create({
      data: {
        accountId: accounts.car,
        bookedAt: atLocal(year, monthIdx0, d, 17, 45),
        direction: "debit",
        amountMinor: kr(jitter(550, 0.2)),
        currencyCode: "DKK",
        merchantName: "Circle K",
        description: "Benzin",
        raw: {},
      },
    });
  }

  // 8) Restaurant/Café (kreditkort)
  const eatOutDays = [10, 18, 27].slice(0, Math.random() < 0.5 ? 2 : 3);
  for (const d of eatOutDays) {
    const places: [string, string, number][] = [
      ["La Trattoria", "Aften – pizza & pasta", 420],
      ["Café Viggo", "Brunch lørdag", 310],
      ["Sushi House", "Sushi aften", 520],
    ];
    const [name, desc, base] = choice(places);
    await prisma.transaction.create({
      data: {
        accountId: accounts.credit,
        bookedAt: atLocal(year, monthIdx0, d, 19, 30),
        direction: "debit",
        amountMinor: kr(jitter(base, 0.2)),
        currencyCode: "DKK",
        merchantName: name,
        description: desc,
        raw: {},
      },
    });
  }

  // 9) Børneaktiviteter
  await prisma.transaction.createMany({
    data: [
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 9, 12, 0),
        direction: "debit",
        amountMinor: kr(300),
        currencyCode: "DKK",
        merchantName: "Aarhus Håndbold",
        description: "Kontingent (Karla)",
        raw: {},
      },
      {
        accountId: accounts.budget,
        bookedAt: atLocal(year, monthIdx0, 9, 12, 2),
        direction: "debit",
        amountMinor: kr(225),
        currencyCode: "DKK",
        merchantName: "Aarhus Svømmeklub",
        description: "Kontingent (Alma)",
        raw: {},
      },
    ],
  });

  // 10) Kreditkortbetaling (75% af månedens forbrug)
  const spend = await prisma.transaction.aggregate({
    _sum: { amountMinor: true },
    where: {
      accountId: accounts.credit,
      bookedAt: { gte: atLocal(year, monthIdx0, 1, 0, 0), lt: atLocal(year, monthIdx0 + 1, 1, 0, 0) },
      direction: "debit",
    },
  });
  const due = Math.max(kr(300), Math.round((spend._sum.amountMinor ?? 0) * 0.75));
  await internalTransfer(
    accounts,
    "budget",
    "credit",
    due,
    atLocal(year, monthIdx0, 28, 9, 0),
    "Kreditkortbetaling",
    `xfer_cc_${year}_${monthIdx0 + 1}`
  );
}

// ---------- kunde & konti ----------
async function createFamilyAndAccounts() {
  const family = await prisma.customer.create({
    data: {
      externalRef: "family_aarhus_demo",
      pii: {
        create: {
          fullName: "Mette Jensen",
          email: "mette@example.com",
          countryCode: "DK",
          city: "Aarhus",
          consentJson: {},
        },
      },
      accounts: {
        create: [
          { provider: "Nordea", providerAccountId: "acc_family_budget", name: "Familie Budget", type: "budget", currencyCode: "DKK" },
          { provider: "Nordea", providerAccountId: "acc_food", name: "Madkonto", type: "checking", currencyCode: "DKK" },
          { provider: "Nordea", providerAccountId: "acc_credit_mette", name: "Kreditkort (Mette)", type: "credit_card", currencyCode: "DKK" },
          { provider: "Nordea", providerAccountId: "acc_savings", name: "Opsparing", type: "savings", currencyCode: "DKK" },
          { provider: "Nordea", providerAccountId: "acc_car", name: "Bil & Udgifter", type: "checking", currencyCode: "DKK" },
        ],
      },
    },
    include: { accounts: true },
  });

  const get = (pid: string) => family.accounts.find((a) => a.providerAccountId === pid)!.id;
  const accounts: Accounts = {
    budget: get("acc_family_budget"),
    food: get("acc_food"),
    credit: get("acc_credit_mette"),
    savings: get("acc_savings"),
    car: get("acc_car"),
  };
  return { accounts };
}

// ---------- main ----------
async function main() {
  console.log("🌱 Seeding family dataset (3 months, realistic REMA receipts)…");
  await prisma.customer.deleteMany({ where: { externalRef: "family_aarhus_demo" } });

  const { accounts } = await createFamilyAndAccounts();

  // tre seneste fulde måneder
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const months = [
    new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() - 3, 1)),
    new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() - 2, 1)),
    new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() - 1, 1)),
  ];

  for (const m of months) {
    await monthSeed(m.getUTCFullYear(), m.getUTCMonth(), accounts);
  }

  console.log("✅ Seed complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
