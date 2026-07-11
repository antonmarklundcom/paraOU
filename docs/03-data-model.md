# Data Model

Prisma/Postgres. Names final; adjust field nullability against real OCDS data in
Phase 1. Raw OCDS JSON is always preserved in `Tender.raw`.

## Core entities

```prisma
model Tender {                    // one procurement process (OCDS record)
  id            String   @id @default(cuid())
  ocid          String   @unique          // e.g. ocds-03ad3f-123456
  dncpId        String?                   // DNCP's internal id (nro. licitación)
  title         String
  description   String?
  status        TenderStatus              // PLANNED|OPEN|CLOSED|AWARDED|CONTRACTED|CANCELLED|UNSUCCESSFUL
  buyerId       String?                   // -> Buyer
  categoryCode  String?                   // catálogo N5 / UNSPSC segment
  categoryName  String?
  procurementMethod String?               // licitación pública, concurso de ofertas, contratación directa...
  amountMin     Decimal?                  // reference/estimated value
  amountMax     Decimal?
  currency      String   @default("PYG")
  department    String?                   // geo: Asunción, Central, Itapúa...
  publishedAt   DateTime?
  deadlineAt    DateTime?                 // tender.tenderPeriod.endDate (bid submission)
  inquiryDeadlineAt DateTime?             // Q&A period end
  documentsUrl  String?                   // link to pliegos on DNCP portal
  sourceUrl     String?                   // canonical DNCP page
  raw           Json                      // full latest OCDS compiled release
  searchVector  Unsupported("tsvector")?  // spanish FTS over title+description+buyer
  embedding     Unsupported("vector(1024)")?  // voyage-3.5
  aiSummary     String?                   // cached one-paragraph plain-language summary
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  buyer         Buyer?   @relation(...)
  awards        Award[]
  events        TenderEvent[]             // status/deadline changes, for alerts
  @@index([status, deadlineAt])
  @@index([publishedAt])
  @@index([categoryCode])
}

model Buyer {                     // contracting authority (ministry, municipality)
  id        String  @id            // OCDS party id
  name      String
  ruc       String?                // tax id
  level     String?                // central / municipal / etc.
  tenders   Tender[]
}

model Award {                     // adjudicaciones — competitor intelligence
  id         String   @id
  tenderId   String
  supplierId String?               // -> Supplier
  amount     Decimal?
  currency   String?
  date       DateTime?
  status     String?
}

model Supplier {                  // proveedores — who wins contracts
  id      String  @id
  name    String
  ruc     String?
  awards  Award[]
}

model SyncState {                 // ingestion watermarks
  job         String   @id        // "ocds_incremental", "backfill_2019", ...
  lastRunAt   DateTime?
  watermark   DateTime?           // last successfully covered publication date
  cursor      String?             // page/offset if a run is interrupted
  status      String              // ok | running | error
  lastError   String?
}
```

## Users & matching

```prisma
model User {  // via Auth.js tables +
  id            String  @id
  email         String  @unique
  locale        String  @default("es")
  plan          Plan    @default(FREE)   // FREE|PRO|BUSINESS|AGENCY
  stripeCustomerId String?
  profiles      CompanyProfile[]
}

model CompanyProfile {            // what the user's company sells — input to matching
  id            String   @id @default(cuid())
  userId        String
  name          String                    // company name
  description   String                    // free text: what we do, in their words
  categoryCodes String[]                  // selected N5/UNSPSC categories
  keywords      String[]                  // include terms
  excludeKeywords String[]                // "we do NOT do X"
  departments   String[]                  // geo scope, empty = all
  amountMin     Decimal?                  // contract size comfort range
  amountMax     Decimal?
  certifications String[]                 // ISO 9001, etc. (used by LLM reasoning)
  embedding     Unsupported("vector(1024)")?
  matches       Match[]
  savedSearches SavedSearch[]
  alertChannel  AlertChannel @default(EMAIL)  // EMAIL | WHATSAPP(later) | NONE
}

model Match {                     // AI match result: profile × tender
  id          String  @id @default(cuid())
  profileId   String
  tenderId    String
  score       Int                        // 0-100
  reasoning   String                     // LLM explanation (user-facing)
  cautions    String?                    // requirements that may disqualify
  userAction  MatchAction @default(NONE) // NONE|SAVED|BIDDING|DISMISSED  ← north-star metric
  createdAt   DateTime @default(now())
  @@unique([profileId, tenderId])
}

model SavedSearch {
  id        String @id @default(cuid())
  profileId String
  name      String
  params    Json                         // serialized filter state
  alerting  Boolean @default(true)
}

model AlertLog {                  // dedupe + audit of sent alerts
  id        String @id @default(cuid())
  userId    String
  tenderId  String
  channel   String
  sentAt    DateTime @default(now())
  @@unique([userId, tenderId, channel])
}
```

## Notes

- **FTS:** generated column `searchVector = to_tsvector('spanish', title || ' ' || description || ' ' || buyerName)` + GIN index. Handles accents/stemming (licitación/licitaciones).
- **pgvector:** ivfflat/HNSW index on `Tender.embedding`; profile-to-tender cosine similarity is the matching prefilter.
- **Money:** PYG amounts are huge (Gs. 1,000,000,000+) — use `Decimal`, never float; display with compact notation ("Gs. 1.2 mil M") and optional USD conversion (store a daily PYG/USD rate table).
- **History:** ~15 years × roughly 10–40k processes/year → low millions of rows worst case. Trivial for Postgres on a small VPS.
