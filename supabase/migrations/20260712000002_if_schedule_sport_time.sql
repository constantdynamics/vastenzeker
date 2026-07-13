-- Traintijd per sportdag, zodat de app tijdgebonden sportadvies kan geven.
alter table public.if_schedule add column if not exists sport_time time;
