# PlatzGo - Project Guidelines

## Project Overview

PlatzGo is a sports court booking SaaS built with Next.js 16 (App Router), TypeScript, Prisma ORM, PostgreSQL, Redis, and NextAuth.js.

## Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Cache**: Redis (ioredis)
- **Auth**: NextAuth.js with credentials + Google
- **Storage**: S3-compatible (AWS/MinIO/DigitalOcean)
- **Payments**: ASAAS (primary), MercadoPago (fallback), Stripe (stub)
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Background**: Workers for email, reminders, alerts, maintenance

## Key Directories

- `src/lib/actions/` - Server actions (async functions with 'use server')
- `src/lib/` - Configurations, utilities, clients
- `src/app/api/` - REST API routes
- `src/components/` - Shared React components
- `prisma/` - Schema and migrations

## Conventions

- Error messages in Brazilian Portuguese
- Currency values in cents (int) converted to BRL for display
- CPF/CNPJ validated with functions in `src/lib/utils/cpfCnpj.ts`
- WhatsApp formatted as E.164 Brazil (+55)
- Redis cache with prefix `platzgo:`
- Use `OptimizedImage` component instead of bare `<img>` tags
- Use `useImageUpload` hook for file uploads instead of inline upload logic
- Use `next/image` for image optimization (remote patterns configured in next.config.ts)

## Business Rules

### Establishments
- One establishment per owner user
- Unique slug for friendly URLs
- Photos in S3 with prefix `establishments/owners/{email}/`
- Operating hours configurable per weekday
- Cancellation: minimum notice (hours), fee (percent or fixed)
- Booking buffer configurable (minutes)
- Optional booking confirmation requirement

### Payments (ASAAS)
- ASAAS is primary payment provider
- PIX only for now (no credit card/boleto in main flows)
- Payment split: configurable platform percentage
- Wallet ID per establishment for payouts
- Webhook handles: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_CANCELED, PAYMENT_OVERDUE, PAYMENT_REFUNDED

### Tournaments
- Tournament functionality is NOT in production
- Do not modify tournament code unless explicitly requested
- Controlled by feature flag `tournamentsEnabled`

## Anti-patterns

- Do NOT duplicate functions between modules
- Do NOT use `any` - type explicitly
- Do NOT fetch ASAAS directly without error handling
- Do NOT create new actions without revalidating relevant paths
- Use `OptimizedImage` component (next/image) instead of bare `<img>` tags

## Lint & Typecheck

```bash
npx tsc --noEmit
npx eslint .
```