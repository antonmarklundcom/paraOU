import type { PrismaClient } from "@prisma/client";

/** Deterministic dataset for the API integration tests. Deadlines are relative to
 * `now` so the deadlineWithinDays filter is stable regardless of the wall clock. */
export async function seedApiFixtures(prisma: PrismaClient) {
  await prisma.tenderEvent.deleteMany();
  await prisma.award.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.supplier.deleteMany();

  const day = 24 * 60 * 60 * 1000;
  const inDays = (n: number) => new Date(Date.now() + n * day);
  const on = (iso: string) => new Date(iso);

  await prisma.buyer.createMany({
    data: [
      { id: "B-SALUD", name: "Ministerio de Salud Pública", ruc: "80016909-2", level: "central" },
      {
        id: "B-CDE",
        name: "Municipalidad de Ciudad del Este",
        ruc: "30002020-1",
        level: "municipal",
      },
      {
        id: "B-MEC",
        name: "Ministerio de Educación y Ciencias",
        ruc: "80017059-0",
        level: "central",
      },
    ],
  });
  await prisma.supplier.createMany({
    data: [{ id: "S-ESTE", name: "Constructora del Este S.A.", ruc: "80099887-3" }],
  });

  const rows = [
    {
      ocid: "t-001",
      title: "Adquisición de insumos médicos para hospitales",
      status: "OPEN" as const,
      buyerId: "B-SALUD",
      buyerName: "Ministerio de Salud Pública",
      department: "Central",
      categoryCode: "42142523",
      categoryName: "Jeringas hipodérmicas",
      procurementMethod: "Licitación Pública Nacional",
      amountMax: "4500000000",
      amountMin: "4000000000",
      publishedAt: on("2024-03-10T12:00:00Z"),
      deadlineAt: inDays(10),
    },
    {
      ocid: "t-002",
      title: "Construcción de pavimento asfáltico",
      status: "AWARDED" as const,
      buyerId: "B-CDE",
      buyerName: "Municipalidad de Ciudad del Este",
      department: "Alto Paraná",
      categoryCode: "72141115",
      categoryName: "Servicios de pavimentación",
      procurementMethod: "Concurso de Ofertas",
      amountMax: "2800000000",
      amountMin: "2800000000",
      publishedAt: on("2024-02-01T12:00:00Z"),
      deadlineAt: on("2024-02-28T12:00:00Z"),
    },
    {
      ocid: "t-003",
      title: "Provisión de kits escolares 2024",
      status: "PLANNED" as const,
      buyerId: "B-MEC",
      buyerName: "Ministerio de Educación y Ciencias",
      department: "Itapúa",
      categoryCode: "44121700",
      categoryName: "Útiles escolares",
      procurementMethod: "Contratación Directa",
      amountMax: "950000000",
      amountMin: "950000000",
      publishedAt: on("2024-03-14T12:00:00Z"),
      deadlineAt: null,
    },
    {
      ocid: "t-004",
      title: "Servicio de limpieza de oficinas",
      status: "OPEN" as const,
      buyerId: "B-MEC",
      buyerName: "Ministerio de Educación y Ciencias",
      department: "Central",
      categoryCode: "76111500",
      categoryName: "Servicios de limpieza",
      procurementMethod: "Licitación Pública Nacional",
      amountMax: "120000000",
      amountMin: "120000000",
      publishedAt: on("2024-03-20T12:00:00Z"),
      deadlineAt: inDays(3),
    },
    {
      ocid: "t-005",
      title: "Compra de computadoras y periféricos",
      status: "CLOSED" as const,
      buyerId: "B-MEC",
      buyerName: "Ministerio de Educación y Ciencias",
      department: "Central",
      categoryCode: "43211500",
      categoryName: "Computadoras",
      procurementMethod: "Concurso de Ofertas",
      amountMax: "1500000000",
      amountMin: "1500000000",
      publishedAt: on("2024-01-15T12:00:00Z"),
      deadlineAt: on("2024-02-10T12:00:00Z"),
    },
    {
      ocid: "t-006",
      title: "Adquisición de medicamentos esenciales",
      status: "OPEN" as const,
      buyerId: "B-SALUD",
      buyerName: "Ministerio de Salud Pública",
      department: "Itapúa",
      categoryCode: "42142500",
      categoryName: "Medicamentos",
      procurementMethod: "Licitación Pública Nacional",
      amountMax: "6000000000",
      amountMin: "5500000000",
      publishedAt: on("2024-03-25T12:00:00Z"),
      deadlineAt: inDays(30),
    },
    {
      ocid: "t-007",
      title: "Mantenimiento de rutas nacionales",
      status: "CONTRACTED" as const,
      buyerId: "B-CDE",
      buyerName: "Municipalidad de Ciudad del Este",
      department: "Alto Paraná",
      categoryCode: "72141100",
      categoryName: "Mantenimiento vial",
      procurementMethod: "Licitación por Concurso",
      amountMax: "8000000000",
      amountMin: "8000000000",
      publishedAt: on("2024-02-20T12:00:00Z"),
      deadlineAt: on("2024-03-15T12:00:00Z"),
    },
    {
      ocid: "t-008",
      title: "Insumos de oficina varios",
      status: "OPEN" as const,
      buyerId: "B-MEC",
      buyerName: "Ministerio de Educación y Ciencias",
      department: "Central",
      categoryCode: "44121700",
      categoryName: "Útiles escolares",
      procurementMethod: "Contratación Directa",
      amountMax: null,
      amountMin: null,
      publishedAt: on("2024-03-28T12:00:00Z"),
      deadlineAt: inDays(15),
    },
  ];

  for (const r of rows) {
    await prisma.tender.create({ data: { currency: "PYG", raw: {}, ...r } });
  }

  // Awards for competitor-intelligence endpoints.
  const t002 = await prisma.tender.findUniqueOrThrow({ where: { ocid: "t-002" } });
  const t007 = await prisma.tender.findUniqueOrThrow({ where: { ocid: "t-007" } });
  await prisma.award.createMany({
    data: [
      {
        id: "t-002:adj-1",
        tenderId: t002.id,
        supplierId: "S-ESTE",
        amount: "2750000000",
        currency: "PYG",
        date: on("2024-03-05T12:00:00Z"),
        status: "active",
      },
      {
        id: "t-007:adj-1",
        tenderId: t007.id,
        supplierId: "S-ESTE",
        amount: "7900000000",
        currency: "PYG",
        date: on("2024-03-20T12:00:00Z"),
        status: "active",
      },
    ],
  });
}
