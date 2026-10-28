CREATE TABLE IF NOT EXISTS drivers (
 id text PRIMARY KEY, name text NOT NULL, class text NOT NULL CHECK(class IN ('economy','comfort')),
 x double precision NOT NULL, y double precision NOT NULL,
 status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','offered','busy','offline'))
);
CREATE TABLE IF NOT EXISTS orders (
 id text PRIMARY KEY, owner_id text NOT NULL, origin text NOT NULL DEFAULT 'guest',
 pickup_x double precision NOT NULL, pickup_y double precision NOT NULL,
 dropoff_x double precision NOT NULL, dropoff_y double precision NOT NULL,
 class text NOT NULL CHECK(class IN ('economy','comfort')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','offered','accepted','arrived','in_progress','completed','cancelled')),
 driver_id text REFERENCES drivers(id), offer_expires timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_order_per_driver ON orders(driver_id)
 WHERE status IN ('offered','accepted','arrived','in_progress');
CREATE INDEX IF NOT EXISTS pending_orders ON orders(created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS attempts (
 order_id text REFERENCES orders(id) ON DELETE CASCADE,
 driver_id text REFERENCES drivers(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,driver_id)
);
CREATE TABLE IF NOT EXISTS events (
 id bigserial PRIMARY KEY, service text NOT NULL, kind text NOT NULL, order_id text,
 message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS demo_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 running boolean NOT NULL DEFAULT false,
 scenario text NOT NULL DEFAULT 'normal' CHECK(scenario IN ('normal','refusals','shortage','burst'))
);
INSERT INTO demo_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
INSERT INTO drivers(id,name,class,x,y) VALUES
 ('d1','Алексей','economy',18,23),('d2','Мария','economy',65,18),
 ('d3','Тимур','comfort',40,68),('d4','Анна','economy',77,72),
 ('d5','Илья','comfort',25,48),('d6','София','economy',56,45),
 ('d7','Максим','economy',83,39),('d8','Вера','comfort',18,82)
 ON CONFLICT DO NOTHING;
