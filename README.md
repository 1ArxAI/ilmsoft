# ilmsoft

**Fee collection and records for small schools. Simple enough to run from a phone.**

MIT licensed. Free to self-host.

Most school software is built for big institutions and priced per student. ilmsoft is the opposite: one owner, a couple of managers, a few hundred students, and the daily job of collecting fees and keeping the books straight. It is in production at a real school in Pakistan and is built to stay small.

Live app: https://ilmsoft.netlify.app

## What it does

- **Families and students.** Register a parent once, add their children, move students up a class at year end.
- **Fees without spreadsheets.** Each class has a monthly fee. Each student may have a discount (percentage or fixed). Generate a month with one click and every family is billed class fee minus discount. Change a class fee and it applies to everyone in that class next month.
- **Payments and statements.** Receive a payment, print the receipt, and the family's running statement is up to date. Every rupee lives in one ledger, so balances are always the sum of the ledger and can never drift.
- **See who owes at a glance.** Families with dues show in red. Fee Stats shows this month's bill, collections, today's takings and total receivables.
- **The rest of the money.** Income, expenses, suppliers and one-time collections (books, trips, exams) in the same place.
- **Exams and result cards.** Terms, marks entry, printable result cards in the school's colours.
- **Team.** An owner invites managers who can do the daily work but cannot change fees, delete records or touch billing.
- **Receipts, invoices and result cards are rendered on demand.** Nothing is stored twice.

## Principles

1. **One rule for fees.** Net fee = class fee − student discount, computed in the database at generation time. There is no second place a fee can come from.
2. **The ledger is the truth.** Balances, receivables and statements are derived. Nothing is cached that could disagree with the ledger.
3. **Small surface.** Six runtime dependencies. No backend server to run: the browser talks to Postgres through Supabase, and row-level security decides who sees what.
4. **Every tenant is walled off in the database, not in the UI.** A school's users can only read and write their own school's rows, enforced by Postgres policies on every table.
5. **If a feature is not needed by a small school, it is not here.**

## Stack

React 19, TypeScript, Vite, SWR, lucide-react on the client. Supabase (Postgres, Auth, Storage) as the only backend. Static hosting on Netlify. Node 22.

## Run it locally

```bash
git clone https://github.com/1ArxAI/ilmsoft.git
cd ilmsoft
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev
```

Other scripts: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`.

**Self-hosting the database:** the repo carries the incremental migrations in `sql/` that were applied to the production project, but not yet a single bootstrap schema for a fresh Supabase project. That is the next thing to publish; until then, open an issue if you want to run your own instance and we will help.

## Operations scripts

For people running their own instance. All of them read connection details from `.env.local`.

| Script | What it does |
|---|---|
| `scripts/db_dump.mjs` | Full logical backup of the live database (schema + every table as JSON) into `backups/`. |
| `scripts/db_restore.mjs` | Restore a dump, table by table, with an explicit confirmation. |
| `scripts/backup_to_baserow.mjs` | Zip the newest dump and upload it to a Baserow table, keeping the last three. Runs nightly from GitHub Actions. |
| `scripts/migrate_to_project.mjs` | Rebuild the whole database in a new Supabase project (for example to change region) and verify the copy against the original. |

## Roles and safety

- **Owner:** everything for their school.
- **Manager:** daily work (families, students, payments, fee generation, exams, income and expenses). Cannot delete financial history, change class fees, or manage the team.
- **Platform admin:** approves credit purchases and can read, not write, school data.
- A school whose subscription has lapsed becomes read-only; nothing is deleted.
- Permanent deletion of a family or student is refused if any financial history exists.

## Hosted plans

The hosted version at ilmsoft.netlify.app runs on prepaid days: one credit is one day of access.

| Plan | Days | Price |
|---|---|---|
| Monthly | 30 | Rs 2,000 |
| Quarterly+ | 100 | Rs 5,000 |

Payment is by JazzCash or bank transfer; the school submits the reference and a platform admin approves it. Self-hosting is free.

## Contributing

Small pull requests that remove something are the most welcome. Before adding a feature, ask whether a small school needs it on a normal day. If the answer is no, it does not belong here. Keep the one fee rule and the one ledger intact, and keep every table behind row-level security.

Run `npm run typecheck`, `npm run lint` and `npm test` before opening a PR.

## License

[MIT](LICENSE). Use it, change it, run it for your school.
