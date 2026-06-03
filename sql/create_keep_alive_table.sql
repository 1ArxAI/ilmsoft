-- Create keep_alive table to track database activity logs
CREATE TABLE IF NOT EXISTS public.keep_alive (
    id SERIAL PRIMARY KEY,
    touched_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.keep_alive ENABLE ROW LEVEL SECURITY;
