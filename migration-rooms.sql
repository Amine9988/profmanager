CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 0,
  floor text,
  status text NOT NULL DEFAULT 'active',
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read rooms in their tenant"
  ON public.rooms FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id', true)::text);

CREATE POLICY "Users can insert rooms in their tenant"
  ON public.rooms FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

CREATE POLICY "Users can update rooms in their tenant"
  ON public.rooms FOR UPDATE
  USING ("tenantId" = current_setting('app.tenant_id', true)::text);

CREATE POLICY "Users can delete rooms in their tenant"
  ON public.rooms FOR DELETE
  USING ("tenantId" = current_setting('app.tenant_id', true)::text);
