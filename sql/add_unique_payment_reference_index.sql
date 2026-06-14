-- Migration: Add unique partial index to credit_requests to prevent replay of active payment references.
-- Author: Antigravity AI

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_payment_reference 
ON public.credit_requests (payment_reference) 
WHERE (status IN ('pending', 'approved'));
